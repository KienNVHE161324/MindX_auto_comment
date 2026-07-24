# Preserve LMS Comment Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi đè nhận xét học sinh bằng editor của mode Area hoặc Manual đang mở mà không thay đổi switch.

**Architecture:** Automation quan sát Quill trong popup trước. Nếu editor chưa hiển thị, automation click vùng nội dung một lần để mở editor thuộc mode hiện tại; không thao tác switch. Cả hai mode dùng chung luồng fill, Save và xác nhận editor đóng.

**Tech Stack:** TypeScript, Playwright, Vitest.

## Global Constraints

- Không click hoặc thay đổi switch Area/Manual.
- Area giữ Area; Manual giữ Manual.
- Nội dung mới thay toàn bộ nội dung cũ.
- Chỉ báo posted sau khi editor đóng hoặc quay về trạng thái hiển thị.

---

### Task 1: Giữ nguyên mode khi mở editor

**Files:**
- Modify: `src/main/automation/LmsAutomator.ts`
- Test: `src/main/automation/LmsAutomator.test.ts`

**Interfaces:**
- Produces: `getStudentCommentModeFromAriaLabel(label): 'area' | 'manual' | 'unknown'`
- Consumes: switch `aria-label`, Quill `.ql-editor[contenteditable="true"]`.

- [ ] **Step 1: Viết test đỏ**

```ts
expect(getStudentCommentModeFromAriaLabel(
  'Đang ở chế độ nhận xét theo các tiêu chí, click để chuyển sang nhận xét tự do',
)).toBe('area')
expect(getStudentCommentModeFromAriaLabel(
  'Đang ở chế độ nhận xét tự do, click để chuyển sang nhận xét theo các tiêu chí',
)).toBe('manual')
```

- [ ] **Step 2: Chạy test đỏ**

Run: `npm.cmd test -- src/main/automation/LmsAutomator.test.ts`

Expected: FAIL vì helper chưa tồn tại.

- [ ] **Step 3: Implement luồng giữ mode**

Không gọi `manualMode.click()`. Nếu editor đã visible thì fill ngay; nếu chưa visible thì click `table td p` rồi chờ editor. Lưu mode chỉ phục vụ log/debug, không thay đổi switch.

- [ ] **Step 4: Xác minh**

Run: `npm.cmd test -- src/main/automation/LmsAutomator.test.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd test -- --run`

Expected: toàn bộ lệnh PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/main/automation/LmsAutomator.ts src/main/automation/LmsAutomator.test.ts
git commit -m "fix: preserve LMS student comment mode"
```

### Task 2: Chờ Quill và xác nhận Save bằng GraphQL

**Files:**
- Modify: `src/main/automation/LmsAutomator.ts`
- Test: `src/main/automation/LmsAutomator.test.ts`

**Interfaces:**
- Produces: `isUpdateSlotCommentRequest(url, postData): boolean`
- Produces: `isUpdateSlotCommentResponse(status, body): boolean`

- [ ] **Step 1: Viết test đỏ cho request/response**

```ts
expect(isUpdateSlotCommentRequest(
  'https://lms-api.mindx.edu.vn/',
  JSON.stringify({ operationName: 'UpdateSlotComment' }),
)).toBe(true)
expect(isUpdateSlotCommentResponse(200, {
  data: { classes: { updateSlotComment: { id: 'class-1' } } },
})).toBe(true)
expect(isUpdateSlotCommentResponse(200, {
  errors: [{ message: 'Save failed' }],
})).toBe(false)
```

- [ ] **Step 2: Chạy test đỏ**

Run: `npm.cmd test -- src/main/automation/LmsAutomator.test.ts`

Expected: FAIL vì hai helper chưa tồn tại.

- [ ] **Step 3: Implement chờ editor và GraphQL**

Chờ editor visible tối đa 1500ms trước khi click vùng nội dung. Trước `save.click()`, tạo `page.waitForResponse()` chỉ khớp POST tới `lms-api.mindx.edu.vn` có `operationName: UpdateSlotComment`. Sau click, parse JSON và chỉ xác nhận khi helper response trả `true`.

- [ ] **Step 4: Xác minh**

Run: `npm.cmd test -- src/main/automation/LmsAutomator.test.ts`

Run: `npm.cmd run typecheck`

Run: `npm.cmd test -- --run`

Expected: toàn bộ lệnh PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/main/automation/LmsAutomator.ts src/main/automation/LmsAutomator.test.ts docs/superpowers/plans/2026-07-23-preserve-lms-comment-mode.md
git commit -m "fix: confirm LMS comments through GraphQL"
```
