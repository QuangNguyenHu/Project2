const { calcPayslip, netPay } = require('./payrollCalc');
const { monthRange } = require('../utils/time');

/** Tạo lại toàn bộ phiếu lương của một kỳ (chỉ dùng cho kỳ ở trạng thái draft). */
async function generatePayslips(q, run) {
  const policy = (await q('SELECT * FROM payroll_policies WHERE id=@id', { id: run.policy_id }))[0];
  const { from, to } = monthRange(run.period_year, run.period_month);

  // giữ lại khấu trừ nhập tay khi tính lại
  const old = await q('SELECT user_id, other_deduction, deduction_note FROM payslips WHERE run_id=@r', { r: run.id });
  const keep = new Map(old.map((o) => [o.user_id, o]));
  await q('DELETE FROM payslips WHERE run_id=@r', { r: run.id });

  const entries = await q(
    `SELECT t.user_id, CONVERT(VARCHAR(10), e.work_date, 23) AS work_date, e.start_min, e.end_min
     FROM timesheet_entries e JOIN timesheets t ON t.id = e.timesheet_id
     WHERE t.status='approved' AND e.end_min IS NOT NULL AND e.work_date >= @f AND e.work_date < @t`,
    { f: from, t: to }
  );
  const leaves = await q(
    `SELECT user_id, SUM(hours) AS hours FROM leaves
     WHERE status='approved' AND leave_type='annual' AND start_date >= @f AND start_date < @t
     GROUP BY user_id`,
    { f: from, t: to }
  );
  const byUser = new Map();
  for (const e of entries) {
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, { entries: [], leave: 0 });
    byUser.get(e.user_id).entries.push(e);
  }
  for (const l of leaves) {
    if (!byUser.has(l.user_id)) byUser.set(l.user_id, { entries: [], leave: 0 });
    byUser.get(l.user_id).leave = Number(l.hours);
  }
  if (!byUser.size) return 0;

  const rates = await q('SELECT id, hourly_rate FROM users');
  const rateOf = new Map(rates.map((r) => [r.id, Number(r.hourly_rate)]));

  for (const [userId, d] of byUser) {
    const p = calcPayslip({ entries: d.entries, paidLeaveHours: d.leave, hourlyRate: rateOf.get(userId), policy });
    const k = keep.get(userId);
    p.other_deduction = k ? Number(k.other_deduction) : 0;
    p.net_pay = netPay(p);
    await q(
      `INSERT INTO payslips (run_id, user_id, hourly_rate, regular_minutes, ot_minutes, night_minutes, leave_minutes,
         regular_pay, ot_pay, night_pay, leave_pay, gross_pay, insurance_deduction, other_deduction, deduction_note, net_pay)
       VALUES (@run, @u, @rate, @rm, @om, @nm, @lm, @rp, @op, @np, @lp, @g, @ins, @oth, @note, @net)`,
      {
        run: run.id, u: userId, rate: rateOf.get(userId),
        rm: p.regular_minutes, om: p.ot_minutes, nm: p.night_minutes, lm: p.leave_minutes,
        rp: p.regular_pay, op: p.ot_pay, np: p.night_pay, lp: p.leave_pay,
        g: p.gross_pay, ins: p.insurance_deduction, oth: p.other_deduction,
        note: k ? k.deduction_note : null, net: p.net_pay,
      }
    );
  }
  return byUser.size;
}

module.exports = { generatePayslips };
