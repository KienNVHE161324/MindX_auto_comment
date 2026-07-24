# Milestone 3 — Content Composition + Gemini Implementation Plan

> Steps dùng checkbox. TDD, commit theo đơn vị typecheck-xanh.

**Goal:** Soạn nội dung mỗi buổi: nội dung bài học (gõ tay hoặc trích từ PDF bằng Gemini), nhận xét từng học sinh (Gemini sửa văn phong), bài tập về nhà; xem trước tin nhắn Zalo theo template; lưu nội dung buổi. Không cần LMS.

**Architecture:** Gemini `generateContent` (một hàm `callGemini` dùng chung; PDF gửi qua `inline_data`). Nội dung buổi lưu qua `StorageProvider` collection `contents` (id = sessionId) bằng `ContentRepository`. Preview là hàm thuần điền template. Main thêm handler đọc file PDF → base64 → Gemini, và rewrite comment (đọc key + styleHint từ config). UI thêm `SessionComposer`.

**Tech Stack:** kế thừa M1/M2.

## Global Constraints
- TypeScript strict.
- Gọi Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=...`, body `{ contents: [{ parts }] }`, đọc `candidates[0].content.parts[0].text`. `fetchFn` inject được để test.
- Bí mật (key) chỉ ở main; renderer không thấy key.
- Nội dung buổi: collection `contents`, id = `sessionId`.
- Biến template Zalo: `{ten_lop}`, `{ngay_buoi_hoc}`, `{noi_dung_bai_hoc}`, `{danh_sach_nhan_xet}`, `{bai_tap_ve_nha}`.

## File Structure
```
src/shared/types.ts     # + StudentComment, SessionContent; + config.commentStyleHint; + AppApi/IPC
src/main/gemini/geminiClient.ts   # + callGemini, extractLessonContent, rewriteComment
src/main/content/ContentRepository.ts
src/shared/zaloTemplate.ts        # fillTemplate, formatCommentLines, formatSessionDate (thuần)
src/main/ipcHandlers.ts           # + content/gemini handlers
src/main/index.ts / preload       # wiring + pickPdf
src/renderer/src/pages/SessionComposer.tsx
src/renderer/src/pages/ClassesPage.tsx  # + nút "Soạn" theo buổi
src/renderer/src/pages/SettingsPage.tsx # + ô "Văn phong nhận xét"
```

---

### Task 1: Types + config styleHint + AppApi/IPC (backend types)
- `StudentComment { studentId: string; raw: string; polished: string }`
- `SessionContent { id: string; classId: string; sessionId: string; lessonContent: string; homework: string; comments: StudentComment[] }`
- `AppConfig` + `commentStyleHint: string` (DEFAULT: "nhẹ nhàng, khách quan, đúng mực, đúng văn phong giáo viên tiểu học").
- `AppApi` + `getContent(sessionId): Promise<SessionContent | null>`, `saveContent(c: SessionContent): Promise<void>`, `extractLessonFromPdf(): Promise<string>`, `rewriteComment(studentName: string, raw: string): Promise<string>`.
- `IPC` + `getContent:'content:get'`, `saveContent:'content:save'`, `extractLessonFromPdf:'gemini:extractPdf'`, `rewriteComment:'gemini:rewrite'`.

Vì mở rộng AppApi ràng buộc type, gộp Task 1–5 (backend) thành một commit typecheck-xanh (như M2).

### Task 2: ContentRepository
`class ContentRepository { constructor(storage: StorageProvider); get(sessionId): Promise<SessionContent|null>; save(c: SessionContent): Promise<void> }` — collection `contents`, key = `c.sessionId`. Test bằng LocalStorageProvider + tmpdir (get null, save→get, ghi đè).

### Task 3: Gemini generate
`callGemini(apiKey, parts, fetchFn?)`, `extractLessonContent(apiKey, pdfBase64, fetchFn?)`, `rewriteComment(apiKey, studentName, raw, styleHint, fetchFn?)`. Test (mock fetchFn): trả text khi 200; ném lỗi khi !ok; ném lỗi khi thiếu candidates; extract gửi `inline_data` pdf; rewrite prompt chứa styleHint + tên + nhận xét thô.

### Task 4: Preview builder (thuần)
`fillTemplate(template, data)` thay `{key}` bằng `data[key]` (giữ nguyên nếu không có key); `formatCommentLines(items: {name,text}[])` → mỗi dòng `name: text`; `formatSessionDate(iso)` → `dd/mm/yyyy HH:mm` (rỗng nếu iso rỗng). Test đầy đủ.

### Task 5: IPC wiring + pickPdf + preload
- ipcHandlers + `getContent/saveContent` (qua `getContentRepository`), `extractLessonFromPdf` (qua dep `extractPdf`), `rewriteComment` (qua dep `rewrite`).
- main: `getContentRepository()` (như getRepository); `pickPdf()` dialog openFile filter pdf → đọc `fs.readFile` → base64 → `extractLessonContent(key,...)`; `rewriteComment` đọc key + styleHint từ config. Đăng ký 4 kênh; preload expose 4 method.

### Task 6: UI — SettingsPage styleHint + SessionComposer + ClassesPage compose entry
- SettingsPage: thêm ô `<label>Văn phong nhận xét` textarea gắn `commentStyleHint`.
- `SessionComposer({ cls, session, onDone })`: tải content theo `session.id` khi mount (nếu null → khởi tạo rỗng, comments = từ roster lớp). Khối: (1) nội dung bài học textarea + nút "Nạp PDF & trích" gọi `extractLessonFromPdf` → điền; (2) mỗi học sinh: raw textarea + nút "AI sửa" gọi `rewriteComment(name, raw)` → điền polished (textarea sửa được); (3) bài tập textarea; (4) nút "Xem trước" hiển thị tin Zalo (dùng fillTemplate + formatCommentLines + formatSessionDate + config.zaloMessageTemplate); (5) nút "Lưu" gọi `saveContent`. Bắt lỗi mọi call, hiển thị.
- ClassesPage: mỗi buổi của lớp có nút "Soạn nội dung" → mở SessionComposer.

## Nghiệm thu M3
- Full suite xanh; typecheck + build OK.
- Soạn được nội dung buổi, trích PDF (với key thật), AI sửa nhận xét, xem trước tin Zalo, lưu & tải lại.

## Ngoài phạm vi M3
- Tự động thêm lớp từ LMS; tự động hoá Playwright (LMS + Zalo); hẹn giờ — milestone sau.
