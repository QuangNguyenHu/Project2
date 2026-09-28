const { HttpError } = require('../utils/http');
const { parseHHmm, weekStartOf } = require('../utils/time');

/** Lấy (hoặc tạo) timesheet tuần của user; chỉ cho sửa khi draft/rejected. */
async function ensureEditableTimesheet(q, userId, workDate) {
  const weekStart = weekStartOf(workDate);
  let ts = (await q(
    'SELECT id, status FROM timesheets WHERE user_id=@u AND week_start=@w',
    { u: userId, w: weekStart }
  ))[0];
  if (!ts) {
    ts = (await q(
      `INSERT INTO timesheets (user_id, week_start) OUTPUT INSERTED.id, INSERTED.status VALUES (@u, @w)`,
      { u: userId, w: weekStart }
    ))[0];
  }
  if (ts.status === 'submitted' || ts.status === 'approved')
    throw new HttpError(409, 'Timesheet tuần này đã gửi/duyệt, không thể chỉnh sửa');
  return ts;
}

async function assertAssigned(q, userId, projectId, taskId) {
  const ok = await q(
    `SELECT TOP 1 1 AS ok FROM assignments a JOIN tasks t ON t.id = a.task_id
     WHERE a.user_id=@u AND t.project_id=@p ${taskId ? 'AND t.id=@t' : ''}`,
    { u: userId, p: projectId, t: taskId || null }
  );
  if (!ok.length) throw new HttpError(403, 'Bạn chưa được phân công công việc nào trong dự án này');
}

async function assertNoOverlap(q, userId, workDate, startMin, endMin) {
  const rows = await q(
    `SELECT TOP 1 1 AS x FROM timesheet_entries e JOIN timesheets t ON t.id = e.timesheet_id
     WHERE t.user_id=@u AND e.work_date=@d AND e.start_min < @e AND COALESCE(e.end_min, 1440) > @s`,
    { u: userId, d: workDate, s: startMin, e: endMin }
  );
  if (rows.length) throw new HttpError(409, 'Khoảng thời gian bị trùng với một dòng chấm công khác trong ngày');
}

/**
 * Thêm một dòng chấm công. Giờ vào/ra nhập tay dạng HH:mm (đã là phút nguyên);
 * check-in/check-out tự động làm tròn ở route tương ứng.
 */
async function insertEntry(q, userId, { work_date, project_id, task_id, start_min, end_min, note }) {
  if (end_min != null && !(end_min > start_min)) throw new HttpError(400, 'Giờ kết thúc phải sau giờ bắt đầu');
  if (start_min < 0 || start_min > 1439 || (end_min != null && end_min > 1440))
    throw new HttpError(400, 'Giờ không hợp lệ (ca làm việc không được qua nửa đêm; hãy tách thành 2 dòng)');
  const ts = await ensureEditableTimesheet(q, userId, work_date);
  await assertAssigned(q, userId, project_id, task_id);
  await assertNoOverlap(q, userId, work_date, start_min, end_min ?? 1440);
  if (task_id) {
    const t = await q('SELECT 1 AS ok FROM tasks WHERE id=@t AND project_id=@p', { t: task_id, p: project_id });
    if (!t.length) throw new HttpError(400, 'Công việc không thuộc dự án đã chọn');
  }
  const [row] = await q(
    `INSERT INTO timesheet_entries (timesheet_id, work_date, project_id, task_id, start_min, end_min, note)
     OUTPUT INSERTED.id VALUES (@ts, @d, @p, @t, @s, @e, @n)`,
    { ts: ts.id, d: work_date, p: project_id, t: task_id || null, s: start_min, e: end_min ?? null, n: note || null }
  );
  return row.id;
}

const parseTimes = (start, end) => {
  const s = parseHHmm(start), e = parseHHmm(end);
  if (s == null || e == null) throw new HttpError(400, 'Giờ phải có dạng HH:mm');
  return { start_min: s, end_min: e };
};

module.exports = { insertEntry, parseTimes, ensureEditableTimesheet };
