class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function int(v, name = 'id') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} không hợp lệ`);
  return n;
}
function dateStr(v, name = 'ngày') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z')))
    throw new HttpError(400, `${name} không hợp lệ (định dạng YYYY-MM-DD)`);
  return v;
}
function required(v, name) {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `Thiếu ${name}`);
  return v.trim();
}

module.exports = { HttpError, ah, int, dateStr, required };
