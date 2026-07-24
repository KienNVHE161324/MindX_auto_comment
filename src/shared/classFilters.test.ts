import { describe, expect, it } from 'vitest'
import {
  ALL_CLASS_PROGRAMS,
  DEFAULT_CLASS_FILTERS,
  filterClasses,
  getClassProgram,
} from './classFilters'
import { SchoolClass } from './types'

const now = new Date('2026-07-23T12:00:00')

function cls(
  id: string,
  code: string,
  sessions: SchoolClass['sessions'],
): SchoolClass {
  return { id, code, name: code, students: [], sessions }
}

const runningSessions = [
  { id: 'past', dateTime: '2026-07-20T09:00:00' },
  { id: 'future', dateTime: '2026-07-27T09:00:00' },
]
const futureSessions = [{ id: 'future', dateTime: '2026-07-27T09:00:00' }]
const endedSessions = [{ id: 'past', dateTime: '2026-07-20T09:00:00' }]

describe('getClassProgram', () => {
  it.each([
    ['ABC-R01', 'robotics'],
    ['MD-g02', 'game'],
    ['C-J03', 'web'],
    ['X-s04', 'scratch'],
    ['NO-DASH', 'other'],
    ['ABC-', 'other'],
    ['', 'other'],
  ] as const)('%s -> %s', (code, expected) => {
    expect(getClassProgram(code)).toBe(expected)
  })
})

describe('filterClasses', () => {
  const classes = [
    cls('running-r', 'ABC-R01', runningSessions),
    cls('running-other', 'ABC-X01', runningSessions),
    cls('future-g', 'ABC-G01', futureSessions),
    cls('ended-j', 'ABC-J01', endedSessions),
  ]

  it('mặc định chỉ hiện lớp đang diễn ra và vẫn giữ loại other', () => {
    expect(filterClasses(classes, DEFAULT_CLASS_FILTERS, now).map(item => item.id))
      .toEqual(['running-r', 'running-other'])
  })

  it('kết hợp trạng thái và loại theo AND', () => {
    expect(filterClasses(classes, {
      statuses: new Set(['chưa bắt đầu', 'đã kết thúc']),
      programs: new Set(['game', 'web']),
    }, now).map(item => item.id)).toEqual(['future-g', 'ended-j'])
  })

  it('ẩn other ngay khi thu hẹp loại lớp', () => {
    expect(filterClasses(classes, {
      statuses: new Set(['đang diễn ra']),
      programs: new Set(['robotics', 'game', 'web']),
    }, now).map(item => item.id)).toEqual(['running-r'])
  })

  it('bỏ chọn hết trạng thái hoặc loại đều trả danh sách rỗng', () => {
    expect(filterClasses(classes, {
      statuses: new Set(),
      programs: new Set(ALL_CLASS_PROGRAMS),
    }, now)).toEqual([])
    expect(filterClasses(classes, {
      statuses: new Set(['đang diễn ra']),
      programs: new Set(),
    }, now)).toEqual([])
  })
})
