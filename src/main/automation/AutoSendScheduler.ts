import * as fs from 'fs'
import * as path from 'path'
import { SchoolClass, ClassSession, SessionContent, LmsPostParams, LmsPostResult, AppConfig } from '../../shared/types'
import { planAutoSend, buildZaloMessage } from '../../shared/autoSend'

export interface AutoSendDeps {
  getClasses: () => Promise<SchoolClass[]>
  getContent: (sessionId: string) => Promise<SessionContent | null>
  saveContent: (content: SessionContent) => Promise<void>
  getConfig: () => Promise<AppConfig>
  lmsOpenBrowser: () => Promise<{ loggedIn: boolean }>
  lmsPostSession: (params: LmsPostParams) => Promise<LmsPostResult>
  /** Ghi tin Zalo ra ngoài — mặc định ghi file trong thư mục Documents (xem writeZaloMessageToDocuments). */
  writeZaloMessage: (classCode: string, sessionDate: string, message: string) => Promise<void>
  now?: () => Date
  log?: (msg: string) => void
}

/** Ghi tin Zalo ra file .txt trong thư mục Documents — dùng khi chưa có automation Zalo Desktop thật. */
export function writeZaloMessageToDocuments(documentsDir: string) {
  return async (classCode: string, sessionDate: string, message: string): Promise<void> => {
    const dir = path.join(documentsDir, 'MindX Auto Comment - Zalo tu dong')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${classCode}_${sessionDate}.txt`)
    fs.writeFileSync(file, message, 'utf8')
  }
}

export class AutoSendScheduler {
  constructor(private readonly deps: AutoSendDeps) {}

  /** Chạy 1 lượt kiểm tra tất cả lớp; gửi cho lớp nào tới giờ hẹn và còn thiếu LMS/Zalo. Không throw ra ngoài — lỗi 1 lớp không chặn lớp khác. */
  async tick(): Promise<void> {
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

  private async processClass(cls: SchoolClass, now: Date, log: (msg: string) => void): Promise<void> {
    if (!cls.autoSend?.enabled) return

    // Lấy content của buổi gần nhất đã qua (nếu có) rồi để planAutoSend tự quyết định.
    const candidateSessionId = latestPastSessionId(cls, now)
    const content = candidateSessionId ? await this.deps.getContent(candidateSessionId) : null

    const plan = planAutoSend(cls, content, now)
    if (!plan) return

    log(`[AutoSend] ${cls.code}: buổi ${plan.session.dateTime} — needLms=${plan.needLms} needZalo=${plan.needZalo}`)

    let updated = plan.content

    if (plan.needLms) {
      updated = await this.sendLms(cls, plan.session, updated, log)
    }
    if (plan.needZalo) {
      updated = await this.sendZalo(cls, plan.session, updated, log)
    }

    if (updated !== plan.content) {
      await this.deps.saveContent(updated)
    }
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
      const absentIds = new Set(content.absentStudentIds ?? [])
      const comments = cls.students
        .filter(s => !absentIds.has(s.id))
        .map(s => {
          const cm = content.comments.find(c => c.studentId === s.id)
          return { studentName: s.name, text: cm?.polished || cm?.raw || '' }
        })
        .filter(c => c.text.trim() !== '')

      const result = await this.deps.lmsPostSession({
        classCode: cls.code,
        sessionDate: session.dateTime.slice(0, 10),
        lessonContent: content.lessonContent,
        homework: content.homework,
        comments,
      })

      if (result.error || result.posted.length === 0) {
        log(`[AutoSend] ${cls.code}: gửi LMS thất bại — ${result.error ?? 'không HS nào được gửi'}`)
        return content
      }
      return { ...content, postedToLms: true }
    } catch (err) {
      log(`[AutoSend] ${cls.code}: lỗi gửi LMS — ${(err as Error).message}`)
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
      const message = buildZaloMessage(cls, session, content, cfg.zaloMessageTemplate)
      await this.deps.writeZaloMessage(cls.code, session.dateTime.slice(0, 10), message)
      return { ...content, zaloSentAt: new Date().toISOString() }
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
