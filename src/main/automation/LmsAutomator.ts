import { chromium, Browser, BrowserContext, Page } from 'playwright'
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { LmsPostParams, LmsPostResult, LmsSyncResult, LmsScrapedClass } from '../../shared/types'

const BASE_URL = 'https://lms.mindx.edu.vn'
const TIMEOUT = 30_000
const CDP_PORT = 9222
const LOGIN_WAIT_MS = 180_000

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

  constructor(
    private readonly sessionDir: string,
    private readonly baseUrl: string = BASE_URL,
  ) {
    this.debugDir = sessionDir  // lưu debug HTML cùng thư mục session
  }

  private readonly debugDir: string

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async launch(): Promise<void> {
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
    console.log('[LMS] openBrowser() bắt đầu')
    await this.launch()
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
    if (!this.cdpBrowser && !this.context) {
      throw new Error('Trình duyệt LMS chưa mở. Hãy bấm "Gửi lên LMS" trước.')
    }
    const page = await this.getPage()
    await this.ensureLoggedIn(page)
    await this.findAndOpenClass(page, params.classCode)
    await this.clickTab(page, 'Nhận xét')
    await this.selectSession(page, params.sessionDate)
    await this.fillTongKet(page, params.lessonContent)
    await this.fillHomework(page, params.homework)
    return await this.processComments(page, params.comments)
  }

  /**
   * Lấy danh sách lớp từ /admin/classes, chỉ fetch chi tiết lớp CHƯA có trong app.
   * @param existingCodes Mã lớp đã có — bỏ qua, không fetch lại
   */
  async syncClasses(existingCodes: string[] = []): Promise<LmsSyncResult> {
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
    await page.goto(`${this.baseUrl}/admin/classes?tab=0`, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT,
    })

    const row = page.locator('table tbody tr').filter({ hasText: classCode }).first()
    if ((await row.count()) === 0) {
      throw new Error(`Không tìm thấy lớp "${classCode}" trong danh sách LMS.`)
    }

    await row.locator('a').first().click()
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT })
  }

  private async clickTab(page: Page, tabName: string): Promise<void> {
    const tab = page
      .locator('[role="tab"]')
      .filter({ hasText: new RegExp(tabName, 'i') })
      .first()
    await tab.click({ timeout: TIMEOUT })
    // Chờ GraphQL load (React SPA — networkidle không đủ)
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(500)
  }

  private async selectSession(page: Page, sessionDate: string): Promise<void> {
    const [year, month, day] = sessionDate.split('-')
    const display = `${day}/${month}/${year}`

    let btn = page.locator('button, a, [class*="session"], [class*="buoi"]').filter({ hasText: display }).first()

    if ((await btn.count()) === 0) {
      btn = page
        .locator('button:not([disabled]), a')
        .filter({ hasText: new RegExp(`${day}[/-]${month}|${month}[/-]${day}`, 'i') })
        .first()
    }

    if ((await btn.count()) === 0) {
      throw new Error(`Không tìm thấy buổi học ngày ${display}.`)
    }

    await btn.click({ timeout: TIMEOUT })
    await page.waitForTimeout(800)
  }

  // ─── Fill content ──────────────────────────────────────────────────────────

  private async fillTongKet(page: Page, content: string): Promise<void> {
    const section = page.locator('*').filter({ hasText: /tổng kết/i }).last()
    const editor = section.locator('[contenteditable="true"], .ql-editor, .ProseMirror, textarea').first()

    if ((await editor.count()) === 0) {
      const fallback = page.locator('[contenteditable="true"]').first()
      await fallback.click()
      await page.keyboard.press('Control+A')
      await fallback.type(content)
      return
    }

    await editor.click()
    await page.keyboard.press('Control+A')
    await editor.type(content)
    await page.waitForTimeout(300)
  }

  private async fillHomework(page: Page, homework: string): Promise<void> {
    const section = page.locator('*').filter({ hasText: /bài.*nhà/i }).last()
    const input = section.locator('textarea, input, [contenteditable="true"]').first()

    if ((await input.count()) > 0) {
      await input.click()
      await input.fill(homework)
    } else {
      await page.locator('textarea, input[type="text"]').nth(1).fill(homework)
    }
    await page.waitForTimeout(300)
  }

  // ─── Student comments ──────────────────────────────────────────────────────

  private async processComments(
    page: Page,
    comments: { studentName: string; text: string }[],
  ): Promise<LmsPostResult> {
    const posted: string[] = []
    const skipped: string[] = []

    const rows = page.locator('table tbody tr')
    const rowCount = await rows.count()

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i)
      const cells = row.locator('td')

      const rawName = ((await cells.nth(0).textContent()) ?? '').trim()
      const studentName = rawName.split('\n')[0].trim()
      if (!studentName) continue

      const isAbsent =
        (await row.locator('*').filter({ hasText: /vắng mặt|nghỉ có phép/i }).count()) > 0

      if (isAbsent) {
        skipped.push(studentName)
        continue
      }

      const commentData = comments.find(
        c =>
          studentName.toLowerCase().includes(c.studentName.toLowerCase()) ||
          c.studentName.toLowerCase().includes(studentName.toLowerCase()),
      )

      if (!commentData?.text) {
        skipped.push(studentName)
        continue
      }

      try {
        await cells.nth(1).click({ timeout: 5000 })

        const popup = page.locator('[role="dialog"], .modal, [class*="popup"], [class*="modal"]').last()
        await popup.waitFor({ state: 'visible', timeout: 8000 })

        const textarea = popup.locator('textarea, [contenteditable="true"], input[type="text"]').first()
        await textarea.click()
        await textarea.fill(commentData.text)

        const saveBtn = popup
          .locator('button')
          .filter({ hasText: /lưu|xác nhận|ok|save|submit/i })
          .first()
        await saveBtn.click({ timeout: 5000 })

        await popup.waitFor({ state: 'hidden', timeout: 5000 })
        await page.waitForTimeout(300)
        posted.push(studentName)
      } catch (err) {
        skipped.push(`${studentName} (lỗi: ${(err as Error).message.slice(0, 60)})`)
      }
    }

    return { posted, skipped }
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
    // Luôn về list để bắt đầu sạch (tránh drawer cũ còn mở)
    await page.goto(this.LIST_URL, { waitUntil: 'networkidle', timeout: TIMEOUT })
    await page.waitForSelector('[class*="MuiTableRow-hover"]', { timeout: 15_000 })

    // Tìm row chứa <pre> có text = code
    const row = page
      .locator('[class*="MuiTableRow-hover"]')
      .filter({ has: page.locator('pre').filter({ hasText: new RegExp(`^${code}$`) }) })
      .first()

    if ((await row.count()) === 0) {
      throw new Error(`Không tìm thấy row cho mã "${code}"`)
    }

    // Button "View detail" ẩn bởi CSS (display:none), chỉ hiện khi hover.
    // Dùng JS click để tránh race condition: Playwright scroll/move chuột làm mất hover state
    // → button trở về display:none → click({ force:true }) vẫn fail vì bounding box = 0.
    await row.scrollIntoViewIfNeeded()
    await page.evaluate((codeStr) => {
      const pre = Array.from(document.querySelectorAll('[class*="MuiTableRow-hover"] pre'))
        .find(p => p.textContent?.trim() === codeStr)
      if (!pre) throw new Error(`Không tìm thấy pre với mã ${codeStr}`)
      const btn = pre
        .closest('[class*="MuiTableRow-hover"]')
        ?.querySelector('span[aria-label="View detail"] button') as HTMLElement | null
      if (!btn) throw new Error(`Không tìm thấy nút "View detail" cho ${codeStr}`)
      btn.click()
    }, code)

    // "View detail" mở right drawer (không navigate) — chờ header drawer hiện mã lớp
    const drawerHeader = page
      .locator('[aria-labelledby="class-detail"] h6')
      .filter({ hasText: code })
    await drawerHeader.waitFor({ state: 'visible', timeout: 15_000 })
    console.log(`[LMS] Drawer ${code} đã mở`)

    // Click tab "Schedule" trong drawer để load danh sách buổi học
    // (scope vào #detail-content tránh nhầm tab "Attendance" của class list bên ngoài)
    const scheduleTab = page
      .locator('#detail-content [role="tab"]')
      .filter({ hasText: /^Schedule$/ })
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
      .filter({ hasText: /^Students$/ })
      .first()
    await studentsTab.click({ timeout: 8_000 })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(1_000)

    const students = await this.scrapeStudents(page)
    console.log(`[LMS] ${code}: ${sessions.length} buổi, ${students.length} HS`)

    return { lmsCode: code, name, sessions, students }
  }

  // ─── Sync helpers ──────────────────────────────────────────────────────────

  private async scrapeSessions(page: Page): Promise<{ date: string }[]> {
    try {
      // Buổi học nằm ở trang mặc định dưới dạng <input placeholder="DD/MM/YYYY">
      // Không cần click tab — đọc thẳng value từ DOM (kể cả khi accordion bị collapse)
      await page.waitForSelector('input[placeholder="DD/MM/YYYY"]', { timeout: 8_000 })
      const inputs = page.locator('input[placeholder="DD/MM/YYYY"]')
      const count = await inputs.count()
      console.log(`[LMS] Tìm thấy ${count} date inputs`)
      const sessions: { date: string }[] = []
      for (let i = 0; i < count; i++) {
        const val = await inputs.nth(i).inputValue()
        // Format DD/MM/YYYY → YYYY-MM-DD
        const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
        if (m) sessions.push({ date: `${m[3]}-${m[2]}-${m[1]}` })
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
}
