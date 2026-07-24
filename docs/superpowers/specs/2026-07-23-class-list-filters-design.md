# Bộ lọc danh sách lớp

## Mục tiêu

Thêm thanh lọc đơn giản trên màn `Lớp học` để người dùng tập trung vào lớp đang diễn ra và nhanh chóng lọc theo nhóm chương trình.

## Phạm vi

Phase này chỉ thay đổi cách hiển thị danh sách lớp trong renderer. Không thay đổi dữ liệu lớp đã lưu, repository, IPC, scheduler hoặc hành vi gửi LMS/Zalo.

## Trạng thái lớp

Thanh lọc có ba lựa chọn:

- `Chưa bắt đầu`
- `Đang diễn ra`
- `Đã kết thúc`

Khi màn hình được mở lần đầu, chỉ `Đang diễn ra` được chọn. Người dùng phải tự bật `Chưa bắt đầu` hoặc `Đã kết thúc` nếu muốn xem các lớp đó.

Các lựa chọn trạng thái là checkbox nhiều lựa chọn. Một lớp được hiển thị khi trạng thái do `getClassStatus()` tính ra nằm trong tập trạng thái đang chọn. Nếu bỏ chọn cả ba trạng thái thì danh sách kết quả rỗng.

## Loại lớp

Loại lớp được suy ra từ ký tự đầu tiên ngay sau dấu `-` đầu tiên trong mã lớp, không phân biệt chữ hoa/chữ thường:

- `R` → `Robotics`
- `G` → `Game`
- `J` → `Web`
- `S` → `Scratch`

Ví dụ:

- `ABC-R01` → `Robotics`
- `MD-G02` → `Game`
- `C-J03` → `Web`
- `X-S04` → `Scratch`

Mã không có dấu `-`, không có ký tự sau dấu `-`, hoặc có ký tự khác `R/G/J/S` được xếp loại `Khác`.

Thanh lọc hiển thị bốn lựa chọn `Robotics`, `Game`, `Web`, `Scratch`; mặc định chọn cả bốn. Khi cả bốn lựa chọn đều đang bật, lớp loại `Khác` vẫn được hiển thị để trạng thái mặc định không làm mất lớp chưa nhận diện. Khi người dùng tắt bất kỳ lựa chọn loại nào, `Khác` bị ẩn vì người dùng đã chủ động thu hẹp theo loại. Nếu bỏ chọn cả bốn loại thì danh sách kết quả rỗng.

## Tổ hợp và hiển thị

Hai nhóm lọc kết hợp theo phép AND:

1. lớp phải khớp một trạng thái đang chọn;
2. lớp phải khớp một loại đang chọn, hoặc thuộc `Khác` khi cả bốn loại đều được chọn.

Thanh lọc đặt phía trên danh sách thẻ lớp và không làm thay đổi bố cục bên trong thẻ. Hiển thị `Đang xem X/Y lớp`, trong đó `X` là số lớp sau lọc và `Y` là tổng số lớp đã tải.

Nếu đã tải được lớp nhưng không có lớp nào khớp, hiển thị `Không có lớp phù hợp với bộ lọc.` thay cho danh sách rỗng chung. Thông báo `Chưa có lớp nào.` chỉ dùng khi repository thực sự không có lớp.

Bộ lọc chỉ là state của màn hình, không lưu vào cấu hình. Mỗi lần app khởi động lại, giá trị mặc định được áp dụng lại.

## Kiến trúc

Tạo module shared nhỏ chịu trách nhiệm:

- `getClassProgram(code)` nhận mã lớp và trả về `robotics | game | web | scratch | other`;
- `filterClasses(classes, filters, now)` trả về danh sách lớp thỏa điều kiện.

`ClassesPage` chỉ giữ state checkbox, gọi hàm shared để tạo `visibleClasses`, rồi render danh sách kết quả. Cách tách này giữ logic nhận diện mã và tổ hợp điều kiện độc lập với JSX.

## Lỗi và dữ liệu đặc biệt

- Chuẩn hóa ký tự loại bằng `toUpperCase()`.
- Không throw với mã rỗng hoặc mã sai định dạng; trả về `other`.
- Dùng cùng một giá trị `now` cho toàn bộ lượt lọc để trạng thái các lớp nhất quán.
- Việc tải/sửa/xóa/đồng bộ lớp vẫn thao tác trên danh sách đầy đủ; bộ lọc chỉ quyết định các thẻ đang hiển thị.

## Kiểm thử

- Nhận diện đúng `R/G/J/S` ngay sau dấu `-`.
- Nhận diện không phân biệt hoa/thường.
- Mã thiếu/sai ký tự được xếp `other`.
- Mặc định chỉ hiển thị lớp đang diễn ra.
- Bật thêm trạng thái hiển thị đúng hợp của các trạng thái.
- Lọc loại hoạt động cùng bộ lọc trạng thái theo AND.
- `other` hiện khi cả bốn loại bật và ẩn khi người dùng thu hẹp loại.
- Bỏ chọn hết trạng thái hoặc loại cho kết quả rỗng.
- UI hiển thị đúng `X/Y` và thông báo không có kết quả.
- Full test, typecheck và production build đạt.
