import { describe, it, expect } from 'vitest'
import { getClassStatus } from './classStatus'
import { ClassSession } from './types'

const s = (dateTime: string): ClassSession => ({ id: dateTime, dateTime })

describe('getClassStatus', () => {
  it('không có buổi nào -> chưa bắt đầu', () => {
    expect(getClassStatus([])).toBe('chưa bắt đầu')
  })

  it('buổi đầu tiên còn ở tương lai -> chưa bắt đầu', () => {
    const now = new Date('2026-07-17T00:00:00')
    expect(getClassStatus([s('2026-08-01T14:00:00')], now)).toBe('chưa bắt đầu')
  })

  it('now nằm giữa buổi đầu và buổi cuối -> đang diễn ra', () => {
    const now = new Date('2026-07-17T00:00:00')
    expect(getClassStatus([s('2026-07-01T14:00:00'), s('2026-08-01T14:00:00')], now)).toBe('đang diễn ra')
  })

  it('now sau buổi cuối cùng -> đã kết thúc', () => {
    const now = new Date('2026-07-17T00:00:00')
    expect(getClassStatus([s('2026-01-01T14:00:00'), s('2026-02-01T14:00:00')], now)).toBe('đã kết thúc')
  })
})
