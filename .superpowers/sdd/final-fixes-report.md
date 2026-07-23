# Final whole-branch review fixes

Ngày hoàn tất: 2026-07-23

## Kết quả

Đã kiểm chứng từng finding của final whole-branch review trên code hiện tại. Tất cả finding đều đúng về mặt kỹ thuật và đã được sửa bằng test-first:

- Tuần tự hóa toàn bộ workflow LMS dùng chung browser/context bằng `WorkflowMutex`; mutex có FIFO, nhả khóa cả khi operation lỗi, và bao phủ launch/close/open/post/sync.
- Scheduler dùng single-flight cho các `tick()` chồng nhau.
- Scheduler không còn đăng LMS từ plan/content cũ: sau khi mở browser, nó nhận cùng LMS mutex, đọc content mới nhất bên trong mutex, giữ mutex qua side effect và bỏ post nếu trạng thái đã hoàn tất.
- Content repository serialize read-modify-write theo storage key, merge metadata an toàn (`postedToLms` monotonic, hợp nhất absence, giữ timestamp mới nhất) và có API cập nhật riêng metadata.
- Local storage dùng temp path duy nhất và khóa theo target để tránh hai lần ghi đè/rename va chạm nhau.
- Đối sánh tên ưu tiên exact normalized match; partial match chỉ được dùng khi duy nhất. Cùng normalization được dùng cho duplicate LMS rows.
- Session Composer chặn mutation xung đột trong lúc load/save/LMS/AI/PDF, chỉ cho preview khi config đã tải, tải lại content đã persist sau save, và bổ sung trạng thái accessibility.
- Lỗi tải config được giữ riêng, nên một thao tác PDF/AI/save thành công không thể làm mất thông báo trong khi config vẫn `null`.
- So sánh nội dung Quill được normalize để tránh coi khác biệt HTML không có ý nghĩa là save thất bại.
- `zaloSentAt` dùng đồng hồ inject của scheduler, giúp hành vi nhất quán và test deterministic.

## TDD và review độc lập

Các regression test đã được viết để tái hiện lỗi trước khi sửa. Các nhóm RED bao gồm:

- mutex/single-flight/fresh-content;
- lost update và va chạm temp file;
- ambiguous name matching và Quill equality;
- UI loading/operation/config guards;
- TOCTOU giữa lần đọc content và LMS post;
- lỗi config bị thao tác không liên quan xóa;
- timestamp không dùng injected clock.

Vòng review độc lập sau commit đầu phát hiện thêm hai finding Important và hai Minor:

1. Lần đọc mới nhất của scheduler vẫn nằm ngoài LMS post mutex.
2. Lỗi config dùng chung state với lỗi operation nên có thể bị xóa sai.
3. Duplicate row key chưa dùng `normalizeStudentName`.
4. Timestamp Zalo chưa dùng `deps.now`.

Cả bốn đã được xác minh, thêm regression coverage và sửa trong commit follow-up.

## Commits

- `74e5468 fix: serialize automation and preserve session state`
- `f846718 fix: close remaining automation races`

## Verification

Targeted regression suite cuối:

```text
npm.cmd test -- src/main/automation/AutoSendScheduler.test.ts src/main/automation/LmsAutomator.test.ts src/renderer/src/pages/SessionComposer.test.tsx src/shared/lmsSync.test.ts
Test Files  4 passed (4)
Tests       78 passed (78)
```

Full verification trên commit code cuối:

```text
npm.cmd run typecheck
PASS: tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json

npm.cmd test -- --run
Test Files  22 passed (22)
Tests       216 passed (216)

npm.cmd run build
PASS: main, preload và renderer production bundles được build thành công

git diff --check
PASS: không có whitespace error
```

Lần build đầu trong filesystem sandbox thất bại vì esbuild không được phép đọc thư mục cha/config path. Chạy lại đúng cùng lệnh ngoài sandbox đã pass; đây là giới hạn môi trường, không phải lỗi build của code.

## Self-review

- Không mở rộng public behavior ngoài phạm vi findings.
- Shared LMS mutex không bị deadlock: callback độc quyền được cấp `postSessionUnlocked`, không gọi lại public method tự nhận cùng khóa.
- Content được đọc sau khi nhận mutex và khóa được giữ qua LMS side effect, đóng cửa sổ TOCTOU được reviewer nêu.
- Chỉ các file thuộc fix được stage; các thay đổi có sẵn của workspace được giữ nguyên.

## Rủi ro còn lại

- Chưa có fixture/E2E chạy với LMS thật để xác minh selector Playwright và phản hồi Save của backend; coverage hiện tại là unit/static integration.
- JSDOM không thực hiện layout thực, nên chưa có visual QA Electron ở viewport hẹp trong task này.
- Git vẫn cảnh báo không đọc được global ignore tại `C:\Users\Beam1\.config\git\ignore`; cảnh báo này không ảnh hưởng test, build hoặc nội dung commit.
