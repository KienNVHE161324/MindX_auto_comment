import { describe, expect, it, vi } from 'vitest'
import {
  normalizeZaloMessage,
  ZaloWebAutomator,
  ZALO_SELECTORS,
  ZALO_TEST_SEARCH_TERM,
} from './ZaloWebAutomator'
import { WorkflowMutex } from './WorkflowMutex'

function locator(overrides: Record<string, unknown> = {}) {
  return {
    count: vi.fn(async () => 1),
    fill: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    press: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    innerText: vi.fn(async () => ''),
    nth: vi.fn(),
    ...overrides,
  }
}

function createHarness() {
  const loggedIn = locator()
  const searchInput = locator()
  const firstResult = locator()
  const secondResult = locator()
  const searchResults = locator({
    count: vi.fn(async () => 2),
    nth: vi.fn((index: number) => [firstResult, secondResult][index]),
  })
  const composer = locator()
  const sendButton = locator()
  const outgoing = locator({
    count: vi.fn(async () => 1),
    nth: vi.fn(() => locator({ innerText: vi.fn(async () => 'Xin chào') })),
  })
  const page = {
    goto: vi.fn(async () => {}),
    bringToFront: vi.fn(async () => {}),
    content: vi.fn(async () => '<html></html>'),
    screenshot: vi.fn(async () => {}),
    locator: vi.fn((selector: string) => {
      if (selector === ZALO_SELECTORS.loggedInShell) return loggedIn
      if (selector === ZALO_SELECTORS.searchInput) return searchInput
      if (selector === ZALO_SELECTORS.searchResult) return searchResults
      if (selector === ZALO_SELECTORS.composer) return composer
      if (selector === ZALO_SELECTORS.sendButton) return sendButton
      if (selector === ZALO_SELECTORS.outgoingBubble) return outgoing
      throw new Error(`Unexpected selector: ${selector}`)
    }),
  }
  return {
    page, loggedIn, searchInput, firstResult, secondResult,
    searchResults, composer, sendButton, outgoing,
  }
}

describe('Zalo Web helpers', () => {
  it('uses the approved Phase 3 search term', () => {
    expect(ZALO_TEST_SEARCH_TERM).toBe('Dương')
  })

  it('normalizes NBSP, CRLF and repeated whitespace for bubble verification', () => {
    expect(normalizeZaloMessage('A\u00a0B\r\n C  D ')).toBe('A B\nC D')
  })

  it('opens Zalo and returns login-required without typing when not logged in', async () => {
    const harness = createHarness()
    harness.loggedIn.count.mockResolvedValue(0)
    const automator = new ZaloWebAutomator('C:/tmp/zalo-test', {
      pageFactory: async () => harness.page,
      workflowMutex: new WorkflowMutex(),
    })

    await expect(automator.sendMessage({
      searchTerm: 'Dương',
      message: 'Xin chào',
    })).resolves.toEqual({
      status: 'login-required',
      message: 'Cần đăng nhập Zalo Web rồi gửi lại.',
    })
    expect(harness.page.goto).toHaveBeenCalledWith('https://chat.zalo.me/')
    expect(harness.page.bringToFront).toHaveBeenCalledOnce()
    expect(harness.searchInput.fill).not.toHaveBeenCalled()
  })

  it('selects first result, clears draft, sends and verifies outgoing bubble', async () => {
    const harness = createHarness()
    const automator = new ZaloWebAutomator('C:/tmp/zalo-test', {
      pageFactory: async () => harness.page,
      workflowMutex: new WorkflowMutex(),
    })

    await expect(automator.sendMessage({
      searchTerm: 'Dương',
      message: 'Xin chào',
    })).resolves.toEqual({ status: 'sent' })

    expect(harness.searchInput.fill).toHaveBeenNthCalledWith(1, '')
    expect(harness.searchInput.fill).toHaveBeenNthCalledWith(2, 'Dương')
    expect(harness.firstResult.click).toHaveBeenCalledOnce()
    expect(harness.secondResult.click).not.toHaveBeenCalled()
    expect(harness.composer.press).toHaveBeenNthCalledWith(1, 'Control+A')
    expect(harness.composer.press).toHaveBeenNthCalledWith(2, 'Backspace')
    expect(harness.composer.type).toHaveBeenCalledWith('Xin chào')
    expect(harness.sendButton.click).toHaveBeenCalledOnce()
  })

  it('does not retry after click when outgoing verification fails', async () => {
    const harness = createHarness()
    harness.outgoing.nth.mockReturnValue(
      locator({ innerText: vi.fn(async () => 'Tin khác') }),
    )
    const saveDebug = vi.fn(async () => {})
    const automator = new ZaloWebAutomator('C:/tmp/zalo-test', {
      pageFactory: async () => harness.page,
      workflowMutex: new WorkflowMutex(),
      saveDebug,
    })

    await expect(automator.sendMessage({
      searchTerm: 'Dương',
      message: 'Xin chào',
    })).rejects.toThrow(/không xác nhận được/i)
    expect(harness.sendButton.click).toHaveBeenCalledOnce()
    expect(saveDebug).toHaveBeenCalledOnce()
  })
})
