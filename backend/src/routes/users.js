const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../db');
const { ah, HttpError, int, required } = require('../utils/http');
const { requireRole } = require('../middleware/auth');

const ROLES = ['admin', 'pm', 'employee', 'accountant'];

// Danh sách người dùng. Đơn giá lương chỉ admin/kế toán được thấy.
router.get('/', requireRole('admin', 'pm', 'accountant'), ah(async (req, res) => {
  const canSeeRate = ['admin', 'accountant'].includes(req.user.role);
  const rows = await query(
    `SELECT id, email, full_name, role, is_active ${canSeeRate ? ', hourly_rate' : ''} FROM users ORDER BY full_name`
  );
  res.json(rows);
}));

router.post('/', requireRole('admin'), ah(async (req, res) => {
  const email = required(req.body.email, 'email').toLowerCase();
  const full_name = required(req.body.full_name, 'họ tên');
  const password = required(req.body.password, 'mật khẩu');
  const role = req.body.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');
  if (password.length < 8) throw new HttpError(400, 'Mật khẩu tối thiểu 8 ký tự');
  const rate = Math.round(Number(req.body.hourly_rate || 0));
  if (!(rate >= 0)) throw new HttpError(400, 'Đơn giá không hợp lệ');
  if (await queryOne('SELECT 1 AS x FROM users WHERE email=@email', { email })) throw new HttpError(409, 'Email đã tồn tại');
  const hash = await bcrypt.hash(password, 10);
  const row = await queryOne(
    `INSERT INTO users (email, full_name, password_hash, role, hourly_rate)
     OUTPUT INSERTED.id VALUES (@email, @full_name, @hash, @role, @rate)`,
    { email, full_name, hash, role, rate }
  );
  res.status(201).json({ id: row.id });
}));

router.patch('/:id', requireRole('admin'), ah(async (req, res) => {
  const id = int(req.params.id);
  const sets = [];
  const p = { id };
  if (req.body.full_name !== undefined) { sets.push('full_name=@full_name'); p.full_name = required(req.body.full_name, 'họ tên'); }
  if (req.body.role !== undefined) {
    if (!ROLES.includes(req.body.role)) throw new HttpError(400, 'Vai trò không hợp lệ');
    sets.push('role=@role'); p.role = req.body.role;
  }
  if (req.body.hourly_rate !== undefined) {
    const r = Math.round(Number(req.body.hourly_rate));
    if (!(r >= 0)) throw new HttpError(400, 'Đơn giá không hợp lệ');
    sets.push('hourly_rate=@rate'); p.rate = r;
  }
  if (req.body.is_active !== undefined) { sets.push('is_active=@act'); p.act = req.body.is_active ? 1 : 0; }
  if (req.body.password) {
    if (String(req.body.password).length < 8) throw new HttpError(400, 'Mật khẩu tối thiểu 8 ký tự');
    sets.push('password_hash=@hash'); p.hash = await bcrypt.hash(String(req.body.password), 10);
  }
  if (!sets.length) throw new HttpError(400, 'Không có gì để cập nhật');
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id=@id`, p);
  res.json({ ok: true });
}));

module.exports = router;
