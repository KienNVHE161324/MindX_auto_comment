# Đồng bộ nội dung tự động từ LMS — Thiết kế

## Bối cảnh

Milestone 4 đã có `syncClasses()`: quét `/admin/classes`, chỉ thêm **lớp mới** (mã lớp chưa có trong app) kèm danh sách buổi học + học sinh. Lớp đã tồn tại trong app bị bỏ qua hoàn toàn — không có cách nào tự động lấy về nội dung buổi học (tổng kết, bài tập, nhận xét từng HS) mà giáo viên đã điền sẵn trên LMS.

Yêu cầu mới: khi bấm nút đồng bộ, ngoài thêm lớp mới, app còn phải tự lấy nội dung buổi học **gần nhất đã qua mà local chưa có** cho các lớp đang có (chưa kết thúc), và khi soạn tin Zalo phải tự loại học sinh nghỉ khỏi danh sách nhận xét.

## Mục tiêu

1. Gộp 1 nút "Đồng bộ từ LMS" duy nhất: vừa thêm lớp mới, vừa cập nhật nội dung buổi gần nhất còn thiếu cho lớp đã có.
2. Với mỗi lớp chưa kết thúc, chỉ xử lý **buổi gần nhất đã qua (dateTime < now) mà local chưa có `SessionContent`**. Nếu buổi đó trên LMS cũng chưa được điền nội dung → bỏ qua lớp, không báo lỗi.
3. Đọc từ tab "Nhận xét" của buổi đó: nội dung tổng kết, bài tập, và với từng học sinh — trạng thái điểm danh (có mặt / nghỉ) + nội dung nhận xét đã lưu (nếu có mặt).
4. Lưu thẳng vào local (không preview xác nhận), giống cơ chế thêm lớp hiện tại.
5. Nội dung nhận xét lấy từ LMS lưu **nguyên văn** — không gọi Gemini rewrite (Gemini chỉ dùng khi giáo viên tự soạn tay).
6. Khi xem trước / gửi tin Zalo, tự động loại học sinh nghỉ khỏi phần "Nhận xét từng học sinh".

## Kiến trúc & luồng dữ liệu

### 1. Renderer tính danh sách cần đồng bộ (`ClassesPage.tsx`)

Trước khi gọi LMS, renderer tự tính (không cần main biết logic trạng thái lớp — logic này đã có sẵn ở `getClassStatus()`):

```
contentTargets = lớp local đang có
  .filter(c => getClassStatus(c.sessions) !== 'đã kết thúc')
  .map(c => buổi gần nhất có dateTime < now VÀ chưa có SessionContent local)
  .filter(target tồn tại)
  → { classCode, sessionId, sessionDate: 'YYYY-MM-DD' }[]
```

### 2. IPC mới: `lmsSyncAll({ existingCodes, contentTargets })`

Thay thế `lmsSyncClasses` (đổi tên/mở rộng). `LmsAutomator` xử lý 2 phần trong cùng 1 phiên trình duyệt:

**Phần lớp mới** — giữ nguyên logic `scrapeAllClasses` hiện tại (lọc theo `existingCodes`, chỉ lấy lớp status "Running").

**Phần nội dung** — với từng `contentTarget`:
1. `findAndOpenClass(classCode)` (tái dùng helper có sẵn).
2. Vào tab "Nhận xét" (tương tự `clickTab` trong `postSession`).
3. Tìm nút buổi theo `sessionDate` (tái dùng cách match ngày trong `selectSession`), bấm vào.
4. Kiểm tra buổi đã có nội dung chưa (đọc ô "Tổng kết" — nếu rỗng/không có → coi là "chưa điền", bỏ qua lớp này, sang lớp tiếp theo).
5. Nếu đã có: đọc `lessonContent` (Tổng kết), `homework` (Bài về nhà).
6. Với từng dòng học sinh trong bảng: xác định `attended` (dựa theo text "Có mặt"/"Nghỉ có phép" — tái dùng cách check trong `processComments`). Nếu có mặt, mở popup "Nhận xét học sinh" đọc text đã lưu sẵn trong textarea/contenteditable (nếu popup có ô nhận xét trống thì `comment: ''`).

