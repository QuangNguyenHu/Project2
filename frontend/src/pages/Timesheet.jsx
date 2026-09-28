import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Alert, Badge, Field, statusTone } from '../components/ui';
import { addDays, dmy, fmtMin, hhmm, today, TS_STATUS, weekdayName } from '../util';

export default function Timesheet() {
  const [anchor, setAnchor] = useState(today());
  const [data, setData] = useState(null);
  const [mine, setMine] = useState([]); // dự án/công việc được phân công
  const [f, setF] = useState({ work_date: today(), project_id: '', task_id: '', start: '08:00', end: '17:00', note: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = () => api.get(`/timesheets/mine?week=${anchor}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [anchor]); // eslint-disable-line
  useEffect(() => { api.get('/projects/mine/tasks').then(setMine).catch((e) => setError(e.message)); }, []);

  const projects = useMemo(() => [...new Map(mine.map((m) => [m.project_id, m])).values()], [mine]);
  const tasks = mine.filter((m) => String(m.project_id) === String(f.project_id));
  const status = data?.timesheet?.status;
  const editable = !status || status === 'draft' || status === 'rejected';
  const days = data ? Array.from({ length: 7 }, (_, i) => addDays(data.week_start, i)) : [];
  const total = data?.entries.reduce((s, e) => s + (e.minutes || 0), 0) || 0;
  const open = data?.entries.find((e) => e.end_min == null);

  const run = async (fn, success) => {
    setError(''); setOk('');
    try { await fn(); if (success) setOk(success); await load(); }
    catch (e) { setError(e.message); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'project_id' ? { task_id: '' } : {}) });
  const need = () => { if (!f.project_id) { setError('Hãy chọn dự án trước'); return false; } return true; };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Chấm công</h1>
          <p>Tuần {data && `${dmy(data.week_start)} – ${dmy(data.week_end)}`} · Tổng {fmtMin(total)}</p>
        </div>
        <div className="row">
          <button className="btn btn-line" onClick={() => setAnchor(addDays(anchor, -7))}>Tuần trước</button>
          <button className="btn btn-line" onClick={() => setAnchor(today())}>Tuần này</button>
          <button className="btn btn-line" onClick={() => setAnchor(addDays(anchor, 7))}>Tuần sau</button>
          {status && <Badge tone={statusTone(status)}>{TS_STATUS[status]}</Badge>}
        </div>
      </div>
      <Alert error={error} ok={ok} />
      {status === 'rejected' && data.timesheet.review_note && <Alert error={`Timesheet bị từ chối: ${data.timesheet.review_note}. Hãy chỉnh sửa rồi gửi lại.`} />}

      {editable && (
        <div className="card">
          <h2>Thêm giờ làm</h2>
          {mine.length === 0 && <p className="muted">Bạn chưa được phân công công việc nào nên chưa thể chấm công. Hãy liên hệ quản lý dự án.</p>}
          <div className="form-grid">
            <Field label="Dự án">
              <select value={f.project_id} onChange={set('project_id')}>
                <option value="">Chọn dự án</option>
                {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.code} – {p.project_name}</option>)}
              </select>
            </Field>
            <Field label="Công việc">
              <select value={f.task_id} onChange={set('task_id')} disabled={!f.project_id}>
                <option value="">Không chọn</option>
                {tasks.map((t) => <option key={t.task_id} value={t.task_id}>{t.title}</option>)}
              </select>
            </Field>
            <Field label="Ngày">
              <select value={f.work_date} onChange={set('work_date')}>
                {days.map((d) => <option key={d} value={d}>{weekdayName(d)} {dmy(d)}</option>)}
              </select>
            </Field>
            <Field label="Từ"><input type="time" value={f.start} onChange={set('start')} /></Field>
            <Field label="Đến"><input type="time" value={f.end} onChange={set('end')} /></Field>
            <Field label="Ghi chú"><input value={f.note} onChange={set('note')} /></Field>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => need() && run(() => api.post('/timesheets/entries', f), 'Đã thêm dòng chấm công')}>Thêm dòng</button>
            <span className="muted">hoặc chấm công trực tiếp (giờ được làm tròn đến phút gần nhất):</span>
            <button className="btn btn-line" disabled={!!open} onClick={() => need() && run(() => api.post('/timesheets/check-in', { project_id: f.project_id, task_id: f.task_id || undefined }), 'Đã check-in')}>Check-in</button>
            <button className="btn btn-line" disabled={!open} onClick={() => run(() => api.post('/timesheets/check-out'), 'Đã check-out')}>Check-out</button>
          </div>
        </div>
      )}

      {days.map((d) => {
        const es = data.entries.filter((e) => e.work_date === d);
        const dayTotal = es.reduce((s, e) => s + (e.minutes || 0), 0);
        return (
          <div className="day" key={d}>
            <div className="day-head">
              <span>{weekdayName(d)} {dmy(d)}</span>
              <span>{dayTotal ? fmtMin(dayTotal) : '—'}{dayTotal > 480 && <> · <span style={{ color: 'var(--warn)' }}>vượt 8 giờ: {fmtMin(dayTotal - 480)} OT</span></>}</span>
            </div>
            {es.map((e) => (
              <div key={e.id} className={`entry ${e.end_min == null ? 'open' : ''}`}>
                <span>{hhmm(e.start_min)} – {e.end_min == null ? 'đang chạy' : hhmm(e.end_min)}</span>
                <span>{e.project_code}{e.task_title ? ` · ${e.task_title}` : ''}{e.note ? <span className="muted"> — {e.note}</span> : null}</span>
                <span>{e.minutes ? fmtMin(e.minutes) : ''}</span>
                {editable ? <button className="btn btn-ghost btn-sm" onClick={() => run(() => api.del(`/timesheets/entries/${e.id}`))}>Xoá</button> : <span />}
              </div>))}
          </div>);
      })}

      {editable && data?.entries.length > 0 && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={() => run(() => api.post('/timesheets/submit', { week: data.week_start }), 'Đã gửi timesheet chờ duyệt')}>Gửi duyệt tuần này</button>
        </div>
      )}
    </>
  );
}
