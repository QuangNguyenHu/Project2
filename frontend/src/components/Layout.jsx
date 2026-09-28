import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { ROLE } from '../util';

const NAV = [
  { to: '/', label: 'Tổng quan', roles: ['admin', 'pm', 'employee', 'accountant'], end: true },
  { to: '/projects', label: 'Dự án', roles: ['admin', 'pm', 'employee', 'accountant'] },
  { to: '/timesheet', label: 'Chấm công', roles: ['admin', 'pm', 'employee', 'accountant'] },
  { to: '/leaves', label: 'Nghỉ phép', roles: ['admin', 'pm', 'employee', 'accountant'] },
  { to: '/approvals', label: 'Duyệt timesheet', roles: ['admin', 'pm'] },
  { to: '/my-payslips', label: 'Phiếu lương của tôi', roles: ['admin', 'pm', 'employee', 'accountant'] },
  { to: '/payroll', label: 'Bảng lương', roles: ['admin', 'accountant'] },
  { to: '/reports', label: 'Báo cáo', roles: ['admin', 'pm', 'accountant'] },
  { to: '/users', label: 'Người dùng', roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Dự án & Lương</div>
        <nav>
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <strong>{user.full_name}</strong>
          <span>{ROLE[user.role]}</span>
          <button className="btn btn-ghost-light" onClick={logout}>Đăng xuất</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
