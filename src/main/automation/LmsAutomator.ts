import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright'
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import {
  LmsPostParams, LmsPostResult, LmsSyncResult, LmsScrapedClass,
  LmsContentTarget, LmsContentResult, LmsSyncAllResult,
} from '../../shared/types'
import { WorkflowMutex } from './WorkflowMutex'
import { normalizeStudentName, resolveUniqueNameMatch } from '../../shared/lmsSync'

const BASE_URL = 'https://lms.mindx.edu.vn'
const TIMEOUT = 30_000
const CDP_PORT = 9222
const LOGIN_WAIT_MS = 180_000

export function getLmsTabPattern(tabName: string): RegExp {
  if (tabName === 'Nhận xét') return /^(Nhận xét|Comments)$/i
  return new RegExp(tabName, 'i')
}

export function getLmsTabReadySelector(tabName: string): string | null {
  if (tabName === 'Nhận xét') {
    return '#detail-content [id^="class-comments-slot-carousel-"]'
  }
  return null
}

export function getLmsSectionPattern(section: 'summary' | 'homework'): RegExp {
  return section === 'summary'
    ? /^(Tổng\s*k\S*|Summary)$/i
    : /^(Bài.*nhà|Homework)$/i
}

export function getLmsSectionEditorSelector(): string {
  return '[contenteditable="true"], textarea, input[type="text"], .ql-editor, .ProseMirror'
}

export function getAbsentStudentPattern(): RegExp {
  return /không thể viết nhận xét|cannot comment on absent student/i
}

export function getLmsOverwriteAction(
  _existing: string,
  incoming: string,
): 'replace' | 'skip' {
  return incoming.trim() ? 'replace' : 'skip'
}

export function getStudentCommentEditorSelector(): string {
  return '.ql-editor[contenteditable="true"]'
}

export function getStudentCommentManualModeSelector(): string {
  return '[aria-label="In by-areas mode, click to switch to manual mode"]'
}

export async function isStudentCommentSaveConfirmed(
  waitForPopupToClose: () => Promise<void>,
): Promise<boolean> {
  try {
    await waitForPopupToClose()
    return true
  } catch {
    return false
  }
}

export function matchLmsCommentByStudentName(
  comments: { studentName: string; text: string }[],
  studentName: string,
): { studentName: string; text: string } | undefined {
  return resolveUniqueNameMatch(comments, studentName, comment => comment.studentName)
}

