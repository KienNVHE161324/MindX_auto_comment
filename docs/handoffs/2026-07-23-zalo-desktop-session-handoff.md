# Handoff: Zalo PC automation

Ngày cập nhật: 2026-07-23

## Nhánh và worktree

- Nhánh làm việc: `codex/zalo-web-automation`
- Worktree: `C:\Users\Beam1\MindX_auto_comment\.worktrees\zalo-web-automation`
- Nhánh gốc: `feature/milestone-1-foundation`
- Trạng thái merge: chưa merge vào `feature/milestone-1-foundation`

Không tiếp tục sửa tại checkout chính trước khi đưa các commit của nhánh này vào đó.

## Phần đã triển khai

- Thay hoàn toàn `ZaloWebAutomator` bằng `ZaloDesktopAutomator`.
- Dùng PowerShell 5.1 và Windows UI Automation để điều khiển Zalo PC.
- Từ khóa test là Unicode chính xác `Dương`, chọn kết quả đầu tiên.
- Thêm nút gộp `Gửi LMS & Zalo`.
- LMS luôn chạy trước Zalo.
- Lưu bằng chứng theo ID:
  - `lmsPostedStudentIds`: LMS xác nhận đã lưu nhận xét;
  - `absentStudentIds`: LMS xác nhận học sinh nghỉ.
- Chỉ gửi Zalo khi mọi học sinh đã thuộc một trong hai tập bằng chứng trên.
- Học sinh đi học bị timeout, thiếu nội dung hoặc LMS không xác nhận lưu sẽ chặn Zalo.
- Lịch tự động dùng cùng điều kiện chặn như thao tác thủ công.
- `zaloSentAt` chỉ được lưu sau khi adapter Zalo xác nhận tin đã gửi.
- Khi UI Automation lỗi, script lưu:
  - `zalo-desktop-controls.json`;
  - `zalo-desktop-error.png`.

## Các commit của phase Zalo PC

- `66e96bf` — thiết kế Zalo PC
- `b35cee2` — kế hoạch triển khai
- `b270535` — đánh giá kết quả LMS theo từng học sinh
- `c4d52ba` — bridge Windows UI Automation
- `1547766` — thay Zalo Web bằng Zalo PC
- `e35a92e` — workflow LMS trước rồi Zalo
- `2c2a6e5` — chặn lịch Zalo khi LMS chưa hoàn tất

Nhánh còn chứa các commit Zalo Web trước đó vì Zalo PC được phát triển nối tiếp trên cùng worktree. Các file Zalo Web đã bị xóa và không còn được import.

## Bằng chứng kiểm thử mới nhất

Chạy ngoài sandbox tại worktree:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Kết quả ngày 2026-07-23:

- Vitest: 26 files, 277/277 tests passed.
- TypeScript node + web: exit code 0.
- Electron Vite production build: exit code 0.

## Lỗi Windows `Access is denied`

Triệu chứng:

```text
Cannot read directory "../../..": Access is denied.
Could not resolve "...\.worktrees\zalo-web-automation\vitest.config.ts"
```

Nguyên nhân đã xác nhận: esbuild chạy trong filesystem sandbox cố quét thư mục cha của worktree và bị ACL chặn. Đây không phải lỗi TypeScript, Vitest config hoặc source. Cùng lệnh chạy ngoài sandbox đã đạt 277/277 test và build thành công.

Cách xử lý:

1. Không ghép test, typecheck và build trong cùng một lệnh.
2. Dừng Electron dev cũ trước khi kiểm thử.
3. Chạy từng lệnh riêng trong PowerShell bình thường hoặc terminal có quyền truy cập đầy đủ worktree.
4. Nếu Codex sandbox báo lại lỗi trên, chạy lại đúng lệnh với quyền ngoài sandbox.

## Cách chạy Electron dev trong worktree

Binary Electron trong `node_modules` của worktree từng thiếu, trong khi checkout chính có binary đúng phiên bản `31.7.7`. Có thể chạy:

```powershell
$env:ELECTRON_EXEC_PATH='C:\Users\Beam1\MindX_auto_comment\node_modules\electron\dist\electron.exe'
npm.cmd run dev
```

Nếu cổng 5173 đang được bản cũ dùng, Vite sẽ chọn 5174. Cần kiểm tra đúng cửa sổ dev mới.

## Việc bắt buộc còn lại ở session sau

1. Mở Zalo PC và bảo đảm đã đăng nhập.
2. Chạy Electron dev từ worktree bằng lệnh phía trên.
3. Chọn một buổi có nội dung hoàn chỉnh và bấm `Gửi LMS & Zalo`.
4. Xác nhận LMS chạy trước, cập nhật học sinh nghỉ, rồi Zalo PC mới được đưa lên trước.
5. Xác nhận tìm đúng `Dương`, chọn kết quả đầu, xóa draft, nhập và gửi đúng một tin.
6. Nếu UI Automation không tìm thấy control, đọc hai file debug trong:
   `C:\Users\Beam1\AppData\Roaming\mindx-auto-comment\zalo-desktop-debug`
7. Chỉ chỉnh selector theo thuộc tính thực tế trong `zalo-desktop-controls.json`, thêm regression test rồi chạy lại toàn bộ kiểm thử.
8. Test đường chặn: một học sinh đi học gửi LMS lỗi thì Zalo PC không được focus và không có `zaloSentAt`.
9. Sau smoke test thành công mới merge nhánh vào `feature/milestone-1-foundation`.

## Tài liệu liên quan

- Thiết kế: `docs/superpowers/specs/2026-07-23-zalo-desktop-automation-design.md`
- Kế hoạch: `docs/superpowers/plans/2026-07-23-zalo-desktop-automation.md`
- Script UI Automation: `resources/zalo-desktop-uia.ps1`
