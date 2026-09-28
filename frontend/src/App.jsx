import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Timesheet from './pages/Timesheet';
import Approvals from './pages/Approvals';
import Leaves from './pages/Leaves';
import Payroll from './pages/Payroll';
import MyPayslips from './pages/MyPayslips';
import Reports from './pages/Reports';
import Users from './pages/Users';

function Guard({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <p className="empty">Đang tải…</p>;
  if (!user) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="timesheet" element={<Timesheet />} />
        <Route path="leaves" element={<Leaves />} />
        <Route path="my-payslips" element={<MyPayslips />} />
        <Route path="approvals" element={<Guard roles={['admin', 'pm']}><Approvals /></Guard>} />
        <Route path="payroll" element={<Guard roles={['admin', 'accountant']}><Payroll /></Guard>} />
        <Route path="reports" element={<Guard roles={['admin', 'pm', 'accountant']}><Reports /></Guard>} />
        <Route path="users" element={<Guard roles={['admin']}><Users /></Guard>} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
