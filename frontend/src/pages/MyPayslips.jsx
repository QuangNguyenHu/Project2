import { useEffect, useState } from 'react';
import { api, download } from '../api';
import { Alert, Empty } from '../components/ui';
import { fmtMin, vnd } from '../util';

export default function MyPayslips() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/payroll/payslips/mine').then(setRows).catch((e) => setError(e.message)); }, []);
  const pad = (n) => String(n).padStart(2, '0');

  return (
    <>
      <div className="page-head"><div><h1>Phiếu lương của tôi</h1><p>Chỉ hiển thị các kỳ lương đã được chốt</p></div></div>
      <Alert error={error} />
      <div className="card table-wrap">
        {rows.length === 0 ? <Empty>Chưa có phiếu lương nào được chốt.</Empty> : (
          <table>
            <thead><tr><th>Kỳ</th><th className="num">Giờ thường</th><th className="num">OT</th><th className="num">Tổng thu nhập</th><th className="num">Khấu trừ</th><th className="num">Thực nhận</th><th></th></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id}><td>{pad(s.period_month)}/{s.period_year}</td><td className="num">{fmtMin(s.regular_minutes)}</td><td className="num">{fmtMin(s.ot_minutes)}</td>
                <td className="num">{vnd(s.gross_pay)}</td><td className="num">{vnd(Number(s.insurance_deduction) + Number(s.other_deduction))}</td>
                <td className="num"><b>{vnd(s.net_pay)}</b></td>
                <td><button className="btn btn-line btn-sm" onClick={() => download(`/payroll/payslips/${s.id}/pdf`, `phieu-luong-${s.period_year}-${pad(s.period_month)}.pdf`).catch((e) => setError(e.message))}>Tải PDF</button></td></tr>))}</tbody>
          </table>)}
      </div>
    </>
  );
}
