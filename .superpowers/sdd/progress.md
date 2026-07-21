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

---

## Milestone 5 — Lưu/xem nội dung + trạng thái + gửi tự động (đã làm)

- [x] `SessionContent.postedToLms` + trạng thái 3 mức (chưa có / đã soạn / đã nhận xét) — SessionComposer đánh dấu khi gửi LMS thành công. Commit 284f3a9.
- [x] Nút "Sao chép buổi trước" (`shared/sessionContent.ts`: copySessionContent/findPreviousSession/getSessionContentStatus). Commit 284f3a9.
- [x] Gửi tự động theo giờ hẹn mỗi lớp:
  - `shared/autoSend.ts` (planAutoSend/isAutoSendDue/nearestPastSession/buildZaloMessage). Commit 777b675.
  - `main/automation/AutoSendScheduler.ts` — gửi LMS tự động + **ghi tin Zalo ra file .txt trong Documents/'MindX Auto Comment - Zalo tu dong'** (chưa tự động điều khiển Zalo Desktop thật — cần khảo sát UI Zalo). Idempotent qua cờ `postedToLms`/`zaloSentAt` → có cơ chế gửi bù khi mở app trễ. Commit 0bc96ae.
  - Khởi động scheduler khi app ready, tick mỗi 60s + tick ngay lúc mở. Commit 19efe42.
  - UI bật/tắt + giờ hẹn trong ClassEditor. Commit 4ca0c12.

## Milestone 6 — Thiết kế lại UI (đã làm)

- [x] `styles.css` design system (tokens + .btn/.card/.section/.badge/.input/.modal...) + import ở main.tsx. Commit 2186ca1.
- [x] Nav có brand + tab active; các trang chuyển sang section/card/input nhất quán. Commit 2186ca1.
- [x] `ConfirmDialog` — hộp xác nhận khi xóa lớp. Commit 2186ca1.
- [x] Icon Sửa/Xóa đổi sang SVG đơn sắc (`components/Icons.tsx`), đóng khung; nút Soạn/Xem-Sửa cùng bề rộng; mark màu buổi đã qua; tiến độ = "đã qua X/Y buổi" (nhỏ, trên dòng meta). Commit 27e5d4f, 2e5c2cd.

## Milestone 7 — Lấy giờ buổi học thật từ LMS (một phần)

- [x] `scrapeSessions` đọc thêm giờ bắt đầu (`hh:mm`) từ DOM; `importScraped` dùng giờ thật, fallback 14:00. Commit 5fc9a31.

Tổng: **146 tests xanh**, `npm run typecheck` sạch, `npm run build` OK.

### ⚠️ TỒN ĐỌNG — giờ buổi học vẫn ra 14:00 (chưa xử lý xong)
Người dùng báo: đồng bộ về vẫn 14:00 dù buổi thật là 08:00. Hai nghi vấn (chưa xác nhận được):
1. **Dữ liệu cũ**: `scrapeAllClasses` bỏ qua các lớp đã có trong app → lịch không đọc lại; giờ 14:00 lưu từ trước vẫn còn. Muốn refresh phải xóa lớp rồi thêm lại, HOẶC bổ sung tính năng cập-nhật-lịch cho lớp đã có.
2. **Sai DOM**: `scrapeSessions` chạy trong tab "Schedule" của **drawer**; DOM người dùng gửi (có ô `hh:mm`) là trang **"Cài đặt lịch"** đầy đủ. Nếu tab Schedule trong drawer KHÔNG có ô `hh:mm`, code lấy không ra giờ → fallback 14:00.

**Cần để xử lý dứt điểm:** HTML/console-log thật của tab "Schedule" trong drawer chi tiết lớp (không phải trang Cài đặt lịch), hoặc quyết định đổi luồng scrape sang trang "Cài đặt lịch". Không tự đoán selector.

**CẬP NHẬT (2026-07-21):** Đã kiểm chứng bằng file `lms-detail-debug.html` thật (userData/lms-browser) — DOM drawer Schedule CÓ ô `hh:mm` với giá trị đúng (08:00/10:00). Chạy logic climb bằng jsdom trả về đúng 08:00 cho cả 14 buổi → **code đúng**. Nguyên nhân người dùng vẫn thấy 14:00: **main-process không hot-reload** khi `npm run dev` đang chạy → cần tắt hẳn app và chạy lại. (Chưa xác nhận người dùng đã restart chưa.)

## Milestone 8 — Đánh số buổi + chặn buổi đặc biệt + tối ưu Gemini + đổi model (2026-07-21)

- [x] Đánh số buổi #1..#N theo thứ tự thời gian trong danh sách buổi (ClassesPage). Commit 9052b9c.
- [x] Chặn gửi LMS buổi #4/#9 (cơ chế đặc biệt, làm phase sau): `shared/sessionContent` thêm `getSessionNumber`/`isLmsBlockedSession`; SessionComposer khóa nút + báo; autoSend không tự gửi LMS 2 buổi này (vẫn gửi Zalo). Commit 430c033.
- [x] Gộp "Sửa bằng AI" thành 1 nút cho cả lớp (bỏ nút từng HS). Commit 430c033.
- [x] Giữ tài khoản LMS: tự lưu email/mật khẩu khi rời ô (onBlur) + nút Hiện/Ẩn mật khẩu. Commit 430c033. (Đã phát hiện config cũ `lmsEmail=null` do trước đây chỉ lưu khi bấm "Lưu".)
- [x] Gemini retry khi model quá tải (429/500/502/503/504, backoff). Commit 37aac14.
- [x] LMS `processComments`: nếu HS đã có nhận xét trên LMS → bỏ qua, không ghi đè (`readPopupExistingComment`). Commit 37aac14. **Chưa verify DOM popup thật.**
- [x] Làm đẹp màn Soạn nội dung: card từng HS, tag "AI đã sửa", action bar, header có icon Quay lại + chip mã lớp + số buổi. Commit 37aac14, 18bddbd.
- [x] **Tối ưu token**: `rewriteCommentsBatch` — gộp cả lớp vào 1 request Gemini (chỉ dẫn gửi 1 lần), trả JSON theo index; HS bỏ sót giữ raw. IPC `gemini:rewriteBatch` xuyên main/preload. Commit 18bddbd.
- [x] **Đổi model Gemini** trong Cấu hình (`AppConfig.geminiModel`, `setGeminiModel`) — để đổi khi 1 model hết quota miễn phí. Commit (session này).

Tổng: **162 tests xanh**, `npm run typecheck` sạch, `npm run build` OK.

### ⚠️ Đang gặp: quota Gemini free-tier
`gemini:rewriteBatch` báo **429 — Quota exceeded (free_tier, limit 20/ngày, model gemini-3.5-flash)**. Batch đã giảm số request (1 thay vì N/lớp) nhưng vẫn đụng hạn mức ngày. Giải pháp cho người dùng:
1. Dán **API key khác** (Google account khác) — quota theo key.
2. **Đổi model** trong Cấu hình (mỗi model có quota riêng): gemini-2.5-flash / gemini-2.0-flash / gemini-flash-lite-latest.
Cần restart app (main-process) sau khi đổi.

### Việc còn treo cho session sau
- Verify thủ công (cần restart app): giờ buổi lấy đúng từ LMS; LMS skip-nếu-đã-có-comment (cần HTML popup thật nếu sai); luồng gửi Zalo tự động thật (hiện ghi file Documents).
- Cơ chế đặc biệt buổi #4/#9 (spec chưa có) — hiện mới chỉ CHẶN gửi LMS.
- Automation Zalo Desktop thật (hiện là file .txt thay thế).
