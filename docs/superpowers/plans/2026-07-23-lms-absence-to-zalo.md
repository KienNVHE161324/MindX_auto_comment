# LMS Manual Comment, Absence Status, and Session Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi nhận xét LMS ổn định ở manual mode, đồng bộ học sinh nghỉ thành `Tên: nghỉ` sau khi LMS trả kết quả, và căn thẳng các cột trong danh sách buổi học.

**Architecture:** `LmsAutomator` chịu trách nhiệm chuyển popup sang manual mode và trả ba nhóm kết quả độc lập. Shared `buildZaloMessage()` là nguồn dựng tin duy nhất cho preview/copy/auto-send; `SessionComposer` chỉ cập nhật preview đang mở sau khi đã lưu kết quả LMS. Danh sách buổi học dùng CSS grid năm cột với một ô nút phụ luôn tồn tại.

**Tech Stack:** TypeScript, React 18, Playwright, CSS Grid, Vitest, Testing Library.

## Global Constraints

- Lỗi kỹ thuật hoặc thiếu nội dung không được coi là nghỉ.
- Học sinh nghỉ phải hiện `Tên: nghỉ` trong preview, copy và auto-send Zalo.
- Preview không tự thay nội dung trước khi LMS trả kết quả.
- Giữ nguyên quy tắc hiện tại của `postedToLms`.
- Không ghi đè mất `absentStudentIds` đã lưu.
- Layout phải không tràn khung trên màn hình hẹp.

---

### Task 1: Chuyển popup nhận xét LMS sang manual mode

**Files:**
- Modify: `src/main/automation/LmsAutomator.ts`
- Test: `src/main/automation/LmsAutomator.test.ts`

**Interfaces:**
- Produces: `getStudentCommentManualModeSelector(): string`
- Consumes: popup Playwright `Locator` sau khi vùng nhận xét được click.

- [ ] **Step 1: Viết test đỏ cho selector manual mode**

```ts
expect(getStudentCommentManualModeSelector()).toBe(
  '[aria-label="In by-areas mode, click to switch to manual mode"]',
)
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm.cmd test -- src/main/automation/LmsAutomator.test.ts`

Expected: FAIL vì helper chưa tồn tại.

- [ ] **Step 3: Thêm selector và thao tác chuyển mode**

```ts
export function getStudentCommentManualModeSelector(): string {
  return '[aria-label="In by-areas mode, click to switch to manual mode"]'
}
```

Sau `await commentArea.click(...)`, tìm selector trong popup. Nếu tồn tại và đang hiển thị, click nó; sau đó mới chờ `.ql-editor[contenteditable="true"]`, fill nội dung mới, xác minh và Save. Bỏ việc đọc nội dung `<p>` cũ vì luồng luôn ghi đè và đoạn đọc này có thể nhầm nội dung giao diện by-areas.

- [ ] **Step 4: Chạy test mục tiêu**

Run: `npm.cmd test -- src/main/automation/LmsAutomator.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit thay đổi LMS**

```powershell
git add -- src/main/automation/LmsAutomator.ts src/main/automation/LmsAutomator.test.ts
git commit -m "fix: switch LMS comments to manual mode"
```

### Task 2: Dùng một nguồn dựng tin Zalo có trạng thái nghỉ

**Files:**
- Modify: `src/shared/autoSend.ts`
- Test: `src/shared/autoSend.test.ts`
- Modify: `src/renderer/src/pages/SessionComposer.tsx`
- Test: `src/renderer/src/pages/SessionComposer.test.tsx`

**Interfaces:**
- Consumes: `buildZaloMessage(cls, session, content, template): string`
- Produces: nội dung trong đó học sinh nghỉ có `text: 'nghỉ'`.

- [ ] **Step 1: Viết test đỏ cho tin Zalo**

```ts
const message = buildZaloMessage(cls, session, {
  ...content,
  absentStudentIds: ['s2'],
}, '{{danh_sach_nhan_xet}}')

expect(message).toContain('An: Ngoan')
expect(message).toContain('Bình: nghỉ')
```

- [ ] **Step 2: Viết test đỏ cho thời điểm cập nhật preview**

Mở preview trước khi post LMS và xác nhận có `Nguyễn Sách Sâm: Chăm`. Mock LMS trả `absentStudentNames: ['Sách Sâm']`; sau khi `saveContent` nhận `absentStudentIds: ['s2']`, xác nhận chính preview đang mở tự đổi thành `Nguyễn Sách Sâm: nghỉ`.

- [ ] **Step 3: Chạy test đỏ**

Run: `npm.cmd test -- src/shared/autoSend.test.ts src/renderer/src/pages/SessionComposer.test.tsx`

Expected: FAIL vì học sinh nghỉ đang bị lọc bỏ và preview đang mở chưa được dựng lại.

- [ ] **Step 4: Sửa shared builder**

```ts
danh_sach_nhan_xet: formatCommentLines(
  cls.students.map(s => ({
    name: s.name,
    text: absentIds.has(s.id)
      ? 'nghỉ'
      : commentFor(s.id).polished || commentFor(s.id).raw,
  })),
),
```

- [ ] **Step 5: Dùng shared builder trong renderer**

`showPreview()` gọi `buildZaloMessage(cls, session, content, config.zaloMessageTemplate)`. Sau khi LMS trả kết quả và `updated` đã được lưu, nếu preview đang mở thì gọi lại builder với chính `updated`; không thay preview trước thời điểm này.

- [ ] **Step 6: Chạy test mục tiêu**

Run: `npm.cmd test -- src/shared/autoSend.test.ts src/renderer/src/pages/SessionComposer.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit luồng Zalo**

