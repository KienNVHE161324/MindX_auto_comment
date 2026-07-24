# LMS Content Overwrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Luôn thay nội dung cũ trên LMS bằng dữ liệu mới trong app cho Summary, Homework và nhận xét học sinh.

**Architecture:** Tập trung quyết định ghi đè vào helper thuần `getLmsOverwriteAction()`. Các editor tiếp tục dùng luồng click, chọn toàn bộ, xóa, nhập mới và xác minh DOM; nhánh bỏ qua nhận xét đã tồn tại bị loại bỏ.

**Tech Stack:** TypeScript, Playwright, Vitest.

## Global Constraints

- Homework mới trống không chỉnh sửa Homework trên LMS.
- Học sinh nghỉ vẫn bị bỏ qua.
- Popup học sinh luôn được đóng trong `finally`.
- Không thay đổi luồng chọn lớp, tab hoặc buổi học.

---

### Task 1: Quy tắc ghi đè thống nhất

**Files:**
- Modify: `src/main/automation/LmsAutomator.ts`
- Test: `src/main/automation/LmsAutomator.test.ts`

**Interfaces:**
- Produces: `getLmsOverwriteAction(existing: string, incoming: string): 'replace' | 'skip'`
- Consumes: nội dung hiện tại và nội dung mới của Summary, Homework hoặc nhận xét học sinh.

- [ ] **Step 1: Viết test thất bại cho nội dung cũ đã tồn tại**

```ts
describe('getLmsOverwriteAction', () => {
  it('luôn thay nội dung cũ khi có nội dung mới', () => {
    expect(getLmsOverwriteAction('Nội dung cũ', 'Nội dung mới')).toBe('replace')
    expect(getLmsOverwriteAction('', 'Nội dung mới')).toBe('replace')
  })

  it('bỏ qua khi nội dung mới trống', () => {
    expect(getLmsOverwriteAction('Nội dung cũ', '   ')).toBe('skip')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận đỏ**

Run: `npm.cmd test -- src/main/automation/LmsAutomator.test.ts`

Expected: FAIL vì `getLmsOverwriteAction` chưa tồn tại.

- [ ] **Step 3: Thêm implementation tối thiểu**

```ts
export function getLmsOverwriteAction(
  _existing: string,
  incoming: string,
): 'replace' | 'skip' {
  return incoming.trim() ? 'replace' : 'skip'
}
```

`shouldWriteLmsSection()` gọi helper này để giữ quy tắc Homework trống.

- [ ] **Step 4: Bỏ nhánh không ghi đè nhận xét cũ**

Trong `processComments()`, vẫn có thể đọc text hiện tại để phục vụ xác minh nhưng không được `continue` khi text khác rỗng. Luồng luôn click `table td p`, nhấn `Control+A`, `Delete`, nhập text mới, xác minh DOM, rồi thoát popup.

- [ ] **Step 5: Chạy test mục tiêu**

Run: `npm.cmd test -- src/main/automation/LmsAutomator.test.ts`

Expected: toàn bộ test file PASS.

- [ ] **Step 6: Xác minh toàn dự án**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd test -- --run`

Expected: toàn bộ test PASS.

- [ ] **Step 7: Kiểm tra diff**

Run: `git diff --check`

Expected: không có lỗi whitespace.
