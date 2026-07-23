import {
  AutoSendConfig,
  LegacyAutoSendConfig,
  SchoolClass,
  ClassSession,
  SessionContent,
} from './types'
import { fillTemplate, formatCommentLines, formatSessionDate } from './zaloTemplate'
import { isLmsBlockedSession } from './sessionContent'
import { getClassStatus } from './classStatus'

/** Buổi học gần nhất có dateTime < now (không phụ thuộc trạng thái nội dung). */
export function nearestPastSession(sessions: ClassSession[], now: Date = new Date()): ClassSession | undefined {
  const past = sessions
    .filter(s => new Date(s.dateTime) < now)
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
  return past[0]
}

export function normalizeAutoSend(
  value?: AutoSendConfig | LegacyAutoSendConfig,
): AutoSendConfig {
  if (!value) {
    return { time: '18:00', lmsEnabled: false, zaloEnabled: false }
  }
  if ('enabled' in value) {
    return {
      time: value.time,
      lmsEnabled: value.enabled,
      zaloEnabled: value.enabled,
    }
  }
  return value
}

/** Thời điểm hẹn theo ngày địa phương của chính buổi học. */
export function scheduledAt(session: ClassSession, time: string): Date | null {
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  const date = session.dateTime.slice(0, 10)
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const result = new Date(`${date}T${match[1]}:${match[2]}:00`)
  return Number.isNaN(result.getTime()) ? null : result
}

export interface AutoSendPlan {
  session: ClassSession
  content: SessionContent
  needLms: boolean
  needZalo: boolean
}

/**
 * Tính buổi + việc cần làm cho 1 lớp, tại thời điểm `now`.
 * Trả về null nếu: chưa tới giờ hẹn, chưa bật, không có buổi đã qua, buổi chưa soạn nội dung,
 * hoặc đã gửi xong cả hai kênh.
 */
export function planAutoSend(cls: SchoolClass, content: SessionContent | null, now: Date = new Date()): AutoSendPlan | null {
  if (getClassStatus(cls.sessions, now) !== 'đang diễn ra') return null
  const config = normalizeAutoSend(cls.autoSend)
  if (!config.lmsEnabled && !config.zaloEnabled) return null

  const session = nearestPastSession(cls.sessions, now)
  if (!session) return null
  if (!content) return null
  const due = scheduledAt(session, config.time)
  if (!due || now < due) return null

  // Buổi #4/#9 có cơ chế đặc biệt → chặn gửi LMS (phase sau mới xử lý)
  const needLms = config.lmsEnabled
    && !content.postedToLms
    && !isLmsBlockedSession(cls.sessions, session.id)
  const needZalo = config.zaloEnabled && !content.zaloSentAt
  if (!needLms && !needZalo) return null

  return { session, content, needLms, needZalo }
}

/** Dựng tin Zalo giống hệt bản xem trước trong SessionComposer. */
export function buildZaloMessage(
  cls: SchoolClass,
  session: ClassSession,
  content: SessionContent,
  template: string,
): string {
  const absentIds = new Set(content.absentStudentIds ?? [])
  const commentFor = (studentId: string): { raw: string; polished: string } =>
    content.comments.find(c => c.studentId === studentId) ?? { raw: '', polished: '' }

  return fillTemplate(template, {
    ten_lop: cls.name || cls.code,
    ngay_buoi_hoc: formatSessionDate(session.dateTime),
    noi_dung_bai_hoc: content.lessonContent,
    danh_sach_nhan_xet: formatCommentLines(
      cls.students.map(s => ({
        name: s.name,
        text: absentIds.has(s.id)
          ? 'nghỉ'
          : commentFor(s.id).polished || commentFor(s.id).raw,
      })),
    ),
    bai_tap_ve_nha: content.homework,
  })
}
