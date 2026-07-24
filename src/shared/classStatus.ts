import { ClassSession } from './types'

export type ClassStatus = 'chưa bắt đầu' | 'đang diễn ra' | 'đã kết thúc'

export function getClassStatus(sessions: ClassSession[], now: Date = new Date()): ClassStatus {
  if (sessions.length === 0) return 'chưa bắt đầu'
  const dates = sessions.map(s => new Date(s.dateTime)).sort((a, b) => a.getTime() - b.getTime())
  if (now < dates[0]) return 'chưa bắt đầu'
  if (now > dates[dates.length - 1]) return 'đã kết thúc'
  return 'đang diễn ra'
}
