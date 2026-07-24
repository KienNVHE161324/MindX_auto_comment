# Backlog cho Milestone 2 (từ review M1)

Các finding Minor từ review tổng nhánh M1 — không chặn merge, xử lý ở M2:

- [ ] **Validate `localFolderPath` trước khi lưu** (SettingsPage / storage): khi chọn backend `local` mà chưa chọn thư mục, chặn nút "Lưu" hoặc cảnh báo, thay vì để lỗi nổ về sau ở `createStorageProvider`.
- [ ] **Trạng thái loading cho nút "Kiểm tra key"**: disable nút trong lúc gọi mạng để tránh double-click và kết quả hiển thị sai thứ tự.
- [ ] **Làm rõ "Kiểm tra key" vs "Lưu"**: key được validate là key đang nhập, chưa chắc đã lưu; cân nhắc gộp hoặc nhắc người dùng lưu sau khi kiểm tra.

Đã xử lý trong M1 (không còn tồn đọng):
- [x] Ghi config atomic + fallback khi config.json hỏng (commit 9e1d625).

## Minor còn lại từ review M2 (nợ kỹ thuật, làm ở M3)
- [ ] `ClassesPage` useEffect: `reload` không nằm trong dep array (bọc useCallback hoặc inline) — chưa gây bug vì chỉ capture window.api.
- [ ] `ClassEditor` khởi tạo `useState(cls)` không sync nếu prop đổi khi đang mở — hiện an toàn vì mount/unmount theo `editing`.
- [ ] `getRepository` tạo instance mới mỗi IPC call (load config + provider). OK với local; refactor khi thêm Supabase (connection pool) ở phase online.

Đã xử lý trong review M2 (commit d7106cb):
- [x] try/catch cho save/delete + hiển thị lỗi.
- [x] functional updater tránh stale closure.
- [x] aria-label nút xóa buổi là duy nhất; thêm test getClass + save-fail.
