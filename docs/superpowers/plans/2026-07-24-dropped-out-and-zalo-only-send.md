# Nghỉ dài hạn, đồng bộ điểm danh, tách gửi Zalo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm trạng thái "nghỉ dài hạn", đồng bộ điểm danh từ LMS cho mọi lớp, và tách nút gửi Zalo khỏi việc post lại nhận xét lên LMS.

**Architecture:** Trạng thái điểm danh (`attendedStudentIds`) và nghỉ dài hạn (`Student.droppedOut`) là dữ liệu thuần, thu từ LMS qua "Gửi lên LMS" hoặc "Đồng bộ". Helper thuần `assessZaloReadiness` quyết định có đủ điều kiện gửi Zalo. Nút "Gửi Zalo" chỉ đọc dữ liệu điểm danh đã lưu, không post LMS.

**Tech Stack:** TypeScript, React 18, Playwright, Vitest, Testing Library.

## Global Constraints

- Không ghi đè mất nội dung bài học / nhận xét người dùng đã soạn khi đồng bộ.
- Không ghi đè mất `absentStudentIds` đã lưu.
- HS `droppedOut` bị loại khỏi cả Zalo lẫn LMS ở mọi buổi.
- HS `droppedOut` được gỡ cờ nếu xuất hiện lại trên LMS.
- Lỗi kỹ thuật khi post nhận xét từng HS không chặn gửi Zalo.
- Popup/trình duyệt LMS đóng an toàn trong `finally`.

---

### Task 1: Type mới

**Files:**
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: `Student.droppedOut?: boolean`, `SessionContent.attendedStudentIds?: string[]`, `LmsPostResult.attendedStudentNames: string[]`

- [ ] Thêm `droppedOut?: boolean` vào `Student`.
- [ ] Thêm `attendedStudentIds?: string[]` vào `SessionContent`.
- [ ] Thêm `attendedStudentNames: string[]` vào `LmsPostResult`.
- [ ] `npm.cmd run typecheck` — sẽ đỏ ở nơi tạo `LmsPostResult` (bắt buộc field mới); sửa các literal `{ posted, skipped, absentStudentNames }` thành có `attendedStudentNames` (khởi tạo `[]` nơi chưa có). Commit.

### Task 2: `assessZaloReadiness` (helper thuần)

**Files:**
- Modify: `src/shared/lmsDelivery.ts`
- Test: `src/shared/lmsDelivery.test.ts`

**Interfaces:**
- Produces: `assessZaloReadiness(students: Student[], content: { absentStudentIds?: string[]; attendedStudentIds?: string[] }): { ready: boolean; unknownStudentNames: string[] }`

- [ ] Test đỏ: mọi HS đã đi học/nghỉ → `ready:true`; thiếu 1 HS → `ready:false, unknownStudentNames:['Tên']`; HS `droppedOut` bị bỏ qua (không tính).
- [ ] Impl: `handled = attended ∪ absent`; xét `students.filter(s => !s.droppedOut)`; `unknownStudentNames` = tên các HS không thuộc handled; `ready = unknownStudentNames.length===0`.
- [ ] Test xanh. Commit.

### Task 3: `buildZaloMessage` loại `droppedOut`

**Files:**
- Modify: `src/shared/autoSend.ts`
- Test: `src/shared/autoSend.test.ts`

- [ ] Test đỏ: lớp có 1 HS `droppedOut` → tên đó KHÔNG xuất hiện trong `danh_sach_nhan_xet`.
- [ ] Impl: `cls.students.filter(s => !s.droppedOut)` trước khi map.
- [ ] Test xanh. Commit.

### Task 4: Đồng bộ — target rộng + gộp bảo toàn + phát hiện nghỉ dài hạn

**Files:**
- Modify: `src/shared/lmsSync.ts`
- Test: `src/shared/lmsSync.test.ts`

**Interfaces:**
- Produces:
  - `computeContentTargets` không còn bỏ buổi đã có content (chỉ bỏ lớp `đã kết thúc`).
  - `mergeContentResult(cls, session, result, existing?: SessionContent): SessionContent` — khi `existing` có nội dung, giữ `lessonContent/homework/comments` cũ, chỉ cập nhật `absentStudentIds` + `attendedStudentIds`.
  - `detectDroppedOut(students: Student[], lmsNames: string[]): { id: string; droppedOut: boolean }[]` — map roster → cờ droppedOut theo việc có khớp tên LMS hay không.

- [ ] Test đỏ `computeContentTargets`: buổi gần nhất đã có content vẫn được trả về.
- [ ] Impl: bỏ nhánh `if (hasContent(latest.id)) continue`.
- [ ] Test đỏ `mergeContentResult` với `existing`: giữ nội dung cũ, cập nhật `attendedStudentIds`/`absentStudentIds`; không `existing` → lấy từ LMS như cũ (giữ hành vi hiện tại + thêm `attendedStudentIds`).
- [ ] Impl: thêm param `existing?`; build `attendedStudentIds` từ `result.students` có `attended`; nếu `existing` có `comments.length>0` hoặc `lessonContent` → giữ các trường nội dung của `existing`.
- [ ] Test đỏ `detectDroppedOut`: HS không có trong `lmsNames` → `droppedOut:true`; có → `false`.
- [ ] Impl `detectDroppedOut` dùng `matchStudentByName` ngược (so tên chuẩn hoá).
- [ ] Test xanh. Commit.

