# Thiết kế: App nhận xét học sinh tự động (Zalo + LMS)

- **Ngày:** 2026-07-16
- **Nền tảng:** App desktop Windows (Electron)
- **Trạng thái:** Bản thiết kế chờ duyệt

---

## 1. Mục tiêu & nghiệp vụ

Giáo viên cần, **mỗi tuần một lần cho mỗi lớp**, đăng nội dung buổi học lên:
- **Nhóm Zalo** của lớp (tin nhắn tổng hợp), và
- **Web LMS công ty** (điền vào trang Comment của từng lớp).

Nội dung mỗi đợt gồm 3 phần:
1. **Nội dung chính buổi học** — nhập tay hoặc trích tự động từ file PDF.
2. **Nhận xét từng học sinh** — nhập thô, AI viết lại khách quan, đúng văn phong giáo viên.
3. **Bài tập về nhà** — giáo viên tự cập nhật.

App cho phép **hẹn giờ theo tuần**; tới giờ tự động đăng LMS rồi gửi Zalo, có các cơ chế an toàn (kiểm tra đăng nhập, kiểm tra đủ nội dung, lọc học sinh nghỉ, không gửi trùng).

### Ràng buộc đã chốt
- **Zalo:** dùng Zalo cá nhân qua **Zalo Web** (không có API chính thức → tự động bằng cách mô phỏng thao tác).
- **LMS:** người dùng chỉ là user thường, không có API → tự động qua giao diện web.
- **AI:** dùng **Gemini API (free tier)** của Google AI Studio — miễn phí và gọi tự động được.
- **Máy phải bật** lúc tới giờ hẹn (không tránh được với nền tảng không có API).

---

## 2. Kiến trúc tổng thể

```
┌──────────────────────────────────────────────────────────┐
│               APP DESKTOP (Electron - Windows)             │
│                                                            │
│  Giao diện nhập liệu ──▶ Bộ xử lý (nền)                    │
│   • Quản lý lớp          • Đọc PDF                          │
│   • Soạn nội dung        • Gọi Gemini API                  │
│   • Xem trước & duyệt    • Bộ hẹn giờ theo tuần            │
│                          • Điều phối đợt gửi               │
│                                │                            │
│                                ▼                            │
│                     Playwright (tự động web)               │
│                      • Tab LMS  • Tab Zalo Web             │
└───────────────┬───────────────────────────┬───────────────┘
                │                           │
                ▼                           ▼
   Kho dữ liệu (chọn 1)           💻 Luôn giữ tại máy
   ☁️ Supabase HOẶC 📁 local      • API key Gemini (riêng mỗi user)
      • Lớp & học sinh             • Phiên đăng nhập Zalo/LMS
      • Nội dung mỗi đợt           (KHÔNG đưa lên cloud)
      • Lịch (suy từ LMS) & trạng thái
      • (Supabase) đăng nhập & phân quyền
```

### Thành phần
- **Giao diện nhập liệu:** quản lý lớp, soạn nội dung theo tuần, xem trước & duyệt.
- **Bộ xử lý nền:** đọc PDF, gọi Gemini, chạy bộ hẹn giờ, điều phối đợt gửi.
- **Playwright:** dùng phiên đăng nhập của người dùng để thao tác LMS & Zalo Web.
- **Supabase:** kho dữ liệu online chung cho nhiều giáo viên (có đăng nhập + phân quyền).

### Phân tách dữ liệu (quan trọng cho bảo mật)
- ☁️ **Lên Supabase (chia sẻ):** lớp/học sinh, nội dung mỗi đợt (bản gốc + bản AI đã duyệt), lịch tuần, trạng thái gửi.
- 💻 **Giữ tại máy (bí mật, không lên cloud):** API key Gemini, phiên đăng nhập Zalo/LMS.
- Dữ liệu chứa **thông tin cá nhân học sinh** → Supabase bật **đăng nhập + Row-Level Security**: mỗi giáo viên chỉ thấy/sửa lớp của mình.

---

## 3. Luồng làm việc hằng tuần & giao diện

### Quản lý lớp — tự động thêm từ LMS
- Nút **"Tự động thêm lớp học"**: app so sánh danh sách lớp hiện có với LMS, **tự thêm các lớp còn thiếu**, kèm:
  - **Danh sách học sinh** của lớp (tải từ LMS).
  - **Số buổi học** của lớp — mỗi buổi **đã kèm sẵn thời điểm diễn ra**.
- Vì mỗi buổi đã có thời điểm, **bộ hẹn giờ tự suy ra lịch** từ LMS (giáo viên không phải nhập tay giờ hẹn cho từng buổi; vẫn chỉnh được nếu muốn).
- Giáo viên **chỉ thấy lớp mình sở hữu** — quyền sở hữu lấy theo lớp tải được từ LMS của tài khoản đó.

