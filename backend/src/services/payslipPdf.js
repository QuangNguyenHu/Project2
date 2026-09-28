const PDFDocument = require('pdfkit');
const path = require('path');

const FONT = path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf');
const BOLD = path.join(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');

const vnd = (n) => new Intl.NumberFormat('vi-VN').format(Number(n)) + ' đ';
const hours = (min) => `${Math.floor(min / 60)} giờ ${String(min % 60).padStart(2, '0')} phút`;

/**
 * Phiếu lương theo Khoản 3 Điều 95 Bộ luật Lao động 2019: ghi rõ tiền lương,
 * tiền lương làm thêm giờ, tiền lương làm việc ban đêm, nội dung và số tiền bị khấu trừ.
 */
function buildPayslipPdf(slip, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  doc.registerFont('r', FONT);
  doc.registerFont('b', BOLD);

  const line = () => {
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
    doc.moveDown(0.4);
  };
  const row = (label, detail, amount, bold = false) => {
    const y = doc.y;
    doc.font(bold ? 'b' : 'r').fontSize(10.5);
    const h = Math.max(
      doc.heightOfString(label, { width: 225 }),
      doc.heightOfString(detail || ' ', { width: 130 })
    );
    doc.text(label, 50, y, { width: 225 });
    doc.text(detail || '', 280, y, { width: 130 });
    doc.text(amount, 415, y, { width: 130, align: 'right' });
    doc.x = 50;
    doc.y = y + h + 5;
  };
  const heading = (t) => {
    doc.font('b').fontSize(11).text(t, 50, doc.y, { width: 495 });
    doc.moveDown(0.3);
  };

  doc.font('b').fontSize(16).text('PHIẾU LƯƠNG', { align: 'center' });
  doc.font('r').fontSize(11).text(`Kỳ lương: tháng ${slip.period_month}/${slip.period_year}`, { align: 'center' });
  doc.moveDown();

  doc.font('r').fontSize(10.5);
  doc.text(`Họ và tên: ${slip.full_name}`);
  doc.text(`Email: ${slip.email}`);
  doc.text(`Đơn giá lương giờ: ${vnd(slip.hourly_rate)}/giờ`);
  doc.moveDown(0.6);
  line();

  heading('I. Các khoản thu nhập');
  row('1. Tiền lương (giờ làm việc thường)', hours(slip.regular_minutes), vnd(slip.regular_pay));
  row('2. Tiền lương làm thêm giờ', `${hours(slip.ot_minutes)} (hệ số ${slip.ot_multiplier * 100}%)`, vnd(slip.ot_pay));
  row('3. Tiền lương làm việc ban đêm', `${hours(slip.night_minutes)} (phụ cấp +${Math.round(slip.night_extra_rate * 100)}%)`, vnd(slip.night_pay));
  row('4. Nghỉ phép hưởng lương', hours(slip.leave_minutes), vnd(slip.leave_pay));
  line();
  row('Tổng thu nhập', '', vnd(slip.gross_pay), true);
  doc.moveDown(0.4);

  heading('II. Các khoản khấu trừ');
  row('1. Bảo hiểm (BHXH, BHYT, BHTN)', `${(slip.insurance_rate * 100).toFixed(2)}% tổng thu nhập`, vnd(slip.insurance_deduction));
  row('2. Khấu trừ khác', slip.deduction_note || '', vnd(slip.other_deduction));
  line();
  row('Tổng khấu trừ', '', vnd(Number(slip.insurance_deduction) + Number(slip.other_deduction)), true);
  doc.moveDown(0.6);
  line();
  row('THỰC NHẬN', '', vnd(slip.net_pay), true);

  doc.moveDown(2);
  doc.font('r').fontSize(9).fillColor('#666')
    .text('Số tiền được làm tròn đến đồng ở từng khoản mục. Thời gian làm việc được làm tròn đến phút khi chấm công.', 50, doc.y, { width: 495 });
  doc.end();
}

module.exports = { buildPayslipPdf };
