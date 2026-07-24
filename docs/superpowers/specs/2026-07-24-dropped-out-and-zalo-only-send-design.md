# Nghỉ dài hạn, đồng bộ điểm danh, và tách gửi Zalo — Thiết kế

Ngày: 2026-07-24
Nhánh: feature/milestone-1-foundation

## Mục tiêu

1. Phân biệt ba trạng thái học sinh: **đi học**, **nghỉ buổi** (1 buổi), và **nghỉ dài hạn** (đã nghỉ học).
2. Nút gửi Zalo **chỉ gửi Zalo**, không post lại nhận xét lên LMS; chỉ cần biết ai đi học / ai nghỉ.
3. Đồng bộ từ LMS lấy trạng thái điểm danh + phát hiện nghỉ dài hạn cho **mọi lớp đang diễn ra** (hỗ trợ trường hợp giáo viên tự nhận xét trên LMS).
4. Lỗi kỹ thuật khi post nhận xét từng HS **không** chặn việc gửi Zalo.

## Ràng buộc chung

- Không ghi đè mất nội dung bài học / nhận xét người dùng đã soạn trong app khi đồng bộ.
- Không ghi đè mất `absentStudentIds` đã lưu.
- HS nghỉ dài hạn bị loại khỏi **cả** Zalo lẫn LMS ở mọi buổi.
- HS nghỉ dài hạn được gỡ cờ nếu xuất hiện lại trên LMS.
- Popup / trình duyệt LMS vẫn được đóng an toàn trong `finally` như hiện tại.

---

## Phần 1 — Mô hình dữ liệu

Ba trạng thái, lưu tách bạch:

| Trạng thái | Lưu ở đâu | Ảnh hưởng |
|---|---|---|
| Đi học (buổi này) | `SessionContent.attendedStudentIds` | Có trong Zalo + có nhận xét LMS |
| Nghỉ buổi (1 buổi) | `SessionContent.absentStudentIds` (đã có) | Hiện "Tên: nghỉ" trong Zalo, bỏ qua LMS buổi đó |
| Nghỉ dài hạn (đã nghỉ học) | `Student.droppedOut` (cấp lớp) | Loại hẳn khỏi Zalo và LMS, mọi buổi |

### Thay đổi type (`src/shared/types.ts`)

```ts
export interface Student {
  id: string
  name: string
  note?: string
  droppedOut?: boolean          // MỚI: nghỉ dài hạn (đã nghỉ học)
}

export interface SessionContent {
  // ...các trường hiện có...
  attendedStudentIds?: string[] // MỚI: HS được LMS xác nhận có đi học buổi này
}

export interface LmsPostResult {
  posted: string[]
  skipped: string[]
  absentStudentNames: string[]
  attendedStudentNames: string[] // MỚI: tên HS đi học (không nghỉ), bất kể post thành/lỗi
  error?: string
}
```

`LmsContentResult.students[].attended` (đã có) tiếp tục là nguồn điểm danh khi đồng bộ.

### Phát hiện nghỉ dài hạn

Sau khi đọc bảng nhận xét LMS của một buổi, đối chiếu roster app với danh sách tên xuất hiện trên LMS:
- HS trong app **không khớp** dòng LMS nào → `droppedOut = true`.
- HS **khớp** dòng LMS → `droppedOut = false` (gỡ cờ nếu trước đó bật).

Khớp tên dùng `matchStudentByName` / `resolveUniqueNameMatch` (chuẩn hoá NFC, bỏ khoảng trắng thừa, không phân biệt hoa/thường) như code hiện có.

---

## Phần 2 — Đồng bộ từ LMS mở rộng

### Phạm vi

Với **mọi lớp đang diễn ra** đã có trong app, đồng bộ **buổi gần nhất đã qua** — kể cả buổi đã có nội dung.

`computeContentTargets` (`src/shared/lmsSync.ts`) bỏ điều kiện `hasContent(latest.id)`: luôn thêm buổi gần nhất đã qua của lớp chưa "đã kết thúc" vào danh sách target. (Vẫn giữ điều kiện bỏ lớp `đã kết thúc`.)

### Quy tắc gộp (không phá dữ liệu người dùng)

`mergeContentResult` nhận thêm tham số nội dung app hiện có (nếu có) để quyết định:

| Trường | Buổi CHƯA có nội dung app | Buổi ĐÃ có nội dung app |
|---|---|---|
| `lessonContent` / `homework` | lấy từ LMS | giữ nguyên của app |
| `comments` | lấy từ LMS | giữ nguyên của app |
| `absentStudentIds` | từ LMS | cập nhật từ LMS |
| `attendedStudentIds` | từ LMS | cập nhật từ LMS |

`Student.droppedOut` được cập nhật ở cấp lớp (không thuộc `SessionContent`).

### Luồng trong `ClassesPage.syncFromLms`

1. Gọi `lmsSyncAll` như hiện tại, nhận `contentResults` (mỗi buổi kèm `students[].attended`).
2. Với mỗi `contentResult`:
   - Lấy nội dung app hiện có của buổi (`sessionContents`), gộp theo bảng trên → `saveContent`.
   - Tính lại `droppedOut` cho roster lớp từ danh sách tên LMS → nếu có thay đổi thì `saveClass`.