### Task 5: `LmsAutomator` ghi điểm danh mọi dòng

**Files:**
- Modify: `src/main/automation/LmsAutomator.ts`
- Test: `src/main/automation/LmsAutomator.test.ts`

**Interfaces:**
- Consumes: `LmsPostResult.attendedStudentNames`
- Produces: `makeLmsPostResult(posted, absentStudentNames, skipped, attendedStudentNames)`

- [ ] Test đỏ: `makeLmsPostResult([], [], [], ['A'])` → `.attendedStudentNames` = `['A']`.
- [ ] Impl: thêm tham số `attendedStudentNames` vào `makeLmsPostResult`.
- [ ] `processComments`: với mỗi dòng KHÔNG nghỉ, push `studentName` vào mảng `attendedStudentNames` NGAY sau khi xác định không nghỉ (trước try post) — nên lỗi post vẫn giữ điểm danh. Trả qua `makeLmsPostResult`.
- [ ] Test xanh (suite LmsAutomator). Commit.

### Task 6: `lmsPostSessionAndSave` lưu `attendedStudentIds`

**Files:**
- Modify: `src/main/ipcHandlers.ts`
- Test: `src/main/ipcHandlers.test.ts`

- [ ] Test đỏ: sau `lmsPostSessionAndSave` với postResult có `attendedStudentNames:['A']` → content lưu có `attendedStudentIds` chứa id của A.
- [ ] Impl: map `postResult.attendedStudentNames` → ids qua `matchStudentByName`; gộp với `current.attendedStudentIds`; đưa vào `updated`/`repository.save`. Loại HS `droppedOut` khỏi mảng `comments` gửi LMS.
- [ ] Test xanh. Commit.

### Task 7: `zaloSendSession` không post LMS + gate

**Files:**
- Modify: `src/main/ipcHandlers.ts`
- Test: `src/main/ipcHandlers.test.ts`

- [ ] Test đỏ: `zaloSendSession` KHÔNG gọi `runLmsPostExclusive`; khi thiếu điểm danh → `status:'blocked'`, message chứa "Chưa đủ thông tin điểm danh"; khi đủ → gọi `sendZaloMessage` và lưu `zaloSentAt`.
- [ ] Impl: bỏ khối `runLmsPostExclusive`; dùng `assessZaloReadiness(cls.students, content)`; nếu `!ready` → blocked; nếu ready → `buildZaloMessage` (đã loại droppedOut) → `sendZaloMessage`.
- [ ] Test xanh. Commit.

### Task 8: AutoSendScheduler dùng attended + droppedOut

**Files:**
- Modify: `src/main/automation/AutoSendScheduler.ts`
- Test: `src/main/automation/AutoSendScheduler.test.ts`

- [ ] Test đỏ: Zalo tự động gửi được khi HS chỉ có `attendedStudentIds` (chưa post comment); HS `droppedOut` không chặn.
- [ ] Impl: `hasCompleteLmsEvidence` tính `handled = attended ∪ absent`, xét `students.filter(s=>!s.droppedOut)`. Message blocker tương ứng.
- [ ] Test xanh. Commit.

### Task 9: UI — đồng bộ áp droppedOut, đổi nút, ẩn HS nghỉ dài hạn

**Files:**
- Modify: `src/renderer/src/pages/ClassesPage.tsx`
- Modify: `src/renderer/src/pages/SessionComposer.tsx`
- Modify: `src/renderer/src/pages/ClassEditor.tsx`
- Test: `src/renderer/src/pages/ClassesPage.test.tsx`, `src/renderer/src/pages/SessionComposer.test.tsx`

- [ ] `ClassesPage.syncFromLms`: khi gộp mỗi `contentResult`, truyền `existing` vào `mergeContentResult`; tính `detectDroppedOut` từ tên LMS (`result.students.map(s=>s.name)`) và `saveClass` nếu cờ đổi.
- [ ] `SessionComposer`: đổi nhãn nút "Gửi LMS & Zalo" → "Gửi Zalo" (+ loading "Đang gửi Zalo..."); ẩn ô nhận xét HS `droppedOut` (hoặc render mờ + nhãn "đã nghỉ học"); loại khỏi `aiRewriteAll`.
- [ ] `ClassEditor`: thêm toggle "Đã nghỉ học" cho từng HS (bật/tắt `droppedOut`).
- [ ] Cập nhật test tương ứng (nhãn nút, HS droppedOut không hiện ô). Test xanh. Commit.

### Task 10: Kiểm tra tích hợp

**Files:** toàn repo.

- [ ] `npm.cmd run typecheck` sạch.
- [ ] `npm.cmd test -- --run` toàn bộ xanh.
- [ ] `git diff --check` không lỗi whitespace.
