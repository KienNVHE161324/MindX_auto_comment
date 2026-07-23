import { describe, expect, it } from 'vitest'
import {
  normalizeZaloMessage,
  ZALO_TEST_SEARCH_TERM,
} from './ZaloWebAutomator'

describe('Zalo Web helpers', () => {
  it('uses the approved Phase 3 search term', () => {
    expect(ZALO_TEST_SEARCH_TERM).toBe('Dương')
  })

  it('normalizes NBSP, CRLF and repeated whitespace for bubble verification', () => {
    expect(normalizeZaloMessage('A\u00a0B\r\n C  D ')).toBe('A B\nC D')
  })
})
