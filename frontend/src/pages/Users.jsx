import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alert, Badge, Field, Modal } from '../components/ui';
import { ROLE, vnd } from '../util';

export default function Users() {
  const [rows, setRows] = useState([]);
  const [rates, setRates] = useState({});
  const [modal, setModal] = useState(false);
  const [f, setF] = useState({ email: '', full_name: '', password: '', role: 'employee', hourly_rate: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = () => api.get('/users').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const act = async (fn, msg) => { setError(''); setOk(''); try { await fn(); setOk(msg); load(); } catch (e) { setError(e.message); } };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <div className="page-head"><div><h1>Người dùng</h1><p>Phân quyền và đơn giá lương theo giờ</p></div>
        <button className="btn" onClick={() => setModal(true)}>Thêm người dùng</button></div>
      <Alert error={error} ok={ok} />
      <div className="card table-wrap"><table>
        <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th className="num">Đơn giá/giờ</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td>
            <td><select value={u.role} onChange={(e) => act(() => api.patch(`/users/${u.id}`, { role: e.target.value }), 'Đã đổi vai trò (có hiệu lực ở lần đăng nhập sau của người đó)')}>
              {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
            <td className="num"><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
              <input type="number" min="0" style={{ width: 110 }} value={rates[u.id] ?? Number(u.hourly_rate)} onChange={(e) => setRates({ ...rates, [u.id]: e.target.value })} aria-label={`Đơn giá của ${u.full_name}`} />
              <button className="btn btn-line btn-sm" onClick={() => act(() => api.patch(`/users/${u.id}`, { hourly_rate: Number(rates[u.id] ?? u.hourly_rate) }), `Đã lưu đơn giá ${vnd(rates[u.id] ?? u.hourly_rate)}/giờ`)}>Lưu</button></div></td>
            <td><Badge tone={u.is_active ? 'ok' : 'neutral'}>{u.is_active ? 'Đang hoạt động' : 'Đã khoá'}</Badge></td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => act(() => api.patch(`/users/${u.id}`, { is_active: !u.is_active }), u.is_active ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản')}>{u.is_active ? 'Khoá' : 'Mở khoá'}</button></td></tr>))}</tbody>
      </table></div>

      {modal && (
        <Modal title="Thêm người dùng" onClose={() => setModal(false)}>
          <form onSubmit={(e) => { e.preventDefault(); act(async () => { await api.post('/users', { ...f, hourly_rate: Number(f.hourly_rate || 0) }); setModal(false); setF({ email: '', full_name: '', password: '', role: 'employee', hourly_rate: '' }); }, 'Đã tạo người dùng'); }}>
            <div className="form-grid">
              <Field label="Họ tên"><input value={f.full_name} onChange={set('full_name')} required /></Field>
              <Field label="Email"><input type="email" value={f.email} onChange={set('email')} required /></Field>
              <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự"><input type="password" minLength={8} value={f.password} onChange={set('password')} required /></Field>
              <Field label="Vai trò"><select value={f.role} onChange={set('role')}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Đơn giá/giờ (đ)"><input type="number" min="0" value={f.hourly_rate} onChange={set('hourly_rate')} /></Field>
            </div>
            <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}><button className="btn">Tạo người dùng</button></div>
          </form>
        </Modal>)}
    </>
  );
}
