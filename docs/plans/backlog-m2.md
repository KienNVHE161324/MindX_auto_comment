# Backlog cho Milestone 2 (từ review M1)

Các finding Minor từ review tổng nhánh M1 — không chặn merge, xử lý ở M2:

- [ ] **Validate `localFolderPath` trước khi lưu** (SettingsPage / storage): khi chọn backend `local` mà chưa chọn thư mục, chặn nút "Lưu" hoặc cảnh báo, thay vì để lỗi nổ về sau ở `createStorageProvider`.
- [ ] **Trạng thái loading cho nút "Kiểm tra key"**: disable nút trong lúc gọi mạng để tránh double-click và kết quả hiển thị sai thứ tự.
- [ ] **Làm rõ "Kiểm tra key" vs "Lưu"**: key được validate là key đang nhập, chưa chắc đã lưu; cân nhắc gộp hoặc nhắc người dùng lưu sau khi kiểm tra.

Đã xử lý trong M1 (không còn tồn đọng):
- [x] Ghi config atomic + fallback khi config.json hỏng (commit 9e1d625).
