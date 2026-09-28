const router = require('express').Router();
const { query, queryOne, withTx } = require('../db');
const { ah, HttpError, int } = require('../utils/http');
const { requireRole } = require('../middleware/auth');
const { generatePayslips } = require('../services/payrollService');
const { buildPayslipPdf } = require('../services/payslipPdf');
const { netPay } = require('../services/payrollCalc');

const finance = requireRole('admin', 'accountant');
const D = (c) => `CONVERT(VARCHAR(19), ${c}, 126)`;

const slipSelect = `SELECT s.*, u.full_name, u.email, r.period_year, r.period_month, r.status AS run_status,
    pol.ot_multiplier, pol.night_extra_rate, pol.insurance_rate
  FROM payslips s JOIN users u ON u.id=s.user_id JOIN payroll_runs r ON r.id=s.run_id
  JOIN payroll_policies pol ON pol.id=r.policy_id`;

/* ---------- Chính sách ---------- */
router.get('/policy', finance, ah(async (req, res) => {
  res.json(await queryOne('SELECT TOP 1 * FROM payroll_policies WHERE is_active=1 ORDER BY id DESC'));
}));

// Mỗi lần sửa tạo bản ghi mới; các kỳ lương cũ vẫn trỏ về chính sách đã dùng.
router.put('/policy', requireRole('admin'), ah(async (req, res) => {
  const b = req.body;
  const num = (v, name, min, max) => {
    const n = Number(v);
    if (!(n >= min && n <= max)) throw new HttpError(400, `${name} không hợp lệ`);
    return n;
  };
  const p = {
    name: String(b.name || 'Chính sách lương').slice(0, 100),
    thr: Math.round(num(b.daily_threshold_min, 'Ngưỡng OT (phút)', 60, 1440)),
    ot: num(b.ot_multiplier, 'Hệ số OT', 1, 9.99),
    ns: Math.round(num(b.night_start_min, 'Giờ bắt đầu đêm', 0, 1439)),
    ne: Math.round(num(b.night_end_min, 'Giờ kết thúc đêm', 0, 1439)),
    nx: num(b.night_extra_rate, 'Phụ cấp đêm', 0, 9.99),
    ins: num(b.insurance_rate, 'Tỷ lệ bảo hiểm', 0, 0.9999),
  };
  await withTx(async (q) => {
    await q('UPDATE payroll_policies SET is_active=0');
    await q(
      `INSERT INTO payroll_policies (name, daily_threshold_min, ot_multiplier, night_start_min, night_end_min, night_extra_rate, insurance_rate)
       VALUES (@name, @thr, @ot, @ns, @ne, @nx, @ins)`, p);
  });
  res.json({ ok: true });
}));

/* ---------- Kỳ lương ---------- */
router.get('/runs', finance, ah(async (req, res) => {
  res.json(await query(
    `SELECT r.id, r.period_year, r.period_month, r.status, ${D('r.created_at')} AS created_at, ${D('r.finalized_at')} AS finalized_at,
       (SELECT COUNT(*) FROM payslips s WHERE s.run_id=r.id) AS payslip_count,
       (SELECT COALESCE(SUM(net_pay),0) FROM payslips s WHERE s.run_id=r.id) AS total_net
     FROM payroll_runs r ORDER BY r.period_year DESC, r.period_month DESC`));
}));

router.post('/runs', finance, ah(async (req, res) => {
  const year = int(req.body.year, 'năm'), month = int(req.body.month, 'tháng');
  if (month > 12 || year < 2000 || year > 2100) throw new HttpError(400, 'Kỳ lương không hợp lệ');
  if (await queryOne('SELECT 1 AS x FROM payroll_runs WHERE period_year=@y AND period_month=@m', { y: year, m: month }))
    throw new HttpError(409, `Kỳ lương ${month}/${year} đã tồn tại`);
  const policy = await queryOne('SELECT TOP 1 id FROM payroll_policies WHERE is_active=1 ORDER BY id DESC');
  const out = await withTx(async (q) => {
    const [run] = await q(
      `INSERT INTO payroll_runs (period_year, period_month, policy_id, created_by)
       OUTPUT INSERTED.* VALUES (@y, @m, @p, @by)`, { y: year, m: month, p: policy.id, by: req.user.id });
    const n = await generatePayslips(q, run);
    return { id: run.id, payslips: n };
  });
  res.status(201).json(out);
}));

router.get('/runs/:id', finance, ah(async (req, res) => {
  const id = int(req.params.id);
  const run = await queryOne(
    `SELECT id, period_year, period_month, status, policy_id, ${D('finalized_at')} AS finalized_at FROM payroll_runs WHERE id=@id`, { id });
  if (!run) throw new HttpError(404, 'Không tìm thấy kỳ lương');
  const payslips = await query(`${slipSelect} WHERE s.run_id=@id ORDER BY u.full_name`, { id });
  res.json({ ...run, payslips });
}));

