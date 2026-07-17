# Đồng bộ nội dung tự động từ LMS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bấm 1 nút "Đồng bộ từ LMS" vừa thêm lớp mới (như hiện tại), vừa tự lấy nội dung buổi học gần nhất còn thiếu (tổng kết, bài tập, nhận xét từng HS, điểm danh) cho các lớp đang có, lưu thẳng vào local, và loại học sinh nghỉ khỏi tin Zalo.

**Architecture:** Renderer (`ClassesPage`) tính trước danh sách buổi cần đồng bộ (`contentTargets`) bằng hàm thuần `computeContentTargets`, gửi 1 lần qua IPC `lmsSyncAll`. Main (`LmsAutomator.syncAll`) vừa quét lớp mới (logic cũ) vừa đọc DOM tab "Nhận xét" cho từng target, trả kết quả thô. Renderer dùng hàm thuần `mergeContentResult` để ghép vào `SessionContent` rồi lưu qua `saveContent`. Logic ghép nối (chọn buổi, khớp tên HS, dựng `SessionContent`) tách thành các hàm thuần trong `src/shared/` để test bằng Vitest không cần mock Playwright.

**Tech Stack:** Electron + React + TypeScript, Playwright (automation), Vitest + Testing Library.

## Global Constraints

- Comment lấy từ LMS lưu **nguyên văn** vào cả `raw` và `polished` — không gọi Gemini rewrite.
- Chỉ đồng bộ **buổi gần nhất đã qua** (dateTime < now) mà local chưa có `SessionContent`, cho lớp có `getClassStatus() !== 'đã kết thúc'`.
- Nếu buổi đó trên LMS chưa được điền nội dung → bỏ qua lớp, không báo lỗi (không phải exception).
- Lỗi ở 1 lớp không được chặn các lớp khác trong cùng lần đồng bộ.
- Lưu content thẳng vào local, không hỏi xác nhận (khác với luồng "thêm lớp mới" — luồng đó giữ nguyên preview + nút "Nhập tất cả vào app" như cũ).
- Selector DOM ưu tiên theo cấu trúc/text đã xác nhận trong spec (`docs/specs/2026-07-17-lms-content-sync-design.md`), chấp nhận rủi ro tên class JSS (`jss2722`...) có thể đổi số giữa các lần build LMS.

---

## File Structure

- **Create** `src/shared/classStatus.ts` — tách `getClassStatus`/`ClassStatus` ra khỏi `ClassesPage.tsx` để dùng chung.
- **Create** `src/shared/classStatus.test.ts`
- **Create** `src/shared/lmsSync.ts` — hàm thuần: `computeContentTargets`, `matchStudentByName`, `mergeContentResult`.
- **Create** `src/shared/lmsSync.test.ts`
- **Modify** `src/shared/types.ts` — thêm `absentStudentIds` vào `SessionContent`; thêm `LmsContentTarget`, `LmsContentResult`, `LmsSyncAllResult`; đổi `IPC.lmsSyncClasses` → `IPC.lmsSyncAll`; đổi `AppApi.lmsSyncClasses` → `AppApi.lmsSyncAll`.
- **Modify** `src/shared/types.test.ts` — test key IPC mới.
- **Modify** `src/main/automation/LmsAutomator.ts` — thêm `syncAll()` + các helper đọc DOM tab "Nhận xét".
- **Modify** `src/main/ipcHandlers.ts` — đổi dep/handler `lmsSyncClasses` → `lmsSyncAll`.
- **Modify** `src/main/ipcHandlers.test.ts` — cập nhật test theo tên mới.
- **Modify** `src/main/index.ts` — wire `lmsSyncAll` tới `lmsAutomator.syncAll(params.existingCodes, params.contentTargets)`.
- **Modify** `src/preload/index.ts` — expose `lmsSyncAll`.
- **Modify** `src/renderer/src/pages/ClassesPage.tsx` — dùng `getClassStatus` từ shared, gọi `lmsSyncAll`, tự lưu content, hiện tóm tắt.
- **Modify** `src/renderer/src/pages/ClassesPage.test.tsx` — test luồng đồng bộ mới.
- **Modify** `src/renderer/src/pages/SessionComposer.tsx` — lọc `absentStudentIds` khỏi preview/gửi LMS.
- **Modify** `src/renderer/src/pages/SessionComposer.test.tsx` — test lọc HS nghỉ.

---

### Task 1: Data model — types & IPC

**Files:**
- Modify: `src/shared/types.ts`
- Test: `src/shared/types.test.ts`

