const router = require('express').Router();
const { query, queryOne, withTx } = require('../db');
const { ah, HttpError, int, dateStr, required } = require('../utils/http');
const { requireRole } = require('../middleware/auth');

const D = (c) => `CONVERT(VARCHAR(10), ${c}, 23)`;
const STATUSES = ['todo', 'doing', 'done'];

async function loadProject(id) {
  const p = await queryOne(
    `SELECT p.id, p.code, p.name, p.description, p.manager_id, u.full_name AS manager_name, p.status,
            ${D('p.start_date')} AS start_date, ${D('p.end_date')} AS end_date, p.budget
     FROM projects p JOIN users u ON u.id = p.manager_id WHERE p.id=@id`, { id });
  if (!p) throw new HttpError(404, 'Không tìm thấy dự án');
  return p;
}
const canManage = (user, project) => user.role === 'admin' || project.manager_id === user.id;

async function assertCanView(user, project) {
  if (['admin', 'accountant'].includes(user.role) || project.manager_id === user.id) return;
  const a = await queryOne(
    `SELECT TOP 1 1 AS x FROM assignments a JOIN tasks t ON t.id=a.task_id WHERE a.user_id=@u AND t.project_id=@p`,
    { u: user.id, p: project.id });
  if (!a) throw new HttpError(403, 'Bạn không có quyền xem dự án này');
}

// Danh sách dự án theo vai trò
router.get('/', ah(async (req, res) => {
  const { id, role } = req.user;
  const base = `SELECT p.id, p.code, p.name, p.status, p.manager_id, u.full_name AS manager_name,
      ${D('p.start_date')} AS start_date, ${D('p.end_date')} AS end_date, p.budget,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='done') AS done_count
    FROM projects p JOIN users u ON u.id=p.manager_id`;
  let rows;
  if (role === 'admin' || role === 'accountant') rows = await query(`${base} ORDER BY p.created_at DESC`);
  else rows = await query(
    `${base} WHERE p.manager_id=@id OR EXISTS (SELECT 1 FROM assignments a JOIN tasks t ON t.id=a.task_id
       WHERE a.user_id=@id AND t.project_id=p.id) ORDER BY p.created_at DESC`, { id });
  res.json(rows);
}));

// Dự án + công việc mà người dùng được phân công (dùng cho form chấm công)
router.get('/mine/tasks', ah(async (req, res) => {
  const rows = await query(
    `SELECT p.id AS project_id, p.code, p.name AS project_name, t.id AS task_id, t.title
     FROM assignments a JOIN tasks t ON t.id=a.task_id JOIN projects p ON p.id=t.project_id
     WHERE a.user_id=@u AND p.status IN ('planning','active') ORDER BY p.name, t.title`, { u: req.user.id });
  res.json(rows);
}));

router.post('/', requireRole('admin', 'pm'), ah(async (req, res) => {
  const b = req.body;
  const code = required(b.code, 'mã dự án').toUpperCase();
  const name = required(b.name, 'tên dự án');
  const manager_id = req.user.role === 'admin' && b.manager_id ? int(b.manager_id, 'manager_id') : req.user.id;
  if (await queryOne('SELECT 1 AS x FROM projects WHERE code=@code', { code })) throw new HttpError(409, 'Mã dự án đã tồn tại');
  const row = await queryOne(
    `INSERT INTO projects (code, name, description, manager_id, start_date, end_date, budget)
     OUTPUT INSERTED.id VALUES (@code, @name, @desc, @mgr, @sd, @ed, @budget)`,
    {
      code, name, desc: b.description || null, mgr: manager_id,
      sd: b.start_date ? dateStr(b.start_date) : null, ed: b.end_date ? dateStr(b.end_date) : null,
      budget: b.budget ? Math.round(Number(b.budget)) : null,
    });
  res.status(201).json({ id: row.id });
}));

router.get('/:id', ah(async (req, res) => {
  const project = await loadProject(int(req.params.id));
  await assertCanView(req.user, project);
  const packages = await query('SELECT id, name, sort_order FROM work_packages WHERE project_id=@id ORDER BY sort_order, id', { id: project.id });
  const tasks = await query(
    `SELECT id, work_package_id, title, description, status, priority, estimate_hours, ${D('due_date')} AS due_date
     FROM tasks WHERE project_id=@id ORDER BY priority, id`, { id: project.id });
  const assignees = await query(
    `SELECT a.task_id, u.id AS user_id, u.full_name FROM assignments a
     JOIN users u ON u.id=a.user_id JOIN tasks t ON t.id=a.task_id WHERE t.project_id=@id`, { id: project.id });
  for (const t of tasks) t.assignees = assignees.filter((a) => a.task_id === t.id).map(({ user_id, full_name }) => ({ user_id, full_name }));
  res.json({ ...project, can_manage: canManage(req.user, project), work_packages: packages, tasks });
}));

