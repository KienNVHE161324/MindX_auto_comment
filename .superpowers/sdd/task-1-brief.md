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

