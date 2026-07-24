import { describe, it, expect } from 'vitest'
import { getSessionContentStatus, findPreviousSession, copySessionContent, getClassProgress, getSessionNumber, isLmsBlockedSession } from './sessionContent'
import { ClassSession, SessionContent } from './types'

describe('getSessionContentStatus', () => {
  it('không có content -> chưa có nội dung', () => {
    expect(getSessionContentStatus(null)).toBe('chưa có nội dung')
    expect(getSessionContentStatus(undefined)).toBe('chưa có nội dung')
  })

  it('có content, chưa gửi LMS -> đã soạn nội dung', () => {
    const content: SessionContent = {
      id: 'ss1', classId: 'c1', sessionId: 'ss1', lessonContent: 'x', homework: '', comments: [],
    }
    expect(getSessionContentStatus(content)).toBe('đã soạn nội dung')
  })

  it('có content, postedToLms=true -> đã nhận xét', () => {
    const content: SessionContent = {
      id: 'ss1', classId: 'c1', sessionId: 'ss1', lessonContent: 'x', homework: '', comments: [],
      postedToLms: true,
    }
    expect(getSessionContentStatus(content)).toBe('đã nhận xét')
  })
})

describe('findPreviousSession', () => {
  const sessions: ClassSession[] = [
    { id: 'ss1', dateTime: '2026-07-01T14:00:00' },
    { id: 'ss2', dateTime: '2026-07-10T14:00:00' },
    { id: 'ss3', dateTime: '2026-07-20T14:00:00' },
  ]

  it('trả về buổi gần nhất trước buổi hiện tại', () => {
    expect(findPreviousSession(sessions, 'ss3')?.id).toBe('ss2')
  })

  it('buổi đầu tiên -> không có buổi trước', () => {
    expect(findPreviousSession(sessions, 'ss1')).toBeUndefined()
  })

  it('sessionId không tồn tại -> undefined', () => {
    expect(findPreviousSession(sessions, 'ss-x')).toBeUndefined()
  })
})

describe('getClassProgress', () => {
  const now = new Date('2026-07-17T00:00:00')
  const sessions: ClassSession[] = [
    { id: 'ss1', dateTime: '2026-07-01T14:00:00' },
    { id: 'ss2', dateTime: '2026-07-10T14:00:00' },
    { id: 'ss3', dateTime: '2026-08-01T14:00:00' },
  ]
  const posted = (id: string): SessionContent => ({ id, classId: 'c1', sessionId: id, lessonContent: '', homework: '', comments: [], postedToLms: true })

  it('đếm tổng buổi, buổi đã qua, buổi đã nhận xét', () => {
    const map: Record<string, SessionContent> = { ss1: posted('ss1') }
    expect(getClassProgress(sessions, id => map[id] ?? null, now)).toEqual({ total: 3, past: 2, commented: 1 })
  })

  it('không buổi nào -> tất cả 0', () => {
    expect(getClassProgress([], () => null, now)).toEqual({ total: 0, past: 0, commented: 0 })
  })
})

describe('getSessionNumber / isLmsBlockedSession', () => {
  // Cố tình xáo trộn thứ tự để kiểm tra sắp xếp theo thời gian
  const sessions: ClassSession[] = [
    { id: 's3', dateTime: '2026-07-15T14:00:00' },
    { id: 's1', dateTime: '2026-07-01T14:00:00' },
    { id: 's4', dateTime: '2026-07-22T14:00:00' },
    { id: 's2', dateTime: '2026-07-08T14:00:00' },
    { id: 's9', dateTime: '2026-09-01T14:00:00' },
  ]

  it('đánh số theo thứ tự thời gian, không theo thứ tự mảng', () => {
    expect(getSessionNumber(sessions, 's1')).toBe(1)
    expect(getSessionNumber(sessions, 's2')).toBe(2)
    expect(getSessionNumber(sessions, 's4')).toBe(4)
  })

  it('sessionId không tồn tại -> 0', () => {
    expect(getSessionNumber(sessions, 'x')).toBe(0)
  })

  it('buổi #4 bị chặn LMS', () => {
    expect(isLmsBlockedSession(sessions, 's4')).toBe(true)
  })

  it('buổi #1 không bị chặn', () => {
    expect(isLmsBlockedSession(sessions, 's1')).toBe(false)
  })
})

describe('copySessionContent', () => {
  it('sao chép bài học/bài tập/nhận xét, reset điểm danh và trạng thái gửi LMS', () => {
    const target: ClassSession = { id: 'ss2', dateTime: '2026-07-10T14:00:00' }
    const source: SessionContent = {
      id: 'ss1', classId: 'c1', sessionId: 'ss1',
      lessonContent: 'Bài học', homework: 'BT',
      comments: [{ studentId: 's1', raw: 'Ngoan', polished: 'Ngoan' }],
      absentStudentIds: ['s2'],
      postedToLms: true,
    }
    expect(copySessionContent(target, 'c1', source)).toEqual({
      id: 'ss2', classId: 'c1', sessionId: 'ss2',
      lessonContent: 'Bài học', homework: 'BT',
      comments: [{ studentId: 's1', raw: 'Ngoan', polished: 'Ngoan' }],
      absentStudentIds: [],
      postedToLms: false,
    })
  })
})