**Interfaces:**
- Produces: `SessionContent.absentStudentIds?: string[]`; `LmsContentTarget { classCode, sessionId, sessionDate }`; `LmsContentResult { classCode, sessionDate, lessonContent, homework, students: {name, attended, comment}[] }`; `LmsSyncAllResult { newClasses: LmsScrapedClass[], contentResults: LmsContentResult[], skippedClasses: string[] }`; `IPC.lmsSyncAll = 'lms:syncAll'`; `AppApi.lmsSyncAll(params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }): Promise<LmsSyncAllResult>`.

- [ ] **Step 1: Write the failing test**

Thêm vào cuối `src/shared/types.test.ts`:

```ts
import { IPC } from './types'

describe('IPC lms sync', () => {
  it('dùng key lms:syncAll (thay cho lms:syncClasses cũ)', () => {
    expect(IPC.lmsSyncAll).toBe('lms:syncAll')
  })
})
```

(Giữ nguyên import `DEFAULT_CONFIG, DEFAULT_ZALO_TEMPLATE` đã có ở đầu file, chỉ thêm `IPC` vào cùng dòng import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/types.test.ts`
Expected: FAIL — `IPC.lmsSyncAll` is `undefined`.

- [ ] **Step 3: Implement**

Trong `src/shared/types.ts`, sửa `SessionContent`:

```ts
export interface SessionContent {
  id: string
  classId: string
  sessionId: string
  lessonContent: string
  homework: string
  comments: StudentComment[]
  absentStudentIds?: string[]
}
```

Thêm sau `LmsSyncResult`:

```ts
export interface LmsContentTarget {
  classCode: string
  sessionId: string
  sessionDate: string  // 'YYYY-MM-DD'
}

export interface LmsContentResult {
  classCode: string
  sessionDate: string  // 'YYYY-MM-DD'
  lessonContent: string
  homework: string
  students: { name: string; attended: boolean; comment: string }[]
}

export interface LmsSyncAllResult {
  newClasses: LmsScrapedClass[]
  contentResults: LmsContentResult[]
  skippedClasses: string[]
}
```

Trong khối `IPC`, đổi:

```ts
  lmsSyncClasses: 'lms:syncClasses',
```
thành
```ts
  lmsSyncAll: 'lms:syncAll',
```

Trong `AppApi`, đổi:

```ts
  lmsSyncClasses(): Promise<LmsSyncResult>
```
thành
```ts
  lmsSyncAll(params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }): Promise<LmsSyncAllResult>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/types.test.ts
git commit -m "feat(types): thêm absentStudentIds, LmsSyncAll types, đổi IPC lmsSyncClasses -> lmsSyncAll"
```

---

### Task 2: `getClassStatus` dùng chung (shared/classStatus.ts)

**Files:**
- Create: `src/shared/classStatus.ts`
- Test: `src/shared/classStatus.test.ts`

**Interfaces:**
- Consumes: `ClassSession` từ `src/shared/types.ts` (đã có).
- Produces: `ClassStatus = 'chưa bắt đầu' | 'đang diễn ra' | 'đã kết thúc'`; `getClassStatus(sessions: ClassSession[], now?: Date): ClassStatus`.

- [ ] **Step 1: Write the failing test**

Tạo `src/shared/classStatus.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/classStatus.test.ts`
Expected: FAIL — cannot find module `./classStatus`.

- [ ] **Step 3: Implement**

Tạo `src/shared/classStatus.ts`:

```ts
import { ClassSession } from './types'

export type ClassStatus = 'chưa bắt đầu' | 'đang diễn ra' | 'đã kết thúc'

export function getClassStatus(sessions: ClassSession[], now: Date = new Date()): ClassStatus {
  if (sessions.length === 0) return 'chưa bắt đầu'
  const dates = sessions.map(s => new Date(s.dateTime)).sort((a, b) => a.getTime() - b.getTime())
  if (now < dates[0]) return 'chưa bắt đầu'
  if (now > dates[dates.length - 1]) return 'đã kết thúc'
  return 'đang diễn ra'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/classStatus.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/classStatus.ts src/shared/classStatus.test.ts
git commit -m "refactor(shared): tách getClassStatus ra shared/classStatus.ts"
```

---

### Task 3: Logic ghép nối thuần (shared/lmsSync.ts)

**Files:**
- Create: `src/shared/lmsSync.ts`
- Test: `src/shared/lmsSync.test.ts`

**Interfaces:**
- Consumes: `getClassStatus` từ `./classStatus` (Task 2); `SchoolClass, ClassSession, Student, SessionContent, LmsContentTarget, LmsContentResult` từ `./types` (Task 1).
- Produces: `computeContentTargets(classes: SchoolClass[], hasContent: (sessionId: string) => boolean, now?: Date): LmsContentTarget[]`; `matchStudentByName(students: Student[], name: string): Student | undefined`; `mergeContentResult(cls: SchoolClass, session: ClassSession, result: LmsContentResult): SessionContent`.

- [ ] **Step 1: Write the failing test**

Tạo `src/shared/lmsSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeContentTargets, matchStudentByName, mergeContentResult } from './lmsSync'
import { SchoolClass, ClassSession, LmsContentResult } from './types'