export function normalizeStudentCommentContent(content: string): string {
  return content
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isStudentCommentContentEqual(
  written: string,
  expected: string,
): boolean {
  return normalizeStudentCommentContent(written) === normalizeStudentCommentContent(expected)
}

export function getLmsDrawerRefreshSelector(): string {
  return '#detail-content header button:has(svg[data-testid="RefreshIcon"])'
}

export function getStudentCommentButtonPattern(): RegExp {
  return /nhận xét học sinh/i
}

export function makeLmsPostResult(
  posted: string[],
  absentStudentNames: string[],
  skipped: string[],
): LmsPostResult {
  return { posted, absentStudentNames, skipped }
}

export function shouldWriteLmsSection(text: string): boolean {
  return getLmsOverwriteAction('', text) === 'replace'
}

export function getCommentSessionDatePattern(sessionDate: string): RegExp {
  const [, month, day] = sessionDate.split('-')
  return new RegExp(`\\b${day}[/-]${month}\\b`)
}

export function getCommentSessionDateTextPattern(sessionDate: string): RegExp {
  const [year, month, day] = sessionDate.split('-')
  return new RegExp(`^(?:\\d{2}:\\d{2}\\s+)?${day}[/-]${month}(?:[/-]${year})?$`)
}

function checkCdpAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${CDP_PORT}/json/version`, res => {
      resolve(res.statusCode === 200)
      res.resume()
    })
    req.setTimeout(800)
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

export class LmsAutomator {
  private context: BrowserContext | null = null
  private cdpBrowser: Browser | null = null
  private readonly workflowMutex = new WorkflowMutex()

  constructor(
    private readonly sessionDir: string,
    private readonly baseUrl: string = BASE_URL,
  ) {
    this.debugDir = sessionDir  // lưu debug HTML cùng thư mục session
  }

  private readonly debugDir: string

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async launch(): Promise<void> {
    return this.workflowMutex.runExclusive(() => this.launchUnlocked())
  }

  private async launchUnlocked(): Promise<void> {
    if (this.cdpBrowser || this.context) return

    // 1. Thử kết nối Chrome đang mở qua CDP
    // Lưu ý: Playwright không track tab mở sẵn trước khi connect, nhưng cdpBrowser.newPage()
    // sẽ mở tab MỚI trong Chrome đang chạy và dùng session/cookie sẵn có → tự đăng nhập
    if (await checkCdpAvailable()) {
      try {
        this.cdpBrowser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`)
        return
      } catch {
        this.cdpBrowser = null
      }
    }

    // 2. Dùng Chrome thật đã cài (persistent session)
    try {
      this.context = await chromium.launchPersistentContext(this.sessionDir, {
        headless: false,
        channel: 'chrome',
        args: ['--no-sandbox'],
        viewport: { width: 1280, height: 800 },
      })
      return
    } catch { /* Chrome chưa cài */ }

    // 3. Fallback Chromium của Playwright
    this.context = await chromium.launchPersistentContext(this.sessionDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      viewport: { width: 1280, height: 800 },
    })
  }

  async close(): Promise<void> {
    return this.workflowMutex.runExclusive(() => this.closeUnlocked())
  }

  private async closeUnlocked(): Promise<void> {
    if (this.cdpBrowser) {
      await this.cdpBrowser.close()  // disconnect, không đóng Chrome của user
      this.cdpBrowser = null
      this.context = null
      return
    }
    if (this.context) {
      await this.context.close()
      this.context = null
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async openBrowser(email?: string, password?: string): Promise<{ loggedIn: boolean }> {
    return this.workflowMutex.runExclusive(() => this.openBrowserUnlocked(email, password))
  }

  private async openBrowserUnlocked(email?: string, password?: string): Promise<{ loggedIn: boolean }> {
    console.log('[LMS] openBrowser() bắt đầu')
    await this.launchUnlocked()
    console.log('[LMS] launch() xong, lấy page...')
    const page = await this.getPage()
    await page.bringToFront()
    console.log('[LMS] URL hiện tại:', page.url())

    // Đã ở LMS và đăng nhập → dùng luôn
    if (page.url().includes(this.baseUrl) && this.isLoggedIn(page)) {
      console.log('[LMS] Đã đăng nhập sẵn')
      return { loggedIn: true }
    }

    console.log('[LMS] Điều hướng đến /admin/classes...')
    await page.goto(`${this.baseUrl}/admin/classes`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT,
    })
    console.log('[LMS] Sau goto, URL:', page.url())

    if (this.isLoggedIn(page)) {
      console.log('[LMS] Đã đăng nhập')
      return { loggedIn: true }
    }

    // Thử tự đăng nhập bằng credentials đã lưu
    if (email && password) {
      console.log('[LMS] Thử auto-login với email:', email)
      await this.tryAutoLogin(page, email, password)
      console.log('[LMS] Sau auto-login, URL:', page.url())
      if (this.isLoggedIn(page)) return { loggedIn: true }
    }

    // Chờ user đăng nhập thủ công (tối đa 3 phút)
    console.log('[LMS] Chưa đăng nhập — chờ thủ công tối đa 3 phút. URL:', page.url())
    try {
      await page.waitForURL(
        url => !url.toString().match(/\/(login|auth|sign-?in)/i),
        { timeout: LOGIN_WAIT_MS },
      )
      return { loggedIn: true }
    } catch {
      return { loggedIn: false }
    }
  }

  async postSession(params: LmsPostParams): Promise<LmsPostResult> {
    return this.workflowMutex.runExclusive(() => this.postSessionUnlocked(params))
  }

  async runPostSessionExclusive<T>(
    operation: (
      postSession: (params: LmsPostParams) => Promise<LmsPostResult>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.workflowMutex.runExclusive(
      () => operation(params => this.postSessionUnlocked(params)),
    )
  }

  private async postSessionUnlocked(params: LmsPostParams): Promise<LmsPostResult> {
    if (!this.cdpBrowser && !this.context) {
      throw new Error('Trình duyệt LMS chưa mở. Hãy bấm "Gửi lên LMS" trước.')
    }
    const page = await this.getPage()
    await this.ensureLoggedIn(page)
    await this.findAndOpenClass(page, params.classCode)
    await this.clickTab(page, 'Nhận xét')
    await this.selectSession(page, params.sessionDate)
    await this.fillTongKet(page, params.lessonContent)
    if (shouldWriteLmsSection(params.homework)) {
      await this.fillHomework(page, params.homework)
    }
    return await this.processComments(page, params.comments)
  }

  /**
   * Lấy danh sách lớp từ /admin/classes, chỉ fetch chi tiết lớp CHƯA có trong app.
   * @param existingCodes Mã lớp đã có — bỏ qua, không fetch lại
   */
  async syncClasses(existingCodes: string[] = []): Promise<LmsSyncResult> {
    return this.workflowMutex.runExclusive(() => this.syncClassesUnlocked(existingCodes))
  }

  private async syncClassesUnlocked(existingCodes: string[]): Promise<LmsSyncResult> {
    console.log('[LMS] syncClasses() bắt đầu, existingCodes:', existingCodes)
    if (!this.cdpBrowser && !this.context) {
      throw new Error('Trình duyệt LMS chưa mở.')
    }
    const page = await this.getPage()
    console.log('[LMS] syncClasses page URL:', page.url())
    await this.ensureLoggedIn(page)

    const classes = await this.scrapeAllClasses(page, existingCodes)
    console.log('[LMS] syncClasses xong, trả về', classes.length, 'lớp')
    return { classes }
  }

  /**
   * Đồng bộ toàn diện: thêm lớp mới + lấy nội dung buổi gần nhất còn thiếu của lớp đang có.
   */
  async syncAll(
    existingCodes: string[],
    contentTargets: LmsContentTarget[],
  ): Promise<LmsSyncAllResult> {
    return this.workflowMutex.runExclusive(
      () => this.syncAllUnlocked(existingCodes, contentTargets),
    )
  }

  private async syncAllUnlocked(
    existingCodes: string[],
    contentTargets: LmsContentTarget[],
  ): Promise<LmsSyncAllResult> {
    console.log('[LMS] syncAll() bắt đầu,', contentTargets.length, 'content targets')
    if (!this.cdpBrowser && !this.context) {
      throw new Error('Trình duyệt LMS chưa mở.')
    }
    const page = await this.getPage()
    await this.ensureLoggedIn(page)

    const newClasses = await this.scrapeAllClasses(page, existingCodes)

    const contentResults: LmsContentResult[] = []
    const skippedClasses: string[] = []
    for (const target of contentTargets) {
      try {
        const result = await this.fetchContentForTarget(page, target)
        if (result) {
          contentResults.push(result)
        } else {
          console.log(`[LMS] ${target.classCode}: buổi ${target.sessionDate} chưa có nội dung trên LMS`)
          skippedClasses.push(target.classCode)
        }
      } catch (err) {
        console.error(`[LMS] Lỗi lấy nội dung ${target.classCode}:`, (err as Error).message)
        skippedClasses.push(target.classCode)
      }
    }

    console.log(`[LMS] syncAll xong: ${newClasses.length} lớp mới, ${contentResults.length} buổi cập nhật, ${skippedClasses.length} bỏ qua`)
    return { newClasses, contentResults, skippedClasses }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Tạo page mới — dùng cdpBrowser khi ở CDP mode */
  private async newPage(): Promise<Page> {
    if (this.cdpBrowser) return this.cdpBrowser.newPage()
    return this.context!.newPage()
  }

  private async getPage(): Promise<Page> {
    if (this.cdpBrowser) {
      // Playwright chỉ track tab do chính nó tạo — dùng CDP để tìm tab LMS cũ
      try {
        const session = await this.cdpBrowser.newBrowserCDPSession()
        type TargetInfo = { targetId: string; url: string; type: string }
        const { targetInfos } = await session.send('Target.getTargets') as { targetInfos: TargetInfo[] }
        await session.detach()

        const lmsTarget = targetInfos.find(
          t => t.type === 'page' && t.url.includes(this.baseUrl) && this.isUrlLoggedIn(t.url),
        )
        if (lmsTarget) {
          // Activate tab cũ rồi để openBrowser() navigate đến đúng URL
          const activateSession = await this.cdpBrowser.newBrowserCDPSession()
          await activateSession.send('Target.activateTarget', { targetId: lmsTarget.targetId })
          await activateSession.detach()
        }
      } catch { /* ignore — fallback sang newPage */ }

      // Lấy tab đã được Playwright track (vừa activate hoặc mới tạo)
      const tracked = this.cdpBrowser.contexts().flatMap(c => c.pages()).find(p => !p.isClosed())
      if (tracked) return tracked

      // Mở tab mới trong Chrome (dùng cookie sẵn có → tự đăng nhập LMS)
      return this.cdpBrowser.newPage()
    }

    const pages = this.context!.pages()
    const open = pages.find(p => !p.isClosed())
    return open ?? this.context!.newPage()
  }

  private isUrlLoggedIn(url: string): boolean {
    return !url.match(/\/(login|auth|sign-?in)/i)
  }

  private isLoggedIn(page: Page): boolean {
    return this.isUrlLoggedIn(page.url())
  }

  private async ensureLoggedIn(page: Page): Promise<void> {
    if (!this.isLoggedIn(page)) {
      throw new Error('Chưa đăng nhập LMS. Vào trình duyệt đang mở, đăng nhập, rồi thử lại.')
    }
  }

  private async findAndOpenClass(page: Page, classCode: string): Promise<void> {
    await this.openClassDrawer(page, classCode)
  }

  /**
   * Mở drawer chi tiết lớp từ danh sách /admin/classes.
   * Danh sách KHÔNG có link <a>; vào lớp qua nút "Xem chi tiết"/"View detail"
   * (span[aria-label] chứa button), bị display:none tới khi hover → JS click để tránh
   * mất hover state khi Playwright di chuột. Drawer mở bên phải, không điều hướng trang.
   */
  private async openClassDrawer(page: Page, code: string): Promise<void> {
    await page.goto(this.LIST_URL, { waitUntil: 'networkidle', timeout: TIMEOUT })
    await page.waitForSelector('[class*="MuiTableRow-hover"]', { timeout: 15_000 })

    const row = page
      .locator('[class*="MuiTableRow-hover"]')
      .filter({ has: page.locator('pre').filter({ hasText: new RegExp(`^${code}$`) }) })
      .first()
    if ((await row.count()) === 0) {
      throw new Error(`Không tìm thấy lớp "${code}" trong danh sách LMS.`)
    }
    await row.scrollIntoViewIfNeeded()

    await page.evaluate((codeStr) => {
      const pre = Array.from(document.querySelectorAll('[class*="MuiTableRow-hover"] pre'))
        .find(p => p.textContent?.trim() === codeStr)
      if (!pre) throw new Error(`Không tìm thấy pre với mã ${codeStr}`)
      const btn = pre
        .closest('[class*="MuiTableRow-hover"]')
        ?.querySelector(
          'span[aria-label="View detail"] button, span[aria-label="Xem chi tiết"] button',
        ) as HTMLElement | null
      if (!btn) throw new Error(`Không tìm thấy nút xem chi tiết cho ${codeStr}`)
      btn.click()
    }, code)

    // Drawer mở → header hiện mã lớp
    const drawerHeader = page
      .locator('[aria-labelledby="class-detail"] h6')
      .filter({ hasText: code })
    await drawerHeader.waitFor({ state: 'visible', timeout: 15_000 })
    console.log(`[LMS] Drawer ${code} đã mở`)
  }

  /** Click tab trong drawer chi tiết lớp (scope vào #detail-content để tránh nhầm tab list ngoài). */
  private async clickTab(page: Page, tabName: string): Promise<void> {
    const tab = page
      .locator('#detail-content [role="tab"]')
      .filter({ hasText: getLmsTabPattern(tabName) })
      .first()
    await tab.click({ timeout: TIMEOUT })
    // React tải dữ liệu tab qua GraphQL sau khi click; chờ đúng nội dung thay vì đoán thời gian.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    const readySelector = getLmsTabReadySelector(tabName)
    if (readySelector) {
      try {
        await page.waitForSelector(readySelector, { state: 'visible', timeout: TIMEOUT })
      } catch {
        // GraphQL của tab Comments đôi lúc treo spinner; refresh drawer một lần rồi thử lại.
        await page.locator(getLmsDrawerRefreshSelector()).click({ timeout: 5_000 })
        try {
          await page.waitForSelector(readySelector, { state: 'visible', timeout: TIMEOUT })
        } catch {
          const debugPath = path.join(this.debugDir, 'lms-comments-loading-debug.html')
          fs.writeFileSync(debugPath, await page.content(), 'utf8')
          throw new Error(`LMS không tải được dữ liệu tab Comments sau khi Refresh. HTML debug: ${debugPath}`)
        }
      }
    } else {
      await page.waitForTimeout(500)
    }
  }

  private async selectSession(page: Page, sessionDate: string): Promise<void> {
    const [year, month, day] = sessionDate.split('-')
    const display = `${day}/${month}/${year}`
    if (!(await this.selectCommentSession(page, sessionDate))) {
      const slots = await page
        .locator('[id^="class-comments-slot-carousel-"]')
        .evaluateAll(elements => elements.map(el => ({
          id: el.id,
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          className: el.className,
        })))
        .catch(() => [])
      const debugPath = path.join(this.debugDir, 'lms-post-session-debug.html')
      fs.writeFileSync(debugPath, await page.content(), 'utf8')
      const visible = slots.length > 0
        ? slots.map(slot => `${slot.text || slot.id}${slot.className.includes('disabled') ? ' [disabled]' : ''}`).join(', ')
        : 'không có slot carousel nào'
      throw new Error(
        `Không tìm thấy buổi học ngày ${display}. Các buổi đang hiển thị: ${visible}. HTML debug: ${debugPath}`,
      )
    }
  }

  // ─── Fill content ──────────────────────────────────────────────────────────

  // Site viết sai chính tả "Tổng két" → dùng /tổng\s*k/i (khớp cả "Tổng kết"/"Tổng két").
  private async fillTongKet(page: Page, content: string): Promise<void> {
    await this.writeExpandableSection(page, getLmsSectionPattern('summary'), content)
  }

  private async fillHomework(page: Page, homework: string): Promise<void> {
    await this.writeExpandableSection(page, getLmsSectionPattern('homework'), homework)
  }

  /**
   * Điền nội dung vào khối Tổng kết/Bài về nhà (rich editor trong drawer).
   * Tái dùng findSectionHeader để định vị theo text, mở khối nếu đang thu gọn.
   */
  private async writeExpandableSection(page: Page, headerRegex: RegExp, text: string): Promise<void> {
    const header = await this.findSectionHeader(page, headerRegex)
    if (!header) {
      const debugPath = path.join(this.debugDir, 'lms-content-section-debug.html')
      fs.writeFileSync(debugPath, await page.content(), 'utf8')
      const tabText = await page
        .locator('#detail-content [role="tabpanel"]:not([hidden])')
        .innerText()
        .catch(() => '')
      throw new Error(
        `Không tìm thấy khối nội dung khớp ${headerRegex}. Nội dung tab: ${tabText.replace(/\s+/g, ' ').trim().slice(0, 500)}. HTML debug: ${debugPath}`,
      )
    }

    const collapsed = (await header.locator('svg[data-testid="ExpandMoreIcon"]').count()) > 0
    if (collapsed) {
      await header.click({ timeout: TIMEOUT })
      await page.waitForTimeout(500)
    }

    const content = header.locator('xpath=following-sibling::div[1]')
    const editorSelector = getLmsSectionEditorSelector()
    let editor = content.locator(editorSelector).first()

    if ((await editor.count()) === 0) {
      const display = content.locator('p, .place-holder').first()
      if ((await display.count()) > 0) await display.click({ timeout: TIMEOUT })

      editor = content
        .locator(editorSelector)
        .or(page.locator('[role="dialog"]:visible').last().locator(editorSelector))
        .first()
      try {
        await editor.waitFor({ state: 'visible', timeout: 5_000 })
      } catch {
        const debugPath = path.join(this.debugDir, 'lms-section-editor-debug.html')
        fs.writeFileSync(debugPath, await page.content(), 'utf8')
        throw new Error(`Đã click khối nội dung nhưng LMS không mở editor. HTML debug: ${debugPath}`)
      }
    }

    await editor.fill(text)

    const dialog = editor.locator('xpath=ancestor::*[@role="dialog"][1]')
    if ((await dialog.count()) > 0) {
      const save = dialog.locator('button').filter({ hasText: /lưu|save|update|xác nhận|ok/i }).first()
      await save.click({ timeout: TIMEOUT })
      await dialog.waitFor({ state: 'hidden', timeout: TIMEOUT })
    } else {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(500)
    }
  }

  // ─── Student comments ──────────────────────────────────────────────────────

  private async processComments(
    page: Page,
    comments: { studentName: string; text: string }[],
  ): Promise<LmsPostResult> {
    const posted: string[] = []
    const skipped: string[] = []
    const absentStudentNames: string[] = []
    const seenStudents = new Set<string>()

    // Bảng HS trong tab "Nhận xét" (scope tránh nhầm table danh sách lớp bên ngoài)
    const rows = page.locator('div.comment-list-table table tbody tr')
    const rowCount = await rows.count()

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i)

      const studentName = ((await row.locator('.name-display').first().textContent()) ?? '').trim()
      if (!studentName) continue
      const studentKey = normalizeStudentName(studentName)
      if (seenStudents.has(studentKey)) continue
      seenStudents.add(studentKey)

      // HS nghỉ: ô Comment hiện "Không thể viết nhận xét cho học viên vắng mặt"
      const isAbsent =
        (await row.locator('td').nth(1).locator('*').filter({ hasText: getAbsentStudentPattern() }).count()) > 0

      if (isAbsent) {
        absentStudentNames.push(studentName)
        skipped.push(studentName)
        continue
      }

      const commentData = matchLmsCommentByStudentName(comments, studentName)

      if (!commentData?.text) {
        skipped.push(studentName)
        continue
      }

      let popup: Locator | null = null
      try {
        const openComment = row
          .locator('button')
          .filter({ hasText: getStudentCommentButtonPattern() })
          .first()
        await openComment.scrollIntoViewIfNeeded()
        await openComment.evaluate(element => (element as HTMLElement).click())

        const activePopup = page.locator('[role="dialog"]').last()
        popup = activePopup
        await activePopup.waitFor({ state: 'visible', timeout: 8000 })

        // Luôn thay nội dung cũ bằng bản mới trong app; chỉ bỏ qua khi bản mới trống.
        const commentArea = activePopup.locator('table td p').first()
        await commentArea.click({ timeout: 5000 })

        const manualMode = activePopup.locator(getStudentCommentManualModeSelector()).first()
        if ((await manualMode.count()) > 0 && await manualMode.isVisible()) {
          await manualMode.click({ timeout: 5000 })
        }

        const editor = activePopup.locator(getStudentCommentEditorSelector()).first()
        await editor.waitFor({ state: 'visible', timeout: 8000 })
        await editor.fill(commentData.text)

        const written = ((await editor.innerText().catch(() => '')) ?? '').trim()
        if (!isStudentCommentContentEqual(written, commentData.text)) {
          const debugPath = path.join(this.debugDir, 'lms-student-comment-editor-debug.html')
          fs.writeFileSync(debugPath, await page.content(), 'utf8')
          throw new Error(`LMS chưa nhận nội dung sau khi click vùng comment. HTML debug: ${debugPath}`)
        }

        const save = activePopup.locator('button').filter({ hasText: /^Save$|^Lưu$/i }).first()
        await save.click({ timeout: 5000 })
        const saved = await isStudentCommentSaveConfirmed(() =>
          activePopup.waitFor({ state: 'hidden', timeout: 5000 }),
        )
        if (!saved) {
          throw new Error('LMS không xác nhận đã lưu nhận xét: popup vẫn đang mở.')
        }
        await page.waitForTimeout(300)
        posted.push(studentName)
      } catch (err) {
        skipped.push(`${studentName} (lỗi: ${(err as Error).message.slice(0, 60)})`)
      } finally {
        if (popup && await popup.isVisible().catch(() => false)) {
          await page.keyboard.press('Escape').catch(() => {})
          await popup.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
          await page.waitForTimeout(200)
        }
      }
    }

    return makeLmsPostResult(posted, absentStudentNames, skipped)
  }

  // ─── Auto-login ────────────────────────────────────────────────────────────

  private async tryAutoLogin(page: Page, email: string, password: string): Promise<void> {
    try {
      // Fill email / username
      const emailField = page
        .locator('input[type="email"], input[name*="email"], input[name*="user"], input[id*="email"], input[id*="user"], input[placeholder*="mail"], input[placeholder*="user"]')
        .first()
      if ((await emailField.count()) > 0) {
        await emailField.fill(email)
      }

      // Fill password
      const pwField = page.locator('input[type="password"]').first()
      if ((await pwField.count()) > 0) {
        await pwField.fill(password)
      }

      // Submit
      const submitBtn = page
        .locator('button[type="submit"], input[type="submit"]')
        .or(page.locator('button').filter({ hasText: /đăng nhập|login|sign in/i }))
        .first()
      if ((await submitBtn.count()) > 0) {
        await submitBtn.click()
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 })
      }
    } catch (err) {
      console.warn('[LMS] Auto-login thất bại:', (err as Error).message)
    }
  }

  // ─── Class list scraping ───────────────────────────────────────────────────

  private get LIST_URL(): string { return `${this.baseUrl}/admin/classes` }

  /** Lấy tất cả lớp từ LMS, rồi chỉ fetch detail cho lớp chưa có trong app */
  private async scrapeAllClasses(
    page: Page,
    existingCodes: string[],
  ): Promise<LmsScrapedClass[]> {
    await page.goto(this.LIST_URL, { waitUntil: 'networkidle', timeout: TIMEOUT })

    // GraphQL load sau networkidle — chờ rows xuất hiện
    await page.waitForSelector('[class*="MuiTableRow-hover"]', { timeout: 15_000 })

    const rows = page.locator('[class*="MuiTableRow-hover"]')
    const count = await rows.count()

    // Bước 1: thu thập mã + tên + trạng thái từ list (không navigate)
    // Cột: [0]=checkbox, [1]=mã lớp (trong <pre>), [2]=tên, [5]=trạng thái (Running/...)
    const allClasses: { code: string; name: string }[] = []
    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator('td')
      const code = (
        (await cells.nth(1).locator('pre').textContent().catch(() => null)) ||
        (await cells.nth(1).textContent())
      )?.trim() ?? ''
      const name = (await cells.nth(2).textContent())?.trim() ?? ''
      const status = (await cells.nth(5).textContent())?.trim() ?? ''
      if (!code) continue
      if (status !== 'Running') {
        console.log(`[LMS] Bỏ qua lớp ${code} (trạng thái: ${status})`)
        continue
      }
      allClasses.push({ code, name: name || code })
    }

    console.log(`[LMS] Tìm thấy ${allClasses.length} lớp đang diễn ra trên LMS`)

    // Bước 2: chỉ xử lý lớp mới
    const newClasses = allClasses.filter(c => !existingCodes.includes(c.code))
    console.log(`[LMS] ${newClasses.length} lớp mới: ${newClasses.map(c => c.code).join(', ')}`)

    // Bước 3: fetch detail từng lớp mới
    const result: LmsScrapedClass[] = []
    for (const cls of newClasses) {
      try {
        const detail = await this.fetchClassDetail(page, cls.code, cls.name)
        result.push(detail)
      } catch (err) {
        console.error(`[LMS] Lỗi fetch ${cls.code}:`, (err as Error).message)
        result.push({ lmsCode: cls.code, name: cls.name, sessions: [], students: [] })
      }
    }
    return result
  }

  /** Điều hướng vào trang chi tiết lớp bằng cách click "View detail" */
  private async fetchClassDetail(
    page: Page,
    code: string,
    name: string,
  ): Promise<LmsScrapedClass> {
    // Mở drawer chi tiết (tái dùng helper chung)
    await this.openClassDrawer(page, code)

    // Click tab "Schedule" trong drawer để load danh sách buổi học
    // (scope vào #detail-content tránh nhầm tab "Attendance" của class list bên ngoài)
    const scheduleTab = page
      .locator('#detail-content [role="tab"]')
      .filter({ hasText: /^(Schedule|Lịch học)$/ })
      .first()
    await scheduleTab.click({ timeout: 8_000 })
    await page.waitForSelector('input[placeholder="DD/MM/YYYY"]', { timeout: 10_000 })
    await page.waitForTimeout(300)

    // Lưu HTML detail để debug
    const debugDetail = path.join(this.debugDir, 'lms-detail-debug.html')
    fs.writeFileSync(debugDetail, await page.content(), 'utf8')
    console.log(`[LMS] Detail ${code} Schedule tab loaded`)

    const sessions = await this.scrapeSessions(page)

    // Click tab "Students" trong drawer để load danh sách học sinh
    const studentsTab = page
      .locator('#detail-content [role="tab"]')
      .filter({ hasText: /^(Students|Học viên)$/ })
      .first()
    await studentsTab.click({ timeout: 8_000 })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(1_000)

    const students = await this.scrapeStudents(page)
    console.log(`[LMS] ${code}: ${sessions.length} buổi, ${students.length} HS`)

    return { lmsCode: code, name, sessions, students }
  }

  // ─── Sync helpers ──────────────────────────────────────────────────────────

  private async scrapeSessions(page: Page): Promise<{ date: string; time?: string }[]> {
    try {
      // Mỗi buổi là 1 hàng: <input placeholder="DD/MM/YYYY"> + 2 <input placeholder="hh:mm"> (giờ bắt đầu / kết thúc).
      // Đọc trực tiếp trong DOM: từ ô ngày leo lên tổ tiên gần nhất chứa cả ô "hh:mm" → ô hh:mm đầu tiên = giờ bắt đầu.
      await page.waitForSelector('input[placeholder="DD/MM/YYYY"]', { timeout: 8_000 })
      const raw = await page.evaluate(() => {
        const dateInputs = Array.from(
          document.querySelectorAll('input[placeholder="DD/MM/YYYY"]'),
        ) as HTMLInputElement[]
        return dateInputs.map(dateEl => {
          let node: HTMLElement | null = dateEl.parentElement
          let timeEl: HTMLInputElement | null = null
          while (node) {
            timeEl = node.querySelector('input[placeholder="hh:mm"]')
            if (timeEl) break
            node = node.parentElement
          }
          return { date: dateEl.value, time: timeEl?.value ?? '' }
        })
      })
      console.log(`[LMS] Tìm thấy ${raw.length} buổi (date+time)`)

      const sessions: { date: string; time?: string }[] = []
      for (const r of raw) {
        // Ngày DD/MM/YYYY → YYYY-MM-DD
        const dm = r.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
        if (!dm) continue
        // Giờ HH:mm (nếu có)
        const tm = r.time.match(/^(\d{1,2}):(\d{2})$/)
        const time = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : undefined
        sessions.push({ date: `${dm[3]}-${dm[2]}-${dm[1]}`, time })
      }
      return sessions
    } catch (err) {
      console.warn('[LMS] scrapeSessions lỗi:', (err as Error).message)
      return []
    }
  }

  private async scrapeStudents(page: Page): Promise<{ name: string }[]> {
    try {
      // Tab "Students" đã được click trước trong fetchClassDetail
      // Scope vào #detail-content để tránh nhầm table của class list bên ngoài
      const detailContent = page.locator('#detail-content')
      await page.waitForSelector('#detail-content table tbody tr', { timeout: 8_000 }).catch(() => {})

      const rows = detailContent.locator('table tbody tr')
      const count = await rows.count()
      console.log(`[LMS] Students tab: ${count} rows`)

      const students: { name: string }[] = []
      for (let i = 0; i < count; i++) {
        const cells = rows.nth(i).locator('td')
        const cellCount = await cells.count()
        // Bỏ cell checkbox/số, lấy cell đầu tiên có tên (text > 2 ký tự, không phải số thuần)
        for (let j = 0; j < cellCount; j++) {
          const cellText = ((await cells.nth(j).textContent()) ?? '').trim()
          if (cellText.length > 2 && !/^\d+$/.test(cellText)) {
            students.push({ name: cellText })
            break
          }
        }
      }
      return students
    } catch (err) {
      console.warn('[LMS] scrapeStudents lỗi:', (err as Error).message)
      return []
    }
  }

  // ─── Content sync (tab "Nhận xét") ─────────────────────────────────────────

  private async fetchContentForTarget(
    page: Page,
    target: LmsContentTarget,
  ): Promise<LmsContentResult | null> {
    await this.findAndOpenClass(page, target.classCode)
    await this.clickTab(page, 'Nhận xét')

    const found = await this.selectCommentSession(page, target.sessionDate)
    if (!found) {
      console.warn(`[LMS] ${target.classCode}: không tìm thấy buổi ${target.sessionDate} trong carousel`)
      return null
    }

    const lessonContent = await this.readExpandableSection(page, getLmsSectionPattern('summary'))
    if (!lessonContent) return null  // chưa điền Tổng kết -> buổi chưa có nội dung

    const homework = (await this.readExpandableSection(page, getLmsSectionPattern('homework'))) ?? ''
    const students = await this.readStudentComments(page)

    return { classCode: target.classCode, sessionDate: target.sessionDate, lessonContent, homework, students }
  }

  /** Chọn buổi trong carousel tab "Nhận xét" theo ngày 'YYYY-MM-DD'. Trả về false nếu không tìm thấy. */
  private async selectCommentSession(page: Page, sessionDate: string): Promise<boolean> {
    const dateText = page
      .locator('[id^="class-comments-slot-carousel-"] .info-container > div')
      .filter({ hasText: getCommentSessionDateTextPattern(sessionDate) })
      .first()

    if ((await dateText.count()) === 0) return false

    const slot = dateText
      .locator('xpath=ancestor::div[starts-with(@id,"class-comments-slot-carousel-")][1]')

    if ((await slot.count()) === 0) return false

    const isDisabled = await slot.evaluate(el => el.className.includes('disabled'))
    if (isDisabled) return false

    await slot.locator('.info-container').click({ timeout: TIMEOUT })
    await page.waitForTimeout(500)
    return true
  }

  /**
   * Đọc khối "Tổng kết"/"Bài về nhà": header (icon thu/mở + label) + nội dung liền dưới.
   * Trả về null nếu không tìm thấy khối; '' nếu khối có nhưng đang trống (placeholder).
   */
  private async readExpandableSection(page: Page, headerRegex: RegExp): Promise<string | null> {
    // Số class jss (jss3524/jss3533...) đổi giữa các build LMS → match theo TEXT header + cấu trúc.
    // Cấu trúc: <section><header row (chứa svg Expand + <span> label)><content wrapper>...</section>
    const header = await this.findSectionHeader(page, headerRegex)
    if (!header) return null

    const collapsed = (await header.locator('svg[data-testid="ExpandMoreIcon"]').count()) > 0
    if (collapsed) {
      await header.click({ timeout: TIMEOUT })
      await page.waitForTimeout(500)
    }

    // Nội dung là div ngay sau header row trong cùng section
    const content = header.locator('xpath=following-sibling::div[1]')
    if ((await content.count()) === 0) return ''

    // Trống: có phần tử con mang class "place-holder"
    if ((await content.locator('.place-holder').count()) > 0) return ''

    return ((await content.innerText().catch(() => '')) ?? '').trim()
  }

  /**
   * Tìm "header row" của khối Tổng kết/Bài về nhà theo text label.
   * Header row = tổ tiên div gần nhất của <span> label mà có chứa icon Expand (thu/mở).
   * Trả về null nếu không có khối.
   */
  private async findSectionHeader(page: Page, headerRegex: RegExp): Promise<Locator | null> {
    // Header row = div SÂU NHẤT chứa cả TEXT label lẫn icon Expand (thu/mở).
    // .last() vì tổ tiên (section, tabpanel) cũng khớp; div bắt đầu muộn nhất = header row.
    const header = page
      .locator('#detail-content div')
      .filter({ hasText: headerRegex })
      .filter({
        has: page.locator('svg[data-testid="ExpandLessIcon"], svg[data-testid="ExpandMoreIcon"]'),
      })
      .last()
    if ((await header.count()) === 0) return null
    return header
  }

  /** Đọc điểm danh + nhận xét đã lưu của từng học sinh trong tab "Nhận xét". */
  private async readStudentComments(
    page: Page,
  ): Promise<{ name: string; attended: boolean; comment: string }[]> {
    const rows = page.locator('div.comment-list-table table tbody tr')
    const count = await rows.count()
    const result: { name: string; attended: boolean; comment: string }[] = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      const name = ((await row.locator('.name-display').first().textContent()) ?? '').trim()
      if (!name) continue

      const isAbsent =
        (await row.locator('td').nth(1).locator('*').filter({ hasText: /không thể viết nhận xét/i }).count()) > 0

      if (isAbsent) {
        result.push({ name, attended: false, comment: '' })
        continue
      }

      try {
        await row.locator('button').filter({ hasText: /nhận xét học sinh/i }).first().click({ timeout: TIMEOUT })

        const popup = page.locator('[role="dialog"]').last()
        await popup.waitFor({ state: 'visible', timeout: 8_000 })

        const contentEl = popup.locator('div.jss2722').first()
        let comment = ''
        if ((await contentEl.count()) > 0) {
          const isPlaceholder = await contentEl.evaluate(el => el.className.includes('place-holder'))
          if (!isPlaceholder) comment = ((await contentEl.textContent()) ?? '').trim()
        }

        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
        await page.waitForTimeout(300)

        result.push({ name, attended: true, comment })
      } catch (err) {
        console.warn(`[LMS] Đọc nhận xét ${name} lỗi:`, (err as Error).message)
        result.push({ name, attended: true, comment: '' })
      }
    }

    return result
  }
}
