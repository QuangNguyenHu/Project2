const pad = (n) => String(n).padStart(2, '0');

export const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const fmtMin = (m) => `${Math.floor((m || 0) / 60)}g ${pad((m || 0) % 60)}p`;
export const vnd = (n) => new Intl.NumberFormat('vi-VN').format(Number(n || 0)) + ' đ';
export const today = () => new Date().toLocaleDateString('en-CA');
export const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dmy = (s) => (s ? s.split('-').reverse().join('/') : '');
export const weekdayName = (s) => ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][new Date(s + 'T00:00:00Z').getUTCDay()];

export const ROLE = { admin: 'Quản trị', pm: 'Quản lý dự án', employee: 'Nhân viên', accountant: 'Kế toán' };
export const TS_STATUS = { draft: 'Nháp', submitted: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối' };
export const LEAVE_TYPE = { annual: 'Nghỉ phép năm (hưởng lương)', unpaid: 'Nghỉ không lương' };
export const LEAVE_STATUS = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
export const TASK_COLS = [
  { key: 'todo', label: 'Cần làm' },
  { key: 'doing', label: 'Đang làm' },
  { key: 'done', label: 'Hoàn thành' },
];
