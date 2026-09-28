# Quản lý dự án, chấm công & tính lương

Node.js + Express (backend) · React + Vite (frontend) · SQL Server · phát triển trên VS Code.

```
pm-payroll/
├─ database/schema.sql      # tạo database + bảng (chạy trước)
├─ backend/                 # REST API
│  ├─ src/routes/           # auth, users, projects, timesheets, leaves, payroll, reports
│  ├─ src/services/         # payrollCalc (tính lương), payrollService, payslipPdf, timesheetService
│  ├─ scripts/seed.js       # dữ liệu mẫu
│  └─ test/                 # unit test tính lương
├─ frontend/                # giao diện React
└─ samples/timesheet-import.csv   # file mẫu import chấm công
```

## 1. Chuẩn bị
- Node.js 18+ (khuyến nghị 20/22), SQL Server (Developer/Express đều được).
- SQL Server cần bật **SQL Server Authentication** và có một SQL Login (ví dụ `sa`) — backend dùng đăng nhập SQL, không dùng Windows Authentication.
- VS Code + extension **SQL Server (mssql)** (đã gợi ý sẵn trong `.vscode/extensions.json`).

## 2. Tạo database
Mở `database/schema.sql` trong VS Code, kết nối tới SQL Server bằng extension mssql rồi bấm **Execute Query** (Ctrl+Shift+E). File tự tạo database `PmPayroll`, các bảng và một chính sách lương mặc định.

## 3. Chạy backend
```bash
cd backend
cp .env.example .env      # sửa DB_USER, DB_PASSWORD, JWT_SECRET
npm install
npm run seed              # tạo tài khoản + dữ liệu mẫu (chạy một lần)
npm run dev               # http://localhost:4000  (kiểm tra: /api/health)
npm test                  # unit test tính lương
```
SQL Server dùng named instance (ví dụ `SQLEXPRESS`)? Xoá `DB_PORT` trong `.env` và đặt `DB_INSTANCE=SQLEXPRESS`.

## 4. Chạy frontend
```bash
cd frontend
npm install
npm run dev               # http://localhost:5173 (tự proxy /api sang backend)
```

Tài khoản mẫu (mật khẩu chung `Matkhau@123`): `admin@example.com`, `pm@example.com`, `nv1@example.com`, `nv2@example.com`, `ketoan@example.com`.

## 5. Luồng nghiệp vụ
1. **PM** tạo dự án → gói việc → công việc, phân công nhân viên; theo dõi bằng Kanban (kéo thả).
2. **Nhân viên** chấm công (nhập tay hoặc Check-in/Check-out) → **gửi duyệt** theo tuần.
3. **PM/Admin** duyệt hoặc từ chối (bắt buộc ghi lý do). PM chỉ duyệt tuần có công của dự án mình quản lý; không ai tự duyệt của mình.
4. **Nhân viên** gửi đơn nghỉ phép → PM/Admin duyệt.
5. **Kế toán/Admin** tạo kỳ lương tháng → hệ thống tính phiếu lương từ timesheet đã duyệt → chỉnh khấu trừ khác → **Chốt kỳ**. Sau khi chốt: khoá sửa, nhân viên xem/tải phiếu lương PDF, kế toán xuất CSV.
6. **Báo cáo**: burn-down, chi phí theo dự án, năng suất.

Phân quyền: Admin (tất cả) · PM (dự án của mình, duyệt timesheet/nghỉ phép) · Nhân viên (dữ liệu của mình) · Kế toán (kỳ lương, phiếu lương, CSV, báo cáo; không sửa dự án).

## 6. Quy tắc tính lương (trong `backend/src/services/payrollCalc.js`)
- Giờ làm được **làm tròn đến phút gần nhất ngay lúc chấm công** (check-in/check-out; nhập tay đã là phút nguyên). Lưu dạng phút → không sai số dấu phẩy động.
- **OT**: phần vượt 8 giờ/ngày (tính từng ngày), một mức hệ số 200%. Giờ nghỉ phép **không** cộng vào ngưỡng 8 giờ, chỉ giờ làm thực tế mới xét OT.
- Tiền tính bằng số nguyên VND, mỗi khoản làm tròn half-up **một lần**; tổng = tổng các khoản đã làm tròn.
- Kỳ lương theo **tháng**, theo ngày làm việc của từng dòng chấm công.
- Phiếu lương PDF ghi đủ các mục tại Khoản 3 Điều 95 Bộ luật Lao động 2019: tiền lương, tiền lương làm thêm giờ, tiền lương làm việc ban đêm, nội dung và số tiền bị khấu trừ. Nếu công ty có mẫu riêng bắt buộc, chỉnh trong `backend/src/services/payslipPdf.js`.

## 7. Import chấm công
Admin gọi `POST /api/timesheets/import` (multipart, field `file`) với CSV như `samples/timesheet-import.csv` (`email,date,start,end,project_code,note`). Dòng hợp lệ vào **timesheet nháp** của từng nhân viên; dòng lỗi được trả về kèm số dòng. Ví dụ:
```bash
curl -H "Authorization: Bearer <token>" -F file=@samples/timesheet-import.csv http://localhost:4000/api/timesheets/import
```

## 8. Giả định & giới hạn hiện tại (cần bạn xác nhận)
- **Phụ cấp ban đêm** 22:00–06:00 mặc định +30%, **bảo hiểm** 10,5% tổng thu nhập — là giá trị mặc định, sửa được ở Bảng lương → Sửa chính sách (Admin). Thuế TNCN chưa tự tính; nhập tay ở "Khấu trừ khác".
- Chỉ có 2 loại nghỉ: **nghỉ phép năm (hưởng lương)** và **nghỉ không lương**; đơn nghỉ không được kéo dài qua tháng.
- OT tự tính theo ngưỡng 8 giờ/ngày, chưa có bước đăng ký/duyệt OT riêng.
- Đơn giá giờ áp dụng cho cả tháng (đổi đơn giá giữa tháng chưa được tách).
- Một dòng chấm công không được qua nửa đêm (ca đêm hãy tách 2 dòng).
- Đổi vai trò người dùng có hiệu lực ở lần đăng nhập kế tiếp (token 12 giờ).
- Chưa có xoá dự án (chỉ chuyển sang "Lưu trữ") để giữ nguyên lịch sử chấm công và chi phí.
