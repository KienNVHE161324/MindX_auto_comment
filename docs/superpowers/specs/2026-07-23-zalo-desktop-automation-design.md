# Thiết kế tự động gửi bằng Zalo PC

## Mục tiêu

Thay hoàn toàn luồng Zalo Web bằng tự động hóa ứng dụng Zalo PC đã được cài đặt và đăng nhập trên máy Windows. Việc gửi Zalo luôn diễn ra sau khi LMS hoàn tất để nội dung gửi cho phụ huynh phản ánh đúng trạng thái nghỉ học.

Trong giai đoạn thử nghiệm, ứng dụng tìm từ khóa `Dương` và chọn kết quả liên hệ/nhóm đầu tiên.

## Phạm vi

- Giữ nguyên phần dựng nội dung Zalo, IPC, lịch tự động và metadata `zaloSentAt`.
- Thay `ZaloWebAutomator` bằng `ZaloDesktopAutomator`.
- Dùng Windows UI Automation để điều khiển Zalo PC.
- Cho phép MindX Auto Comment đưa cửa sổ Zalo lên trước trong lúc gửi.
- Không duy trì Zalo Web như phương án dự phòng.

## Kiến trúc

`ZaloDesktopAutomator` là adapter duy nhất chịu trách nhiệm tương tác với Zalo PC. Adapter:

1. Tìm tiến trình và cửa sổ chính của Zalo PC.
2. Nếu Zalo chưa chạy, mở ứng dụng từ vị trí cài đặt đã phát hiện và chờ cửa sổ sẵn sàng.
3. Đưa cửa sổ Zalo lên trước.
4. Tìm các control bằng Windows UI Automation, không dựa vào tọa độ cố định.
5. Tìm kiếm `Dương`, chọn kết quả đầu tiên, xóa bản nháp, nhập nội dung mới và gửi.
6. Xác nhận tin vừa gửi đã xuất hiện trước khi trả về trạng thái `sent`.

Phần nhập liệu có thể dùng thao tác bàn phím làm fallback khi control UI Automation đã được nhận diện nhưng không hỗ trợ nhập trực tiếp. Không dùng click theo tọa độ làm luồng chính.

`WorkflowMutex` tiếp tục bảo đảm LMS và Zalo không điều khiển giao diện đồng thời.

## Điều kiện và thứ tự gửi

Một thao tác gửi là workflow gộp, theo thứ tự bắt buộc:

1. Khóa nút gửi để tránh thao tác trùng.
2. Gửi nhận xét lên LMS trước.
3. Đọc và lưu kết quả LMS mới nhất, bao gồm trạng thái nghỉ học.
4. Kiểm tra toàn bộ học sinh trong buổi học.
5. Chỉ khi kết quả LMS hợp lệ, dựng lại tin Zalo từ dữ liệu vừa cập nhật.
6. Tự động gửi tin qua Zalo PC.
7. Chỉ lưu `zaloSentAt` sau khi giao diện Zalo xác nhận gửi thành công.

Một học sinh chỉ được ghi là nghỉ khi LMS đọc được trạng thái nghỉ rõ ràng. Không suy ra nghỉ học từ lỗi, thiếu nhận xét hay không tìm thấy control.

Zalo chỉ được gửi nếu mọi học sinh thuộc đúng một trong hai trạng thái:

- nghỉ học đã được LMS xác nhận; hoặc
- đi học và nhận xét đã được LMS lưu thành công.

Nếu bất kỳ học sinh đi học nào bị lỗi, thiếu nội dung hoặc LMS không xác nhận lưu nhận xét, toàn bộ bước Zalo bị chặn. Kết quả phải chỉ rõ học sinh gây chặn để người dùng sửa và chạy lại.

Nếu bước LMS lỗi ở cấp buổi học hoặc không thể phân loại chắc chắn toàn bộ học sinh, không gửi Zalo.

## Giao diện

Nút gửi hiện tại trở thành thao tác gộp `Gửi LMS & Zalo`. Khi workflow đang chạy, nút bị vô hiệu hóa và hiển thị tiến độ theo bước:

- đang gửi LMS;
- LMS chưa hợp lệ, Zalo bị chặn;
- đang gửi Zalo;
- đã gửi hoàn tất.

Phần xem trước Zalo tiếp tục chỉ cập nhật sau khi LMS hoàn tất, dựa trên dữ liệu mới nhất. Nếu Zalo bị chặn, phần xem trước có thể hiển thị nội dung mới để người dùng kiểm tra nhưng không được tự gửi.

## Xử lý lỗi và chẩn đoán

Các lỗi được phân biệt theo bước:

- không tìm thấy hoặc không mở được Zalo PC;
- Zalo chưa sẵn sàng hoặc chưa đăng nhập;
- không tìm thấy ô tìm kiếm;
- không có kết quả cho `Dương`;
- không tìm thấy ô soạn tin hoặc nút gửi;
- không xác nhận được tin vừa gửi;
- LMS chưa phân loại chắc chắn học sinh;
- học sinh đi học chưa gửi nhận xét LMS thành công.

Lỗi Zalo lưu ảnh chụp màn hình và bản liệt kê các control UI Automation đang thấy. Mọi lỗi trước khi xác nhận gửi đều giữ `zaloSentAt` trống để có thể thử lại.

## Kiểm thử

Kiểm thử tự động dùng adapter UI Automation giả lập để bao phủ:

- Zalo đang chạy và Zalo cần được mở;
- tìm `Dương` và chọn đúng kết quả đầu tiên;
- xóa bản nháp, nhập, gửi và xác nhận thành công;
- từng lỗi control không tồn tại hoặc xác nhận gửi thất bại;
- LMS cập nhật học sinh nghỉ trước khi dựng tin Zalo;
- học sinh nghỉ được xác nhận không chặn Zalo;
- một học sinh đi học gửi LMS lỗi sẽ chặn Zalo;
- không ghi `zaloSentAt` khi LMS hoặc Zalo chưa hoàn tất;
- lịch tự động tuân thủ cùng điều kiện như thao tác thủ công.

Sau kiểm thử tự động, chạy smoke test trên Zalo PC thật của người dùng với từ khóa `Dương`.

## Ngoài phạm vi

- Tự suy luận nhóm Zalo theo mã lớp.
- Gửi bằng Zalo Web.
- Click theo tọa độ cố định.
- Gửi Zalo khi kết quả LMS còn lỗi hoặc chưa xác định.
