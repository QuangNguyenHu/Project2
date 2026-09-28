require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'PmPayroll',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};
if (process.env.DB_INSTANCE) config.options.instanceName = process.env.DB_INSTANCE;
else config.port = Number(process.env.DB_PORT || 1433);

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((e) => {
      poolPromise = null;
      throw e;
    });
  }
  return poolPromise;
}

function bind(request, params) {
  for (const [k, v] of Object.entries(params || {})) request.input(k, v === undefined ? null : v);
  return request;
}

async function query(text, params) {
  const pool = await getPool();
  const result = await bind(pool.request(), params).query(text);
  return result.recordset || [];
}

async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

/** Chạy nhiều câu lệnh trong một transaction. fn nhận hàm q(text, params). */
async function withTx(fn) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const q = async (text, params) => {
    const result = await bind(new sql.Request(tx), params).query(text);
    return result.recordset || [];
  };
  try {
    const out = await fn(q);
    await tx.commit();
    return out;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

module.exports = { sql, query, queryOne, withTx, getPool };
