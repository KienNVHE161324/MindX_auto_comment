# Ghi đè nội dung khi gửi lên LMS

## Mục tiêu

Khi giáo viên bấm “Gửi lên LMS”, dữ liệu mới nhất trong app phải thay thế nội dung cũ trên LMS thay vì bỏ qua các ô đã có dữ liệu.

## Phạm vi

Áp dụng cho ba loại nội dung trong tab Comments:

- Summary (Tổng kết/Tổng két).
- Homework (Bài về nhà).
- Nhận xét của từng học sinh.

Không thay đổi quy tắc chọn lớp, chọn buổi hoặc lọc học sinh nghỉ.

## Quy tắc hành vi

1. Summary có nội dung mới: click vùng chỉnh sửa, chọn toàn bộ nội dung cũ, xóa và nhập nội dung mới.
2. Homework có nội dung mới: xử lý tương tự Summary.
3. Homework mới trống: không chỉnh sửa Homework trên LMS và không chặn quá trình gửi.
4. Học sinh có mặt và có nhận xét mới: mở popup, click vùng comment, chọn toàn bộ, xóa và nhập nhận xét mới.
5. Học sinh nghỉ: bỏ qua, không mở popup.
6. Không còn quy tắc “đã có nhận xét thì không ghi đè”.
7. Một học sinh chỉ được xử lý một lần dù bảng LMS render hàng trùng.

## Lưu và xác minh

- Editor inline được blur để kích hoạt autosave.
- Editor trong dialog dùng nút Save/Update nếu có; popup nhận xét học sinh được đóng sau khi nhập theo cơ chế autosave của LMS.
- Sau khi nhập, DOM phải chứa nội dung mới trước khi tác vụ được tính là thành công.
- Nếu xác minh thất bại, tác vụ ghi nhận học sinh là lỗi, lưu HTML debug và đóng popup trước khi chuyển sang học sinh tiếp theo.

## Xử lý lỗi

- Lỗi Summary là lỗi cấp buổi và dừng gửi để tránh chỉ cập nhật một phần.
- Homework trống không phải lỗi.
- Lỗi của một học sinh không chặn học sinh tiếp theo.
- Popup phải được đóng trong `finally` để không che giao diện và gây timeout dây chuyền.

## Kiểm thử

- Test quy tắc ghi đè khi nội dung cũ tồn tại.
- Test Homework trống được bỏ qua.
- Test học sinh nghỉ bằng nhãn tiếng Việt và tiếng Anh.
- Test chống xử lý trùng học sinh.
- Chạy typecheck và toàn bộ test hiện có.
- Kiểm thử thật trên LMS với một buổi đã có Summary, Homework và nhận xét cũ.