describe('computeContentTargets', () => {
  const now = new Date('2026-07-17T00:00:00')

  it('lớp đã kết thúc -> không có target', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [{ id: 'ss1', dateTime: '2026-01-01T14:00:00' }],
    }
    expect(computeContentTargets([cls], () => false, now)).toEqual([])
  })

  it('chưa có buổi nào đã qua -> không có target', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [{ id: 'ss1', dateTime: '2026-08-01T14:00:00' }],
    }
    expect(computeContentTargets([cls], () => false, now)).toEqual([])
  })

  it('buổi gần nhất đã qua và đã có content -> không có target', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [
        { id: 'ss1', dateTime: '2026-07-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-08-01T14:00:00' },
      ],
    }
    expect(computeContentTargets([cls], id => id === 'ss1', now)).toEqual([])
  })

  it('buổi gần nhất đã qua chưa có content -> trả về target đúng buổi đó', () => {
    const cls: SchoolClass = {
      id: 'c1', code: 'A1', name: 'A1', students: [],
      sessions: [
        { id: 'ss1', dateTime: '2026-07-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-07-10T14:00:00' },
        { id: 'ss3', dateTime: '2026-08-01T14:00:00' },
      ],
    }
    expect(computeContentTargets([cls], () => false, now)).toEqual([
      { classCode: 'A1', sessionId: 'ss2', sessionDate: '2026-07-10' },
    ])
  })
})

describe('matchStudentByName', () => {
  const students = [{ id: 's1', name: 'Nguyễn Văn An' }, { id: 's2', name: 'Bình' }]

  it('khớp chính xác', () => {
    expect(matchStudentByName(students, 'Bình')?.id).toBe('s2')
  })

  it('khớp khi tên LMS là chuỗi con của tên local', () => {
    expect(matchStudentByName(students, 'An')?.id).toBe('s1')
  })

  it('không khớp -> undefined', () => {
    expect(matchStudentByName(students, 'Không tồn tại')).toBeUndefined()
  })
})

