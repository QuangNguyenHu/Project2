import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alert, Empty } from '../components/ui';
import { dmy, fmtMin, hhmm, weekdayName } from '../util';

export default function Approvals() {
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState({}); // id -> timesheet
  const [note, setNote] = useState({});
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = () => api.get('/timesheets/pending').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const toggle = async (id) => {
    if (detail[id]) return setDetail({ ...detail, [id]: null });
    try { setDetail({ ...detail, [id]: await api.get(`/timesheets/${id}`) }); } catch (e) { setError(e.message); }
  };
  const review = async (id, action) => {
    setError(''); setOk('');
    try {
      await api.post(`/timesheets/${id}/review`, { action, note: note[id] });
      setOk(action === 'approve' ? 'Đã duyệt timesheet' : 'Đã từ chối timesheet');
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Duyệt timesheet</h1><p>Timesheet nhân viên đã gửi, chờ bạn xử lý</p></div></div>
      <Alert error={error} ok={ok} />
      {rows.length === 0 ? <div className="card"><Empty>Không có timesheet nào đang chờ duyệt.</Empty></div> : rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="row spread">
            <div><b>{r.full_name}</b> <span className="muted">· tuần {dmy(r.week_start)} · {fmtMin(r.total_minutes)}</span></div>
            <button className="btn btn-line btn-sm" onClick={() => toggle(r.id)}>{detail[r.id] ? 'Ẩn chi tiết' : 'Xem chi tiết'}</button>
          </div>
          {detail[r.id] && (
            <div className="table-wrap" style={{ margin: '10px 0' }}><table>
              <thead><tr><th>Ngày</th><th>Giờ</th><th>Dự án / công việc</th><th className="num">Thời lượng</th></tr></thead>
              <tbody>{detail[r.id].entries.map((e) => (
                <tr key={e.id}><td>{weekdayName(e.work_date)} {dmy(e.work_date)}</td><td>{hhmm(e.start_min)} – {hhmm(e.end_min)}</td>
                  <td>{e.project_code}{e.task_title ? ` · ${e.task_title}` : ''}</td><td className="num">{fmtMin(e.minutes)}</td></tr>))}</tbody>
            </table></div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <input style={{ flex: 1, minWidth: 220 }} placeholder="Ghi chú (bắt buộc khi từ chối)" value={note[r.id] || ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
            <button className="btn" onClick={() => review(r.id, 'approve')}>Duyệt</button>
            <button className="btn btn-danger" onClick={() => review(r.id, 'reject')}>Từ chối</button>
          </div>
        </div>))}
    </>
  );
}
