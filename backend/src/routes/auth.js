const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { queryOne } = require('../db');
const { ah, HttpError, required } = require('../utils/http');
const { signToken, auth } = require('../middleware/auth');

router.post('/login', ah(async (req, res) => {
  const email = required(req.body.email, 'email').toLowerCase();
  const password = required(req.body.password, 'mật khẩu');
  const u = await queryOne('SELECT * FROM users WHERE email=@email AND is_active=1', { email });
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    throw new HttpError(401, 'Email hoặc mật khẩu không đúng');
  res.json({
    token: signToken(u),
    user: { id: u.id, email: u.email, full_name: u.full_name, role: u.role },
  });
}));

router.get('/me', auth, ah(async (req, res) => {
  const u = await queryOne('SELECT id, email, full_name, role FROM users WHERE id=@id AND is_active=1', { id: req.user.id });
  if (!u) throw new HttpError(401, 'Tài khoản không còn hiệu lực');
  res.json(u);
}));

module.exports = router;