### Nhập trước nhiều tuần
- Giáo viên có thể **soạn sẵn nội dung cho nhiều buổi/tuần trước**. Mỗi buổi được gắn với thời điểm của nó; **tới đúng buổi đó app tự gửi**.
- Màn hình lịch hiển thị các buổi sắp tới và trạng thái soạn/gửi của từng buổi.

### Màn hình chính
Danh sách lớp; mỗi lớp một thẻ hiển thị **trạng thái** (`Chưa soạn / Đã soạn / Đã gửi ✅ / Bỏ qua ⏭️`) và **các buổi/giờ hẹn** (suy ra từ LMS).

### Soạn một lớp — 3 khối
**① Nội dung bài học** — chọn 1 trong 2:
- 📝 Tự gõ, hoặc
- 📄 Nạp PDF → Gemini trích mục "nội dung bài học" → bản nháp cho giáo viên **duyệt/sửa**.

**② Nhận xét học sinh** — app hiện **danh sách lớp đã lưu**, mỗi em một ô:
- 📝 Gõ nhận xét thô cạnh tên từng em, hoặc
- 📄 Nạp PDF chứa nhận xét → app trích & khớp theo tên.
- Nút **"AI sửa"** cho mỗi ô → Gemini viết lại khách quan, đúng văn phong → giáo viên **duyệt** (sửa tay hoặc "sửa lại lần nữa").

**③ Bài tập về nhà** — giáo viên tự gõ.

### Xem trước & chốt
Bấm **"Xem trước"** → app dựng sẵn: (a) tin nhắn Zalo hoàn chỉnh, (b) nội dung sẽ điền vào LMS. Giáo viên **duyệt lần cuối** → đặt/xác nhận **giờ hẹn tuần** → lưu.

> **Nguyên tắc an toàn:** AI không bao giờ tự gửi nội dung chưa được giáo viên duyệt. Mọi thứ gửi tự động đều đã được xem trước và chốt.

---

## 4. Xử lý AI (Gemini API free)

Ba tác vụ, mỗi tác vụ một prompt chuẩn hoá:

1. **Trích nội dung bài học từ PDF** — gửi văn bản (hoặc ảnh trang nếu PDF scan) + yêu cầu trích đúng mục nội dung chính, giữ nguyên ý, trình bày gọn. Kết quả là bản nháp để duyệt.
2. **Sửa nhận xét học sinh** — mỗi em: nhận xét thô → viết lại khách quan, đúng văn phong giáo viên, giữ đúng ý gốc, **không bịa**, ~1–2 câu. Có "văn phong mẫu" cấu hình một lần cho nhất quán.
3. **(Tùy chọn, mặc định tắt)** Gợi ý bài tập.

**Ràng buộc an toàn nội dung:** AI chỉ diễn đạt lại ý người nhập, không thêm thông tin bịa; bản gốc luôn được giữ để đối chiếu.

**Giới hạn free tier:** xử lý theo lô có kiểm soát để tránh chạm giới hạn; nếu chạm → báo & cho thử lại, không chặn lớp khác.

**API key theo từng người dùng (đa người dùng):** mỗi giáo viên dùng **một Gemini free riêng**. App có **phần Cấu hình** để mỗi người **tự thêm API key Gemini của mình**. Key lưu an toàn tại máy người đó (không lên cloud, không chia sẻ), chỉ gửi tới Google. Cách này giúp mỗi người có hạn mức free riêng, không tranh nhau giới hạn.

---

## 5. Hẹn giờ & tự động hoá web

### Bộ hẹn giờ
- Lịch **theo tuần cho từng lớp** (vd Lớp A: Thứ 6 20:00 hằng tuần).
- Máy tắt/app chưa mở lúc tới giờ → khi mở lại app **nhắc các lớp tới hạn chưa gửi** để bấm "Tiếp tục".

### Trình tự một đợt gửi
```
Tới giờ hẹn (hoặc bấm "Tiếp tục")
    │
    ▼
[Tầng 1] Vào được CẢ Zalo Web lẫn LMS? ──No──▶ Chỉ hiện thông báo, DỪNG (không gửi gì)
    │Yes
    ▼
Duyệt từng lớp CHƯA "Đã gửi":
    ├─ Bật "Nghỉ tuần này"?     ──Yes──▶ Bỏ qua lớp ⏭️
    ├─ [Tầng 2] Thiếu nội dung? ──Yes──▶ Bỏ qua lớp ⏭️ (ghi log)
    └─ Đủ nội dung:
         [1] Vào LMS: Classes → mã lớp → Comment
         [2] Đọc điểm danh trên trang LMS → danh sách em NGHỈ
         [3] Loại nhận xét các em nghỉ (khỏi CẢ LMS lẫn tin Zalo)
         [4] Đăng LMS (chỉ em có mặt)
         [5] Gửi Zalo (tin đã loại em nghỉ)
         → đánh dấu "Đã gửi ✅"
    │
    ▼
Báo cáo cuối: lớp nào đã gửi, lớp nào bỏ qua & vì sao
```

