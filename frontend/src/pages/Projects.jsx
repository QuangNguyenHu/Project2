import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert, Badge, Empty, Field, Modal } from '../components/ui';
import { dmy } from '../util';

const PROJECT_STATUS = { planning: 'Lập kế hoạch', active: 'Đang chạy', done: 'Hoàn thành', archived: 'Lưu trữ' };

export default function Projects() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', start_date: '', end_date: '', budget: '', manager_id: '' });
  const [error, setError] = useState('');
  const canCreate = ['admin', 'pm'].includes(user.role);

  const load = () => api.get('/projects').then(setRows).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    if (user.role === 'admin') api.get('/users').then((u) => setUsers(u.filter((x) => x.role === 'pm' || x.role === 'admin'))).catch(() => {});
  }, []); // eslint-disable-line

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/projects', { ...form, manager_id: form.manager_id || undefined });
      setOpen(false);
      setForm({ code: '', name: '', description: '', start_date: '', end_date: '', budget: '', manager_id: '' });
      load();
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Dự án</h1><p>{user.role === 'employee' ? 'Các dự án bạn được phân công' : 'Tất cả dự án bạn có quyền xem'}</p></div>
        {canCreate && <button className="btn" onClick={() => setOpen(true)}>Tạo dự án</button>}
      </div>
      <Alert error={error} />
      <div className="card table-wrap">
        {rows.length === 0 ? <Empty>Chưa có dự án nào.</Empty> : (
          <table>
            <thead><tr><th>Mã</th><th>Tên dự án</th><th>Quản lý</th><th>Thời gian</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td><Link to={`/projects/${p.id}`}>{p.name}</Link></td>
                <td>{p.manager_name}</td>
                <td>{dmy(p.start_date)} – {dmy(p.end_date)}</td>
                <td>{p.done_count}/{p.task_count} việc</td>
                <td><Badge tone={p.status === 'active' ? 'ok' : 'neutral'}>{PROJECT_STATUS[p.status]}</Badge></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal title="Tạo dự án" onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <div className="form-grid">
              <Field label="Mã dự án"><input value={form.code} onChange={set('code')} required /></Field>
              <Field label="Tên dự án"><input value={form.name} onChange={set('name')} required /></Field>
              <Field label="Ngày bắt đầu"><input type="date" value={form.start_date} onChange={set('start_date')} /></Field>
              <Field label="Ngày kết thúc"><input type="date" value={form.end_date} onChange={set('end_date')} /></Field>
              <Field label="Ngân sách (đ)"><input type="number" min="0" value={form.budget} onChange={set('budget')} /></Field>
              {user.role === 'admin' && (
                <Field label="Quản lý dự án">
                  <select value={form.manager_id} onChange={set('manager_id')}>
                    <option value="">Chính tôi</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </Field>)}
            </div>
            <Field label="Mô tả"><textarea rows={3} value={form.description} onChange={set('description')} /></Field>
            <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}><button className="btn">Tạo dự án</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
