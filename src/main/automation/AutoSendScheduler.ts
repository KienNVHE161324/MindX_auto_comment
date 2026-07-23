import {
  SchoolClass,
  ClassSession,
  SessionContent,
  LmsPostParams,
  LmsPostResult,
  AppConfig,
  AutoSendCatchUpItem,
  AutoSendCatchUpResult,
  AutoSendChannel,
  ZaloSendResult,
} from '../../shared/types'
import {
  planAutoSend,
  AutoSendPlan,
  buildZaloMessage,
  nearestPastSession,
  normalizeAutoSend,
} from '../../shared/autoSend'
import { mergeAbsentStudentNames } from '../../shared/lmsSync'
import type { SessionContentMetadataPatch } from '../content/ContentRepository'
import { ZALO_TEST_SEARCH_TERM } from './ZaloWebAutomator'

export interface AutoSendDeps {
  getClasses: () => Promise<SchoolClass[]>
  getContent: (sessionId: string) => Promise<SessionContent | null>
  updateContentMetadata: (
    sessionId: string,
    patch: Partial<SessionContentMetadataPatch>,
  ) => Promise<SessionContent | null>
  getConfig: () => Promise<AppConfig>
  lmsOpenBrowser: () => Promise<{ loggedIn: boolean }>
  lmsPostSession: (params: LmsPostParams) => Promise<LmsPostResult>
  runLmsPostExclusive<T>(
    operation: (
      postSession: (params: LmsPostParams) => Promise<LmsPostResult>,
    ) => Promise<T>,
  ): Promise<T>
  /** Gửi tin qua adapter Zalo Web; chỉ kết quả `sent` mới được lưu metadata. */
  sendZaloMessage: (input: {
    searchTerm: string
    message: string
  }) => Promise<ZaloSendResult>
  now?: () => Date
  log?: (msg: string) => void
}

class LmsMetadataPersistenceError extends Error {}

/** Ghi tin Zalo ra file .txt trong thư mục Documents — dùng khi chưa có automation Zalo Desktop thật. */
export class AutoSendScheduler {
  private activeTick: Promise<void> | null = null
  private catchUpItems: AutoSendCatchUpItem[] = []
  private readonly heldKeys = new Set<string>()

  constructor(private readonly deps: AutoSendDeps) {}

  async initializeCatchUp(): Promise<AutoSendCatchUpItem[]> {
    const now = this.deps.now?.() ?? new Date()
    const classes = await this.deps.getClasses()
    const items: AutoSendCatchUpItem[] = []

    for (const cls of classes) {
      try {
        const session = nearestPastSession(cls.sessions, now)
        const content = session ? await this.deps.getContent(session.id) : null
        const plan = planAutoSend(cls, content, now)
        if (!plan) continue
        const channels: AutoSendChannel[] = []
        if (plan.needLms) channels.push('lms')
        if (plan.needZalo) channels.push('zalo')
        items.push({
          classId: cls.id,
          classCode: cls.code,
          className: cls.name,
          sessionId: plan.session.id,
          sessionDateTime: plan.session.dateTime,
          channels,
        })
        this.heldKeys.add(this.key(cls.id, plan.session.id))
      } catch (err) {
        this.deps.log?.(
          `[AutoSend] Không lập được lịch gửi bù ${cls.code}: ${(err as Error).message}`,
        )
      }
    }

    this.catchUpItems = items
    return this.getCatchUpItems()
  }

  getCatchUpItems(): AutoSendCatchUpItem[] {
    return this.catchUpItems.map(item => ({
      ...item,
      channels: [...item.channels],
    }))
  }

  async runCatchUp(): Promise<AutoSendCatchUpResult[]> {
    if (this.activeTick) await this.activeTick
    const task = this.runCatchUpItems()
    this.activeTick = task.then(() => undefined)
    try {
      return await task
    } finally {
      this.activeTick = null
    }
  }

