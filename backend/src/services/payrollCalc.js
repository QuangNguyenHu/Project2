/**
 * Tính lương thuần (không đụng DB) để dễ kiểm thử.
 *
 * Quy tắc:
 *  - Thời gian đã được làm tròn đến phút ngay lúc chấm công -> ở đây chỉ cộng số phút nguyên.
 *  - OT: phần vượt ngưỡng (mặc định 8h = 480 phút) của TỪNG NGÀY, một mức hệ số (mặc định 200%).
 *  - Giờ nghỉ phép hưởng lương KHÔNG được cộng vào ngưỡng 8h; chỉ giờ làm thực tế mới xét OT.
 *  - Tiền tính bằng số nguyên VND: mỗi khoản làm tròn half-up MỘT lần, tổng = tổng các khoản đã làm tròn.
 */

/** Chia nguyên, làm tròn half-up (n, d > 0, số nguyên). */
const roundDiv = (n, d) => Math.floor((2 * n + d) / (2 * d));
/** Hệ số thập phân (vd 2.00, 0.30, 0.1050) -> số nguyên theo scale. */
const scaled = (x, scale) => Math.round(Number(x) * scale);

function overlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

/** Số phút nằm trong khung giờ đêm [nightStart, 24:00) và [0, nightEnd). */
function nightMinutes(start, end, nightStart, nightEnd) {
  return overlap(start, end, 0, nightEnd) + overlap(start, end, nightStart, 1440);
}

/**
 * @param {{work_date:string,start_min:number,end_min:number}[]} entries  các dòng timesheet đã duyệt
 * @param {number} paidLeaveHours  tổng giờ nghỉ phép hưởng lương đã duyệt
 * @param {number} hourlyRate      VND/giờ (số nguyên)
 * @param {object} policy          dòng payroll_policies
 */
function calcPayslip({ entries, paidLeaveHours = 0, hourlyRate, policy }) {
  const threshold = Number(policy.daily_threshold_min);
  const byDay = new Map();
  let night = 0;
  for (const e of entries) {
    const m = e.end_min - e.start_min;
    byDay.set(e.work_date, (byDay.get(e.work_date) || 0) + m);
    night += nightMinutes(e.start_min, e.end_min, Number(policy.night_start_min), Number(policy.night_end_min));
  }
  let regular = 0, ot = 0;
  for (const m of byDay.values()) {
    regular += Math.min(m, threshold);
    ot += Math.max(0, m - threshold);
  }
  const leaveMin = Math.round(Number(paidLeaveHours) * 60);
  const rate = Number(hourlyRate);

  const otMul = scaled(policy.ot_multiplier, 100);
  const nightMul = scaled(policy.night_extra_rate, 100);
  const insRate = scaled(policy.insurance_rate, 10000);

  const regular_pay = roundDiv(regular * rate, 60);
  const ot_pay = roundDiv(ot * rate * otMul, 6000);
  const night_pay = roundDiv(night * rate * nightMul, 6000);
  const leave_pay = roundDiv(leaveMin * rate, 60);
  const gross_pay = regular_pay + ot_pay + night_pay + leave_pay;
  const insurance_deduction = roundDiv(gross_pay * insRate, 10000);

  return {
    regular_minutes: regular,
    ot_minutes: ot,
    night_minutes: night,
    leave_minutes: leaveMin,
    regular_pay, ot_pay, night_pay, leave_pay,
    gross_pay, insurance_deduction,
  };
}

const netPay = (p) => p.gross_pay - p.insurance_deduction - (p.other_deduction || 0);

module.exports = { calcPayslip, netPay, roundDiv, nightMinutes };
