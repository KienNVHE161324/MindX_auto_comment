# Zalo Web automation

## Mục tiêu

Thay adapter ghi tin Zalo ra file `.txt` bằng tự động hóa Zalo Web thật. Cùng một bộ tự động hóa phục vụ cả thao tác gửi thủ công trong màn hình buổi học và gửi theo lịch của từng lớp.

Trong giai đoạn thử nghiệm, mọi lần gửi đều tìm từ khóa cố định `Dương`, chọn kết quả đầu tiên và gửi tin vào cuộc trò chuyện đó. Phase này chưa ánh xạ mã lớp sang nhóm chat.

## Phạm vi

- Thêm nút `Gửi Zalo` trong luồng xem trước nội dung Zalo của một buổi học.
- Scheduler dùng Zalo Web thay cho adapter ghi file.
- Dùng hồ sơ trình duyệt riêng, bền vững để giữ phiên đăng nhập Zalo.
- Nếu chưa đăng nhập, mở cửa sổ Zalo Web để người dùng đăng nhập và giữ buổi ở trạng thái chưa gửi.
- Chỉ lưu `zaloSentAt` sau khi xác minh Zalo đã gửi thành công.
- Lưu HTML và screenshot debug khi không thể thao tác hoặc xác minh.

Không thuộc Phase 3:

- Tìm nhóm theo mã lớp.
- Cấu hình từ khóa hoặc lựa chọn kết quả tìm kiếm.
- Gửi tệp, ảnh hoặc nhiều tin nhắn.
- Gọi API nội bộ không công khai của Zalo.

## Kiến trúc

### `ZaloWebAutomator`

Tạo một automator độc lập trong main process, theo cùng ranh giới trách nhiệm với `LmsAutomator`.

Automator sở hữu:

- Playwright persistent context dùng thư mục hồ sơ nằm trong `app.getPath('userData')`.
- Cửa sổ Zalo Web có thể được tái sử dụng giữa các lần gửi.
- Kiểm tra trạng thái đăng nhập.
- Tìm cuộc trò chuyện, nhập nội dung, gửi và xác minh.
- Xuất tài liệu debug khi lỗi.

API chính:

```ts
type ZaloSendResult =
  | { status: 'sent' }
  | { status: 'login-required'; message: string }

sendMessage(input: {
  searchTerm: string
  message: string
}): Promise<ZaloSendResult>
```

Các lỗi thao tác khác được throw với thông báo tiếng Việt có ngữ cảnh. `login-required` là trạng thái dự kiến, không phải gửi thành công.

### IPC và renderer

Thêm IPC gửi Zalo cho một buổi học. Main process luôn tải lại lớp, buổi, content và config mới nhất trước khi dựng tin bằng `buildZaloMessage`; renderer không truyền chuỗi preview làm nguồn dữ liệu chính.

`SessionComposer`:

- giữ luồng `Xem trước Zalo`;
- thêm nút `Gửi Zalo`;
- khóa các thao tác xung đột trong lúc gửi;
- sau thành công, tải lại content để UI nhận `zaloSentAt`;
- khi cần đăng nhập, hiển thị hướng dẫn rõ ràng và không báo đã gửi.

### Scheduler

`AutoSendScheduler` nhận dependency gửi Zalo Web thay cho `writeZaloMessageToDocuments`. Cả gửi tự động và gửi bù gọi cùng một adapter.

Scheduler chỉ lưu `zaloSentAt` khi automator trả `sent`. `login-required` hoặc exception giữ nguyên metadata để lần gửi bù sau vẫn nhận diện được công việc chưa hoàn tất.

## Luồng gửi

1. Lấy dữ liệu lớp, buổi, content và template mới nhất.
2. Nếu `zaloSentAt` đã tồn tại, không gửi lại.
3. Dựng tin bằng `buildZaloMessage`.
4. Mở hoặc tái sử dụng Zalo Web.
5. Nếu chưa đăng nhập:
   - đưa cửa sổ Zalo ra cho người dùng đăng nhập;
   - trả `login-required`;
   - không lưu `zaloSentAt`.
