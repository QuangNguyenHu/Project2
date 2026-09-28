const BASE = '/api';

export const tokenStore = {
  get: () => localStorage.getItem('token'),
  set: (t) => localStorage.setItem('token', t),
  clear: () => localStorage.removeItem('token'),
};

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const t = tokenStore.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    tokenStore.clear();
    window.location.href = '/login';
    throw new Error('Phiên đăng nhập đã hết hạn');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `Lỗi ${res.status}`);
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body: body ?? {} }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, form) => request(p, { method: 'POST', form }),
};

/** Tải file (PDF/CSV) có kèm token rồi lưu xuống máy. */
export async function download(path, filename) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) {
    let msg = `Lỗi ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* không phải JSON */ }
    throw new Error(msg);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
