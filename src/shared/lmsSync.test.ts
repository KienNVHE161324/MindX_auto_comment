import { describe, it, expect } from 'vitest'
import {
  computeContentTargets,
  excludeAbsentSkipped,
  matchStudentByName,
  mergeAbsentStudentNames,
  mergeContentResult,
} from './lmsSync'
import { SchoolClass, ClassSession, LmsContentResult } from './types'

describe('computeContentTargets', () => {
  const now = new Date('2026-07-17T00:00:00')

  it('lớp đã kết thúc -> không có target', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [{ id: 'ss1', dateTime: '2026-01-01T14:00:00' }],
    }
    expect(computeContentTargets([cls], () => false, now)).toEqual([])
  })

  it('chưa có buổi nào đã qua -> không có target', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [{ id: 'ss1', dateTime: '2026-08-01T14:00:00' }],
    }
    expect(computeContentTargets([cls], () => false, now)).toEqual([])
  })

  it('buổi gần nhất đã qua và đã có content -> không có target', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [
        { id: 'ss1', dateTime: '2026-07-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-08-01T14:00:00' },
      ],
    }
    expect(computeContentTargets([cls], id => id === 'ss1', now)).toEqual([])
  })

  it('buổi gần nhất đã qua chưa có content -> trả về target đúng buổi đó', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [
        { id: 'ss1', dateTime: '2026-07-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-07-10T14:00:00' },
        { id: 'ss3', dateTime: '2026-08-01T14:00:00' },
      ],
    }
    expect(computeContentTargets([cls], () => false, now)).toEqual([
      { classCode: 'A1', sessionId: 'ss2', sessionDate: '2026-07-10' },
    ])
  })
})

describe('matchStudentByName', () => {
  const students = [{ id: 's1', name: 'Nguyễn Văn An' }, { id: 's2', name: 'Bình' }]

  it('khớp chính xác', () => {
    expect(matchStudentByName(students, 'Bình')?.id).toBe('s2')
  })

  it('khớp khi tên LMS là chuỗi con của tên local', () => {
    expect(matchStudentByName(students, 'An')?.id).toBe('s1')
  })

  it('không khớp -> undefined', () => {
    expect(matchStudentByName(students, 'Không tồn tại')).toBeUndefined()
  })
})

describe('mergeAbsentStudentNames', () => {
  it('khớp tên LMS, hợp nhất ID mới và giữ ID nghỉ cũ', () => {
    expect(mergeAbsentStudentNames(
      [{ id: 's1', name: 'An' }, { id: 's2', name: 'Nguyễn Sách Sâm' }],
      ['s1'],
      ['sách sâm'],
    )).toEqual(['s1', 's2'])
  })

  it('tên lỗi kỹ thuật không nằm trong danh sách nghỉ thì không bị thêm', () => {
    expect(mergeAbsentStudentNames(
      [{ id: 's1', name: 'Phạm Bá Long' }],
      [],
      [],
    )).toEqual([])
  })
})

describe('excludeAbsentSkipped', () => {
  it('loại học sinh nghỉ khỏi các dòng bị bỏ qua bằng tên đã chuẩn hóa', () => {
    expect(excludeAbsentSkipped(
      ['Nguyễn Sách Sâm', 'Phạm Bá Long (lỗi: timeout)'],
      ['Sách Sâm'],
    )).toEqual(['Phạm Bá Long (lỗi: timeout)'])
  })

  it('giữ skip kỹ thuật khi tên nghỉ chỉ là chuỗi con của tên khác', () => {
    expect(excludeAbsentSkipped(
      ['Thanh (lỗi: timeout)'],
      ['An'],
    )).toEqual(['Thanh (lỗi: timeout)'])
  })
})

describe('mergeContentResult', () => {
  const cls: SchoolClass = {
    id: 'c1', code: 'A1', name: 'A1',
    students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Bình' }],
    sessions: [],
  }
  const session: ClassSession = { id: 'ss1', dateTime: '2026-07-10T14:00:00' }

  it('HS có mặt -> tạo StudentComment với raw = polished = comment gốc', () => {
    const result: LmsContentResult = {
      classCode: 'A1', sessionDate: '2026-07-10',
      lessonContent: 'Bài học', homework: 'BT',
      students: [{ name: 'An', attended: true, comment: 'Ngoan' }],
    }
    const content = mergeContentResult(cls, session, result)
    expect(content).toEqual({
      id: 'ss1', classId: 'c1', sessionId: 'ss1',
      lessonContent: 'Bài học', homework: 'BT',
      comments: [{ studentId: 's1', raw: 'Ngoan', polished: 'Ngoan' }],
      absentStudentIds: [],
    })
  })

  it('HS nghỉ -> vào absentStudentIds, không có StudentComment', () => {
    const result: LmsContentResult = {
      classCode: 'A1', sessionDate: '2026-07-10',
      lessonContent: 'Bài học', homework: 'BT',
      students: [{ name: 'Bình', attended: false, comment: '' }],
    }
    const content = mergeContentResult(cls, session, result)
    expect(content.comments).toEqual([])
    expect(content.absentStudentIds).toEqual(['s2'])
  })

  it('tên không khớp HS nào -> bỏ qua, không lỗi', () => {
    const result: LmsContentResult = {
      classCode: 'A1', sessionDate: '2026-07-10',
      lessonContent: '', homework: '',
      students: [{ name: 'Học sinh lạ', attended: true, comment: 'x' }],
    }
    const content = mergeContentResult(cls, session, result)
    expect(content.comments).toEqual([])
    expect(content.absentStudentIds).toEqual([])
  })
})
