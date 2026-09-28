const router = require('express').Router();
const { query, queryOne } = require('../db');
const { ah, HttpError, int, dateStr } = require('../utils/http');
const { requireRole } = require('../middleware/auth');

const D = (c) => `CONVERT(VARCHAR(10), ${c}, 23)`;
const sel = `SELECT l.id, l.user_id, u.full_name, l.leave_type, ${D('l.start_date')} AS start_date, ${D('l.end_date')} AS end_date,
  l.hours, l.reason, l.status FROM leaves l JOIN users u ON u.id=l.user_id`;

router.get('/mine', ah(async (req, res) => {
  res.json(await query(`${sel} WHERE l.user_id=@u ORDER BY l.start_date DESC`, { u: req.user.id }));
}));

router.post('/', ah(async (req, res) => {
  const b = req.body;
  const start = dateStr(b.start_date, 'ngày bắt đầu'), end = dateStr(b.end_date, 'ngày kết thúc');
  if (end < start) throw new HttpError(400, 'Ngày kết thúc phải sau ngày bắt đầu');
  if (start.slice(0, 7) !== end.slice(0, 7)) throw new HttpError(400, 'Đơn nghỉ phải nằm trong một tháng (tách đơn nếu nghỉ qua tháng)');
  if (!['annual', 'unpaid'].includes(b.leave_type)) throw new HttpError(400, 'Loại nghỉ không hợp lệ');
  const hours = Number(b.hours);
  if (!(hours > 0)) throw new HttpError(400, 'Số giờ nghỉ phải lớn hơn 0');
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (hours > days * 8) throw new HttpError(400, 'Số giờ nghỉ vượt quá 8 giờ/ngày');
  const row = await queryOne(
    `INSERT INTO leaves (user_id, leave_type, start_date, end_date, hours, reason)
     OUTPUT INSERTED.id VALUES (@u, @t, @s, @e, @h, @r)`,
    { u: req.user.id, t: b.leave_type, s: start, e: end, h: hours, r: b.reason || null });
  res.status(201).json({ id: row.id });
}));

router.delete('/:id', ah(async (req, res) => {
  const l = await queryOne('SELECT user_id, status FROM leaves WHERE id=@id', { id: int(req.params.id) });
  if (!l || l.user_id !== req.user.id) throw new HttpError(404, 'Không tìm thấy đơn nghỉ');
  if (l.status !== 'pending') throw new HttpError(409, 'Chỉ huỷ được đơn đang chờ duyệt');
  await query('DELETE FROM leaves WHERE id=@id', { id: int(req.params.id) });
  res.json({ ok: true });
}));

router.get('/pending', requireRole('admin', 'pm'), ah(async (req, res) => {
  res.json(await query(`${sel} WHERE l.status='pending' AND l.user_id <> @me ORDER BY l.created_at`, { me: req.user.id }));
}));

router.post('/:id/review', requireRole('admin', 'pm'), ah(async (req, res) => {
  const id = int(req.params.id);
  if (!['approve', 'reject'].includes(req.body.action)) throw new HttpError(400, 'action phải là approve hoặc reject');
  const l = await queryOne('SELECT user_id, status FROM leaves WHERE id=@id', { id });
  if (!l) throw new HttpError(404, 'Không tìm thấy đơn nghỉ');
  if (l.status !== 'pending') throw new HttpError(409, 'Đơn đã được xử lý');
  if (l.user_id === req.user.id) throw new HttpError(403, 'Không được tự duyệt đơn của mình');
  await query(
    `UPDATE leaves SET status=@s, reviewed_by=@me, reviewed_at=SYSUTCDATETIME() WHERE id=@id`,
    { s: req.body.action === 'approve' ? 'approved' : 'rejected', me: req.user.id, id });
  res.json({ ok: true });
}));

module.exports = router;
