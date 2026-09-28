import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert, Badge, Empty, Field, statusTone } from '../components/ui';
import { dmy, LEAVE_STATUS, LEAVE_TYPE, today } from '../util';

export default function Leaves() {
  const { user } = useAuth();
  const approver = ['admin', 'pm'].includes(user.role);
  const [mine, setMine] = useState([]);
  const [pending, setPending] = useState([]);
  const [f, setF] = useState({ leave_type: 'annual', start_date: today(), end_date: today(), hours: 8, reason: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = () => {
    api.get('/leaves/mine').then(setMine).catch((e) => setError(e.message));
    if (approver) api.get('/leaves/pending').then(setPending).catch((e) => setError(e.message));
  };
  useEffect(load, []); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const act = async (fn, msg) => {
    setError(''); setOk('');
    try { await fn(); setOk(msg); load(); } catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Nghỉ phép</h1><p>Nghỉ phép năm được tính lương theo đơn giá giờ; nghỉ không lương thì không</p></div></div>
      <Alert error={error} ok={ok} />

      <div className="card">
        <h2>Tạo đơn nghỉ</h2>
        <form onSubmit={(e) => { e.preventDefault(); act(() => api.post('/leaves', { ...f, hours: Number(f.hours) }), 'Đã gửi đơn nghỉ'); }}>
          <div className="form-grid">
            <Field label="Loại nghỉ">
              <select value={f.leave_type} onChange={set('leave_type')}>{Object.entries(LEAVE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Field>
            <Field label="Từ ngày"><input type="date" value={f.start_date} onChange={set('start_date')} required /></Field>
            <Field label="Đến ngày"><input type="date" value={f.end_date} onChange={set('end_date')} required /></Field>
            <Field label="Tổng số giờ nghỉ" hint="Tối đa 8 giờ mỗi ngày"><input type="number" min="0.5" step="0.5" value={f.hours} onChange={set('hours')} required /></Field>
            <Field label="Lý do"><input value={f.reason} onChange={set('reason')} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><button className="btn">Gửi đơn</button></div>
        </form>
      </div>

      {approver && (
        <div className="card">
          <h2>Đơn chờ duyệt</h2>
          {pending.length === 0 ? <Empty>Không có đơn nào đang chờ.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Nhân viên</th><th>Loại</th><th>Thời gian</th><th className="num">Giờ</th><th>Lý do</th><th></th></tr></thead>
              <tbody>{pending.map((l) => (
                <tr key={l.id}><td>{l.full_name}</td><td>{LEAVE_TYPE[l.leave_type]}</td><td>{dmy(l.start_date)} – {dmy(l.end_date)}</td>
                  <td className="num">{Number(l.hours)}</td><td>{l.reason}</td>
                  <td className="row">
                    <button className="btn btn-sm" onClick={() => act(() => api.post(`/leaves/${l.id}/review`, { action: 'approve' }), 'Đã duyệt đơn')}>Duyệt</button>
                    <button className="btn btn-danger btn-sm" onClick={() => act(() => api.post(`/leaves/${l.id}/review`, { action: 'reject' }), 'Đã từ chối đơn')}>Từ chối</button>
                  </td></tr>))}</tbody>
            </table></div>)}
        </div>)}

      <div className="card">
        <h2>Đơn của tôi</h2>
        {mine.length === 0 ? <Empty>Bạn chưa có đơn nghỉ nào.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Loại</th><th>Thời gian</th><th className="num">Giờ</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>{mine.map((l) => (
              <tr key={l.id}><td>{LEAVE_TYPE[l.leave_type]}</td><td>{dmy(l.start_date)} – {dmy(l.end_date)}</td><td className="num">{Number(l.hours)}</td>
                <td><Badge tone={statusTone(l.status)}>{LEAVE_STATUS[l.status]}</Badge></td>
                <td>{l.status === 'pending' && <button className="btn btn-ghost btn-sm" onClick={() => act(() => api.del(`/leaves/${l.id}`), 'Đã huỷ đơn')}>Huỷ đơn</button>}</td></tr>))}</tbody>
          </table></div>)}
      </div>
    </>
  );
}
