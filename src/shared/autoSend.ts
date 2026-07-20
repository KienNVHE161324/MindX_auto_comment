import { SchoolClass, ClassSession, SessionContent } from './types'
import { fillTemplate, formatCommentLines, formatSessionDate } from './zaloTemplate'

/** Buổi học gần nhất có dateTime < now (không phụ thuộc trạng thái nội dung). */
export function nearestPastSession(sessions: ClassSession[], now: Date = new Date()): ClassSession | undefined {
  const past = sessions
    .filter(s => new Date(s.dateTime) < now)
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
  return past[0]
}

/** Đã tới hoặc qua giờ hẹn 'HH:mm' của ngày hôm nay (theo giờ máy). */
export function isAutoSendDue(time: string, now: Date = new Date()): boolean {
  const m = time.match(/^(\d{2}):(\d{2})$/)
  if (!m) return false
  const scheduled = new Date(now)
  scheduled.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return now >= scheduled
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
  if (!cls.autoSend?.enabled) return null
  if (!isAutoSendDue(cls.autoSend.time, now)) return null

  const session = nearestPastSession(cls.sessions, now)
  if (!session) return null
  if (!content) return null

  const needLms = !content.postedToLms
  const needZalo = !content.zaloSentAt
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
      cls.students
        .filter(s => !absentIds.has(s.id))
        .map(s => ({ name: s.name, text: commentFor(s.id).polished || commentFor(s.id).raw })),
    ),
    bai_tap_ve_nha: content.homework,
  })
}