3. `reload()` để nạp lại.

---

## Phần 3 — Tách gửi Zalo khỏi post LMS

### Nút UI (`SessionComposer.tsx`)

- Nút trong khung "Xem trước Zalo" đổi nhãn **"Gửi LMS & Zalo" → "Gửi Zalo"** (và trạng thái loading "Đang gửi Zalo...").
- Nút **"Gửi lên LMS"** riêng ở action bar **giữ nguyên** chức năng post nhận xét lên LMS.
- Luồng người dùng: soạn → **Gửi lên LMS** (post nhận xét, thu điểm danh) → **Gửi Zalo** (chỉ gửi Zalo, đọc điểm danh đã có). Điểm danh cũng có thể đến từ **Đồng bộ từ LMS** nếu giáo viên tự nhận xét.

### `zaloSendSession` (`src/main/ipcHandlers.ts`)

1. **Bỏ hẳn** khối `runLmsPostExclusive` post lại nhận xét.
2. Loại HS `droppedOut` khỏi mọi tính toán.
3. Gate — chỉ gửi khi **mọi HS còn học** (không `droppedOut`) đã biết trạng thái:
   `student.id ∈ absentStudentIds ∪ attendedStudentIds`.
   - Nếu còn HS chưa rõ → trả `status: 'blocked'`, message:
     `"Chưa đủ thông tin điểm danh. Hãy Gửi lên LMS hoặc Đồng bộ từ LMS trước."`
4. Nếu đủ → dựng tin bằng `buildZaloMessage` (HS nghỉ buổi → "nghỉ") và gửi Zalo Desktop; lưu `zaloSentAt` khi adapter xác nhận (giữ nguyên cơ chế).

Tách điều kiện gate ra helper thuần để test được, ví dụ trong `src/shared/lmsDelivery.ts`:

```ts
export function assessZaloReadiness(
  students: Student[],
  content: { absentStudentIds?: string[]; attendedStudentIds?: string[] },
): { ready: boolean; unknownStudentNames: string[] }
```

Bỏ qua HS `droppedOut`; `ready = unknownStudentNames.length === 0`.

### `LmsAutomator.processComments`

- Ghi nhận **điểm danh cho mọi dòng đã duyệt**: dòng không có dấu "vắng mặt" → thêm tên vào `attendedStudentNames` (kể cả khi post nhận xét dòng đó lỗi/timeout).
- Trả `attendedStudentNames` trong `LmsPostResult` (qua `makeLmsPostResult`).
- Dòng nghỉ → `absentStudentNames` như hiện tại.

### `lmsPostSessionAndSave` (`src/main/ipcHandlers.ts`)

- Ghi thêm `attendedStudentIds` vào `SessionContent` từ `postResult.attendedStudentNames` (map tên → id qua `matchStudentByName`), song song với `lmsPostedStudentIds` hiện có.
- Nhờ vậy sau khi "Gửi lên LMS", nút "Gửi Zalo" đã đủ dữ liệu điểm danh.

### Lịch tự động (`AutoSendScheduler`)

- Dùng cùng gate `assessZaloReadiness` cho Zalo tự động: chỉ gửi Zalo khi đủ thông tin điểm danh; HS `droppedOut` bị loại. Không tự post lại LMS trong bước Zalo.

---

## Loại nghỉ dài hạn khỏi Zalo & LMS

- `buildZaloMessage` (`src/shared/autoSend.ts`): lọc bỏ HS `droppedOut` khỏi `danh_sach_nhan_xet`.
- Bộ lọc comment khi post LMS (`postToLms`, `lmsPostSessionAndSave`, `zaloSendSession` — chỗ dựng `comments`): loại HS `droppedOut`.
- `SessionComposer`: HS `droppedOut` không hiện ô nhập nhận xét (hoặc hiện mờ + nhãn "đã nghỉ học"), không tính vào "Sửa tất cả bằng AI".

## Kiểm thử

- `lmsSync.test.ts`: `computeContentTargets` lấy cả buổi đã có nội dung; `mergeContentResult` giữ nội dung app khi buổi đã có, cập nhật điểm danh; phát hiện + gỡ `droppedOut`.
- `lmsDelivery.test.ts`: `assessZaloReadiness` — đủ/thiếu điểm danh, bỏ qua `droppedOut`.
- `LmsAutomator.test.ts`: `makeLmsPostResult` mang `attendedStudentNames`; điểm danh vẫn ghi khi post dòng lỗi.
- `autoSend.test.ts`: `buildZaloMessage` loại HS `droppedOut`.
- `ipcHandlers.test.ts`: `zaloSendSession` không post LMS, chặn khi thiếu điểm danh, gửi khi đủ; `lmsPostSessionAndSave` ghi `attendedStudentIds`.
- `SessionComposer.test.tsx`: nút đổi nhãn "Gửi Zalo"; HS nghỉ dài hạn không hiện ô nhận xét.
- `ClassesPage.test.tsx`: đồng bộ cập nhật `droppedOut` và điểm danh, không phá nội dung đã soạn.
```
