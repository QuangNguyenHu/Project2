import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Alert, Field, Modal } from '../components/ui';
import { dmy, TASK_COLS } from '../util';

const emptyTask = { title: '', description: '', estimate_hours: '', priority: 2, due_date: '', work_package_id: '', assignee_ids: [] };

export default function ProjectDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // {mode:'new'|'edit', task}
  const [pkgName, setPkgName] = useState('');
  const [over, setOver] = useState('');
  const [error, setError] = useState('');

  const load = () => api.get(`/projects/${id}`).then(setP).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  useEffect(() => { api.get('/users').then(setUsers).catch(() => {}); }, []);

  if (!p) return <><Alert error={error} /><p className="empty">Đang tải…</p></>;

  const move = async (taskId, status) => {
    try { await api.patch(`/projects/tasks/${taskId}`, { status }); load(); }
    catch (e) { setError(e.message); }
  };
  const save = async (e) => {
    e.preventDefault();
    const t = modal.task;
    const body = { ...t, estimate_hours: Number(t.estimate_hours || 0), priority: Number(t.priority) };
    try {
      if (modal.mode === 'new') await api.post(`/projects/${id}/tasks`, body);
      else await api.patch(`/projects/tasks/${t.id}`, body);
      setModal(null);
      load();
    } catch (err) { setError(err.message); }
  };
  const addPackage = async (e) => {
    e.preventDefault();
    try { await api.post(`/projects/${id}/work-packages`, { name: pkgName }); setPkgName(''); load(); }
    catch (err) { setError(err.message); }
  };

  const setTask = (k, v) => setModal({ ...modal, task: { ...modal.task, [k]: v } });
  const toggleAssignee = (uid) => {
    const cur = modal.task.assignee_ids;
    setTask('assignee_ids', cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]);
  };
  const pkgName_ = (wp) => p.work_packages.find((w) => w.id === wp)?.name;

  return (
    <>
      <div className="page-head">
        <div>
          <p><Link to="/projects">← Dự án</Link></p>
          <h1>{p.code} · {p.name}</h1>
          <p>Quản lý: {p.manager_name} · {dmy(p.start_date)} – {dmy(p.end_date)}</p>
        </div>
        {p.can_manage && <button className="btn" onClick={() => setModal({ mode: 'new', task: { ...emptyTask } })}>Thêm công việc</button>}
      </div>
      <Alert error={error} />

      {p.can_manage && (
        <form className="row" onSubmit={addPackage} style={{ marginBottom: 14 }}>
          <input placeholder="Tên gói việc mới" value={pkgName} onChange={(e) => setPkgName(e.target.value)} required />
          <button className="btn btn-line">Thêm gói việc</button>
          <span className="muted">Gói việc hiện có: {p.work_packages.map((w) => w.name).join(', ') || 'chưa có'}</span>
        </form>
      )}

      <div className="kanban">
        {TASK_COLS.map((col) => {
          const tasks = p.tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className={`col ${over === col.key ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
              onDragLeave={() => setOver('')}
              onDrop={(e) => { e.preventDefault(); setOver(''); const tid = e.dataTransfer.getData('text/plain'); if (tid) move(Number(tid), col.key); }}>
              <h3><span>{col.label}</span><span className="muted">{tasks.length}</span></h3>
              {tasks.map((t) => (
                <div key={t.id} className={`task p${t.priority}`} draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}>
                  <b>{t.title}</b>
                  <small>{Number(t.estimate_hours)} giờ ước lượng{t.due_date ? ` · hạn ${dmy(t.due_date)}` : ''}</small>
                  {t.work_package_id && <small>Gói: {pkgName_(t.work_package_id)}</small>}
                  <small>{t.assignees.map((a) => a.full_name).join(', ') || 'Chưa phân công'}</small>
                  <div className="row" style={{ marginTop: 6 }}>
                    {TASK_COLS.filter((c) => c.key !== col.key).map((c) => (
                      <button key={c.key} className="btn btn-line btn-sm" onClick={() => move(t.id, c.key)}>→ {c.label}</button>))}
                    {p.can_manage && <button className="btn btn-ghost btn-sm"
                      onClick={() => setModal({ mode: 'edit', task: { ...t, due_date: t.due_date || '', work_package_id: t.work_package_id || '', assignee_ids: t.assignees.map((a) => a.user_id) } })}>Sửa</button>}
                  </div>
                </div>))}
            </div>);
        })}
      </div>

      {modal && (
        <Modal title={modal.mode === 'new' ? 'Thêm công việc' : 'Sửa công việc'} onClose={() => setModal(null)}>
          <form onSubmit={save}>
            <Field label="Tiêu đề"><input value={modal.task.title} onChange={(e) => setTask('title', e.target.value)} required /></Field>
            <div className="form-grid" style={{ margin: '12px 0' }}>
              <Field label="Ước lượng (giờ)"><input type="number" min="0" step="0.5" value={modal.task.estimate_hours} onChange={(e) => setTask('estimate_hours', e.target.value)} /></Field>
              <Field label="Ưu tiên">
                <select value={modal.task.priority} onChange={(e) => setTask('priority', e.target.value)}>
                  <option value={1}>Cao</option><option value={2}>Trung bình</option><option value={3}>Thấp</option>
                </select>
              </Field>
              <Field label="Hạn"><input type="date" value={modal.task.due_date} onChange={(e) => setTask('due_date', e.target.value)} /></Field>
              <Field label="Gói việc">
                <select value={modal.task.work_package_id} onChange={(e) => setTask('work_package_id', e.target.value)}>
                  <option value="">Không thuộc gói nào</option>
                  {p.work_packages.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            </div>
            <fieldset style={{ border: '1px solid var(--line)', borderRadius: 6, marginBottom: 12 }}>
              <legend>Phân công</legend>
              <div className="row">
                {users.filter((u) => u.is_active).map((u) => (
                  <label key={u.id} className="row" style={{ gap: 4 }}>
                    <input type="checkbox" checked={modal.task.assignee_ids.includes(u.id)} onChange={() => toggleAssignee(u.id)} />{u.full_name}
                  </label>))}
              </div>
            </fieldset>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn">Lưu công việc</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
