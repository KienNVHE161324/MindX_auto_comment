import { describe, it, expect } from 'vitest'
import {
  computeContentTargets,
  detectDroppedOut,
  excludeAbsentSkipped,
  matchStudentByName,
  mergeAbsentStudentNames,
  mergeContentResult,
  normalizeStudentName,
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

  it('buổi gần nhất đã qua dù ĐÃ có content vẫn trả target (để cập nhật điểm danh)', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [
        { id: 'ss1', dateTime: '2026-07-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-08-01T14:00:00' },
      ],
    }
    expect(computeContentTargets([cls], () => true, now)).toEqual([
      { classCode: 'A1', sessionId: 'ss1', sessionDate: '2026-07-01' },
    ])
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

  it('ưu tiên exact trước partial dù partial đứng trước', () => {
    const withExact = [
      { id: 's1', name: 'Bảo An' },
      { id: 's2', name: 'An' },
    ]

    expect(matchStudentByName(withExact, 'An')?.id).toBe('s2')
  })

  it('chỉ khớp partial khi có đúng một ứng viên', () => {
    const ambiguous = [
      { id: 's1', name: 'Nguyễn Văn An' },
      { id: 's2', name: 'Trần Bảo An' },
    ]

    expect(matchStudentByName(ambiguous, 'An')).toBeUndefined()
    expect(matchStudentByName(ambiguous, 'Văn An')?.id).toBe('s1')
  })
})

describe('normalizeStudentName', () => {
  it('trim, lowercase và collapse whitespace để duplicate key nhất quán', () => {
    expect(normalizeStudentName('  NGUYỄN   VĂN\nAN  ')).toBe('nguyễn văn an')
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

  it('tên nghỉ partial mơ hồ không tự map sang học sinh đầu tiên', () => {
    expect(mergeAbsentStudentNames(
      [{ id: 's1', name: 'Nguyễn Văn An' }, { id: 's2', name: 'Trần Bảo An' }],
      [],
      ['An'],
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

  it('ưu tiên exact khi loại absence khỏi report nên không xóa nhầm tên dài hơn', () => {
    expect(excludeAbsentSkipped(
      ['An', 'Bảo An'],
      ['An'],
    )).toEqual(['Bảo An'])
  })

  it('giữ tất cả skip khi partial absence mơ hồ', () => {
    expect(excludeAbsentSkipped(
      ['Nguyễn Văn An', 'Trần Bảo An'],
      ['An'],
    )).toEqual(['Nguyễn Văn An', 'Trần Bảo An'])
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
      attendedStudentIds: ['s1'],
    })
  })

  it('ghi đè bài học + nhận xét bằng dữ liệu LMS mới, cập nhật điểm danh', () => {
    const result: LmsContentResult = {
      classCode: 'A1', sessionDate: '2026-07-10',
      lessonContent: 'Bài từ LMS', homework: 'BT LMS',
      students: [
        { name: 'An', attended: true, comment: 'Nhận xét LMS' },
        { name: 'Bình', attended: false, comment: '' },
      ],
    }
    const existing = {
      id: 'ss1', classId: 'c1', sessionId: 'ss1',
      lessonContent: 'Bài do người dùng soạn', homework: 'BT app',
      comments: [{ studentId: 's1', raw: 'Nháp app', polished: '' }],
    }
    const content = mergeContentResult(cls, session, result, existing)
    expect(content.lessonContent).toBe('Bài từ LMS')
    expect(content.homework).toBe('BT LMS')
    expect(content.comments).toEqual([{ studentId: 's1', raw: 'Nhận xét LMS', polished: 'Nhận xét LMS' }])
    expect(content.attendedStudentIds).toEqual(['s1'])
    expect(content.absentStudentIds).toEqual(['s2'])
  })

  it('LMS chưa có nhận xét cho HS -> giữ nhận xét app cũ, vẫn ghi điểm danh', () => {
    const result: LmsContentResult = {
      classCode: 'A1', sessionDate: '2026-07-10',
      lessonContent: 'Bài từ LMS', homework: '',
      students: [{ name: 'An', attended: true, comment: '' }],
    }
    const existing = {
      id: 'ss1', classId: 'c1', sessionId: 'ss1',
      lessonContent: 'x', homework: '',
      comments: [{ studentId: 's1', raw: 'Nháp app', polished: 'Đã sửa' }],
    }
    const content = mergeContentResult(cls, session, result, existing)
    expect(content.comments).toEqual([{ studentId: 's1', raw: 'Nháp app', polished: 'Đã sửa' }])
    expect(content.attendedStudentIds).toEqual(['s1'])
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

  it('tên LMS partial mơ hồ -> không ghi nhận xét hoặc nghỉ sai học sinh', () => {
    const ambiguousClass: SchoolClass = {
      ...cls,
      students: [
        { id: 's1', name: 'Nguyễn Văn An' },
        { id: 's2', name: 'Trần Bảo An' },
      ],
    }
    const result: LmsContentResult = {
      classCode: 'A1',
      sessionDate: '2026-07-10',
      lessonContent: 'Bài học',
      homework: '',
      students: [
        { name: 'An', attended: true, comment: 'Ngoan' },
        { name: 'An', attended: false, comment: '' },
      ],
    }

    const content = mergeContentResult(ambiguousClass, session, result)
    expect(content.comments).toEqual([])
    expect(content.absentStudentIds).toEqual([])
  })
})

describe('detectDroppedOut', () => {
  const students = [
    { id: 's1', name: 'An' },
    { id: 's2', name: 'Bình' },
  ]

  it('HS không còn trên LMS -> droppedOut:true; còn trên LMS -> false', () => {
    expect(detectDroppedOut(students, ['An'])).toEqual([
      { id: 's1', droppedOut: false },
      { id: 's2', droppedOut: true },
    ])
  })

  it('khớp tên không phân biệt hoa thường/khoảng trắng', () => {
    expect(detectDroppedOut(students, ['  an  ', 'BÌNH'])).toEqual([
      { id: 's1', droppedOut: false },
      { id: 's2', droppedOut: false },
    ])
  })
})
