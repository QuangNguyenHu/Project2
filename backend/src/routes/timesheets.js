const router = require('express').Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { query, queryOne, withTx } = require('../db');
const { ah, HttpError, int, dateStr } = require('../utils/http');
const { requireRole } = require('../middleware/auth');
const { nowLocal, roundToMinute, weekStartOf, addDays } = require('../utils/time');
const { insertEntry, parseTimes, ensureEditableTimesheet } = require('../services/timesheetService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const D = (c) => `CONVERT(VARCHAR(10), ${c}, 23)`;

const entriesSql = `SELECT e.id, ${D('e.work_date')} AS work_date, e.project_id, p.code AS project_code, p.name AS project_name,
    e.task_id, t.title AS task_title, e.start_min, e.end_min, e.minutes, e.note
  FROM timesheet_entries e JOIN projects p ON p.id=e.project_id LEFT JOIN tasks t ON t.id=e.task_id`;

/** Timesheet của bản thân theo tuần (?week=YYYY-MM-DD, mặc định tuần hiện tại). */
router.get('/mine', ah(async (req, res) => {
  const week = weekStartOf(req.query.week ? dateStr(req.query.week, 'week') : nowLocal().date);
  const ts = await queryOne(
    `SELECT id, ${D('week_start')} AS week_start, status, review_note FROM timesheets WHERE user_id=@u AND week_start=@w`,
    { u: req.user.id, w: week });
  const entries = ts ? await query(`${entriesSql} WHERE e.timesheet_id=@id ORDER BY e.work_date, e.start_min`, { id: ts.id }) : [];
  res.json({ week_start: week, week_end: addDays(week, 6), timesheet: ts, entries });
}));

router.get('/mine/history', ah(async (req, res) => {
  res.json(await query(
    `SELECT t.id, ${D('t.week_start')} AS week_start, t.status, t.review_note,
       COALESCE((SELECT SUM(e.minutes) FROM timesheet_entries e WHERE e.timesheet_id=t.id), 0) AS total_minutes
     FROM timesheets t WHERE t.user_id=@u ORDER BY t.week_start DESC`, { u: req.user.id }));
}));

router.post('/entries', ah(async (req, res) => {
  const b = req.body;
  const { start_min, end_min } = parseTimes(b.start, b.end);
  const id = await withTx((q) => insertEntry(q, req.user.id, {
    work_date: dateStr(b.work_date, 'ngày làm việc'), project_id: int(b.project_id, 'project_id'),
    task_id: b.task_id ? int(b.task_id, 'task_id') : null, start_min, end_min, note: b.note,
  }));
  res.status(201).json({ id });
}));

router.delete('/entries/:id', ah(async (req, res) => {
  const id = int(req.params.id);
  const e = await queryOne(
    `SELECT e.id, t.user_id, t.status FROM timesheet_entries e JOIN timesheets t ON t.id=e.timesheet_id WHERE e.id=@id`, { id });
  if (!e || e.user_id !== req.user.id) throw new HttpError(404, 'Không tìm thấy dòng chấm công');
  if (['submitted', 'approved'].includes(e.status)) throw new HttpError(409, 'Timesheet đã gửi/duyệt, không thể xoá');
  await query('DELETE FROM timesheet_entries WHERE id=@id', { id });
  res.json({ ok: true });
}));

/** Check-in: giờ máy chủ theo múi giờ công ty, làm tròn đến phút gần nhất. */
router.post('/check-in', ah(async (req, res) => {
  const open = await queryOne(
    `SELECT TOP 1 e.id FROM timesheet_entries e JOIN timesheets t ON t.id=e.timesheet_id
     WHERE t.user_id=@u AND e.end_min IS NULL`, { u: req.user.id });
  if (open) throw new HttpError(409, 'Bạn đang có một phiên chấm công chưa check-out');
  const now = nowLocal();
  const start_min = Math.min(1439, roundToMinute(now.seconds));
  const id = await withTx((q) => insertEntry(q, req.user.id, {
    work_date: now.date, project_id: int(req.body.project_id, 'project_id'),
    task_id: req.body.task_id ? int(req.body.task_id, 'task_id') : null, start_min, end_min: null, note: req.body.note,
  }));
  res.status(201).json({ id, start_min });
}));

router.post('/check-out', ah(async (req, res) => {
  const open = await queryOne(
    `SELECT TOP 1 e.id, e.start_min, ${D('e.work_date')} AS work_date FROM timesheet_entries e
     JOIN timesheets t ON t.id=e.timesheet_id WHERE t.user_id=@u AND e.end_min IS NULL`, { u: req.user.id });
  if (!open) throw new HttpError(404, 'Bạn chưa check-in');
  const now = nowLocal();
  if (open.work_date !== now.date)
    throw new HttpError(409, `Phiên chấm công ngày ${open.work_date} chưa được đóng. Hãy xoá dòng này và nhập lại giờ thủ công`);
  const end_min = roundToMinute(now.seconds);
  if (end_min <= open.start_min) throw new HttpError(409, 'Thời gian làm việc chưa đủ 1 phút, hãy đợi thêm rồi check-out');
  await query('UPDATE timesheet_entries SET end_min=@e WHERE id=@id', { e: end_min, id: open.id });
  res.json({ ok: true, end_min });
}));

router.post('/submit', ah(async (req, res) => {
  const week = weekStartOf(dateStr(req.body.week, 'week'));
  const result = await withTx(async (q) => {
    const ts = await ensureEditableTimesheet(q, req.user.id, week);
    const [c] = await q(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN end_min IS NULL THEN 1 ELSE 0 END) AS open_n
       FROM timesheet_entries WHERE timesheet_id=@id`, { id: ts.id });
    if (!c.n) throw new HttpError(400, 'Timesheet chưa có dòng chấm công nào');
    if (c.open_n) throw new HttpError(400, 'Còn dòng chưa check-out, hãy hoàn tất trước khi gửi');
    await q(`UPDATE timesheets SET status='submitted', submitted_at=SYSUTCDATETIME(), review_note=NULL WHERE id=@id`, { id: ts.id });
    return ts.id;
  });
  res.json({ id: result, status: 'submitted' });
}));

/** Timesheet chờ duyệt: PM chỉ thấy tuần có công của dự án mình quản lý. */
router.get('/pending', requireRole('admin', 'pm'), ah(async (req, res) => {
  const pmFilter = req.user.role === 'pm'
    ? `AND EXISTS (SELECT 1 FROM timesheet_entries e JOIN projects p ON p.id=e.project_id
                   WHERE e.timesheet_id=t.id AND p.manager_id=@me)` : '';
  const rows = await query(
    `SELECT t.id, ${D('t.week_start')} AS week_start, u.full_name, u.email, t.submitted_at,
       (SELECT SUM(e.minutes) FROM timesheet_entries e WHERE e.timesheet_id=t.id) AS total_minutes
     FROM timesheets t JOIN users u ON u.id=t.user_id
     WHERE t.status='submitted' AND t.user_id <> @me ${pmFilter} ORDER BY t.submitted_at`, { me: req.user.id });
  res.json(rows);
}));

router.get('/:id', ah(async (req, res) => {
  const id = int(req.params.id);
  const ts = await queryOne(
    `SELECT t.id, t.user_id, u.full_name, ${D('t.week_start')} AS week_start, t.status, t.review_note
     FROM timesheets t JOIN users u ON u.id=t.user_id WHERE t.id=@id`, { id });
  if (!ts) throw new HttpError(404, 'Không tìm thấy timesheet');
  if (ts.user_id !== req.user.id && !['admin', 'pm'].includes(req.user.role)) throw new HttpError(403, 'Không đủ quyền');
  const entries = await query(`${entriesSql} WHERE e.timesheet_id=@id ORDER BY e.work_date, e.start_min`, { id });
  res.json({ ...ts, entries });
}));

router.post('/:id/review', requireRole('admin', 'pm'), ah(async (req, res) => {
  const id = int(req.params.id);
  const action = req.body.action;
  if (!['approve', 'reject'].includes(action)) throw new HttpError(400, 'action phải là approve hoặc reject');
  const note = (req.body.note || '').trim() || null;
  if (action === 'reject' && !note) throw new HttpError(400, 'Cần ghi lý do khi từ chối');
  const ts = await queryOne('SELECT id, user_id, status FROM timesheets WHERE id=@id', { id });
  if (!ts) throw new HttpError(404, 'Không tìm thấy timesheet');
  if (ts.status !== 'submitted') throw new HttpError(409, 'Timesheet không ở trạng thái chờ duyệt');
  if (ts.user_id === req.user.id) throw new HttpError(403, 'Không được tự duyệt timesheet của mình');
  if (req.user.role === 'pm') {
    const ok = await queryOne(
      `SELECT TOP 1 1 AS x FROM timesheet_entries e JOIN projects p ON p.id=e.project_id
       WHERE e.timesheet_id=@id AND p.manager_id=@me`, { id, me: req.user.id });
    if (!ok) throw new HttpError(403, 'Timesheet này không có công của dự án bạn quản lý');
  }
  await query(
    `UPDATE timesheets SET status=@s, reviewed_by=@me, reviewed_at=SYSUTCDATETIME(), review_note=@n WHERE id=@id`,
    { s: action === 'approve' ? 'approved' : 'rejected', me: req.user.id, n: note, id });
  res.json({ ok: true });
}));

/**
 * Import CSV (admin): email,date,start,end,project_code,note
 * Dòng hợp lệ được nạp vào timesheet nháp của từng nhân viên; dòng lỗi được báo lại.
 */
router.post('/import', requireRole('admin'), upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Thiếu file CSV (field "file")');
  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (e) {
    throw new HttpError(400, 'File CSV không đọc được: ' + e.message);
  }
  let inserted = 0;
  const errors = [];
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    try {
      const u = await queryOne('SELECT id FROM users WHERE email=@e AND is_active=1', { e: String(r.email || '').toLowerCase() });
      if (!u) throw new HttpError(400, `Không có nhân viên ${r.email}`);
      const p = await queryOne('SELECT id FROM projects WHERE code=@c', { c: String(r.project_code || '').toUpperCase() });
      if (!p) throw new HttpError(400, `Không có dự án ${r.project_code}`);
      const { start_min, end_min } = parseTimes(r.start, r.end);
      await withTx((q) => insertEntry(q, u.id, {
        work_date: dateStr(r.date, 'date'), project_id: p.id, task_id: null, start_min, end_min, note: r.note,
      }));
      inserted++;
    } catch (e) {
      errors.push({ line, error: e.message });
    }
  }
  res.json({ total: rows.length, inserted, errors });
}));

module.exports = router;