  private async runCatchUpItems(): Promise<AutoSendCatchUpResult[]> {
    const now = this.deps.now?.() ?? new Date()
    const classes = await this.deps.getClasses()
    const results: AutoSendCatchUpResult[] = []
    const remaining: AutoSendCatchUpItem[] = []
    const log = this.deps.log ?? (() => {})

    for (const item of this.catchUpItems) {
      const cls = classes.find(candidate => candidate.id === item.classId)
      if (!cls) {
        results.push(this.catchUpResult(item, [], 'skipped', 'Lớp không còn tồn tại.'))
        remaining.push(item)
        continue
      }
      try {
        const content = await this.deps.getContent(item.sessionId)
        const plan = planAutoSend(cls, content, now)
        if (!plan || plan.session.id !== item.sessionId) {
          results.push(this.catchUpResult(
            item,
            [],
            'skipped',
            'Nội dung hoặc trạng thái gửi đã thay đổi.',
          ))
          remaining.push(item)
          continue
        }
        const completed = await this.executePlan(cls, plan, log, item.channels)
        const requested = item.channels.filter(channel =>
          channel === 'lms' ? plan.needLms : plan.needZalo,
        )
        const success = requested.length > 0
          && requested.every(channel => completed.includes(channel))
        results.push(this.catchUpResult(
          item,
          completed,
          success ? 'success' : 'error',
          success ? 'Đã gửi các kênh đã chọn.' : 'Không gửi được đầy đủ các kênh đã chọn.',
        ))
        if (success) this.heldKeys.delete(this.key(item.classId, item.sessionId))
        else remaining.push(item)
      } catch (err) {
        results.push(this.catchUpResult(item, [], 'error', (err as Error).message))
        remaining.push(item)
      }
    }

    this.catchUpItems = remaining
    return results
  }

  private catchUpResult(
    item: AutoSendCatchUpItem,
    completedChannels: AutoSendChannel[],
    status: AutoSendCatchUpResult['status'],
    message: string,
  ): AutoSendCatchUpResult {
    return {
      classId: item.classId,
      classCode: item.classCode,
      sessionId: item.sessionId,
      status,
      completedChannels,
      message,
    }
  }

  private key(classId: string, sessionId: string): string {
    return `${classId}:${sessionId}`
  }

  /** Chạy 1 lượt kiểm tra tất cả lớp; gửi cho lớp nào tới giờ hẹn và còn thiếu LMS/Zalo. Không throw ra ngoài — lỗi 1 lớp không chặn lớp khác. */
  tick(): Promise<void> {
    if (this.activeTick) return this.activeTick

    const task = this.runTick()
    const tracked = task.finally(() => {
      if (this.activeTick === tracked) this.activeTick = null
    })
    this.activeTick = tracked
    return tracked
  }

  private async runTick(): Promise<void> {
    const now = this.deps.now?.() ?? new Date()
    const log = this.deps.log ?? (() => {})

    let classes: SchoolClass[]
    try {
      classes = await this.deps.getClasses()
    } catch (err) {
      log(`[AutoSend] Không tải được danh sách lớp: ${(err as Error).message}`)
      return
    }

    for (const cls of classes) {
      try {
        await this.processClass(cls, now, log)
      } catch (err) {
        log(`[AutoSend] Lỗi xử lý lớp ${cls.code}: ${(err as Error).message}`)
      }
    }
  }

  private async processClass(
    cls: SchoolClass,
    now: Date,
    log: (msg: string) => void,
  ): Promise<void> {
    const autoSend = normalizeAutoSend(cls.autoSend)
    if (!autoSend.lmsEnabled && !autoSend.zaloEnabled) return

    // Lấy content của buổi gần nhất đã qua (nếu có) rồi để planAutoSend tự quyết định.
    const candidateSessionId = latestPastSessionId(cls, now)
    const content = candidateSessionId ? await this.deps.getContent(candidateSessionId) : null

    const plan = planAutoSend(cls, content, now)
    if (!plan) return
    if (this.heldKeys.has(this.key(cls.id, plan.session.id))) return

    log(`[AutoSend] ${cls.code}: buổi ${plan.session.dateTime} — needLms=${plan.needLms} needZalo=${plan.needZalo}`)
    await this.executePlan(cls, plan, log)
  }

  private async executePlan(
    cls: SchoolClass,
    plan: AutoSendPlan,
    log: (msg: string) => void,
    allowedChannels: AutoSendChannel[] = ['lms', 'zalo'],
  ): Promise<AutoSendChannel[]> {
    let updated = plan.content
    const completed: AutoSendChannel[] = []

    if (plan.needLms && allowedChannels.includes('lms')) {
      updated = await this.sendLms(cls, plan.session, updated, log)
      if (updated.postedToLms) completed.push('lms')
    }
    if (plan.needZalo && allowedChannels.includes('zalo') && !updated.zaloSentAt) {
      updated = await this.sendZalo(cls, plan.session, updated, log)
      if (updated.zaloSentAt) completed.push('zalo')
    }
    return completed
  }

