import { ClassSession, SessionContent } from './types'

export type SessionContentStatus = 'chưa có nội dung' | 'đã soạn nội dung' | 'đã nhận xét'

export function getSessionContentStatus(content: SessionContent | null | undefined): SessionContentStatus {
  if (!content) return 'chưa có nội dung'
  if (content.postedToLms) return 'đã nhận xét'
  return 'đã soạn nội dung'
}

export interface ClassProgress {
  total: number
  /** Số buổi đã qua (dateTime < now) */
  past: number
  /** Số buổi đã gửi nhận xét lên LMS (postedToLms) */
  commented: number
}

/** Tiến độ nhận xét của 1 lớp: đã nhận xét bao nhiêu / tổng số buổi đã qua. */
export function getClassProgress(
  sessions: ClassSession[],
  getContent: (sessionId: string) => SessionContent | null | undefined,
  now: Date = new Date(),
): ClassProgress {
  let past = 0
  let commented = 0
  for (const s of sessions) {
    if (new Date(s.dateTime) < now) past++
    if (getContent(s.id)?.postedToLms) commented++
  }
  return { total: sessions.length, past, commented }
}

/**
 * Buổi #4 và #9 (theo thứ tự thời gian) có cơ chế đặc biệt (làm ở phase sau) —
 * tạm chặn gửi lên LMS cho 2 buổi này.
 */
export const LMS_BLOCKED_SESSION_NUMBERS = [4, 9]

/** Số thứ tự buổi theo thời gian (1-based). 0 nếu không tìm thấy. */
export function getSessionNumber(sessions: ClassSession[], sessionId: string): number {
  const ordered = [...sessions].sort(
    (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
  )
  return ordered.findIndex(s => s.id === sessionId) + 1
}

/** true nếu buổi này bị chặn gửi LMS (buổi #4 hoặc #9). */
export function isLmsBlockedSession(sessions: ClassSession[], sessionId: string): boolean {
  return LMS_BLOCKED_SESSION_NUMBERS.includes(getSessionNumber(sessions, sessionId))
}

/** Tìm buổi học gần nhất trước buổi hiện tại (theo dateTime), không phụ thuộc "now". */
export function findPreviousSession(
  sessions: ClassSession[],
  currentSessionId: string,
): ClassSession | undefined {
  const current = sessions.find(s => s.id === currentSessionId)
  if (!current) return undefined

  const before = sessions
    .filter(s => s.id !== currentSessionId && new Date(s.dateTime) < new Date(current.dateTime))
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())

  return before[0]
}

/** Sao chép nội dung buổi trước sang buổi đích — không mang theo điểm danh/trạng thái đã gửi. */
export function copySessionContent(target: ClassSession, classId: string, source: SessionContent): SessionContent {
  return {
    id: target.id,
    classId,
    sessionId: target.id,
    lessonContent: source.lessonContent,
    homework: source.homework,
    comments: source.comments.map(c => ({ ...c })),
    absentStudentIds: [],
    postedToLms: false,
  }
}