6. Xóa từ khóa cũ trong ô tìm kiếm, nhập `Dương`.
7. Chờ danh sách kết quả ổn định và chọn kết quả đầu tiên.
8. Click ô soạn tin của cuộc trò chuyện, xóa nội dung nháp cũ và nhập toàn bộ tin mới.
9. Bấm nút gửi.
10. Xác minh ô soạn tin đã trống và bong bóng tin mới nhất có nội dung khớp với nội dung vừa gửi.
11. Chỉ sau xác minh mới lưu `zaloSentAt`.

## Đồng thời và chống gửi trùng

- Tái sử dụng `WorkflowMutex` để không chạy đồng thời các workflow LMS/Zalo xung đột.
- Trước thao tác gửi, main process đọc lại content và kiểm tra `zaloSentAt`.
- Trong một tiến trình app, `ZaloWebAutomator` tuần tự hóa các lần gửi để một lần tìm kiếm không làm thay đổi cuộc trò chuyện của lần gửi khác.
- Không tự retry sau khi đã bấm gửi nhưng chưa xác minh được; trả lỗi để tránh nguy cơ gửi trùng.

## Xử lý lỗi và debug

Các trường hợp không đánh dấu đã gửi:

- Chưa đăng nhập.
- Không tìm thấy ô tìm kiếm.
- Không có kết quả cho `Dương`.
- Không mở được kết quả đầu tiên.
- Không tìm thấy ô soạn tin hoặc nút gửi.
- Timeout khi thao tác.
- Ô soạn không trống sau khi gửi.
- Không tìm thấy bong bóng tin nhắn khớp.

Với lỗi selector/xác minh, automator lưu:

- HTML trang hiện tại.
- Screenshot trang hiện tại.
- Thông báo lỗi có bước đang thực hiện và đường dẫn debug.

Không ghi nội dung tin nhắn hoặc thông tin đăng nhập vào log console ngoài dữ liệu debug do người dùng chủ động cung cấp để chẩn đoán.

## Kiểm thử

- Unit test helper nhận diện đăng nhập và selector/chuẩn hóa nội dung dùng để xác minh.
- Test automator với page/locator giả cho:
  - chưa đăng nhập;
  - chọn kết quả đầu tiên;
  - xóa draft và nhập tin mới;
  - gửi thành công;
  - gửi nhưng xác minh thất bại;
  - xuất debug khi lỗi.
- Test IPC dựng tin từ dữ liệu mới nhất và chỉ lưu `zaloSentAt` sau thành công.
- Test `SessionComposer` cho trạng thái pending, thành công, cần đăng nhập và lỗi.
- Test scheduler cho gửi tự động, gửi bù, không gửi trùng và lỗi một lớp không chặn lớp khác.
- Chạy toàn bộ test, typecheck và production build.
- Kiểm tra thủ công bằng tài khoản Zalo thật. Nếu DOM thực tế không khớp fixture, người dùng cung cấp HTML của:
  - màn hình chưa đăng nhập;
  - ô tìm kiếm và danh sách kết quả;
  - cuộc trò chuyện với ô soạn tin, nút gửi và một bong bóng tin đã gửi.

## Tiêu chí hoàn thành

- Nút gửi thủ công và scheduler đều gửi được cùng nội dung qua Zalo Web.
- Trong Phase 3, app luôn tìm `Dương` và chọn kết quả đầu tiên.
- Phiên đăng nhập được giữ trong hồ sơ trình duyệt riêng.
- Khi chưa đăng nhập, app mở Zalo Web và công việc vẫn còn trong danh sách gửi bù.
- Draft cũ bị xóa trước khi nhập tin mới.
- `zaloSentAt` chỉ được lưu sau khi xác minh gửi thành công.
- Mọi lỗi không làm mất trạng thái cần gửi và có tài liệu debug đủ để chỉnh selector.
