import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert, Badge, Empty, statusTone } from '../components/ui';
import { fmtMin, today, TS_STATUS } from '../util';

export default function Dashboard() {
  const { user } = useAuth();
  const privileged = ['admin', 'pm', 'accountant'].includes(user.role);
  const approver = ['admin', 'pm'].includes(user.role);
  const [week, setWeek] = useState(null);
  const [pendingTs, setPendingTs] = useState(null);
  const [pendingLeaves, setPendingLeaves] = useState(null);
  const [prod, setProd] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setWeek(await api.get('/timesheets/mine'));
        if (approver) {
          setPendingTs((await api.get('/timesheets/pending')).length);
          setPendingLeaves((await api.get('/leaves/pending')).length);
        }
        if (privileged) setProd(await api.get('/reports/productivity'));
      } catch (e) { setError(e.message); }
    })();
  }, []); // eslint-disable-line

  const total = week?.entries.reduce((s, e) => s + (e.minutes || 0), 0) || 0;
  const max = Math.max(1, ...(prod?.rows.map((r) => r.worked_minutes) || [1]));

  return (
    <>
      <div className="page-head">
        <div><h1>Xin chào, {user.full_name}</h1><p>Hôm nay {today().split('-').reverse().join('/')}</p></div>
      </div>
      <Alert error={error} />
      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="stat">
          <b>{fmtMin(total)}</b><span>Giờ đã chấm công tuần này</span>
        </div>
        <div className="stat">
          <b>{week?.timesheet ? <Badge tone={statusTone(week.timesheet.status)}>{TS_STATUS[week.timesheet.status]}</Badge> : '—'}</b>
          <span>Trạng thái timesheet tuần này</span>
        </div>
        {approver && <div className="stat"><b>{pendingTs ?? '…'}</b><span><Link to="/approvals">Timesheet chờ duyệt</Link></span></div>}
        {approver && <div className="stat"><b>{pendingLeaves ?? '…'}</b><span><Link to="/leaves">Đơn nghỉ chờ duyệt</Link></span></div>}
      </div>

      {privileged && (
        <div className="card">
          <h2>Năng suất từ {prod?.from.split('-').reverse().join('/')} đến {prod?.to.split('-').reverse().join('/')}</h2>
          {!prod || prod.rows.length === 0 ? <Empty>Chưa có timesheet đã duyệt hoặc công việc hoàn thành trong kỳ này.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Nhân viên</th><th>Giờ làm (đã duyệt)</th><th style={{ width: '25%' }}></th><th className="num">Việc hoàn thành</th><th className="num">Giờ ước lượng hoàn thành</th></tr></thead>
              <tbody>{prod.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.full_name}</td><td>{fmtMin(r.worked_minutes)}</td>
                  <td><div className="bar-cell"><i style={{ width: `${(r.worked_minutes / max) * 100}%` }} /></div></td>
                  <td className="num">{r.tasks_done}</td><td className="num">{Number(r.estimate_done_hours)}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>
      )}
    </>
  );
}