  private async sendLms(
    cls: SchoolClass,
    session: ClassSession,
    content: SessionContent,
    log: (msg: string) => void,
  ): Promise<SessionContent> {
    try {
      const { loggedIn } = await this.deps.lmsOpenBrowser()
      if (!loggedIn) {
        log(`[AutoSend] ${cls.code}: chưa đăng nhập LMS, bỏ qua lần này`)
        return content
      }

      return await this.deps.runLmsPostExclusive(async postSession => {
        // Đọc content sau khi đã nhận shared LMS lock và giữ lock qua side effect.
        const freshContent = await this.deps.getContent(session.id)
        if (!freshContent || freshContent.postedToLms) return freshContent ?? content

        const absentIds = new Set(freshContent.absentStudentIds ?? [])
        const comments = cls.students
          .filter(s => !absentIds.has(s.id))
          .map(s => {
            const cm = freshContent.comments.find(c => c.studentId === s.id)
            return { studentName: s.name, text: cm?.polished || cm?.raw || '' }
          })
          .filter(c => c.text.trim() !== '')

        const result = await postSession({
          classCode: cls.code,
          sessionDate: session.dateTime.slice(0, 10),
          lessonContent: freshContent.lessonContent,
          homework: freshContent.homework,
          comments,
        })

        if (result.error) {
          log(`[AutoSend] ${cls.code}: gửi LMS thất bại — ${result.error}`)
          return freshContent
        }

        const absentStudentIds = mergeAbsentStudentNames(
          cls.students,
          freshContent.absentStudentIds ?? [],
          result.absentStudentNames,
        )
        const absenceChanged = absentStudentIds.length !== (freshContent.absentStudentIds ?? []).length
        const didPost = result.posted.length > 0
        if (!didPost) {
          log(`[AutoSend] ${cls.code}: gửi LMS thất bại — không HS nào được gửi`)
        }
        if (!didPost && !absenceChanged) return freshContent

        const patch: Partial<SessionContentMetadataPatch> = {
          absentStudentIds,
          ...(didPost ? { postedToLms: true } : {}),
        }
        let persisted: SessionContent | null
        try {
          persisted = await this.deps.updateContentMetadata(session.id, patch)
        } catch (err) {
          throw new LmsMetadataPersistenceError(
            `Đã gửi LMS nhưng không lưu được metadata: ${(err as Error).message}`,
          )
        }
        if (!persisted) {
          throw new LmsMetadataPersistenceError(
            'Đã gửi LMS nhưng content không còn tồn tại để lưu metadata',
          )
        }
        return persisted
      })
    } catch (err) {
      log(`[AutoSend] ${cls.code}: lỗi gửi LMS — ${(err as Error).message}`)
      if (err instanceof LmsMetadataPersistenceError) throw err
      return content
    }
  }

  private async sendZalo(
    cls: SchoolClass,
    session: ClassSession,
    content: SessionContent,
    log: (msg: string) => void,
  ): Promise<SessionContent> {
    try {
      const cfg = await this.deps.getConfig()

      // getConfig hoặc workflow LMS trước đó có thể chờ I/O. Lấy draft mới nhất
      // ngay trước side effect và hợp nhất metadata đã lưu trong cùng tick.
      const freshContent = await this.deps.getContent(session.id)
      const latest = freshContent
        ? {
            ...freshContent,
            absentStudentIds: [...new Set([
              ...(freshContent.absentStudentIds ?? []),
              ...(content.absentStudentIds ?? []),
            ])],
            ...(content.postedToLms ? { postedToLms: true } : {}),
            ...(freshContent.zaloSentAt || content.zaloSentAt
              ? { zaloSentAt: freshContent.zaloSentAt ?? content.zaloSentAt }
              : {}),
          }
        : content
      if (latest.zaloSentAt) return latest

      const message = buildZaloMessage(cls, session, latest, cfg.zaloMessageTemplate)
      const result = await this.deps.sendZaloMessage({
        searchTerm: ZALO_TEST_SEARCH_TERM,
        message,
      })
      if (result.status === 'login-required') {
        log(`[AutoSend] ${cls.code}: ${result.message}`)
        return latest
      }
      const zaloSentAt = (this.deps.now?.() ?? new Date()).toISOString()
      const persisted = await this.deps.updateContentMetadata(session.id, { zaloSentAt })
      return persisted ?? { ...latest, zaloSentAt }
    } catch (err) {
      log(`[AutoSend] ${cls.code}: lỗi gửi Zalo — ${(err as Error).message}`)
      return content
    }
  }
}

function latestPastSessionId(cls: SchoolClass, now: Date): string | undefined {
  const past = cls.sessions
    .filter(s => new Date(s.dateTime) < now)
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
  return past[0]?.id
}
