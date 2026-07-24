import { describe, it, expect } from 'vitest'
import { newId } from './id'

describe('newId', () => {
  it('trả chuỗi không rỗng', () => {
    expect(typeof newId()).toBe('string')
    expect(newId().length).toBeGreaterThan(0)
  })
  it('mỗi lần gọi ra id khác nhau', () => {
    expect(newId()).not.toBe(newId())
  })
})
