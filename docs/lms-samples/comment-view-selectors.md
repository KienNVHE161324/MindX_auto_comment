# LMS "Nhận xét" — selector thật (xác nhận từ HTML 2026-07-21)

Nguồn: HTML trang `https://lms.mindx.edu.vn/admin/classes?tab=10` (lớp BN-JSB15), người dùng
gửi trực tiếp. UI hiện **tiếng Việt** (trước đây một số mẫu là tiếng Anh → selector cần khớp cả 2).

## Điều hướng vào màn nhận xét
- Danh sách lớp: hàng `tr[class*="MuiTableRow-hover"]`, **không có `<a>`**. Mã lớp nằm trong `<pre>`.
- Vào lớp: nút ẩn `span[aria-label="Xem chi tiết"] button` (EN: `"View detail"`), `display:none`
  tới khi hover → **JS click** (`page.evaluate`). Mở **drawer** bên phải.
- Drawer: `[aria-labelledby="class-detail"]`, header `h6` = mã lớp. Nội dung trong `#detail-content`.
- Tab "Nhận xét" = `#detail-content [role="tab"]` chứa `Nhận xét` (là `#tab-10`).
  Tab khác: "Lịch học" (Schedule), "Học viên" (Students), "Điểm danh".

## Carousel buổi học
- Slot: `div[id^="class-comments-slot-carousel-N"]`. Đang chọn: class `active`; khoá: class `disabled`.
- Ngày: slot active hiện đầy đủ `08:00&nbsp;28/06/2026`; slot thường chỉ `dd/mm` (vd `12/07`).
- Click vào `.info-container` để chọn buổi.

## Khối Tổng kết / Bài về nhà  (jss ĐỔI SỐ giữa build → match theo TEXT + cấu trúc)
- Cấu trúc: `section > [header row] > [content wrapper]`.
- **Header row** = div sâu nhất chứa CẢ text label (`<span>Tổng két</span>` — site viết sai chính tả;
  hoặc `Bài về nhà`) LẪN icon Expand (`svg[data-testid=ExpandLessIcon]` = đang mở /
  `ExpandMoreIcon` = đang thu gọn). → `findSectionHeader()` lọc `hasText` + `has(expand icon)` + `.last()`.
- **Nội dung** = `header` → `following-sibling::div[1]`. Trống khi có phần tử con class `place-holder`
  (hoặc innerText rỗng). Bài về nhà mặc định thu gọn → phải click header để mở trước khi đọc/ghi.

## Bảng học sinh
- Rows: `div.comment-list-table table tbody tr`.
- Tên: `.name-display`. Trạng thái điểm danh ở ô tên: `Có mặt` / `Nghỉ có phép` / `Đi muộn`.
- HS nghỉ: ô Comment (`td` thứ 2) chứa `Không thể viết nhận xét cho học viên vắng mặt` (`div.jss3565`).
- Mở nhận xét: nút `button` chứa text `Nhận xét học sinh` trong hàng đó.

## ⚠️ CHƯA xác nhận (cần chụp HTML khi mở popup)
- **Popup "Nhận xét học sinh"** (khi click nút): cấu trúc `[role="dialog"]`, ô nhập nội dung,
  nút Lưu, và cách đọc nhận xét đã có. Code hiện dùng `div.jss2722` + `textarea/[contenteditable]`
  — là GIẢ ĐỊNH, cần HTML popup thật để chốt.
- **Editor Tổng kết/Bài về nhà khi GHI**: `writeExpandableSection` click content div rồi gõ phím —
  chưa chắc `jss3533` là contenteditable/Quill; cần thử thực tế.
