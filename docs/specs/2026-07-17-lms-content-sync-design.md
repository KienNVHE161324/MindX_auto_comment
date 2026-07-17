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
3. Tìm buổi theo `sessionDate` trong carousel `div[id^="class-comments-slot-carousel-"]` (mỗi buổi 1 div con, buổi đang chọn có class `active`; ngày hiển thị dạng `dd/mm` hoặc — nếu là buổi đang active — `HH:mm  dd/mm/yyyy`), bấm vào đúng buổi.
4. Đọc khối "Tổng kết": tìm `div.jss2713.jss2705` có chứa `span` text khớp `/Tổng k/i` (site viết sai chính tả "Tổng két"), nội dung nằm trong `div.jss2714 .jss2722`. Nếu container này có class `place-holder` → **chưa điền** → bỏ qua lớp này (không lỗi), sang lớp tiếp theo. Nếu không có `place-holder` → lấy `innerText` làm `lessonContent`.
5. Đọc khối "Bài về nhà" tương tự (header text `/Bài.*nhà/i`) — nếu khối đang thu gọn (icon `ExpandMoreIcon` thay vì `ExpandLessIcon`) thì bấm header để mở trước khi đọc. Cùng quy tắc `place-holder` = rỗng.
6. Với từng dòng trong `table` bên trong `div.comment-list-table`: tên ở `.name-display`; cột Comment nếu chứa text cố định "Không thể viết nhận xét cho học viên vắng mặt" → `attended = false` (không mở popup). Ngược lại (`attended = true`, gồm cả trạng thái "Đi muộn") → bấm nút "Nhận xét học sinh" trong dòng đó để mở popup (`role="dialog"`), đọc nội dung tại `.jss2989 .jss2722` (giữ nguyên text kể cả tiền tố "- Đánh giá chung: " nếu có — lưu nguyên văn theo mục tiêu #5). Nếu vùng đó có class `place-holder`/rỗng → `comment: ''`. Đóng popup trước khi sang học sinh kế tiếp.

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

## Selector đã xác nhận từ HTML thực tế (2026-07-17)

Đã nhận HTML mẫu từ người dùng cho: carousel buổi học, khối Tổng kết (đã điền), khối Bài về nhà (rỗng, đã mở rộng), bảng học sinh (đủ 3 trạng thái Có mặt/Đi muộn/Nghỉ có phép), popup "Nhận xét học sinh" (đã có nội dung sẵn). Các selector ở mục 2.3–2.6 phía trên lấy trực tiếp từ mẫu này — không còn là giả định, có thể implement thẳng.

Rủi ro còn lại (chấp nhận được, không chặn implement): tên class css (`jss2722`, `jss2713`...) do MUI style injection nên **có thể đổi số giữa các lần load trang** — ưu tiên match theo text nội dung (`Tổng két`, `Bài về nhà`, `Nhận xét học sinh`, "Không thể viết nhận xét...") và cấu trúc tương đối (header → sibling content) hơn là số class cụ thể, giống cách `LmsAutomator` hiện tại đã làm với `filter({ hasText })`.

## Ngoài phạm vi

- Không đồng bộ buổi cũ hơn buổi gần nhất còn thiếu (chỉ 1 buổi/lớp mỗi lần bấm, theo yêu cầu).
- Không thay đổi luồng soạn tay hiện có (Gemini rewrite vẫn hoạt động như cũ cho nhận xét tự soạn).
- Không đổi tên nút UI ngoài việc gộp hành vi (giữ style/label tương tự, có thể đổi text "Đồng bộ từ LMS").
