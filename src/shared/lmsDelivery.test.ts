import { describe, expect, it } from 'vitest'
import { assessLmsDelivery, assessZaloReadiness } from './lmsDelivery'

const students = [
  { id: 's1', name: 'Lương Ngọc Việt' },
  { id: 's2', name: 'Nguyễn Sách Sâm' },
]

describe('assessZaloReadiness', () => {
  it('sẵn sàng khi mọi HS đã biết đi học hoặc nghỉ', () => {
    expect(assessZaloReadiness(students, {
      attendedStudentIds: ['s1'],
      absentStudentIds: ['s2'],
    })).toEqual({ ready: true, unknownStudentNames: [] })
  })

  it('chặn khi còn HS chưa rõ trạng thái', () => {
    expect(assessZaloReadiness(students, {
      attendedStudentIds: ['s1'],
      absentStudentIds: [],
    })).toEqual({ ready: false, unknownStudentNames: ['Nguyễn Sách Sâm'] })
  })

  it('bỏ qua HS nghỉ dài hạn (droppedOut)', () => {
    const roster = [
      { id: 's1', name: 'Lương Ngọc Việt' },
      { id: 's2', name: 'Nguyễn Sách Sâm', droppedOut: true },
    ]
    expect(assessZaloReadiness(roster, {
      attendedStudentIds: ['s1'],
      absentStudentIds: [],
    })).toEqual({ ready: true, unknownStudentNames: [] })
  })
})

describe('assessLmsDelivery', () => {
  it('allows Zalo when every student is posted or explicitly absent', () => {
    expect(assessLmsDelivery(students, {
      posted: ['Lương Ngọc Việt'],
      skipped: ['Nguyễn Sách Sâm'],
      absentStudentNames: ['Nguyễn Sách Sâm'],
      attendedStudentNames: ['Lương Ngọc Việt'],
    })).toEqual({
      complete: true,
      blockers: [],
      postedStudentIds: ['s1'],
      absentStudentIds: ['s2'],
    })
  })

  it('blocks a skipped student who was not explicitly absent', () => {
    expect(assessLmsDelivery(students, {
      posted: ['Lương Ngọc Việt'],
      skipped: ['Nguyễn Sách Sâm (lỗi: timeout)'],
      absentStudentNames: [],
      attendedStudentNames: ['Lương Ngọc Việt', 'Nguyễn Sách Sâm'],
    })).toEqual({
      complete: false,
      blockers: ['Nguyễn Sách Sâm'],
      postedStudentIds: ['s1'],
      absentStudentIds: [],
    })
  })

  it('blocks session-level LMS errors', () => {
    expect(assessLmsDelivery(students, {
      posted: [],
      skipped: [],
      absentStudentNames: [],
      attendedStudentNames: [],
      error: 'Không tìm thấy buổi học',
    })).toEqual({
      complete: false,
      blockers: ['LMS: Không tìm thấy buổi học'],
      postedStudentIds: [],
      absentStudentIds: [],
    })
  })

  it('keeps prior confirmed evidence and matches Unicode names exactly', () => {
    expect(assessLmsDelivery(students, {
      posted: ['  LƯƠNG   NGỌC VIỆT  '],
      skipped: [],
      absentStudentNames: [],
      attendedStudentNames: ['  LƯƠNG   NGỌC VIỆT  '],
    }, {
      absentStudentIds: ['s2'],
    })).toEqual({
      complete: true,
      blockers: [],
      postedStudentIds: ['s1'],
      absentStudentIds: ['s2'],
    })
  })
})
