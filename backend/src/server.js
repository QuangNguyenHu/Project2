require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { auth } = require('./middleware/auth');
const { HttpError } = require('./utils/http');
const { getPool } = require('./db');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res) => {
  try { await getPool(); res.json({ ok: true }); }
  catch (e) { res.status(503).json({ ok: false, error: 'Không kết nối được SQL Server: ' + e.message }); }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', auth, require('./routes/users'));
app.use('/api/projects', auth, require('./routes/projects'));
app.use('/api/timesheets', auth, require('./routes/timesheets'));
app.use('/api/leaves', auth, require('./routes/leaves'));
app.use('/api/payroll', auth, require('./routes/payroll'));
app.use('/api/reports', auth, require('./routes/reports'));

app.use((req, res) => res.status(404).json({ error: 'Không tìm thấy đường dẫn' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API chạy tại http://localhost:${port}`));