router.patch('/:id', ah(async (req, res) => {
  const project = await loadProject(int(req.params.id));
  if (!canManage(req.user, project)) throw new HttpError(403, 'Chỉ quản lý dự án hoặc admin được sửa');
  const b = req.body, sets = [], p = { id: project.id };
  if (b.name !== undefined) { sets.push('name=@name'); p.name = required(b.name, 'tên dự án'); }
  if (b.description !== undefined) { sets.push('description=@d'); p.d = b.description || null; }
  if (b.status !== undefined) {
    if (!['planning', 'active', 'done', 'archived'].includes(b.status)) throw new HttpError(400, 'Trạng thái không hợp lệ');
    sets.push('status=@s'); p.s = b.status;
  }
  if (b.start_date !== undefined) { sets.push('start_date=@sd'); p.sd = b.start_date ? dateStr(b.start_date) : null; }
  if (b.end_date !== undefined) { sets.push('end_date=@ed'); p.ed = b.end_date ? dateStr(b.end_date) : null; }
  if (b.budget !== undefined) { sets.push('budget=@bg'); p.bg = b.budget ? Math.round(Number(b.budget)) : null; }
  if (!sets.length) throw new HttpError(400, 'Không có gì để cập nhật');
  await query(`UPDATE projects SET ${sets.join(', ')} WHERE id=@id`, p);
  res.json({ ok: true });
}));

router.post('/:id/work-packages', ah(async (req, res) => {
  const project = await loadProject(int(req.params.id));
  if (!canManage(req.user, project)) throw new HttpError(403, 'Không đủ quyền');
  const row = await queryOne(
    'INSERT INTO work_packages (project_id, name) OUTPUT INSERTED.id VALUES (@p, @n)',
    { p: project.id, n: required(req.body.name, 'tên gói việc') });
  res.status(201).json({ id: row.id });
}));

async function setAssignees(q, taskId, userIds) {
  await q('DELETE FROM assignments WHERE task_id=@t', { t: taskId });
  for (const uid of [...new Set(userIds)])
    await q('INSERT INTO assignments (task_id, user_id) VALUES (@t, @u)', { t: taskId, u: uid });
}

router.post('/:id/tasks', ah(async (req, res) => {
  const project = await loadProject(int(req.params.id));
  if (!canManage(req.user, project)) throw new HttpError(403, 'Không đủ quyền');
  const b = req.body;
  const est = Number(b.estimate_hours || 0);
  if (!(est >= 0)) throw new HttpError(400, 'Ước lượng giờ không hợp lệ');
  const ids = (b.assignee_ids || []).map((x) => int(x, 'assignee'));
  const id = await withTx(async (q) => {
    const [row] = await q(
      `INSERT INTO tasks (project_id, work_package_id, title, description, priority, estimate_hours, due_date)
       OUTPUT INSERTED.id VALUES (@p, @wp, @title, @desc, @pr, @est, @due)`,
      {
        p: project.id, wp: b.work_package_id ? int(b.work_package_id) : null, title: required(b.title, 'tiêu đề'),
        desc: b.description || null, pr: [1, 2, 3].includes(Number(b.priority)) ? Number(b.priority) : 2,
        est, due: b.due_date ? dateStr(b.due_date) : null,
      });
    await setAssignees(q, row.id, ids);
    return row.id;
  });
  res.status(201).json({ id });
}));

// Cập nhật công việc: quản lý sửa mọi trường; người được phân công chỉ đổi trạng thái
router.patch('/tasks/:taskId', ah(async (req, res) => {
  const taskId = int(req.params.taskId);
  const task = await queryOne('SELECT id, project_id FROM tasks WHERE id=@id', { id: taskId });
  if (!task) throw new HttpError(404, 'Không tìm thấy công việc');
  const project = await loadProject(task.project_id);
  const manager = canManage(req.user, project);
  const assigned = await queryOne('SELECT 1 AS x FROM assignments WHERE task_id=@t AND user_id=@u', { t: taskId, u: req.user.id });
  if (!manager && !assigned) throw new HttpError(403, 'Không đủ quyền');

  const b = req.body, sets = [], p = { id: taskId };
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) throw new HttpError(400, 'Trạng thái không hợp lệ');
    sets.push('status=@st', b.status === 'done' ? 'completed_at=SYSUTCDATETIME()' : 'completed_at=NULL');
    p.st = b.status;
  }
  if (manager) {
    if (b.title !== undefined) { sets.push('title=@title'); p.title = required(b.title, 'tiêu đề'); }
    if (b.description !== undefined) { sets.push('description=@d'); p.d = b.description || null; }
    if (b.estimate_hours !== undefined) {
      if (!(Number(b.estimate_hours) >= 0)) throw new HttpError(400, 'Ước lượng giờ không hợp lệ');
      sets.push('estimate_hours=@est'); p.est = Number(b.estimate_hours);
    }
    if (b.priority !== undefined && [1, 2, 3].includes(Number(b.priority))) { sets.push('priority=@pr'); p.pr = Number(b.priority); }
    if (b.due_date !== undefined) { sets.push('due_date=@due'); p.due = b.due_date ? dateStr(b.due_date) : null; }
    if (b.work_package_id !== undefined) { sets.push('work_package_id=@wp'); p.wp = b.work_package_id ? int(b.work_package_id) : null; }
  }
  await withTx(async (q) => {
    if (sets.length) await q(`UPDATE tasks SET ${sets.join(', ')} WHERE id=@id`, p);
    if (manager && Array.isArray(b.assignee_ids)) await setAssignees(q, taskId, b.assignee_ids.map((x) => int(x, 'assignee')));
  });
  res.json({ ok: true });
}));

module.exports = router;
