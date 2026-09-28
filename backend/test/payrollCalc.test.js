const test = require('node:test');
const assert = require('node:assert/strict');
const { calcPayslip, netPay, nightMinutes } = require('../src/services/payrollCalc');

const policy = {
  daily_threshold_min: 480, ot_multiplier: 2.0,
  night_start_min: 1320, night_end_min: 360, night_extra_rate: 0.3, insurance_rate: 0.105,
};
const e = (d, s, t) => ({ work_date: d, start_min: s, end_min: t });

test('10h trong ngày = 8h thường + 2h OT (200%)', () => {
  const r = calcPayslip({ entries: [e('2026-09-01', 480, 720), e('2026-09-01', 780, 1140)], hourlyRate: 50000, policy });
  assert.equal(r.regular_minutes, 480);
  assert.equal(r.ot_minutes, 120);
  assert.equal(r.regular_pay, 400000);
  assert.equal(r.ot_pay, 200000); // 2h * 50.000 * 2
  assert.equal(r.gross_pay, 600000);
  assert.equal(r.insurance_deduction, 63000);
});

test('OT tính theo từng ngày, không cộng dồn cả tuần', () => {
  const r = calcPayslip({
    entries: [e('2026-09-01', 480, 840), e('2026-09-02', 480, 1080)], // 6h và 10h
    hourlyRate: 60000, policy,
  });
  assert.equal(r.regular_minutes, 360 + 480);
  assert.equal(r.ot_minutes, 120);
});

test('giờ nghỉ phép không đẩy giờ làm vào OT', () => {
  const r = calcPayslip({ entries: [e('2026-09-01', 480, 840)], paidLeaveHours: 8, hourlyRate: 50000, policy });
  assert.equal(r.ot_minutes, 0);
  assert.equal(r.leave_pay, 400000);
});

test('làm tròn half-up đúng một lần trên mỗi khoản', () => {
  // 1 phút * 50.030 / 60 = 833,83 -> 834
  const r = calcPayslip({ entries: [e('2026-09-01', 480, 481)], hourlyRate: 50030, policy });
  assert.equal(r.regular_pay, 834);
  // 30 phút * 50.001 / 60 = 25.000,5 -> 25.001
  const r2 = calcPayslip({ entries: [e('2026-09-01', 480, 510)], hourlyRate: 50001, policy });
  assert.equal(r2.regular_pay, 25001);
});

test('phút đêm 22:00-06:00', () => {
  assert.equal(nightMinutes(1290, 1440, 1320, 360), 120); // 21:30-24:00
  assert.equal(nightMinutes(300, 420, 1320, 360), 60); // 05:00-07:00
  assert.equal(nightMinutes(480, 1020, 1320, 360), 0);
});

test('thực nhận = tổng thu nhập - bảo hiểm - khấu trừ khác', () => {
  const r = calcPayslip({ entries: [e('2026-09-01', 480, 960)], hourlyRate: 50000, policy });
  assert.equal(netPay({ ...r, other_deduction: 10000 }), r.gross_pay - r.insurance_deduction - 10000);
});
