import { useEffect, useState } from 'react';
import { api, download } from '../api';
import { useAuth } from '../auth';
import { Alert, Badge, Empty, Field, Modal, statusTone } from '../components/ui';
import { fmtMin, hhmm, vnd } from '../util';

const pad = (n) => String(n).padStart(2, '0');

export default function Payroll() {
  const { user } = useAuth();
  const [policy, setPolicy] = useState(null);
  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [edit, setEdit] = useState({}); // payslipId -> {other, note}
  const [policyForm, setPolicyForm] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const loadRuns = () => api.get('/payroll/runs').then(setRuns).catch((e) => setError(e.message));
  const loadRun = (id) => api.get(`/payroll/runs/${id}`).then(setRun).catch((e) => setError(e.message));
  useEffect(() => { loadRuns(); api.get('/payroll/policy').then(setPolicy).catch((e) => setError(e.message)); }, []);

  const act = async (fn, msg) => {
    setError(''); setOk('');
    try { await fn(); if (msg) setOk(msg); } catch (e) { setError(e.message); }
  };

  const create = () => act(async () => {
    const [y, m] = period.split('-').map(Number);
    const r = await api.post('/payroll/runs', { year: y, month: m });
    await loadRuns();
    await loadRun(r.id);
  }, 'Đã tạo kỳ lương và tính phiếu lương từ các timesheet đã duyệt');

  const saveDeduction = (s) => act(async () => {
    const e = edit[s.id] || {};
    await api.patch(`/payroll/payslips/${s.id}`, {
      other_deduction: e.other ?? s.other_deduction, deduction_note: e.note ?? s.deduction_note ?? '',
    });
    await loadRun(run.id);
  }, 'Đã cập nhật khấu trừ');

  const savePolicy = (e) => {
    e.preventDefault();
    act(async () => {
      const p = policyForm;
      await api.put('/payroll/policy', {
        name: p.name, daily_threshold_min: Number(p.thr_hours) * 60, ot_multiplier: Number(p.ot_multiplier) / 100,
        night_start_min: p.night_start_min, night_end_min: p.night_end_min,
        night_extra_rate: Number(p.night_extra) / 100, insurance_rate: Number(p.insurance) / 100,
      });
      setPolicy(await api.get('/payroll/policy'));
      setPolicyForm(null);
    }, 'Đã lưu chính sách mới (áp dụng cho các kỳ lương tạo từ bây giờ)');
  };

  const openPolicy = () => setPolicyForm({
    name: policy.name, thr_hours: policy.daily_threshold_min / 60, ot_multiplier: Number(policy.ot_multiplier) * 100,
    night_start_min: policy.night_start_min, night_end_min: policy.night_end_min,
    night_extra: Math.round(Number(policy.night_extra_rate) * 100), insurance: (Number(policy.insurance_rate) * 100).toFixed(2),
  });

  const draft = run?.status === 'draft';
  const totals = run?.payslips.reduce((t, s) => ({ gross: t.gross + Number(s.gross_pay), net: t.net + Number(s.net_pay) }), { gross: 0, net: 0 });

  return (
    <>
      <div className="page-head"><div><h1>Bảng lương</h1><p>Kỳ lương theo tháng, tính từ timesheet đã duyệt</p></div></div>
      <Alert error={error} ok={ok} />

      {policy && (
        <div className="card">
          <div className="row spread"><h2 style={{ margin: 0 }}>Chính sách đang áp dụng</h2>
            {user.role === 'admin' && <button className="btn btn-line btn-sm" onClick={openPolicy}>Sửa chính sách</button>}</div>
          <p className="muted" style={{ marginBottom: 0 }}>
            OT khi vượt {policy.daily_threshold_min / 60} giờ/ngày, hệ số {Number(policy.ot_multiplier) * 100}% ·
            Phụ cấp ban đêm {hhmm(policy.night_start_min)}–{hhmm(policy.night_end_min)}: +{Math.round(Number(policy.night_extra_rate) * 100)}% ·
            Bảo hiểm {(Number(policy.insurance_rate) * 100).toFixed(2)}% tổng thu nhập
          </p>
        </div>)}

      <div className="card">
        <h2>Kỳ lương</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          <button className="btn" onClick={create}>Tạo kỳ lương</button>
        </div>
        {runs.length === 0 ? <Empty>Chưa có kỳ lương nào.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Kỳ</th><th>Trạng thái</th><th className="num">Số phiếu</th><th className="num">Tổng thực nhận</th><th></th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id}><td>{pad(r.period_month)}/{r.period_year}</td>
                <td><Badge tone={statusTone(r.status)}>{r.status === 'draft' ? 'Nháp' : 'Đã chốt'}</Badge></td>
                <td className="num">{r.payslip_count}</td><td className="num">{vnd(r.total_net)}</td>
                <td><button className="btn btn-line btn-sm" onClick={() => loadRun(r.id)}>Mở</button></td></tr>))}</tbody>
          </table></div>)}
      </div>

      {run && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Phiếu lương kỳ {pad(run.period_month)}/{run.period_year} <Badge tone={statusTone(run.status)}>{draft ? 'Nháp' : 'Đã chốt'}</Badge></h2>
            <div className="row">
              <button className="btn btn-line" onClick={() => act(() => download(`/payroll/runs/${run.id}/export.csv`, `bang-luong-${run.period_year}-${pad(run.period_month)}.csv`))}>Xuất CSV cho kế toán</button>
              {draft && <>
                <button className="btn btn-line" onClick={() => act(async () => { await api.post(`/payroll/runs/${run.id}/recalculate`); await loadRun(run.id); await loadRuns(); }, 'Đã tính lại từ timesheet mới nhất')}>Tính lại</button>
                <button className="btn" onClick={() => window.confirm('Chốt kỳ lương? Sau khi chốt sẽ không sửa được và nhân viên sẽ xem được phiếu lương.') && act(async () => { await api.post(`/payroll/runs/${run.id}/finalize`); await loadRun(run.id); await loadRuns(); }, 'Đã chốt kỳ lương')}>Chốt kỳ lương</button>
              </>}
            </div>
          </div>
          {run.payslips.length === 0 ? <Empty>Kỳ này chưa có timesheet đã duyệt hoặc nghỉ phép hưởng lương nào.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Nhân viên</th><th className="num">Đơn giá</th><th className="num">Giờ thường</th><th className="num">OT</th><th className="num">Đêm</th><th className="num">Nghỉ phép</th>
                <th className="num">Tổng thu nhập</th><th className="num">Bảo hiểm</th><th className="num">Khấu trừ khác</th><th className="num">Thực nhận</th><th></th></tr></thead>
              <tbody>
                {run.payslips.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name}</td><td className="num">{vnd(s.hourly_rate)}</td>
                    <td className="num">{fmtMin(s.regular_minutes)}</td><td className="num">{fmtMin(s.ot_minutes)}</td>
                    <td className="num">{fmtMin(s.night_minutes)}</td><td className="num">{fmtMin(s.leave_minutes)}</td>
                    <td className="num">{vnd(s.gross_pay)}</td><td className="num">{vnd(s.insurance_deduction)}</td>
                    <td className="num">
                      {draft ? (
                        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <input type="number" min="0" style={{ width: 100 }} value={edit[s.id]?.other ?? Number(s.other_deduction)}
                            onChange={(e) => setEdit({ ...edit, [s.id]: { ...edit[s.id], other: e.target.value } })} aria-label="Khấu trừ khác" />
                          <input placeholder="Lý do" style={{ width: 110 }} value={edit[s.id]?.note ?? s.deduction_note ?? ''}
                            onChange={(e) => setEdit({ ...edit, [s.id]: { ...edit[s.id], note: e.target.value } })} aria-label="Lý do khấu trừ" />
                          <button className="btn btn-line btn-sm" onClick={() => saveDeduction(s)}>Lưu</button>
                        </div>) : vnd(s.other_deduction)}
                    </td>
                    <td className="num"><b>{vnd(s.net_pay)}</b></td>
                    <td><button className="btn btn-line btn-sm" onClick={() => act(() => download(`/payroll/payslips/${s.id}/pdf`, `phieu-luong-${s.period_year}-${pad(s.period_month)}-${s.user_id}.pdf`))}>PDF</button></td>
                  </tr>))}
                <tr className="total"><td colSpan={6}>Tổng cộng</td><td className="num">{vnd(totals.gross)}</td><td /><td /><td className="num">{vnd(totals.net)}</td><td /></tr>
              </tbody>
            </table></div>)}
        </div>)}

      {policyForm && (
        <Modal title="Sửa chính sách lương" onClose={() => setPolicyForm(null)}>
          <form onSubmit={savePolicy}>
            <div className="form-grid">
              <Field label="Ngưỡng OT (giờ/ngày)"><input type="number" min="1" step="0.5" value={policyForm.thr_hours} onChange={(e) => setPolicyForm({ ...policyForm, thr_hours: e.target.value })} /></Field>
              <Field label="Hệ số OT (%)"><input type="number" min="100" value={policyForm.ot_multiplier} onChange={(e) => setPolicyForm({ ...policyForm, ot_multiplier: e.target.value })} /></Field>
              <Field label="Phụ cấp đêm (%)"><input type="number" min="0" value={policyForm.night_extra} onChange={(e) => setPolicyForm({ ...policyForm, night_extra: e.target.value })} /></Field>
              <Field label="Bảo hiểm (% tổng thu nhập)"><input type="number" min="0" step="0.01" value={policyForm.insurance} onChange={(e) => setPolicyForm({ ...policyForm, insurance: e.target.value })} /></Field>
            </div>
            <p className="muted">Chính sách mới chỉ áp dụng cho kỳ lương tạo sau khi lưu; các kỳ cũ giữ nguyên.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn">Lưu chính sách</button></div>
          </form>
        </Modal>)}
    </>
  );
}
