# MindX Auto Comment — Tổng kết trạng thái dự án

Cập nhật: 2026-07-24 · Nhánh: `feature/milestone-1-foundation` (đã push lên origin)

Ứng dụng desktop (Electron + React + TypeScript) giúp giáo viên MindX: soạn nhận xét học sinh, đẩy lên **LMS**, và gửi tin tổng kết buổi học cho phụ huynh qua **Zalo** — thủ công hoặc tự động theo lịch.

---

## 1. Tổng quan kiến trúc

| Lớp | Vị trí | Vai trò |
|---|---|---|
| Renderer (UI) | `src/renderer/src/` | React: trang Lớp học, Soạn nội dung, Cấu hình, Hướng dẫn |
| Main process | `src/main/` | IPC, kho dữ liệu, tự động hóa LMS/Zalo, scheduler |
| Logic thuần (test được) | `src/shared/` | Tính trạng thái, dựng tin Zalo, điểm danh, lọc lớp |
| Tự động hóa LMS | `src/main/automation/LmsAutomator.ts` | Playwright điều khiển Chrome vào LMS |
| Tự động hóa Zalo | `src/main/automation/ZaloDesktop*.ts` + `resources/zalo-desktop-uia.ps1` | Windows UI Automation điều khiển Zalo PC |
| Lịch tự động | `src/main/automation/AutoSendScheduler.ts` | Tick mỗi 60s, gửi bù khi mở app trễ |

Kiểm thử: **291 test (Vitest) xanh**, `npm run typecheck` sạch, `npm run build` OK.

---

## 2. Đã hoàn thành ✅

### Quản lý lớp & dữ liệu
- Kho dữ liệu local (chọn thư mục ở Cấu hình), lưu lớp + nội dung buổi.
- Lọc lớp theo **trạng thái** (dropdown) và **loại lớp** (chip).
- Thêm/sửa/xóa lớp; đánh dấu học sinh **"đã nghỉ học"** (nghỉ dài hạn).

### Đồng bộ từ LMS
- Thêm lớp mới đang diễn ra từ LMS.
- Lấy nội dung + **nhận xét từng học sinh** của buổi gần nhất (selector đọc ổn định `table.can-have-border td`).
- **Ghi đè** nội dung app bằng dữ liệu LMS mới nhất (giữ nhận xét app nếu LMS chưa có).
- Tự phát hiện **nghỉ dài hạn** (HS không còn trên LMS) → loại khỏi Zalo & LMS.
- Buổi đã có nhận xét trên LMS → trạng thái **"đã nhận xét"**.
- Thông báo rõ **lớp nào được cập nhật / bỏ qua**.

### Soạn nội dung & AI
- Nhập nội dung bài học (tay hoặc trích từ PDF).
- Nhận xét từng HS + **"Sửa tất cả bằng AI"** (Gemini, gộp 1 request/lớp).
- Tùy chọn **lồng nội dung bài học** vào prompt Gemini (bỏ qua nếu buổi chưa có bài học).
- Đổi model Gemini khi hết quota.

### Gửi lên LMS
- Tự điều khiển trình duyệt: mở lớp → tab Nhận xét → chọn buổi → điền Tổng kết/Bài về nhà → ghi nhận xét từng HS.
- Tự **chuyển popup sang manual mode** khi ở "by-areas mode" (đã fix lỗi HS đầu không mở được editor).
- Xác nhận lưu qua GraphQL; loại HS nghỉ dài hạn.
- **Popup xác nhận** khi gửi lại buổi đã nhận xét.

### Giao diện & đóng gói
- Thanh nav 3 tab: Lớp học / Cấu hình / **Hướng dẫn** (trang hướng dẫn chi tiết trong app).
- Ẩn menu mặc định Electron; dòng tác giả `kiennv@mindx.net.vn`.
- **Đóng gói portable** (`npm run pack`) → thư mục có `▶ RUN ME.bat` chạy luôn, không cần cài Node.js. Bản ship ~228MB (zip ~99MB).

---

## 3. CHƯA HOÀN THÀNH ⚠️

