import { describe, expect, it, vi } from 'vitest'
import { WorkflowMutex } from './WorkflowMutex'
import {
  ZALO_TEST_SEARCH_TERM,
  ZaloDesktopAutomator,
} from './ZaloDesktopAutomator'

describe('ZaloDesktopAutomator', () => {
  it('uses the exact Unicode test search term', () => {
    expect(ZALO_TEST_SEARCH_TERM).toBe('Dương')
  })

  it('sends through the desktop bridge and maps success', async () => {
    const bridge = { send: vi.fn(async () => ({ status: 'sent' as const })) }
    const automator = new ZaloDesktopAutomator(
      bridge,
      'C:/debug',
      new WorkflowMutex(),
    )
    await expect(automator.sendMessage({
      searchTerm: ZALO_TEST_SEARCH_TERM,
      message: 'Tin nhắn',
    })).resolves.toEqual({ status: 'sent' })
    expect(bridge.send).toHaveBeenCalledWith({
      searchTerm: 'Dương',
      message: 'Tin nhắn',
      debugDir: 'C:/debug',
    })
  })
})
