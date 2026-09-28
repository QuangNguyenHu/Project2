const TZ = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh';
const pad = (n) => String(n).padStart(2, '0');

/** Ngày + số giây trong ngày theo múi giờ của công ty. */
function nowLocal(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const h = g('hour') % 24;
  return {
    date: `${g('year')}-${pad(g('month'))}-${pad(g('day'))}`,
    seconds: h * 3600 + g('minute') * 60 + g('second'),
  };
}

/** Làm tròn đến phút gần nhất (>= 30 giây thì lên phút kế tiếp). */
function roundToMinute(seconds) {
  return Math.round(seconds / 60);
}

function parseHHmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
}
function fmtHHmm(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Thứ Hai của tuần chứa ngày này. */
function weekStartOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return addDays(dateStr, -((d.getUTCDay() + 6) % 7));
}
function monthRange(year, month) {
  const from = `${year}-${pad(month)}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  return { from, to: next };
}

module.exports = { nowLocal, roundToMinute, parseHHmm, fmtHHmm, addDays, weekStartOf, monthRange };