```powershell
git add -- src/shared/autoSend.ts src/shared/autoSend.test.ts src/renderer/src/pages/SessionComposer.tsx src/renderer/src/pages/SessionComposer.test.tsx
git commit -m "fix: show LMS absences in Zalo messages"
```

### Task 3: Tách báo cáo LMS thành ba nhóm

**Files:**
- Modify: `src/shared/lmsSync.ts`
- Test: `src/shared/lmsSync.test.ts`
- Modify: `src/renderer/src/pages/SessionComposer.tsx`
- Test: `src/renderer/src/pages/SessionComposer.test.tsx`

**Interfaces:**
- Produces: `excludeAbsentSkipped(skipped: string[], absentNames: string[]): string[]`
- Consumes: `LmsPostResult.posted`, `.absentStudentNames`, `.skipped`.

- [ ] **Step 1: Viết test đỏ cho lọc dòng bỏ qua**

```ts
expect(excludeAbsentSkipped(
  ['Nguyễn Sách Sâm', 'Phạm Bá Long (lỗi: timeout)'],
  ['Sách Sâm'],
)).toEqual(['Phạm Bá Long (lỗi: timeout)'])
```

- [ ] **Step 2: Chạy test đỏ**

Run: `npm.cmd test -- src/shared/lmsSync.test.ts`

Expected: FAIL vì helper chưa tồn tại.

- [ ] **Step 3: Implement helper và ba dòng báo cáo**

Helper chuẩn hóa tên bằng cùng quy tắc trim/lowercase/chuỗi con đang dùng khi đồng bộ LMS. Renderer hiển thị độc lập:

```text
Đã nhận xét: ...
Học sinh nghỉ: ...
Bỏ qua do lỗi/thiếu nội dung: ...
```

Chỉ hiện một dòng khi mảng tương ứng có phần tử.

- [ ] **Step 4: Chạy test renderer và shared**

Run: `npm.cmd test -- src/shared/lmsSync.test.ts src/renderer/src/pages/SessionComposer.test.tsx`

Expected: PASS và Sách Sâm chỉ xuất hiện ở dòng “Học sinh nghỉ”.

- [ ] **Step 5: Commit báo cáo**

```powershell
git add -- src/shared/lmsSync.ts src/shared/lmsSync.test.ts src/renderer/src/pages/SessionComposer.tsx src/renderer/src/pages/SessionComposer.test.tsx
git commit -m "fix: separate LMS absence and error results"
```

### Task 4: Căn thẳng danh sách buổi học bằng grid

**Files:**
- Modify: `src/renderer/src/pages/ClassesPage.tsx`
- Modify: `src/renderer/src/styles.css`
- Test: `src/renderer/src/pages/ClassesPage.test.tsx`

**Interfaces:**
- Produces: `.session-row` năm cột và `.session-secondary-action` luôn tồn tại.

- [ ] **Step 1: Viết test đỏ cho ô hành động phụ**

Render hai buổi có trạng thái khác nhau; xác nhận mỗi `.session-row` có đúng một `.session-secondary-action`, kể cả hàng không có nút sao chép.

- [ ] **Step 2: Chạy test đỏ**

Run: `npm.cmd test -- src/renderer/src/pages/ClassesPage.test.tsx`

Expected: FAIL vì hàng không thể sao chép chưa render ô giữ chỗ.

- [ ] **Step 3: Render ô giữ chỗ và đổi CSS sang grid**

```tsx
<span className="session-secondary-action">
  {canCopy ? <button className="btn btn-sm">Sao chép buổi trước</button> : null}
</span>
```

```css
.session-row {
  display: grid;
  grid-template-columns: 40px 200px 165px 234px minmax(210px, 1fr);
  align-items: center;
  gap: 12px;
}
.session-secondary-action { min-width: 0; }
@media (max-width: 900px) {
  .session-row { grid-template-columns: 40px minmax(160px, 1fr); }
  .session-row > * { min-width: 0; }
}
```

Điều chỉnh kích thước thực tế nếu cần để giữ nút không tràn card, nhưng mọi hàng phải dùng cùng template cột.

- [ ] **Step 4: Chạy test UI**

Run: `npm.cmd test -- src/renderer/src/pages/ClassesPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit layout**

```powershell
git add -- src/renderer/src/pages/ClassesPage.tsx src/renderer/src/styles.css src/renderer/src/pages/ClassesPage.test.tsx
git commit -m "fix: align session row actions"
```

### Task 5: Xác minh tích hợp

**Files:**
- Verify: toàn bộ repository.

**Interfaces:**
- Consumes: kết quả của Tasks 1–4.
- Produces: bản build đã kiểm tra.

- [ ] **Step 1: Chạy typecheck**

Run: `npm.cmd run typecheck`

Expected: cả `tsconfig.node.json` và `tsconfig.web.json` PASS.

- [ ] **Step 2: Chạy toàn bộ test**

Run: `npm.cmd test -- --run`

Expected: toàn bộ test PASS.

- [ ] **Step 3: Kiểm tra whitespace và diff**

Run: `git diff --check`

Expected: không có lỗi whitespace.

- [ ] **Step 4: Chạy ứng dụng để kiểm tra trực quan**

Run: `npm.cmd run dev`

Expected: hai hàng trong danh sách buổi thẳng các cột; popup LMS chuyển manual mode; preview chỉ đổi sang `Tên: nghỉ` sau kết quả LMS.
