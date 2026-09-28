const router = require('express').Router();
const { query, queryOne } = require('../db');
const { ah, HttpError, int, dateStr } = require('../utils/http');
const { requireRole } = require('../middleware/auth');
const { nowLocal, addDays } = require('../utils/time');

const D = (c) => `CONVERT(VARCHAR(10), ${c}, 23)`;
router.use(requireRole('admin', 'pm', 'accountant'));

async function assertProjectAccess(user, projectId) {
  const p = await queryOne(
    `SELECT id, name, ${D('start_date')} AS start_date, ${D('end_date')} AS end_date, manager_id, ${D('created_at')} AS created_day
     FROM projects WHERE id=@id`, { id: projectId });
  if (!p) throw new HttpError(404, 'Không tìm thấy dự án');
  if (user.role === 'pm' && p.manager_id !== user.id) throw new HttpError(403, 'Không phải dự án của bạn');
  return p;
}

/** Burn-down: giờ ước lượng còn lại theo ngày so với đường lý tưởng. */
router.get('/burndown', ah(async (req, res) => {
  const project = await assertProjectAccess(req.user, int(req.query.projectId, 'projectId'));
  const tasks = await query(
    `SELECT estimate_hours, ${D('completed_at')} AS done_day FROM tasks WHERE project_id=@p`, { p: project.id });
  const total = tasks.reduce((s, t) => s + Number(t.estimate_hours), 0);
  const today = nowLocal().date;
  const start = project.start_date || project.created_day;
  const end = project.end_date && project.end_date > start ? project.end_date : (today > start ? today : addDays(start, 1));
  const span = (Date.parse(end) - Date.parse(start)) / 86400000;
  const series = [];
  for (let i = 0, d = start; d <= end && i < 731; i++, d = addDays(start, i)) {
    const doneToDate = tasks.filter((t) => t.done_day && t.done_day <= d).reduce((s, t) => s + Number(t.estimate_hours), 0);
    series.push({
      date: d,
      ideal: Math.round((total * (1 - i / span)) * 100) / 100,
      remaining: d <= today ? Math.round((total - doneToDate) * 100) / 100 : null,
    });
  }
  res.json({ project: project.name, total_hours: total, start, end, series });
}));

/** Chi phí theo dự án từ timesheet đã duyệt (đơn giá x thời gian, chưa gồm phần tăng thêm của OT/đêm). */
router.get('/project-cost', ah(async (req, res) => {
  const from = req.query.from ? dateStr(req.query.from, 'from') : '1900-01-01';
  const to = req.query.to ? dateStr(req.query.to, 'to') : '2999-12-31';
  const rows = await query(
    `SELECT p.id, p.code, p.name, p.budget, SUM(e.minutes) AS minutes,
       SUM(CAST(e.minutes AS BIGINT) * u.hourly_rate) / 60 AS cost
     FROM timesheet_entries e
     JOIN timesheets t ON t.id=e.timesheet_id AND t.status='approved'
     JOIN users u ON u.id=t.user_id JOIN projects p ON p.id=e.project_id
     WHERE e.end_min IS NOT NULL AND e.work_date >= @f AND e.work_date <= @t
       ${req.user.role === 'pm' ? 'AND p.manager_id=@me' : ''}
     GROUP BY p.id, p.code, p.name, p.budget ORDER BY cost DESC`,
    { f: from, t: to, me: req.user.id });
  res.json(rows.map((r) => ({ ...r, cost: Math.round(Number(r.cost)) })));
}));

/** Dashboard năng suất: giờ đã duyệt, số việc hoàn thành và tổng giờ ước lượng của việc đó. */
router.get('/productivity', ah(async (req, res) => {
  const today = nowLocal().date;
  const from = req.query.from ? dateStr(req.query.from, 'from') : today.slice(0, 8) + '01';
  const to = req.query.to ? dateStr(req.query.to, 'to') : today;
  const pm = req.user.role === 'pm';
  const rows = await query(
    `SELECT u.id, u.full_name,
       COALESCE((SELECT SUM(e.minutes) FROM timesheet_entries e JOIN timesheets t ON t.id=e.timesheet_id
          ${pm ? 'JOIN projects p ON p.id=e.project_id AND p.manager_id=@me' : ''}
          WHERE t.user_id=u.id AND t.status='approved' AND e.end_min IS NOT NULL
            AND e.work_date >= @f AND e.work_date <= @t), 0) AS worked_minutes,
       (SELECT COUNT(*) FROM tasks k JOIN assignments a ON a.task_id=k.id
          ${pm ? 'JOIN projects p ON p.id=k.project_id AND p.manager_id=@me' : ''}
          WHERE a.user_id=u.id AND k.status='done' AND ${D('k.completed_at')} >= @f AND ${D('k.completed_at')} <= @t) AS tasks_done,
       COALESCE((SELECT SUM(k.estimate_hours) FROM tasks k JOIN assignments a ON a.task_id=k.id
          ${pm ? 'JOIN projects p ON p.id=k.project_id AND p.manager_id=@me' : ''}
          WHERE a.user_id=u.id AND k.status='done' AND ${D('k.completed_at')} >= @f AND ${D('k.completed_at')} <= @t), 0) AS estimate_done_hours
     FROM users u WHERE u.is_active=1 ORDER BY worked_minutes DESC`,
    { f: from, t: to, me: req.user.id });
  res.json({ from, to, rows: rows.filter((r) => r.worked_minutes || r.tasks_done) });
}));

module.exports = router;
