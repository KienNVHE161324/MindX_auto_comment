import { chromium, BrowserContext, Page } from 'playwright'
import { LmsPostParams, LmsPostResult, LmsSyncResult } from '../../shared/types'

const BASE_URL = 'https://lms.mindx.edu.vn'
const TIMEOUT = 30_000

export class LmsAutomator {
  private context: BrowserContext | null = null

  constructor(
    private readonly sessionDir: string,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async launch(): Promise<void> {
    if (this.context) return
    this.context = await chromium.launchPersistentContext(this.sessionDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      viewport: { width: 1280, height: 800 },
    })
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close()
      this.context = null
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async openBrowser(): Promise<{ loggedIn: boolean }> {
    await this.launch()
    const page = await this.getPage()
    await page.bringToFront()
    await page.goto(`${this.baseUrl}/admin/classes`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT,
    })
    const loggedIn = !this.isLoginPage(page)
    return { loggedIn }
  }

  async postSession(params: LmsPostParams): Promise<LmsPostResult> {
    if (!this.context) throw new Error('Trình duyệt LMS chưa mở. Hãy bấm "Mở trình duyệt LMS" trước.')
    const page = await this.getPage()

    await this.ensureLoggedIn(page)
    await this.findAndOpenClass(page, params.classCode)
    await this.clickTab(page, 'Nhận xét')
    await this.selectSession(page, params.sessionDate)
    await this.fillTongKet(page, params.lessonContent)
    await this.fillHomework(page, params.homework)
    return await this.processComments(page, params.comments)
  }

  async syncClasses(): Promise<LmsSyncResult> {
    if (!this.context) throw new Error('Trình duyệt LMS chưa mở. Hãy bấm "Mở trình duyệt LMS" trước.')
    const page = await this.getPage()
    await this.ensureLoggedIn(page)

    await page.goto(`${this.baseUrl}/admin/classes?tab=0`, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT,
    })