### Nút "Tiếp tục" (chống gửi trùng)
- App theo dõi **trạng thái từng lớp** mỗi đợt.
- Bấm "Tiếp tục" → chỉ xử lý lớp **chưa "Đã gửi"**, không gửi lại lớp đã gửi.
- Bấm nhiều lần được, tới khi tất cả `Đã gửi`.

### Quy tắc lọc học sinh nghỉ
- Điểm danh **đọc trực tiếp từ trang Comment của LMS** (trang đã hiển thị sẵn ai nghỉ).
- Em đã nghỉ nhưng vẫn có nhận xét → app **tự loại**: không comment trên LMS **và** xóa khỏi tin Zalo.

### Thứ tự chốt: **LMS trước, Zalo sau** (vì điểm danh nằm ở LMS).

### Tìm nhóm Zalo & định dạng tin nhắn
- **Tìm nhóm:** trên Zalo Web, app **gõ đúng mã lớp vào thanh tìm kiếm** → chọn đúng nhóm → mở khung chat.
- **Một tin nhắn dài duy nhất:** app **nối cả 3 phần** (nội dung bài học + nhận xét từng em + bài tập về nhà) thành **một tin nhắn**, theo **format do người dùng định nghĩa**. Nhận xét của em nghỉ đã được loại trước khi ghép.
- **Khu cấu hình "Mẫu tin nhắn Zalo":** người dùng **tự định nghĩa/chỉnh format** tại đây, dùng các biến chèn (vd `{ten_lop}`, `{noi_dung_bai_hoc}`, `{danh_sach_nhan_xet}`, `{bai_tap_ve_nha}`, `{ngay_buoi_hoc}`...).
- **Có sẵn template mặc định** do bạn (chủ dự án) định nghĩa; người dùng có thể dùng luôn hoặc sửa. Template mặc định — xem Phụ lục A.

### Ràng buộc & bảo trì (nói thẳng)
- Tự động hoạt động bằng cách khớp đúng **nút/ô của LMS** và **nhóm Zalo**. Khi LMS/Zalo **đổi giao diện**, kịch bản có thể hỏng và cần chỉnh lại — đây là **điểm bảo trì chính**.
- **"Chế độ chạy thử" (an toàn):** chạy tới bước cuối nhưng **dừng trước khi Gửi/Đăng**, cho xem đã điền đúng chưa rồi mới cho chạy thật.
- **Cần cung cấp ở giai đoạn triển khai:** ảnh chụp/mô tả trang **Comment của LMS** và cách chọn **nhóm Zalo** để "chỉ đường" chính xác.

---

## 6. Lưu trữ dữ liệu, xử lý lỗi

### Lưu trữ — 2 lựa chọn backend (người dùng chọn)
App cho phép **mỗi người dùng chọn nơi lưu dữ liệu lớp/nội dung**:

**Lựa chọn A — Supabase (kho online chung):**
- Lớp & học sinh (mã lớp, tên, mapping tới nhóm Zalo + trang LMS), nội dung mỗi đợt (bài học, nhận xét gốc + bản AI đã duyệt, bài tập), lịch (suy từ LMS), trạng thái gửi.
- Có đăng nhập + phân quyền RLS. Hợp khi muốn dùng nhiều máy / nhiều người / có sao lưu cloud.

**Lựa chọn B — Thư mục local do người dùng chỉ định:**
- Toàn bộ dữ liệu lưu vào **thư mục người dùng tự chọn** trên máy họ (file cục bộ).
- Hợp khi muốn giữ dữ liệu tại máy, offline, tự sao lưu bằng cách copy thư mục.
- Vì mỗi giáo viên chỉ thao tác lớp của mình nên bản local vẫn dùng tốt cho một người.

> Bất kể chọn A hay B: **API key Gemini và phiên đăng nhập Zalo/LMS luôn giữ tại máy**, không đưa lên cloud.

### Mô hình nhiều người dùng
- **Mỗi giáo viên chỉ xem được lớp mình sở hữu.** Quyền sở hữu **lấy từ LMS** — lớp nào tài khoản LMS của họ tải xuống được thì là của họ.
- Với backend Supabase: RLS đảm bảo mỗi người chỉ đọc/sửa lớp của mình.
- Với backend local: dữ liệu vốn nằm tại máy từng người nên tách biệt tự nhiên.

