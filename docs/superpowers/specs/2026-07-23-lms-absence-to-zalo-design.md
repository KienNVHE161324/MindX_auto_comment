# Đồng bộ học sinh nghỉ từ LMS sang nội dung Zalo

## Mục tiêu

Sau khi LMS xác định một học sinh nghỉ, app phải lưu trạng thái nghỉ của học sinh trong buổi đó và loại học sinh khỏi nội dung xem trước/copy/gửi Zalo.

## Luồng dữ liệu

1. `LmsAutomator.processComments()` phân biệt ba nhóm:
   - `posted`: đã ghi nhận xét thành công.
   - `absentStudentNames`: LMS xác nhận nghỉ.
   - `skipped`: thiếu nội dung hoặc lỗi kỹ thuật.
2. `LmsPostResult` truyền cả ba nhóm qua IPC.
3. `SessionComposer` khớp `absentStudentNames` với `SchoolClass.students` theo tên không phân biệt hoa thường và cho phép tên LMS/local chứa nhau.
4. ID khớp được hợp nhất vào `SessionContent.absentStudentIds` và lưu ngay.
5. Mọi luồng dựng tin Zalo tiếp tục lọc theo `absentStudentIds`, nên học sinh nghỉ biến mất khỏi xem trước, copy và gửi tự động.

## Quy tắc

- Chỉ học sinh được LMS xác nhận nghỉ mới vào `absentStudentNames`.
- Lỗi kỹ thuật hoặc thiếu nội dung không được coi là nghỉ.
- Không xóa các `absentStudentIds` đã lưu trước đó; kết quả mới được hợp nhất, không ghi đè mất dữ liệu.
- So khớp tên phải trim, lowercase và chấp nhận một tên là chuỗi con của tên còn lại.
- Sau khi gửi LMS, state React và file nội dung cục bộ phải được cập nhật cùng một giá trị.
- `postedToLms` chỉ được đặt khi kết quả không có lỗi và có ít nhất một học sinh được đăng, giữ nguyên quy tắc hiện tại.

## Hiển thị

- Báo cáo LMS vẫn hiển thị `skipped` như hiện tại.
- Học sinh nghỉ có thể tiếp tục xuất hiện trong dòng “Bỏ qua”, nhưng nguồn dữ liệu chính xác để lọc Zalo là `absentStudentNames`.
- Nếu bản xem trước Zalo đang mở, người dùng bấm “Xem trước Zalo” lại để dựng nội dung từ state mới.

## Kiểm thử

- LMS result trả riêng tên học sinh nghỉ.
- Lỗi kỹ thuật trong `skipped` không tạo absent ID.
- Tên LMS/local khớp không phân biệt hoa thường và theo quan hệ chuỗi con.
- ID nghỉ mới được hợp nhất với ID nghỉ cũ.
- Sau khi post LMS, `saveContent` nhận `absentStudentIds` đã cập nhật.
- Preview Zalo loại học sinh nghỉ.
- Typecheck và toàn bộ test dự án đạt.
