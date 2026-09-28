/* Tạo dữ liệu mẫu: 5 tài khoản, 1 dự án, vài công việc và 1 tuần công đã duyệt để thử chạy lương. */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, queryOne, withTx, getPool } = require('../src/db');
const { nowLocal, weekStartOf, addDays } = require('../src/utils/time');

const PASSWORD = 'Matkhau@123';

async function main() {
  if ((await queryOne('SELECT COUNT(*) AS n FROM users')).n > 0) {
    console.log('Đã có dữ liệu người dùng, bỏ qua seed.');
    return;
  }
  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = [
    ['admin@example.com', 'Quản trị viên', 'admin', 0],
    ['pm@example.com', 'Trần Minh PM', 'pm', 150000],
    ['nv1@example.com', 'Nguyễn Văn An', 'employee', 60000],
    ['nv2@example.com', 'Lê Thị Bình', 'employee', 55000],
    ['ketoan@example.com', 'Phạm Kế Toán', 'accountant', 70000],
  ];
  const ids = {};
  for (const [email, name, role, rate] of users) {
    const r = await queryOne(
      `INSERT INTO users (email, full_name, password_hash, role, hourly_rate) OUTPUT INSERTED.id VALUES (@e,@n,@h,@r,@rate)`,
      { e: email, n: name, h: hash, r: role, rate });
    ids[email] = r.id;
  }

  await withTx(async (q) => {
    const [p] = await q(
      `INSERT INTO projects (code, name, description, manager_id, start_date, end_date, budget)
       OUTPUT INSERTED.id VALUES ('WEB01', N'Website bán hàng', N'Dự án mẫu', @m, @sd, @ed, 200000000)`,
      { m: ids['pm@example.com'], sd: addDays(nowLocal().date, -30), ed: addDays(nowLocal().date, 30) });
    const [wp] = await q(`INSERT INTO work_packages (project_id, name) OUTPUT INSERTED.id VALUES (@p, N'Giai đoạn 1')`, { p: p.id });
    const tasks = [
      ['Thiết kế cơ sở dữ liệu', 'done', 16, 'nv1@example.com'],
      ['Xây dựng API đăng nhập', 'doing', 24, 'nv1@example.com'],
      ['Giao diện danh sách sản phẩm', 'todo', 20, 'nv2@example.com'],
      ['Trang giỏ hàng', 'todo', 16, 'nv2@example.com'],
    ];
    for (const [title, status, est, who] of tasks) {
      const [t] = await q(
        `INSERT INTO tasks (project_id, work_package_id, title, status, estimate_hours, completed_at)
         OUTPUT INSERTED.id VALUES (@p, @wp, @t, @s, @e, ${status === 'done' ? 'SYSUTCDATETIME()' : 'NULL'})`,
        { p: p.id, wp: wp.id, t: title, s: status, e: est });
      await q('INSERT INTO assignments (task_id, user_id) VALUES (@t, @u)', { t: t.id, u: ids[who] });
    }

    // Một tuần công đã duyệt của nv1 (tuần trước), có 1 ngày làm 10 giờ để thấy OT
    const week = addDays(weekStartOf(nowLocal().date), -7);
    const [ts] = await q(
      `INSERT INTO timesheets (user_id, week_start, status, submitted_at, reviewed_by, reviewed_at)
       OUTPUT INSERTED.id VALUES (@u, @w, 'approved', SYSUTCDATETIME(), @pm, SYSUTCDATETIME())`,
      { u: ids['nv1@example.com'], w: week, pm: ids['pm@example.com'] });
    const days = [[0, 480, 720, 780, 1140], [1, 480, 720, 780, 1020], [2, 480, 720, 780, 1020]]; // T2 làm 10 giờ
    for (const [off, s1, e1, s2, e2] of days) {
      for (const [s, e] of [[s1, e1], [s2, e2]])
        await q(
          `INSERT INTO timesheet_entries (timesheet_id, work_date, project_id, start_min, end_min) VALUES (@ts,@d,@p,@s,@e)`,
          { ts: ts.id, d: addDays(week, off), p: p.id, s, e });
    }
  });
  console.log('Seed xong. Mật khẩu chung cho mọi tài khoản mẫu: ' + PASSWORD);
  console.log(users.map((u) => `  ${u[0]}  (${u[2]})`).join('\n'));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  try { (await getPool()).close(); } catch { /* ignore */ }
});