### 3.1. Gửi Zalo — chưa dùng được thực tế
**Trạng thái:** khung xử lý đã có (nút "Gửi Zalo", điều kiện điểm danh, dựng tin, adapter Zalo PC qua UI Automation), **nhưng chưa gửi cho người nhận thật.**

Việc còn thiếu:
- ❌ **Người nhận đang HARD-CODE là liên hệ test `"Dương"`** (`ZALO_TEST_SEARCH_TERM` trong `ZaloDesktopAutomator.ts`). Cần:
  - Thêm trường **người nhận/nhóm Zalo cho từng lớp** (ví dụ tên nhóm phụ huynh) vào `SchoolClass`.
  - UI nhập tên nhóm trong màn sửa lớp.
  - `zaloSendSession` / scheduler dùng tên nhóm của lớp thay vì `"Dương"`.
- ❌ **Chưa smoke-test với Zalo PC thật**: cần mở Zalo PC đã đăng nhập, bấm gửi, xác nhận script UIA tìm đúng hội thoại, xóa draft, nhập và gửi **đúng 1 tin**.
- ❌ Nếu UIA không tìm thấy control: đọc file debug `%APPDATA%\mindx-auto-comment\zalo-desktop-debug\zalo-desktop-controls.json` để chỉnh selector theo thuộc tính thật (không đoán).

**Tài nguyên cần để hoàn thiện:** máy có Zalo PC đăng nhập sẵn + xác nhận tên nhóm phụ huynh mẫu; nếu lỗi, file `zalo-desktop-controls.json` thật.

### 3.2. Gửi tự động theo giờ — chưa nghiệm thu
**Trạng thái:** đã nối dây đầy đủ (bật LMS/Zalo, chọn giờ + ngày *cùng ngày/hôm sau*, tick mỗi 60s, cơ chế **gửi bù** khi mở app trễ, gate điểm danh cho Zalo). Logic có test tự động.

Việc còn thiếu:
- ❌ **Chưa chạy thử end-to-end thật**: chưa xác nhận đúng giờ hẹn app tự gửi LMS + Zalo cho lớp thật.
- ❌ **Phụ thuộc 3.1**: Zalo tự động cũng gửi vào liên hệ test `"Dương"` → phải xong người-nhận-thật trước.
- ❌ Chưa kiểm thử luồng **gửi bù** với dữ liệu thật (mở app sau giờ hẹn → xác nhận danh sách → gửi).

---

## 4. Tồn đọng nhỏ khác
- Buổi đặc biệt (#4/#9) hiện mới **chặn** gửi LMS, chưa có cơ chế xử lý riêng (spec chưa có).
- `ContentRepository.mergeMetadata` hợp nhất (union) `absentStudentIds`/`attendedStudentIds` với dữ liệu cũ — hiếm khi một HS đổi từ nghỉ↔đi học giữa các lần đồng bộ có thể còn cờ cũ. Chưa gặp thực tế; theo dõi.
- Đóng gói **installer 1-file** (electron-builder) bị chặn do máy chưa bật *Developer Mode* (lỗi tạo symbolic link khi giải nén winCodeSign). Hiện dùng `npm run pack` (thủ công, không cần admin). Bật Developer Mode rồi `npm run dist` sẽ ra installer.

---

## 5. Cách chạy & build

```bash
npm install            # cài phụ thuộc (một lần)
npm run dev            # chạy dev (tắt hẳn app cũ trước — main không hot-reload)
npm test               # 291 test
npm run typecheck
npm run build          # build production vào out/
npm run pack           # đóng gói portable -> release/MindX Auto Comment/
```

**Yêu cầu máy người dùng cuối:** Windows + **Google Chrome** (Playwright điều khiển Chrome hệ thống để vào LMS) + **Zalo PC** (cho tính năng gửi Zalo).

---

## 6. Việc tiếp theo đề xuất (ưu tiên)
1. **Thêm người nhận Zalo theo lớp** (bỏ hard-code `"Dương"`) — mở khóa toàn bộ mục 3.
2. **Smoke-test Zalo PC thật** → chỉnh selector UIA nếu cần.
3. **Nghiệm thu gửi tự động** end-to-end (đúng giờ + gửi bù) sau khi (1),(2) xong.
4. Cơ chế riêng cho buổi đặc biệt #4/#9 (khi có spec).
