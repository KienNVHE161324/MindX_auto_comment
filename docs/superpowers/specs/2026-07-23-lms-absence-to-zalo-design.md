# Đồng bộ học sinh nghỉ từ LMS sang nội dung Zalo

## Mục tiêu

Sau khi LMS xác định một học sinh nghỉ, app phải lưu trạng thái nghỉ của học sinh trong buổi đó và hiển thị học sinh dưới dạng `Tên: nghỉ` trong nội dung xem trước/copy/gửi Zalo.

## Luồng dữ liệu

1. `LmsAutomator.processComments()` phân biệt ba nhóm:
   - `posted`: đã ghi nhận xét thành công.
   - `absentStudentNames`: LMS xác nhận nghỉ.
   - `skipped`: thiếu nội dung hoặc lỗi kỹ thuật.
2. `LmsPostResult` truyền cả ba nhóm qua IPC.
3. `SessionComposer` khớp `absentStudentNames` với `SchoolClass.students` theo tên không phân biệt hoa thường và cho phép tên LMS/local chứa nhau.
4. ID khớp được hợp nhất vào `SessionContent.absentStudentIds` và lưu ngay.
5. Mọi luồng dựng tin Zalo dùng `absentStudentIds`: học sinh có mặt hiện nhận xét, học sinh nghỉ hiện `Tên: nghỉ`.

## Quy tắc

- Chỉ học sinh được LMS xác nhận nghỉ mới vào `absentStudentNames`.
- Lỗi kỹ thuật hoặc thiếu nội dung không được coi là nghỉ.
- Không xóa các `absentStudentIds` đã lưu trước đó; kết quả mới được hợp nhất, không ghi đè mất dữ liệu.
- So khớp tên phải trim, lowercase và chấp nhận một tên là chuỗi con của tên còn lại.
- Trước khi LMS trả kết quả, preview giữ nguyên nội dung giáo viên đã soạn và không tự suy đoán học sinh nghỉ.
- Sau khi LMS trả kết quả, state React và file nội dung cục bộ phải được cập nhật cùng một giá trị.
- Nếu preview đang mở, preview được dựng lại ngay sau khi lưu kết quả LMS.
- `postedToLms` chỉ được đặt khi kết quả không có lỗi và có ít nhất một học sinh được đăng, giữ nguyên quy tắc hiện tại.

## Hiển thị

- Báo cáo LMS tách ba dòng: đã nhận xét, học sinh nghỉ, và bỏ qua do lỗi/thiếu nội dung.
- Tên trong `absentStudentNames` không được lặp lại trong dòng lỗi/thiếu nội dung.
- Preview, Copy và tự động gửi Zalo dùng cùng quy tắc: học sinh nghỉ hiện `Tên: nghỉ`.

## Căn chỉnh danh sách buổi học

- Mọi hàng buổi học dùng chung một grid gồm năm cột: số thứ tự, ngày giờ, trạng thái, nút chính và nút phụ.
- Chiều rộng mỗi cột phải ổn định giữa các hàng để trạng thái và các nút không bị lệch theo độ dài nội dung.
- Hàng không có nút phụ vẫn giữ cột trống, không kéo các cột trước hoặc sau sang vị trí khác.
- Trên màn hình hẹp, grid được phép xuống dòng để không làm tràn khung.

## Ghi nhận xét LMS theo mode hiện tại

- Sau khi mở popup, nhận biết mode hiện tại từ `aria-label` của switch nhưng không thay đổi switch.
- Nếu Quill `.ql-editor[contenteditable="true"]` đã hiển thị thì ghi đè trực tiếp trong mode hiện tại.
- Nếu popup mới ở trạng thái hiển thị, click vùng nhận xét để mở editor thuộc chính mode hiện tại, rồi chờ Quill sẵn sàng.
- Mode Area tiếp tục lưu bằng editor Area; mode Manual tiếp tục lưu bằng editor Manual.
- Thay toàn bộ nội dung, bấm `Lưu`/`Save`, và xác nhận thành công khi editor đóng hoặc quay về trạng thái hiển thị.

## Kiểm thử

- LMS result trả riêng tên học sinh nghỉ.
- Lỗi kỹ thuật trong `skipped` không tạo absent ID.
- Tên LMS/local khớp không phân biệt hoa thường và theo quan hệ chuỗi con.
- ID nghỉ mới được hợp nhất với ID nghỉ cũ.
- Sau khi post LMS, `saveContent` nhận `absentStudentIds` đã cập nhật.
- Preview trước post LMS chưa tự thay nội dung.
- Preview đang mở được cập nhật sau post LMS và hiển thị `Tên: nghỉ`.
- Auto-send Zalo cũng hiển thị `Tên: nghỉ`.
- Báo cáo LMS tách riêng nghỉ và lỗi/thiếu nội dung.
- Popup giữ nguyên mode Area/Manual và ghi đúng editor của mode đang dùng.
- Các hàng buổi học thẳng cột khi có hoặc không có nút phụ.
- Layout buổi học không tràn khung trên màn hình hẹp.
- Typecheck và toàn bộ test dự án đạt.
