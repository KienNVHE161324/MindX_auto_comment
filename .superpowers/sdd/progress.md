# Đồng bộ nội dung LMS — Progress Ledger

Plan: docs/superpowers/plans/2026-07-17-lms-content-sync.md
Base (branch state before Task 1): 2617f24

(Ledger milestone 1 cũ đã hoàn tất và merge trước đó — xem git log nếu cần tra lại.)

## Trạng thái đồng bộ nội dung LMS (7 task) — HOÀN TẤT

- [x] Task 1 — types & IPC (`lmsSyncAll`) — commit f79487e
- [x] Task 2 — `shared/classStatus.ts` — commit 9613d47
- [x] Task 3 — `shared/lmsSync.ts` (computeContentTargets/matchStudentByName/mergeContentResult) — commit 2c03f68
- [x] Task 4 — `LmsAutomator.syncAll` + helper đọc tab Nhận xét — commit ef64074
- [x] Task 5 — nối dây IPC (handlers/index/preload) — commit 48d7afc
- [x] Task 6 — `ClassesPage` gộp đồng bộ + tóm tắt — commit 059e4f1
- [x] Task 7 — `SessionComposer` loại HS nghỉ — commit e08ad4f

Toàn bộ suite: 111 tests xanh; `npm run typecheck` sạch.

Ghi chú lệch so với plan: fixture test trong `ClassesPage.test.tsx` (Task 6) dùng lớp chỉ có 1 buổi 2020 sẽ bị `getClassStatus` xếp "đã kết thúc" → không sinh contentTarget (đúng logic Task 3). Đã thêm buổi tương lai vào fixture để lớp ở trạng thái "đang diễn ra" cho khớp kỳ vọng.

### Còn lại (thủ công, không có test tự động)
- Task 4 / Step 6: chạy `npm run dev`, bấm "Đồng bộ từ LMS" với lớp thật đã điền nội dung buổi gần nhất trên LMS, xác nhận selector (`selectCommentSession`/`readExpandableSection`/`readStudentComments`) đọc đúng. Nếu sai, cần HTML/console log thật để chỉnh — không tự đoán selector.
