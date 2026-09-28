import { useState } from 'react';
import { useAuth } from '../auth';
import { Alert, Field } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await login(email, password); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>Đăng nhập</h1>
        <Alert error={error} />
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Mật khẩu"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <button className="btn" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <p className="hint">Tài khoản mẫu sau khi chạy seed: admin@example.com / pm@example.com / nv1@example.com / ketoan@example.com</p>
      </form>
    </div>
  );
}
