import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { chromium, BrowserContext } from 'playwright'
import { ZaloSendResult } from '../../shared/types'
import { WorkflowMutex } from './WorkflowMutex'

export const ZALO_TEST_SEARCH_TERM = 'Dương' as const
const ZALO_URL = 'https://chat.zalo.me/'

export const ZALO_SELECTORS = {
  loggedInShell: '#contact-search-input',
  searchInput: '#contact-search-input[data-id="txt_Main_Search"]',
  searchResult: [
    '.ReactVirtualized__List .conv-item[id^="friend-item-"]',
    '.ReactVirtualized__List .conv-item[id^="group-item-"]',
  ].join(', '),
  composer: '#chat-input-container-id #richInput',
  sendButton: '#chat-input-container-id .send-msg-btn[data-translate-title="STR_SEND"]',
  outgoingBubble: '.message-frame.me [data-id="div_SentMsg_Text"] .text',
} as const

interface ZaloLocator {
  count(): Promise<number>
  fill(value: string): Promise<void>
  click(): Promise<void>
  press(key: string): Promise<void>
  type(value: string): Promise<void>
  innerText(): Promise<string>
  nth(index: number): ZaloLocator
}

export interface ZaloPage {
  goto(url: string): Promise<unknown>
  bringToFront(): Promise<void>
  locator(selector: string): ZaloLocator
  content(): Promise<string>
  screenshot(options: { path: string; fullPage: boolean }): Promise<unknown>
}

export interface ZaloWebAutomatorOptions {
  pageFactory?: () => Promise<ZaloPage>
  workflowMutex?: WorkflowMutex
  saveDebug?: (page: ZaloPage, step: string) => Promise<void>
}

export function normalizeZaloMessage(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim()
}

export class ZaloWebAutomator {
  private context: BrowserContext | null = null
  private page: ZaloPage | null = null
  private readonly workflowMutex: WorkflowMutex
  private readonly pageFactory?: () => Promise<ZaloPage>
  private readonly saveDebugOverride?: (page: ZaloPage, step: string) => Promise<void>

  constructor(
    private readonly profileDir: string,
    options: ZaloWebAutomatorOptions = {},
  ) {
    this.workflowMutex = options.workflowMutex ?? new WorkflowMutex()
    this.pageFactory = options.pageFactory
    this.saveDebugOverride = options.saveDebug
  }

  async sendMessage(input: {
    searchTerm: string
    message: string
  }): Promise<ZaloSendResult> {
    return this.workflowMutex.runExclusive(async () => {
      const page = await this.ensurePage()
      try {
        if (await page.locator(ZALO_SELECTORS.loggedInShell).count() === 0) {
          await page.bringToFront()
          return {
            status: 'login-required',
            message: 'Cần đăng nhập Zalo Web rồi gửi lại.',
          }
        }

        const searchInput = page.locator(ZALO_SELECTORS.searchInput)
        await searchInput.fill('')
        await searchInput.fill(input.searchTerm)

        const results = page.locator(ZALO_SELECTORS.searchResult)
        if (await results.count() === 0) {
          throw new Error(`Không tìm thấy kết quả Zalo cho "${input.searchTerm}".`)
        }
        await results.nth(0).click()

        const composer = page.locator(ZALO_SELECTORS.composer)
        await composer.click()
        await composer.press('Control+A')
        await composer.press('Backspace')
        await composer.type(input.message)
        await page.locator(ZALO_SELECTORS.sendButton).click()

        if (normalizeZaloMessage(await composer.innerText()) !== '') {
          throw new Error('Zalo chưa xóa nội dung khỏi ô soạn sau khi gửi.')
        }

        const outgoing = page.locator(ZALO_SELECTORS.outgoingBubble)
        const outgoingCount = await outgoing.count()
        const newest = outgoingCount > 0
          ? await outgoing.nth(outgoingCount - 1).innerText()
          : ''
        if (normalizeZaloMessage(newest) !== normalizeZaloMessage(input.message)) {
          throw new Error('Zalo không xác nhận được tin nhắn vừa gửi.')
        }
        return { status: 'sent' }
      } catch (error) {
        await this.saveDebug(page, 'send')
        throw error
      }
    })
  }

  async close(): Promise<void> {
    await this.workflowMutex.runExclusive(async () => {
      await this.context?.close()
      this.context = null
      this.page = null
    })
  }

  private async ensurePage(): Promise<ZaloPage> {
    if (this.page) return this.page
    if (this.pageFactory) {
      this.page = await this.pageFactory()
    } else {
      this.context = await chromium.launchPersistentContext(this.profileDir, {
        headless: false,
        channel: 'chrome',
        args: ['--no-sandbox'],
        viewport: { width: 1280, height: 800 },
      })
      this.page = (this.context.pages()[0] ?? await this.context.newPage()) as ZaloPage
    }
    await this.page.goto(ZALO_URL)
    return this.page
  }

  private async saveDebug(page: ZaloPage, step: string): Promise<void> {
    if (this.saveDebugOverride) {
      await this.saveDebugOverride(page, step)
      return
    }
    await fs.mkdir(this.profileDir, { recursive: true })
    await fs.writeFile(
      join(this.profileDir, 'zalo-send-debug.html'),
      await page.content(),
      'utf8',
    )
    await page.screenshot({
      path: join(this.profileDir, 'zalo-send-debug.png'),
      fullPage: true,
    })
  }
}
