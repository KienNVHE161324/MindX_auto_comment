import { describe, it, expect } from 'vitest'
import {
  nearestPastSession,
  normalizeAutoSend,
  scheduledAt,
  planAutoSend,
  buildZaloMessage,
} from './autoSend'
import { SchoolClass, ClassSession, SessionContent } from './types'

describe('nearestPastSession', () => {
  const sessions: ClassSession[] = [
    { id: 'ss1', dateTime: '2026-07-01T14:00:00' },
    { id: 'ss2', dateTime: '2026-07-10T14:00:00' },
    { id: 'ss3', dateTime: '2026-08-01T14:00:00' },
  ]
  it('trả về buổi đã qua gần nhất', () => {
    const now = new Date('2026-07-17T00:00:00')
    expect(nearestPastSession(sessions, now)?.id).toBe('ss2')
  })
  it('không có buổi nào đã qua -> undefined', () => {
    const now = new Date('2026-01-01T00:00:00')
    expect(nearestPastSession(sessions, now)).toBeUndefined()
  })
})

describe('normalizeAutoSend', () => {
  it('dữ liệu cũ enabled=true bật cả LMS và Zalo', () => {
    expect(normalizeAutoSend({ enabled: true, time: '18:30' })).toEqual({
      time: '18:30',
      lmsEnabled: true,
      zaloEnabled: true,
    })
  })

  it('dữ liệu cũ enabled=false tắt cả LMS và Zalo', () => {
    expect(normalizeAutoSend({ enabled: false, time: '18:30' })).toEqual({
      time: '18:30',
      lmsEnabled: false,
      zaloEnabled: false,
    })
  })

  it('lớp chưa cấu hình mặc định tắt hai kênh lúc 18:00', () => {
    expect(normalizeAutoSend()).toEqual({
      time: '18:00',
      lmsEnabled: false,
      zaloEnabled: false,
    })
  })
})

describe('scheduledAt', () => {
  const session = { id: 'ss1', dateTime: '2026-07-20T14:00:00' }

  it('dùng ngày của buổi học thay vì ngày hiện tại', () => {
    expect(scheduledAt(session, '18:30')?.toISOString())
      .toBe(new Date('2026-07-20T18:30:00').toISOString())
  })

  it('giờ sai định dạng -> null', () => {
    expect(scheduledAt(session, '25:00')).toBeNull()
  })
})

describe('planAutoSend', () => {
  const now = new Date('2026-07-17T19:00:00')
  const cls: SchoolClass = {
    id: 'c1', code: 'A1', name: 'A1', students: [{ id: 's1', name: 'An' }],
    sessions: [
      { id: 'ss1', dateTime: '2026-07-10T14:00:00' },
      { id: 'ss2', dateTime: '2026-07-24T14:00:00' },
    ],
    autoSend: { time: '18:00', lmsEnabled: true, zaloEnabled: true },
  }
  const content: SessionContent = {
    id: 'ss1', classId: 'c1', sessionId: 'ss1', lessonContent: 'x', homework: '', comments: [],
  }

  it('chưa bật autoSend -> null', () => {
    expect(planAutoSend({
      ...cls,
      autoSend: { time: '18:00', lmsEnabled: false, zaloEnabled: false },
    }, content, now)).toBeNull()
  })

  it('chưa tới giờ hẹn -> null', () => {
    expect(planAutoSend(cls, content, new Date('2026-07-10T17:00:00'))).toBeNull()
  })

  it('lớp đã kết thúc -> null', () => {
    expect(planAutoSend({
      ...cls,
      sessions: [{ id: 'ss1', dateTime: '2026-07-10T14:00:00' }],
    }, content, now)).toBeNull()
  })

  it('chưa có content -> null', () => {
    expect(planAutoSend(cls, null, now)).toBeNull()
  })

  it('đã gửi cả 2 kênh -> null', () => {
    expect(planAutoSend(cls, { ...content, postedToLms: true, zaloSentAt: '2026-07-17T18:01:00' }, now)).toBeNull()
  })

  it('đủ điều kiện -> trả về plan đúng buổi + việc cần làm', () => {
    expect(planAutoSend(cls, content, now)).toEqual({
      session: cls.sessions[0], content, needLms: true, needZalo: true,
    })
  })

  it('đã gửi LMS rồi -> chỉ cần Zalo', () => {
    const posted = { ...content, postedToLms: true }
    expect(planAutoSend(cls, posted, now)).toEqual({
      session: cls.sessions[0], content: posted, needLms: false, needZalo: true,
    })
  })

  it('cấu hình chỉ LMS -> không lập kế hoạch Zalo', () => {
    expect(planAutoSend({
      ...cls,
      autoSend: { time: '18:00', lmsEnabled: true, zaloEnabled: false },
    }, content, now)).toEqual({
      session: cls.sessions[0], content, needLms: true, needZalo: false,
    })
  })

  it('buổi #4 (bị chặn LMS) -> needLms=false, chỉ gửi Zalo', () => {
    // 4 buổi đã qua, buổi gần nhất là #4 → bị chặn LMS
    const blockedCls: SchoolClass = {
      ...cls,
      sessions: [
        { id: 's1', dateTime: '2026-07-01T14:00:00' },
        { id: 's2', dateTime: '2026-07-03T14:00:00' },
        { id: 's3', dateTime: '2026-07-05T14:00:00' },
        { id: 's4', dateTime: '2026-07-10T14:00:00' },
        { id: 's5', dateTime: '2026-07-24T14:00:00' },
      ],
    }
    const c4: SessionContent = { ...content, id: 's4', sessionId: 's4' }
    const plan = planAutoSend(blockedCls, c4, now)
    expect(plan?.session.id).toBe('s4')
    expect(plan?.needLms).toBe(false)
    expect(plan?.needZalo).toBe(true)
  })
})

describe('buildZaloMessage', () => {
  it('hiển thị HS nghỉ với nhận xét "nghỉ", điền đúng template', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Bình' }],
      sessions: [],
    }
    const session: ClassSession = { id: 'ss1', dateTime: '2026-07-10T14:00:00' }
    const content: SessionContent = {
      id: 'ss1', classId: 'c1', sessionId: 'ss1',
      lessonContent: 'Phép cộng', homework: 'Làm bài 5',
      comments: [{ studentId: 's1', raw: 'ngoan', polished: '' }],
      absentStudentIds: ['s2'],
    }
    const msg = buildZaloMessage(cls, session, content, 'Lớp {ten_lop}\n{noi_dung_bai_hoc}\n{danh_sach_nhan_xet}\n{bai_tap_ve_nha}')
    expect(msg).toContain('Lớp Lớp A1')
    expect(msg).toContain('Phép cộng')
    expect(msg).toContain('An: ngoan')
    expect(msg).toContain('Bình: nghỉ')
    expect(msg).toContain('Làm bài 5')
  })
})