Trả về:
```ts
interface LmsSyncAllResult {
  newClasses: LmsScrapedClass[]      // như cũ
  contentResults: {
    classCode: string
    sessionDate: string              // 'YYYY-MM-DD'
    lessonContent: string
    homework: string
    students: { name: string; attended: boolean; comment: string }[]
  }[]
  skippedClasses: string[]           // mã lớp có target nhưng LMS chưa điền nội dung buổi đó
}
```

Lỗi ở 1 lớp (class/session không tìm thấy, DOM bất thường...) không chặn các lớp khác — try/catch quanh từng lớp trong `contentTargets`, lớp lỗi thêm vào `skippedClasses` kèm lý do ngắn (log console, không throw).

### 3. Renderer merge kết quả

- `newClasses` → nhập như `importScraped` hiện tại (không đổi).
- Với từng `contentResult`:
  - Tìm `SchoolClass` theo `classCode`, tìm `ClassSession` có `dateTime` khớp `sessionDate`.
  - Với mỗi học sinh trong `students`:
    - Tìm/khớp `Student.id` theo tên (so khớp gần đúng, tái dùng cách match trong `processComments`: substring 2 chiều, không phân biệt hoa/thường).
    - Nếu `attended`: tạo `StudentComment { studentId, raw: comment, polished: comment }` (không gọi Gemini).
    - Nếu không `attended`: thêm `studentId` vào `absentStudentIds`, **không** tạo `StudentComment`.
  - Lưu `SessionContent` qua `saveContent` — ghi thẳng, không hỏi xác nhận.
- Hiện bảng tóm tắt cuối cùng: số lớp mới, số buổi vừa cập nhật nội dung, số lớp bỏ qua (kèm lý do nếu có).

### 4. Data model

Thêm field mới vào `SessionContent` (`shared/types.ts`):

```ts
export interface SessionContent {
  id: string
  classId: string
  sessionId: string
  lessonContent: string
  homework: string
  comments: StudentComment[]
  absentStudentIds?: string[]   // mới — HS nghỉ buổi này, loại khỏi tin Zalo
}
```

### 5. Lọc học sinh nghỉ khỏi tin Zalo

`SessionComposer.tsx` — hàm `showPreview()` và `postToLms()`: khi build `danh_sach_nhan_xet` / `comments`, loại các `Student` có `id` nằm trong `content.absentStudentIds` (mặc định `[]` nếu field không tồn tại — tương thích ngược với `SessionContent` cũ đã lưu trước đây).

## Phụ thuộc cần trước khi code phần đọc DOM

Phần đọc tab "Nhận xét" (bước 2.4–2.6 ở trên) cần biết chính xác cấu trúc HTML thực tế của:
- Ô "Tổng kết" / "Bài về nhà" khi **đã có sẵn nội dung** (để phân biệt "đã điền" vs "chưa điền", và lấy đúng text — có thể là rich text nên cần biết lấy `innerText` hay theo từng đoạn).
- Popup "Nhận xét học sinh" khi mở lại 1 học sinh **đã có nhận xét sẵn** — để biết selector/format đọc lại text đã lưu.

→ Sẽ xin bạn gửi HTML debug hoặc screenshot cấu trúc này trước khi bắt đầu implement bước đọc DOM cụ thể (các bước khác — merge logic, data model, UI tóm tắt — có thể làm trước, không phụ thuộc).

## Ngoài phạm vi

- Không đồng bộ buổi cũ hơn buổi gần nhất còn thiếu (chỉ 1 buổi/lớp mỗi lần bấm, theo yêu cầu).
- Không thay đổi luồng soạn tay hiện có (Gemini rewrite vẫn hoạt động như cũ cho nhận xét tự soạn).
- Không đổi tên nút UI ngoài việc gộp hành vi (giữ style/label tương tự, có thể đổi text "Đồng bộ từ LMS").