    // Lấy danh sách lớp từ bảng
    const rows = page.locator('table tbody tr')
    const count = await rows.count()
    const classes = []

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i)
      const cells = row.locator('td')
      const code = ((await cells.nth(0).textContent()) ?? '').trim()
      const name = ((await cells.nth(1).textContent()) ?? '').trim()
      if (!code) continue

      // Mở chi tiết lớp để lấy sessions + students
      const link = row.locator('a').first()
      const href = await link.getAttribute('href')
      if (!href) continue

      const detailPage = await this.context!.newPage()
      try {
        await detailPage.goto(`${this.baseUrl}${href}`, { waitUntil: 'networkidle', timeout: TIMEOUT })

        const sessions = await this.scrapeSessions(detailPage)
        const students = await this.scrapeStudents(detailPage)

        classes.push({ lmsCode: code, name, sessions, students })
      } finally {
        await detailPage.close()
      }
    }

    return { classes }
  }

  // ─── Navigation helpers ─────────────────────────────────────────────────────

  private async getPage(): Promise<Page> {
    const ctx = this.context!
    const pages = ctx.pages()
    if (pages.length > 0) {
      const page = pages[0]
      // Nếu page đã bị đóng, tạo mới
      if (!page.isClosed()) return page
    }
    return ctx.newPage()
  }

  private isLoginPage(page: Page): boolean {
    const url = page.url()
    return url.includes('/login') || url.includes('/auth') || url.includes('/sign-in')
  }

  private async ensureLoggedIn(page: Page): Promise<void> {
    if (this.isLoginPage(page)) {
      throw new Error(
        'Chưa đăng nhập LMS. Vào trình duyệt đang mở, đăng nhập, rồi thử lại.',
      )
    }
  }

  private async findAndOpenClass(page: Page, classCode: string): Promise<void> {
    await page.goto(`${this.baseUrl}/admin/classes?tab=0`, {
      waitUntil: 'networkidle',
      timeout: TIMEOUT,
    })

    // Tìm hàng chứa mã lớp (cột Tên)
    const row = page.locator('table tbody tr').filter({ hasText: classCode }).first()
    const found = (await row.count()) > 0
    if (!found) {
      throw new Error(`Không tìm thấy lớp "${classCode}" trong danh sách LMS.`)
    }

    const link = row.locator('a').first()
    await link.click()
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT })
  }

  private async clickTab(page: Page, tabName: string): Promise<void> {
    // Tab có thể là <a>, <button>, hay <li> chứa text
    const tab = page
      .locator('a, button, li, [role="tab"]')
      .filter({ hasText: new RegExp(tabName, 'i') })
      .first()
    await tab.click({ timeout: TIMEOUT })
    await page.waitForTimeout(800)
  }

  private async selectSession(page: Page, sessionDate: string): Promise<void> {
    // sessionDate: 'YYYY-MM-DD' → tìm nút/tab có ngày dạng 'DD/MM/YYYY'
    const [year, month, day] = sessionDate.split('-')
    const display = `${day}/${month}/${year}`

    // Thử tìm nút session chứa ngày
    let sessionBtn = page.locator('button, a, [class*="session"], [class*="buoi"]').filter({ hasText: display }).first()

    if ((await sessionBtn.count()) === 0) {
      // Fallback: tìm nút chứa ngày dạng khác (MM/DD/YYYY hoặc YYYY-MM-DD)
      sessionBtn = page
        .locator('button:not([disabled]), a')
        .filter({ hasText: new RegExp(`${day}[/-]${month}|${month}[/-]${day}`, 'i') })
        .first()
    }

    if ((await sessionBtn.count()) === 0) {
      throw new Error(
        `Không tìm thấy buổi học ngày ${display} trong tab Nhận xét. ` +
          'Kiểm tra buổi có tồn tại và chưa phải ngày tương lai.',
      )
    }

    await sessionBtn.click({ timeout: TIMEOUT })
    await page.waitForTimeout(800)
  }

  // ─── Fill content ──────────────────────────────────────────────────────────

  private async fillTongKet(page: Page, content: string): Promise<void> {
    // "Tổng kết" là rich text editor (toolbar B/I/U)
    // Thử theo thứ tự: label → contenteditable → textarea
    const section = page.locator('*').filter({ hasText: /tổng kết/i }).last()
    const editor = section
      .locator('[contenteditable="true"], .ql-editor, .ProseMirror, textarea')
      .first()

    if ((await editor.count()) === 0) {
      // Fallback: lấy contenteditable đầu tiên trên trang
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
    // "Bài về nhà" — tìm theo label hoặc placeholder
    const field = page
      .locator('textarea, input[type="text"], [contenteditable="true"]')
      .filter({ hasText: '' })  // chọn ô chưa có nội dung
    // Tìm theo label gần text "bài về nhà"
    const section = page.locator('*').filter({ hasText: /bài.*nhà/i }).last()
    const input = section.locator('textarea, input, [contenteditable="true"]').first()

    if ((await input.count()) > 0) {
      await input.click()
      await input.fill(homework)
    } else {
      // Fallback: textarea thứ 2 trên trang (sau Tổng kết)
      await field.nth(1).fill(homework)
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

    // Tìm bảng học viên có cột Comment
    // Mỗi hàng: Học viên | Comment | Sản phẩm
    const rows = page.locator('table tbody tr')
    const rowCount = await rows.count()

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i)
      const cells = row.locator('td')

      // Cột đầu: tên học sinh
      const rawName = ((await cells.nth(0).textContent()) ?? '').trim()
      const studentName = rawName.split('\n')[0].trim()
      if (!studentName) continue

      // Kiểm tra nghỉ học: cell bị disable hoặc có text "vắng mặt"
      const isAbsent =
        (await row.locator('*').filter({ hasText: /vắng mặt|nghỉ có phép/i }).count()) > 0

      if (isAbsent) {
        skipped.push(studentName)
        continue
      }

      const commentData = comments.find(c =>
        studentName.toLowerCase().includes(c.studentName.toLowerCase()) ||
        c.studentName.toLowerCase().includes(studentName.toLowerCase()),
      )

      if (!commentData?.text) {
        skipped.push(studentName)
        continue
      }

      try {
        // Click ô Comment của học sinh → mở popup
        const commentCell = cells.nth(1)
        await commentCell.click({ timeout: 5000 })

        // Chờ popup xuất hiện
        const popup = page.locator('[role="dialog"], .modal, [class*="popup"], [class*="modal"]').last()
        await popup.waitFor({ state: 'visible', timeout: 8000 })

        // Fill nhận xét vào textarea trong popup
        const textarea = popup.locator('textarea, [contenteditable="true"], input[type="text"]').first()
        await textarea.click()
        // Xóa template mặc định "- Đánh giá chung: ..."
        await textarea.fill(commentData.text)

        // Bấm Lưu/Xác nhận trong popup
        const saveBtn = popup
          .locator('button')
          .filter({ hasText: /lưu|xác nhận|ok|save|submit/i })
          .first()
        await saveBtn.click({ timeout: 5000 })

        // Chờ popup đóng
        await popup.waitFor({ state: 'hidden', timeout: 5000 })
        await page.waitForTimeout(300)

        posted.push(studentName)
      } catch (err) {
        // Không dừng toàn bộ — ghi lỗi vào skipped và tiếp tục
        skipped.push(`${studentName} (lỗi: ${(err as Error).message.slice(0, 60)})`)
      }
    }

    return { posted, skipped }
  }

  // ─── Sync helpers ──────────────────────────────────────────────────────────

  private async scrapeSessions(page: Page): Promise<{ date: string }[]> {
    // Tab "Lịch học" — bảng buổi học với ngày tháng
    try {
      await this.clickTab(page, 'Lịch học')
      const rows = page.locator('table tbody tr')
      const count = await rows.count()
      const sessions: { date: string }[] = []
      for (let i = 0; i < count; i++) {
        const text = ((await rows.nth(i).locator('td').first().textContent()) ?? '').trim()
        // Chuyển dd/mm/yyyy → yyyy-mm-dd
        const m = text.match(/(\d{2})[/-](\d{2})[/-](\d{4})/)
        if (m) sessions.push({ date: `${m[3]}-${m[2]}-${m[1]}` })
      }
      return sessions
    } catch {
      return []
    }
  }

  private async scrapeStudents(page: Page): Promise<{ name: string }[]> {
    try {
      await this.clickTab(page, 'Học viên')
      const rows = page.locator('table tbody tr')
      const count = await rows.count()
      const students: { name: string }[] = []
      for (let i = 0; i < count; i++) {
        const name = ((await rows.nth(i).locator('td').first().textContent()) ?? '').trim()
        if (name) students.push({ name })
      }
      return students
    } catch {
      return []
    }
  }
}