describe('mergeContentResult', () => {
  const cls: SchoolClass = {
    id: 'c1', code: 'A1', name: 'A1',
    students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Bình' }],
    sessions: [],
  }
  const session: ClassSession = { id: 'ss1', dateTime: '2026-07-10T14:00:00' }

  it('HS có mặt -> tạo StudentComment với raw = polished = comment gốc', () => {
    const result: LmsContentResult = {
      classCode: 'A1', sessionDate: '2026-07-10',
      lessonContent: 'Bài học', homework: 'BT',
      students: [{ name: 'An', attended: true, comment: 'Ngoan' }],
    }
    const content = mergeContentResult(cls, session, result)
    expect(content).toEqual({
      id: 'ss1', classId: 'c1', sessionId: 'ss1',
      lessonContent: 'Bài học', homework: 'BT',
      comments: [{ studentId: 's1', raw: 'Ngoan', polished: 'Ngoan' }],
      absentStudentIds: [],
    })
  })

  it('HS nghỉ -> vào absentStudentIds, không có StudentComment', () => {
    const result: LmsContentResult = {
      classCode: 'A1', sessionDate: '2026-07-10',
      lessonContent: 'Bài học', homework: 'BT',
      students: [{ name: 'Bình', attended: false, comment: '' }],
    }
    const content = mergeContentResult(cls, session, result)
    expect(content.comments).toEqual([])
    expect(content.absentStudentIds).toEqual(['s2'])
  })

  it('tên không khớp HS nào -> bỏ qua, không lỗi', () => {
    const result: LmsContentResult = {
      classCode: 'A1', sessionDate: '2026-07-10',
      lessonContent: '', homework: '',
      students: [{ name: 'Học sinh lạ', attended: true, comment: 'x' }],
    }
    const content = mergeContentResult(cls, session, result)
    expect(content.comments).toEqual([])
    expect(content.absentStudentIds).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/lmsSync.test.ts`
Expected: FAIL — cannot find module `./lmsSync`.

- [ ] **Step 3: Implement**

Tạo `src/shared/lmsSync.ts`:

```ts
import { SchoolClass, ClassSession, Student, SessionContent, LmsContentTarget, LmsContentResult } from './types'
import { getClassStatus } from './classStatus'

export function computeContentTargets(
  classes: SchoolClass[],
  hasContent: (sessionId: string) => boolean,
  now: Date = new Date(),
): LmsContentTarget[] {
  const targets: LmsContentTarget[] = []

  for (const cls of classes) {
    if (getClassStatus(cls.sessions, now) === 'đã kết thúc') continue

    const past = cls.sessions
      .filter(s => new Date(s.dateTime) < now)
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())

    const latest = past[0]
    if (!latest || hasContent(latest.id)) continue

    targets.push({
      classCode: cls.code,
      sessionId: latest.id,
      sessionDate: latest.dateTime.slice(0, 10),
    })
  }

  return targets
}

export function matchStudentByName(students: Student[], name: string): Student | undefined {
  const target = name.trim().toLowerCase()
  return students.find(
    s => target.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(target),
  )
}

export function mergeContentResult(
  cls: SchoolClass,
  session: ClassSession,
  result: LmsContentResult,
): SessionContent {
  const comments: SessionContent['comments'] = []
  const absentStudentIds: string[] = []

  for (const s of result.students) {
    const student = matchStudentByName(cls.students, s.name)
    if (!student) continue
    if (s.attended) {
      comments.push({ studentId: student.id, raw: s.comment, polished: s.comment })
    } else {
      absentStudentIds.push(student.id)
    }
  }

  return {
    id: session.id,
    classId: cls.id,
    sessionId: session.id,
    lessonContent: result.lessonContent,
    homework: result.homework,
    comments,
    absentStudentIds,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/lmsSync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/lmsSync.ts src/shared/lmsSync.test.ts
git commit -m "feat(shared): thêm computeContentTargets/matchStudentByName/mergeContentResult"
```

---

### Task 4: `LmsAutomator.syncAll` — đọc nội dung tab "Nhận xét"

**Files:**
- Modify: `src/main/automation/LmsAutomator.ts`

**Interfaces:**
- Consumes: `LmsContentTarget`, `LmsContentResult`, `LmsSyncAllResult`, `LmsScrapedClass` từ `../../shared/types` (Task 1). Tái dùng `findAndOpenClass`, `clickTab`, `scrapeAllClasses`, `ensureLoggedIn`, `getPage` đã có trong file.
- Produces: `async syncAll(existingCodes: string[], contentTargets: LmsContentTarget[]): Promise<LmsSyncAllResult>` — public method mới, dùng ở Task 5.

Không có unit test tự động (Playwright thao tác trình duyệt thật, không mock trong bộ test hiện tại — giống các method LMS khác trong file này). Sau khi cài xong, cần chạy app thật và thử nút "Đồng bộ từ LMS" để xác nhận selector đúng (xem bước Verify cuối task).

- [ ] **Step 1: Thêm import types**

Trong `src/main/automation/LmsAutomator.ts`, sửa dòng import đầu file:

```ts
import {
  LmsPostParams, LmsPostResult, LmsSyncResult, LmsScrapedClass,
  LmsContentTarget, LmsContentResult, LmsSyncAllResult,
} from '../../shared/types'
```

- [ ] **Step 2: Thêm public method `syncAll`**

Thêm vào khối `// ─── Public API ──...` (ngay sau `syncClasses`):

```ts
  /**
   * Đồng bộ toàn diện: thêm lớp mới + lấy nội dung buổi gần nhất còn thiếu của lớp đang có.
   */
  async syncAll(
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
```

- [ ] **Step 3: Thêm helper `fetchContentForTarget` + `selectCommentSession`**

Thêm vào khối `// ─── Sync helpers ──...` (cuối file, trước dấu `}` đóng class):

```ts
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

    const lessonContent = await this.readExpandableSection(page, /tổng\s*k/i)
    if (!lessonContent) return null  // chưa điền Tổng kết -> buổi chưa có nội dung

    const homework = (await this.readExpandableSection(page, /bài.*nhà/i)) ?? ''
    const students = await this.readStudentComments(page)

    return { classCode: target.classCode, sessionDate: target.sessionDate, lessonContent, homework, students }
  }

  /** Chọn buổi trong carousel tab "Nhận xét" theo ngày 'YYYY-MM-DD'. Trả về false nếu không tìm thấy. */
  private async selectCommentSession(page: Page, sessionDate: string): Promise<boolean> {
    const [, month, day] = sessionDate.split('-')
    const slot = page
      .locator('[id^="class-comments-slot-carousel-"]')
      .filter({ hasText: new RegExp(`\\b${day}[/-]${month}\\b`) })
      .first()

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
    const block = page.locator('div.jss2713.jss2705').filter({ hasText: headerRegex }).first()
    if ((await block.count()) === 0) return null

    const isCollapsed = (await block.locator('svg[data-testid="ExpandMoreIcon"]').count()) > 0
    if (isCollapsed) {
      await block.locator('div.jss2712').first().click({ timeout: TIMEOUT })
      await page.waitForTimeout(500)
    }

    const contentEl = block.locator('div.jss2722').first()
    if ((await contentEl.count()) === 0) return ''

    const isPlaceholder = await contentEl.evaluate(el => el.className.includes('place-holder'))
    if (isPlaceholder) return ''

    return ((await contentEl.textContent()) ?? '').trim()
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
```

- [ ] **Step 4: Kiểm tra TypeScript build**

Run: `npx tsc --noEmit -p tsconfig.node.json`
(hoặc lệnh type-check hiện có trong `package.json` nếu khác — kiểm tra bằng `cat package.json` nếu lệnh trên báo "config not found")
Expected: không có lỗi type trong `LmsAutomator.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/main/automation/LmsAutomator.ts
git commit -m "feat(lms): thêm syncAll() đọc tổng kết/bài tập/nhận xét/điểm danh từ tab Nhận xét"
```

- [ ] **Step 6 (Verify thủ công — làm sau khi Task 5-6 nối dây xong UI):**

Chạy app thật (`npm run dev`), bấm "Đồng bộ từ LMS" với 1 lớp có buổi gần nhất đã điền sẵn nội dung trên LMS. Kỳ vọng: buổi đó được lưu vào local (kiểm tra bằng cách mở lại "Soạn nội dung" của buổi đó, thấy tổng kết/bài tập/nhận xét đã điền sẵn, HS nghỉ không có ô nhận xét). Nếu selector sai (lỗi ném ra hoặc `contentResults` rỗng dù LMS đã có nội dung), chụp lại HTML/console log gửi để chỉnh `readExpandableSection`/`readStudentComments`/`selectCommentSession` — **không tự đoán lại selector nếu không có HTML/log thực tế.**

---

### Task 5: Nối dây IPC (ipcHandlers, main/index, preload)

**Files:**
- Modify: `src/main/ipcHandlers.ts`
- Test: `src/main/ipcHandlers.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `LmsAutomator.syncAll` (Task 4); `LmsContentTarget, LmsSyncAllResult` (Task 1).
- Produces: `IpcDeps.lmsSyncAll(params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }): Promise<LmsSyncAllResult>`; `AppApi.lmsSyncAll` implemented end-to-end.

- [ ] **Step 1: Write the failing test**

Trong `src/main/ipcHandlers.test.ts`, khối `describe('createIpcHandlers — LMS automation', ...)`: đổi `makeDeps()` và thêm test mới.

Sửa `makeDeps()`:

```ts
  function makeDeps() {
    return {
      configStore: { load: vi.fn(), save: vi.fn(), update: vi.fn() },
      validateGeminiKey: vi.fn(), pickFolder: vi.fn(),
      getRepository: vi.fn(), getContentRepository: vi.fn(),
      extractPdf: vi.fn(), rewrite: vi.fn(),
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsPostSession: vi.fn(async () => ({ posted: ['An'], skipped: [] })),
      lmsSyncAll: vi.fn(async () => ({ newClasses: [], contentResults: [], skippedClasses: [] })),
    }
  }
```

Đổi test `lmsSyncClasses ủy quyền cho dep` thành:

```ts
  it('lmsSyncAll truyền params và ủy quyền cho dep', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    const params = { existingCodes: ['A1'], contentTargets: [{ classCode: 'A1', sessionId: 'ss1', sessionDate: '2026-07-10' }] }
    const res = await api.lmsSyncAll(params)
    expect(res).toEqual({ newClasses: [], contentResults: [], skippedClasses: [] })
    expect(deps.lmsSyncAll).toHaveBeenCalledWith(params)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/ipcHandlers.test.ts`
Expected: FAIL — `api.lmsSyncAll is not a function` (TypeScript sẽ báo lỗi biên dịch trước, vì `IpcDeps`/`AppApi` chưa có field này ở `ipcHandlers.ts`).

- [ ] **Step 3: Implement**

Trong `src/main/ipcHandlers.ts`, sửa import:

```ts
import {
  AppApi, AppConfig, GeminiValidationResult, SchoolClass, SessionContent,
  LmsPostParams, LmsPostResult, LmsContentTarget, LmsSyncAllResult,
} from '../shared/types'
```

Sửa interface `IpcDeps`, đổi field cuối:

```ts
  lmsOpenBrowser: () => Promise<{ loggedIn: boolean }>
  lmsPostSession: (params: LmsPostParams) => Promise<LmsPostResult>
  lmsSyncAll: (params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }) => Promise<LmsSyncAllResult>
```

Sửa object trả về trong `createIpcHandlers`, đổi dòng cuối:

```ts
    lmsOpenBrowser: () => deps.lmsOpenBrowser(),
    lmsPostSession: (params: LmsPostParams) => deps.lmsPostSession(params),
    lmsSyncAll: (params) => deps.lmsSyncAll(params),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/main/ipcHandlers.test.ts`
Expected: PASS

- [ ] **Step 5: Wire `main/index.ts` và `preload/index.ts`**

Trong `src/main/index.ts`, đổi khối cuối `createIpcHandlers({...})`:

```ts
    lmsOpenBrowser: async () => {
      const cfg = await configStore.load()
      return lmsAutomator.openBrowser(cfg.lmsEmail ?? undefined, cfg.lmsPassword ?? undefined)
    },
    lmsPostSession: (params) => lmsAutomator.postSession(params),
    lmsSyncAll: (params) => lmsAutomator.syncAll(params.existingCodes, params.contentTargets),
  })
```

(Xóa khối `lmsSyncClasses: async () => { const repo = await getRepository(); ... }` cũ — renderer giờ tự tính `existingCodes` từ state đã có, main không cần đọc repo nữa cho việc này.)

Và đổi dòng đăng ký ipcMain:

```ts
  ipcMain.handle(IPC.lmsSyncAll, (_e, params) => handlers.lmsSyncAll(params))
```//thay cho `ipcMain.handle(IPC.lmsSyncClasses, ...)`.

Trong `src/preload/index.ts`, đổi:

```ts
  lmsSyncClasses: () => ipcRenderer.invoke(IPC.lmsSyncClasses),
```
thành
```ts
  lmsSyncAll: (params) => ipcRenderer.invoke(IPC.lmsSyncAll, params),
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS (không còn lỗi biên dịch do `lmsSyncClasses` bị xóa — nếu còn nơi nào tham chiếu cũ, TypeScript sẽ báo lỗi khi build; sửa hết trước khi commit).

- [ ] **Step 7: Commit**

```bash
git add src/main/ipcHandlers.ts src/main/ipcHandlers.test.ts src/main/index.ts src/preload/index.ts
git commit -m "feat(ipc): nối dây lmsSyncAll xuyên main/preload, bỏ lmsSyncClasses cũ"
```

---

### Task 6: `ClassesPage` — gọi đồng bộ, tự lưu content, hiện tóm tắt

**Files:**
- Modify: `src/renderer/src/pages/ClassesPage.tsx`
- Test: `src/renderer/src/pages/ClassesPage.test.tsx`

**Interfaces:**
- Consumes: `getClassStatus, ClassStatus` từ `../../../shared/classStatus` (Task 2); `computeContentTargets, mergeContentResult` từ `../../../shared/lmsSync` (Task 3); `window.api.lmsSyncAll` (Task 5).

- [ ] **Step 1: Write the failing test**

Thêm vào `src/renderer/src/pages/ClassesPage.test.tsx` (sau import hiện có, thêm `LmsSyncAllResult` vào import type nếu cần — không bắt buộc vì test dùng object literal trực tiếp):

```tsx
  it('bấm "Đồng bộ từ LMS": tính đúng contentTargets, lưu content buổi thiếu, hiện tóm tắt', async () => {
    const clsA1: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }],
      sessions: [{ id: 'ss1', dateTime: '2020-01-01T14:00:00' }],
    }
    const api = stub({
      listClasses: vi.fn(async () => [clsA1]),
      getContent: vi.fn(async () => null),
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsSyncAll: vi.fn(async () => ({
        newClasses: [],
        contentResults: [{
          classCode: 'A1', sessionDate: '2020-01-01',
          lessonContent: 'Bài học', homework: 'BT',
          students: [{ name: 'An', attended: true, comment: 'Ngoan' }],
        }],
        skippedClasses: [],
      })),
      saveContent: vi.fn(async () => {}),
    })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('A1'))

    fireEvent.click(screen.getByText(/đồng bộ từ lms/i))

    await waitFor(() => expect(api.lmsSyncAll).toHaveBeenCalledWith({
      existingCodes: ['A1'],
      contentTargets: [{ classCode: 'A1', sessionId: 'ss1', sessionDate: '2020-01-01' }],
    }))
    await waitFor(() => expect(api.saveContent).toHaveBeenCalledWith({
      id: 'ss1', classId: 'c1', sessionId: 'ss1',
      lessonContent: 'Bài học', homework: 'BT',
      comments: [{ studentId: 's1', raw: 'Ngoan', polished: 'Ngoan' }],
      absentStudentIds: [],
    }))
    await waitFor(() => expect(screen.getByText(/đã cập nhật nội dung 1 buổi/i)).toBeInTheDocument())
  })

  it('lớp bị bỏ qua (LMS chưa có nội dung) hiện trong tóm tắt', async () => {
    const clsA1: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }],
      sessions: [{ id: 'ss1', dateTime: '2020-01-01T14:00:00' }],
    }
    stub({
      listClasses: vi.fn(async () => [clsA1]),
      getContent: vi.fn(async () => null),
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsSyncAll: vi.fn(async () => ({ newClasses: [], contentResults: [], skippedClasses: ['A1'] })),
      saveContent: vi.fn(async () => {}),
    })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('A1'))
    fireEvent.click(screen.getByText(/đồng bộ từ lms/i))
    await waitFor(() => expect(screen.getByText(/bỏ qua 1 lớp/i)).toBeInTheDocument())
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/pages/ClassesPage.test.tsx`
Expected: FAIL — không tìm thấy text "Đồng bộ từ LMS" (nút hiện tại tên "Tự động thêm lớp từ LMS"), và `lmsSyncAll` chưa tồn tại trên `window.api` stub type.

- [ ] **Step 3: Implement**

Trong `src/renderer/src/pages/ClassesPage.tsx`:

Đổi import đầu file:

```tsx
import { useEffect, useState } from 'react'
import { SchoolClass, ClassSession, LmsScrapedClass } from '../../../shared/types'
import { newId } from '../../../shared/id'
import { formatSessionDate } from '../../../shared/zaloTemplate'
import { getClassStatus, ClassStatus } from '../../../shared/classStatus'
import { computeContentTargets, mergeContentResult } from '../../../shared/lmsSync'
import ClassEditor from './ClassEditor'
import SessionComposer from './SessionComposer'
```

Xóa định nghĩa `type ClassStatus`, `function getClassStatus`, giữ nguyên `STATUS_STYLE`.

Thêm state mới (cạnh các `useState` hiện có):

```tsx
  const [syncSummary, setSyncSummary] = useState<{ updated: number; skipped: number } | null>(null)
```

Thay toàn bộ hàm `syncFromLms`:

```tsx
  const syncFromLms = async (): Promise<void> => {
    setSyncing(true)
    setSyncError(null)
    setSyncSummary(null)
    try {
      const { loggedIn } = await window.api.lmsOpenBrowser()
      if (!loggedIn) {
        setSyncError('Hết thời gian chờ đăng nhập LMS (3 phút). Thử lại sau khi đăng nhập.')
        return
      }
      const existingCodes = classes.map(c => c.code)
      const contentTargets = computeContentTargets(classes, id => commentedSessions.has(id))

      const { newClasses, contentResults, skippedClasses } = await window.api.lmsSyncAll({
        existingCodes,
        contentTargets,
      })

      for (const result of contentResults) {
        const cls = classes.find(c => c.code === result.classCode)
        const target = contentTargets.find(t => t.classCode === result.classCode)
        const session = cls?.sessions.find(s => s.id === target?.sessionId)
        if (cls && session) {
          await window.api.saveContent(mergeContentResult(cls, session, result))
        }
      }

      setSyncPreview(newClasses)
      setSyncSummary({ updated: contentResults.length, skipped: skippedClasses.length })
      if (contentResults.length > 0) await reload()
    } catch (err) {
      setSyncError((err as Error).message)
    } finally {
      setSyncing(false)
    }
  }
```

Đổi nhãn nút (trong JSX render, khối các `<button>` đầu trang):

```tsx
          <button onClick={() => void syncFromLms()} disabled={syncing}>
            {syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ LMS'}
          </button>
```

Thêm hiện tóm tắt ngay dưới dòng `{syncError && ...}`:

```tsx
      {syncSummary && (
        <p style={{ color: '#555' }}>
          Đã cập nhật nội dung {syncSummary.updated} buổi
          {syncSummary.skipped > 0 ? `, bỏ qua ${syncSummary.skipped} lớp (LMS chưa có nội dung buổi mới nhất)` : ''}.
        </p>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/src/pages/ClassesPage.test.tsx`
Expected: PASS (toàn bộ file, kể cả các test cũ — kiểm tra không có test nào tham chiếu text nút cũ "Tự động thêm lớp từ LMS"; nếu có, không có vì các test hiện tại không kiểm tra text nút này).

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/ClassesPage.tsx src/renderer/src/pages/ClassesPage.test.tsx
git commit -m "feat(classes): gộp đồng bộ lớp mới + nội dung buổi thiếu vào 1 nút, hiện tóm tắt"
```

---

### Task 7: `SessionComposer` — loại HS nghỉ khỏi tin Zalo

**Files:**
- Modify: `src/renderer/src/pages/SessionComposer.tsx`
- Test: `src/renderer/src/pages/SessionComposer.test.tsx`

**Interfaces:**
- Consumes: `SessionContent.absentStudentIds` (Task 1).

- [ ] **Step 1: Write the failing test**

Thêm vào `src/renderer/src/pages/SessionComposer.test.tsx`, cuối `describe('SessionComposer', ...)`:

```tsx
  it('loại học sinh nghỉ (absentStudentIds) khỏi tin Zalo xem trước', async () => {
    const clsWithTwo: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Bình' }],
      sessions: [],
    }
    stub({
      getContent: vi.fn(async () => ({
        id: 'ss1', classId: 'c1', sessionId: 'ss1', lessonContent: 'Bài học', homework: 'BT',
        comments: [{ studentId: 's1', raw: 'Ngoan', polished: 'Ngoan' }],
        absentStudentIds: ['s2'],
      })),
    })
    render(<SessionComposer cls={clsWithTwo} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/nội dung bài học/i))
    fireEvent.click(screen.getByText(/xem trước/i))
    const pre = await screen.findByLabelText(/xem trước zalo/i)
    expect(pre.textContent).toContain('An: Ngoan')
    expect(pre.textContent).not.toContain('Bình')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/pages/SessionComposer.test.tsx`
Expected: FAIL — preview vẫn chứa "Bình" (chưa lọc HS nghỉ).

- [ ] **Step 3: Implement**

Trong `src/renderer/src/pages/SessionComposer.tsx`, thêm helper ngay dưới hàm `commentFor`:

```ts
  const isAbsent = (studentId: string): boolean => (content.absentStudentIds ?? []).includes(studentId)
```

Sửa `showPreview`, đổi dòng `danh_sach_nhan_xet`:

```ts
      danh_sach_nhan_xet: formatCommentLines(
        cls.students
          .filter(s => !isAbsent(s.id))
          .map(s => ({ name: s.name, text: commentFor(s.id).polished || commentFor(s.id).raw })),
      ),
```

Sửa `postToLms`, đổi khối xây `comments`:

```ts
      const comments = cls.students
        .filter(s => !isAbsent(s.id))
        .map(s => {
          const cm = commentFor(s.id)
          return { studentName: s.name, text: cm.polished || cm.raw }
        })
        .filter(c => c.text.trim() !== '')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/src/pages/SessionComposer.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS toàn bộ (tất cả các file test trong dự án).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/SessionComposer.tsx src/renderer/src/pages/SessionComposer.test.tsx
git commit -m "feat(composer): loại học sinh nghỉ (absentStudentIds) khỏi tin Zalo"
```

---

## Sau khi hoàn thành cả 7 task

1. Chạy `npm test` lần cuối — toàn bộ suite phải xanh.
2. Làm Task 4 / Step 6 (verify thủ công đọc DOM thật) nếu chưa làm — bắt buộc trước khi coi tính năng là xong, vì đây là phần duy nhất không có test tự động.
3. Cân nhắc dùng skill `verify` để lái thử luồng "Đồng bộ từ LMS" trong app thật end-to-end (mở app, bấm nút, kiểm tra dữ liệu lưu đúng, tin Zalo xem trước loại đúng HS nghỉ).
