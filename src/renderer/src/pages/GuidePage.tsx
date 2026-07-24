export default function GuidePage(): JSX.Element {
  return (
    <div className="page guide-page">
      <h1 style={{ marginBottom: 6 }}>Hướng dẫn sử dụng</h1>
      <p className="text-muted" style={{ marginTop: 0, marginBottom: 24 }}>
        MindX Auto Comment giúp bạn soạn nhận xét, gửi lên LMS và gửi tin Zalo cho phụ huynh — thủ công hoặc tự động theo lịch.
      </p>

      <nav className="guide-toc card card-pad">
        <strong>Nội dung</strong>
        <ol>
          <li><a href="#gd-batdau">1. Chuẩn bị lần đầu (Cấu hình)</a></li>
          <li><a href="#gd-dongbo">2. Đồng bộ lớp & nội dung từ LMS</a></li>
          <li><a href="#gd-lop">3. Quản lý & lọc lớp học</a></li>
          <li><a href="#gd-soan">4. Soạn nội dung một buổi</a></li>
          <li><a href="#gd-lms">5. Gửi nhận xét lên LMS</a></li>
          <li><a href="#gd-zalo">6. Gửi tin Zalo</a></li>
          <li><a href="#gd-auto">7. Tự động gửi theo lịch</a></li>
          <li><a href="#gd-trangthai">8. Trạng thái học sinh (nghỉ buổi / nghỉ dài hạn)</a></li>
          <li><a href="#gd-suco">9. Xử lý sự cố thường gặp</a></li>
        </ol>
      </nav>

      <section id="gd-batdau" className="section">
        <h2>1. Chuẩn bị lần đầu (tab Cấu hình)</h2>
        <p>Vào tab <strong>Cấu hình</strong> và thiết lập theo thứ tự:</p>
        <ul className="guide-list">
          <li><strong>Kho dữ liệu → Chọn thư mục</strong>: chọn một thư mục trên máy để app lưu lớp học và nội dung. Bắt buộc làm trước, nếu không tab Lớp học sẽ báo lỗi.</li>
          <li><strong>Gemini API key</strong>: dán API key (lấy tại Google AI Studio), bấm <em>Kiểm tra key</em> để xác nhận hợp lệ. Dùng để "Sửa nhận xét bằng AI".</li>
          <li><strong>Model Gemini</strong>: đổi model khi một model hết quota miễn phí trong ngày (mỗi model có hạn mức riêng). Nhớ bấm <em>Lưu</em>.</li>
          <li><strong>Mẫu tin nhắn Zalo</strong>: chỉnh khung tin gửi phụ huynh. Dùng các biến như <code>{'{ten_lop}'}</code>, <code>{'{ngay_buoi_hoc}'}</code>, <code>{'{noi_dung_bai_hoc}'}</code>, <code>{'{danh_sach_nhan_xet}'}</code>, <code>{'{bai_tap_ve_nha}'}</code>.</li>
          <li><strong>Văn phong nhận xét</strong>: mô tả giọng văn để Gemini viết lại nhận xét. Có thể bật <em>“lồng nội dung bài học vào ngữ cảnh”</em> để nhận xét sát bài hơn (nếu buổi chưa có nội dung bài học thì app tự bỏ qua phần lồng ghép).</li>
          <li><strong>Tài khoản LMS</strong>: nhập email + mật khẩu LMS. Giá trị được lưu ngay khi rời khỏi ô — app dùng để tự đăng nhập LMS khi cần.</li>
        </ul>
      </section>

      <section id="gd-dongbo" className="section">
        <h2>2. Đồng bộ lớp & nội dung từ LMS</h2>
        <p>Ở tab <strong>Lớp học</strong>, bấm <strong>Đồng bộ từ LMS</strong>. Một cửa sổ trình duyệt sẽ mở — nếu chưa đăng nhập, hãy đăng nhập LMS trong cửa sổ đó (app chờ tối đa 3 phút).</p>
        <ul className="guide-list">
          <li><strong>Thêm lớp mới</strong>: các lớp đang diễn ra trên LMS mà app chưa có sẽ hiện trong danh sách xem trước — bấm <em>Nhập tất cả vào app</em>.</li>
          <li><strong>Cập nhật nội dung buổi mới nhất</strong>: với lớp đã có, app lấy nội dung + điểm danh buổi gần nhất. App <strong>giữ nguyên</strong> nội dung/nhận xét bạn đã soạn, chỉ cập nhật điểm danh (đi học / nghỉ).</li>
          <li>Sau khi đồng bộ, thông báo cho biết <strong>đã cập nhật nội dung cho lớp nào</strong> và bỏ qua lớp nào (LMS chưa có nội dung buổi mới nhất).</li>
        </ul>
      </section>

      <section id="gd-lop" className="section">
        <h2>3. Quản lý & lọc lớp học</h2>
        <ul className="guide-list">
          <li><strong>Bộ lọc</strong> đầu trang: chọn <em>Trạng thái</em> (dropdown) và <em>Loại lớp</em> (chip). Số "Đang xem X/Y lớp" cho biết đang lọc còn bao nhiêu.</li>
          <li><strong>Thêm lớp</strong> thủ công bằng nút <em>+ Thêm lớp</em>; sửa/xóa bằng 2 nút biểu tượng ở góc phải mỗi thẻ lớp.</li>
          <li>Trong màn sửa lớp, bạn có thể đánh dấu <strong>“Đã nghỉ học”</strong> cho từng học sinh (nghỉ dài hạn — xem mục 8).</li>
        </ul>
      </section>

      <section id="gd-soan" className="section">
        <h2>4. Soạn nội dung một buổi</h2>
        <p>Trên thẻ lớp, mỗi buổi có nút <strong>Soạn nội dung</strong> / <strong>Xem·Sửa nội dung</strong>.</p>
        <ul className="guide-list">
          <li><strong>Nội dung bài học</strong>: nhập tay, hoặc bấm <em>Nạp PDF & trích</em> để trích nội dung từ file PDF giáo án.</li>
          <li><strong>Nhận xét học sinh</strong>: nhập nhận xét thô cho từng em, rồi bấm <em>Sửa tất cả bằng AI</em> để Gemini viết lại đồng loạt (tiết kiệm token — gộp cả lớp trong 1 lần gọi). Có nút <em>Hoàn tác tất cả</em> để quay lại bản thô.</li>
          <li><strong>Bài tập về nhà</strong>: nhập nếu có (để trống thì không cập nhật mục này trên LMS).</li>
          <li>Bấm <strong>Lưu</strong> để giữ nội dung; <strong>Xem trước Zalo</strong> để xem/copy tin nhắn.</li>
        </ul>
      </section>

      <section id="gd-lms" className="section">
        <h2>5. Gửi nhận xét lên LMS</h2>
        <p>Bấm <strong>Gửi lên LMS</strong>. App tự điều khiển trình duyệt: mở lớp → tab Nhận xét → chọn đúng buổi → điền Tổng kết/Bài về nhà → ghi nhận xét từng học sinh (tự chuyển sang chế độ nhận xét tự do khi cần).</p>
        <ul className="guide-list">
          <li>Kết quả chia 3 nhóm: <strong>Đã nhận xét</strong>, <strong>Học sinh nghỉ</strong>, và <strong>Bỏ qua do lỗi/thiếu nội dung</strong>.</li>
          <li>Học sinh <strong>nghỉ dài hạn</strong> được loại khỏi việc gửi LMS.</li>
          <li>Một số buổi đặc biệt (ví dụ buổi kiểm tra) có thể bị khóa gửi LMS — app sẽ báo rõ.</li>
        </ul>
      </section>

      <section id="gd-zalo" className="section">
        <h2>6. Gửi tin Zalo</h2>
        <p>Sau khi có bản xem trước, bấm <strong>Gửi Zalo</strong>. Nút này <strong>không gửi lại LMS</strong> — chỉ cần biết điểm danh (ai đi học / ai nghỉ) để dựng tin.</p>
        <ul className="guide-list">
          <li>Điều kiện gửi: mọi học sinh còn học phải đã biết trạng thái (đi học hoặc nghỉ). Nếu thiếu, app báo <em>“Chưa đủ thông tin điểm danh — hãy Gửi lên LMS hoặc Đồng bộ từ LMS trước.”</em></li>
          <li>Lỗi kỹ thuật khi ghi nhận xét một em <strong>không</strong> chặn gửi Zalo, miễn là đã biết em đó đi học.</li>
          <li>Học sinh nghỉ buổi hiện dạng <code>Tên: nghỉ</code>; học sinh nghỉ dài hạn bị loại khỏi tin.</li>
        </ul>
      </section>

      <section id="gd-auto" className="section">
        <h2>7. Tự động gửi theo lịch</h2>
        <p>Trên mỗi thẻ lớp có dòng <strong>Tự động gửi</strong>:</p>
        <ul className="guide-list">
          <li>Bật <strong>LMS</strong> và/hoặc <strong>Zalo</strong> để tự động gửi kênh tương ứng.</li>
          <li>Chọn <strong>giờ</strong> và <strong>ngày</strong> gửi: <em>Cùng ngày</em> buổi học hoặc <em>Hôm sau</em> buổi học.</li>
          <li>App kiểm tra mỗi phút. Nếu lúc tới giờ hẹn app chưa mở, khi mở lại sẽ hiện danh sách <strong>gửi bù</strong> để bạn xác nhận.</li>
          <li>Zalo tự động dùng cùng điều kiện điểm danh như gửi tay (mục 6).</li>
        </ul>
      </section>

      <section id="gd-trangthai" className="section">
        <h2>8. Trạng thái học sinh</h2>
        <ul className="guide-list">
          <li><strong>Nghỉ buổi</strong> (1 buổi): lấy từ điểm danh LMS. Hiện <code>Tên: nghỉ</code> trong Zalo, bỏ qua ghi nhận xét LMS buổi đó.</li>
          <li><strong>Nghỉ dài hạn / đã nghỉ học</strong>: học sinh không còn trong danh sách nhận xét trên LMS sẽ được tự đánh dấu khi đồng bộ; bạn cũng có thể tự bật/tắt trong màn sửa lớp. Học sinh này bị <strong>loại khỏi cả Zalo lẫn LMS</strong> ở mọi buổi.</li>
        </ul>
      </section>

      <section id="gd-suco" className="section">
        <h2>9. Xử lý sự cố thường gặp</h2>
        <ul className="guide-list">
          <li><strong>Kẹt ở “Đang kết nối LMS…”</strong>: kiểm tra cửa sổ trình duyệt vừa mở và đăng nhập LMS trong đó, rồi thử lại.</li>
          <li><strong>Gemini báo hết quota (429)</strong>: đổi sang API key khác hoặc đổi model trong Cấu hình (mỗi model/khóa có hạn mức riêng), rồi khởi động lại app.</li>
          <li><strong>Đổi cấu hình không có tác dụng</strong>: một số thay đổi cần tắt hẳn app và mở lại (không chỉ đóng cửa sổ).</li>
          <li><strong>Một học sinh gửi LMS lỗi</strong>: app lưu file gỡ lỗi trong thư mục dữ liệu LMS (userData) — giữ lại để nhờ hỗ trợ chỉnh nếu giao diện LMS thay đổi.</li>
        </ul>
      </section>
    </div>
  )
}
