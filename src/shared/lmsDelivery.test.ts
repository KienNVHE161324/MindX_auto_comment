import { describe, expect, it } from 'vitest'
import { assessLmsDelivery } from './lmsDelivery'

const students = [
  { id: 's1', name: 'Lương Ngọc Việt' },
  { id: 's2', name: 'Nguyễn Sách Sâm' },
]

describe('assessLmsDelivery', () => {
  it('allows Zalo when every student is posted or explicitly absent', () => {
    expect(assessLmsDelivery(students, {
      posted: ['Lương Ngọc Việt'],
      skipped: ['Nguyễn Sách Sâm'],
      absentStudentNames: ['Nguyễn Sách Sâm'],
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
