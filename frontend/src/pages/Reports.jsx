import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alert, Empty } from '../components/ui';
import { dmy, fmtMin, vnd } from '../util';

function BurndownChart({ data }) {
  const W = 720, H = 280, m = { l: 48, r: 16, t: 14, b: 30 };
  const n = data.series.length;
  const max = Math.max(1, data.total_hours);
  const x = (i) => m.l + (i / Math.max(1, n - 1)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - v / max) * (H - m.t - m.b);
  const path = (key) => data.series.map((p, i) => (p[key] == null ? null : `${i && data.series[i - 1][key] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`)).filter(Boolean).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ burn-down">
      {ticks.map((t) => (<g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="#e3e8ec" /><text x={m.l - 6} y={y(t) + 4} textAnchor="end">{Math.round(t)}</text></g>))}
      <text x={m.l} y={H - 8}>{dmy(data.start)}</text>
      <text x={W - m.r} y={H - 8} textAnchor="end">{dmy(data.end)}</text>
      <path d={path('ideal')} fill="none" stroke="#9aa7b2" strokeWidth="2" strokeDasharray="6 4" />
      <path d={path('remaining')} fill="none" stroke="#0e7c86" strokeWidth="2.5" />
    </svg>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('burndown');
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState('');
  const [burn, setBurn] = useState(null);
  const [cost, setCost] = useState(null);
  const [prod, setProd] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/projects').then((p) => { setProjects(p); if (p[0]) setPid(String(p[0].id)); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (tab === 'burndown' && pid) api.get(`/reports/burndown?projectId=${pid}`).then(setBurn).catch((e) => setError(e.message));
  }, [tab, pid]);
  const q = () => `?${range.from ? `from=${range.from}&` : ''}${range.to ? `to=${range.to}` : ''}`;
  useEffect(() => {
    if (tab === 'cost') api.get(`/reports/project-cost${q()}`).then(setCost).catch((e) => setError(e.message));
    if (tab === 'prod') api.get(`/reports/productivity${q()}`).then(setProd).catch((e) => setError(e.message));
  }, [tab, range]); // eslint-disable-line

  const TABS = [['burndown', 'Burn-down'], ['cost', 'Chi phí theo dự án'], ['prod', 'Năng suất']];
  return (
    <>
      <div className="page-head"><div><h1>Báo cáo</h1></div></div>
      <Alert error={error} />
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab !== 'burndown' && (
        <div className="row" style={{ marginBottom: 14 }}>
          <label className="row">Từ <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label className="row">Đến <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        </div>)}

      {tab === 'burndown' && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 10 }}>
            <select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Chọn dự án">{projects.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}</select>
            {burn && <span className="muted">Tổng ước lượng: {burn.total_hours} giờ · nét đứt: đường lý tưởng, nét liền: còn lại thực tế</span>}
          </div>
          {burn && burn.total_hours > 0 ? <BurndownChart data={burn} /> : <Empty>Dự án chưa có công việc kèm giờ ước lượng để vẽ burn-down.</Empty>}
        </div>)}

      {tab === 'cost' && (
        <div className="card table-wrap">
          <p className="muted">Chi phí = đơn giá giờ × thời gian trong timesheet đã duyệt, chưa gồm phần tăng thêm của OT và phụ cấp đêm.</p>
          {!cost || cost.length === 0 ? <Empty>Chưa có timesheet đã duyệt trong khoảng này.</Empty> : (
            <table>
              <thead><tr><th>Dự án</th><th className="num">Giờ đã duyệt</th><th className="num">Chi phí</th><th className="num">Ngân sách</th><th className="num">Đã dùng</th></tr></thead>
              <tbody>{cost.map((r) => (
                <tr key={r.id}><td>{r.code} – {r.name}</td><td className="num">{fmtMin(r.minutes)}</td><td className="num">{vnd(r.cost)}</td>
                  <td className="num">{r.budget ? vnd(r.budget) : '—'}</td><td className="num">{r.budget ? `${Math.round((r.cost / r.budget) * 100)}%` : '—'}</td></tr>))}</tbody>
            </table>)}
        </div>)}

      {tab === 'prod' && (
        <div className="card table-wrap">
          {!prod || prod.rows.length === 0 ? <Empty>Chưa có dữ liệu trong khoảng này.</Empty> : (
            <table>
              <thead><tr><th>Nhân viên</th><th className="num">Giờ làm (đã duyệt)</th><th className="num">Việc hoàn thành</th><th className="num">Giờ ước lượng hoàn thành</th></tr></thead>
              <tbody>{prod.rows.map((r) => (<tr key={r.id}><td>{r.full_name}</td><td className="num">{fmtMin(r.worked_minutes)}</td><td className="num">{r.tasks_done}</td><td className="num">{Number(r.estimate_done_hours)}</td></tr>))}</tbody>
            </table>)}
        </div>)}
    </>
  );
}
