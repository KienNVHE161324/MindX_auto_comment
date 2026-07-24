# Hẹn giờ từng lớp và gửi bù khi mở app

## Mục tiêu

Mỗi lớp có giờ hẹn và hai công tắc LMS/Zalo ngay trên thẻ lớp. Scheduler chỉ xử lý lớp đang diễn ra, chọn buổi đã qua gần nhất theo `dateTime`, và cho người dùng xác nhận gửi bù nếu app không mở tại giờ hẹn.

## Dữ liệu

`SchoolClass.autoSend` lưu:

- `time`: giờ hẹn dạng `HH:mm`.
- `lmsEnabled`: bật tự động gửi LMS.
- `zaloEnabled`: bật tự động gửi Zalo.

Lớp chưa cấu hình mặc định tắt cả hai kênh. Dữ liệu cũ `{ enabled: true, time }` được hiểu là đã bật cả LMS và Zalo vì đó là hành vi cũ; `{ enabled: false }` được hiểu là tắt cả hai.

## Chọn lớp và buổi

1. Chỉ xét lớp có trạng thái `đang diễn ra` tại thời điểm chạy.
2. Trong mỗi lớp, chọn buổi có `dateTime < now` lớn nhất.
3. Không có buổi đã qua hoặc không có `SessionContent` cho buổi được chọn thì bỏ qua lớp.
4. “Gần nhất” luôn dựa trên thời gian, không dựa trên số thứ tự hoặc thứ tự mảng.

## Kênh gửi

- `lmsEnabled` và chưa có `postedToLms` thì gửi LMS.
- `zaloEnabled` và chưa có `zaloSentAt` thì gửi qua adapter Zalo hiện có.
- Hai kênh độc lập; kết quả một kênh không tự đánh dấu kênh còn lại.
- Giữ cơ chế chống trùng hiện tại bằng metadata `postedToLms` và `zaloSentAt`.
- Buổi đặc biệt đang bị chặn LMS tiếp tục tuân theo quy tắc hiện có.

## Chạy đúng giờ

Thời điểm đến hạn được tạo bằng ngày địa phương của buổi học được chọn cộng với `autoSend.time`. Scheduler kiểm tra định kỳ; khi `now` lớn hơn hoặc bằng thời điểm này, scheduler đọc lại nội dung mới nhất ngay trước side effect và chỉ thực hiện các kênh còn thiếu.

## Gửi bù khi mở app

Khi app khởi động:

1. Quét các lớp đang diễn ra đã quá giờ hẹn.
2. Chọn buổi đã qua gần nhất theo thời gian.
3. Chỉ đưa vào danh sách gửi bù khi buổi có nội dung và còn ít nhất một kênh đã bật nhưng chưa gửi.
4. Không tự gửi.
5. Hiển thị lớp, buổi và các kênh còn thiếu.
6. Chỉ chạy khi người dùng bấm `Gửi bù tất cả`; `Để sau` đóng thông báo.

Nút gửi bù bị khóa trong khi chạy. Kết quả hiển thị riêng từng lớp: thành công, bỏ qua vì thiếu nội dung, hoặc lỗi.

Danh sách gửi bù được chụp một lần khi app khởi động. Các mục trong danh sách này được giữ lại khỏi scheduler định kỳ trong toàn bộ phiên app hiện tại. Bấm `Để sau` chỉ đóng thông báo và hoãn các mục đó đến lần khởi động app kế tiếp; Phase 1 không thêm nút mở lại thông báo trong cùng phiên.

Các lớp chưa đến hạn tại thời điểm khởi động không nằm trong danh sách gửi bù và vẫn được scheduler xử lý bình thường khi đến giờ trong phiên hiện tại.

## UI cấu hình

Trên mỗi thẻ lớp hiển thị:

- giờ hẹn;
- công tắc `LMS`;
- công tắc `Zalo`.

Thay đổi được lưu ngay. Loại bỏ cấu hình auto-send khỏi màn sửa lớp để chỉ còn một nguồn chỉnh sửa.

## Kiểm thử

- Dữ liệu cũ được migrate/fallback mà không tự bật sai kênh.
- Chỉ lớp đang diễn ra được lên kế hoạch.
- Chọn đúng buổi có `dateTime` gần nhất nhưng nhỏ hơn `now`.
- Bỏ qua lớp không có nội dung.
- Hai công tắc LMS/Zalo hoạt động độc lập.
- Không gửi lại kênh đã có metadata thành công.
- Khi mở app muộn, phát hiện đúng danh sách gửi bù nhưng chưa side effect.
- `Gửi bù tất cả` chạy đúng danh sách; `Để sau` không gửi.
- Các mục gửi bù không bị scheduler định kỳ gửi ngầm trong cùng phiên.
- Lớp chưa đến hạn lúc mở app vẫn tự chạy khi đến giờ.
- Một lớp lỗi không chặn lớp khác.
- Scheduler và gửi bù không chạy chồng nhau.
- Typecheck, full test và production build đạt.