### Xử lý lỗi (quy tắc)
- Không vào được web (Tầng 1) → chỉ thông báo, không làm gì.
- Lớp thiếu nội dung / bật "nghỉ tuần này" → bỏ qua lớp đó, ghi log.
- Gemini lỗi/chạm giới hạn → báo, cho thử lại, không chặn lớp khác.
- Tự động web gặp nút/ô lạ (giao diện đổi) → **dừng an toàn**, chụp màn hình lỗi, không gửi bừa.
- Mỗi đợt có **báo cáo cuối**: đã gửi lớp nào, bỏ qua lớp nào & vì sao.

---

## 7. Phạm vi bản đầu tiên (MVP) — theo thứ tự

1. **Nền tảng app + lưu trữ** — chọn backend (Supabase / thư mục local), cấu hình **API key Gemini riêng** cho người dùng.
2. **Quản lý lớp** — nút **"Tự động thêm lớp"** từ LMS (danh sách học sinh + số buổi kèm thời điểm); mỗi GV chỉ thấy lớp của mình.
3. **Nhập liệu + Gemini** (trích PDF, sửa nhận xét, xem trước, **soạn trước nhiều tuần**) — *dùng được ngay để soạn dù gửi tay*.
4. **Tự động LMS** (điền + đọc điểm danh + lọc em nghỉ) ở **chế độ chạy thử**.
5. **Tự động Zalo Web** (tìm nhóm bằng mã lớp, gửi 1 tin dài theo format cố định) ở chế độ chạy thử.
6. **Hẹn giờ theo buổi (suy từ LMS) + nút "Tiếp tục" + báo cáo** → bật chạy thật.

> Cách chia này cho **công cụ soạn nội dung dùng được từ bước 2**, rồi mới tới phần tự động hoá (khó & cần bảo trì).

---

## 8. Rủi ro chính & cách giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Zalo Web đăng xuất (đăng nhập máy khác) | Tầng 1 kiểm tra đăng nhập; lỗi thì chỉ thông báo, không gửi; "Tiếp tục" sau khi đăng nhập lại |
| LMS/Zalo đổi giao diện → kịch bản hỏng | Chế độ chạy thử; dừng an toàn khi gặp phần tử lạ; thiết kế selector dễ chỉnh |
| Gemini free chạm giới hạn | Xử lý theo lô; báo & cho thử lại; không chặn lớp khác |
| Gửi trùng | Theo dõi trạng thái từng lớp; "Tiếp tục" bỏ qua lớp đã gửi |
| Lộ thông tin học sinh | Phân quyền RLS trên Supabase; bí mật (key, phiên) giữ tại máy |
| Máy tắt lúc tới giờ | Nhắc lại các lớp tới hạn chưa gửi khi mở app |

---

## 9. Điểm cần làm rõ ở bước lập kế hoạch (chưa cần ngay)
- Cấu trúc trang Comment của LMS (nhãn nút, ô nhập, cách hiển thị điểm danh).
- Cấu trúc trang LMS để **tự thêm lớp**: nơi lấy danh sách lớp, danh sách học sinh, danh sách buổi + thời điểm.
- **Format cố định của tin nhắn Zalo** (bố cục 3 phần) — giáo viên định nghĩa mẫu.
- Định dạng file PDF nội dung bài học (text hay scan).
- Repo GitHub người dùng sẽ tạo (cần URL remote để mình kết nối).

---

## Phụ lục A — Template mặc định tin nhắn Zalo

Đây là mẫu mặc định app tải sẵn cho mọi người dùng (họ có thể sửa lại).

**Template (dạng có biến chèn):**
```
@All Em xin gửi nhận xét buổi học của các học sinh lớp {ten_lop} ngày {ngay_buoi_hoc} ạ
Nội dung bài học:
{noi_dung_bai_hoc}
Nhận xét từng học sinh:
{danh_sach_nhan_xet}
Bài tập về nhà:
{bai_tap_ve_nha}
Cảm ơn phụ huynh và các con!
```

**Ghi chú về biến:**
- `{danh_sach_nhan_xet}` được app dựng thành nhiều dòng, mỗi em một dòng dạng `Tên: nhận xét` (vd `A: ...`, `B: ...`). **Em nghỉ đã bị loại** khỏi danh sách này.
- `{ten_lop}`, `{ngay_buoi_hoc}` lấy từ dữ liệu lớp/buổi (đồng bộ từ LMS).
- `{noi_dung_bai_hoc}`, `{bai_tap_ve_nha}` lấy từ phần soạn của giáo viên.
- `@All` để nhắc toàn nhóm. **Lưu ý kỹ thuật:** trên Zalo, `@All` là thao tác mention đặc biệt — app phải **gõ `@` rồi chọn "Tất cả"** từ danh sách gợi ý, chứ dán chuỗi "@All" thường sẽ không ping. Xử lý ở bước tự động Zalo.
