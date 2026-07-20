import { describe, it, expect } from 'vitest'
import { getSessionContentStatus, findPreviousSession, copySessionContent } from './sessionContent'
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