async function draftRun(id) {
  const run = await queryOne('SELECT * FROM payroll_runs WHERE id=@id', { id });
  if (!run) throw new HttpError(404, 'Không tìm thấy kỳ lương');
  if (run.status !== 'draft') throw new HttpError(409, 'Kỳ lương đã chốt, không thể thay đổi');
  return run;
}

router.post('/runs/:id/recalculate', finance, ah(async (req, res) => {
  const run = await draftRun(int(req.params.id));
  const n = await withTx((q) => generatePayslips(q, run));
  res.json({ payslips: n });
}));

router.post('/runs/:id/finalize', finance, ah(async (req, res) => {
  const run = await draftRun(int(req.params.id));
  await query(`UPDATE payroll_runs SET status='finalized', finalized_at=SYSUTCDATETIME() WHERE id=@id`, { id: run.id });
  res.json({ ok: true });
}));

router.delete('/runs/:id', finance, ah(async (req, res) => {
  const run = await draftRun(int(req.params.id));
  await query('DELETE FROM payroll_runs WHERE id=@id', { id: run.id });
  res.json({ ok: true });
}));

/* ---------- Xuất CSV cho kế toán ---------- */
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
router.get('/runs/:id/export.csv', finance, ah(async (req, res) => {
  const id = int(req.params.id);
  const run = await queryOne('SELECT period_year, period_month FROM payroll_runs WHERE id=@id', { id });
  if (!run) throw new HttpError(404, 'Không tìm thấy kỳ lương');
  const rows = await query(`${slipSelect} WHERE s.run_id=@id ORDER BY u.full_name`, { id });
  const head = ['Mã NV', 'Họ tên', 'Email', 'Kỳ lương', 'Đơn giá/giờ', 'Phút thường', 'Phút OT', 'Phút đêm', 'Phút nghỉ phép',
    'Lương giờ thường', 'Lương OT', 'Phụ cấp đêm', 'Lương nghỉ phép', 'Tổng thu nhập', 'Bảo hiểm', 'Khấu trừ khác', 'Ghi chú khấu trừ', 'Thực nhận'];
  const lines = [head.join(',')];
  for (const s of rows) {
    lines.push([s.user_id, s.full_name, s.email, `${String(s.period_month).padStart(2, '0')}/${s.period_year}`, s.hourly_rate,
      s.regular_minutes, s.ot_minutes, s.night_minutes, s.leave_minutes, s.regular_pay, s.ot_pay, s.night_pay, s.leave_pay,
      s.gross_pay, s.insurance_deduction, s.other_deduction, s.deduction_note, s.net_pay].map(csvCell).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bang-luong-${run.period_year}-${String(run.period_month).padStart(2, '0')}.csv"`);
  res.send('\uFEFF' + lines.join('\r\n')); // BOM để Excel đọc đúng tiếng Việt
}));

/* ---------- Phiếu lương ---------- */
router.get('/payslips/mine', ah(async (req, res) => {
  res.json(await query(
    `${slipSelect} WHERE s.user_id=@u AND r.status='finalized' ORDER BY r.period_year DESC, r.period_month DESC`, { u: req.user.id }));
}));

router.patch('/payslips/:id', finance, ah(async (req, res) => {
  const id = int(req.params.id);
  const s = await queryOne('SELECT s.*, r.status AS run_status FROM payslips s JOIN payroll_runs r ON r.id=s.run_id WHERE s.id=@id', { id });
  if (!s) throw new HttpError(404, 'Không tìm thấy phiếu lương');
  if (s.run_status !== 'draft') throw new HttpError(409, 'Kỳ lương đã chốt');
  const other = Math.round(Number(req.body.other_deduction ?? s.other_deduction));
  if (!(other >= 0)) throw new HttpError(400, 'Khoản khấu trừ không hợp lệ');
  const net = netPay({ gross_pay: Number(s.gross_pay), insurance_deduction: Number(s.insurance_deduction), other_deduction: other });
  await query('UPDATE payslips SET other_deduction=@o, deduction_note=@n, net_pay=@net WHERE id=@id',
    { o: other, n: req.body.deduction_note ?? s.deduction_note, net, id });
  res.json({ ok: true, net_pay: net });
}));

router.get('/payslips/:id/pdf', ah(async (req, res) => {
  const slip = await queryOne(`${slipSelect} WHERE s.id=@id`, { id: int(req.params.id) });
  if (!slip) throw new HttpError(404, 'Không tìm thấy phiếu lương');
  const isFinance = ['admin', 'accountant'].includes(req.user.role);
  if (!isFinance && !(slip.user_id === req.user.id && slip.run_status === 'finalized'))
    throw new HttpError(403, 'Bạn không có quyền xem phiếu lương này');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="phieu-luong-${slip.period_year}-${String(slip.period_month).padStart(2, '0')}-${slip.user_id}.pdf"`);
  buildPayslipPdf(slip, res);
}));

module.exports = router;
