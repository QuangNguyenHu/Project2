import { useEffect } from 'react';

export function Alert({ error, ok }) {
  if (!error && !ok) return null;
  return <div className={`alert ${error ? 'alert-error' : 'alert-ok'}`} role="alert">{error || ok}</div>;
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const TONE = { draft: 'neutral', submitted: 'warn', approved: 'ok', rejected: 'danger', pending: 'warn', finalized: 'ok', todo: 'neutral', doing: 'warn', done: 'ok' };
export const statusTone = (s) => TONE[s] || 'neutral';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Đóng">Đóng</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}
