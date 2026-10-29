import { session } from './session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const BASE = (import.meta as any).env?.VITE_API_BASE ?? '';

function token(): string | null {
  return session.token();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (init.body) headers['Content-Type'] = 'application/json';
  const t = token();
  if (t) headers['Authorization'] = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  session.assertCurrent(t);
  // 登录接口的 401 是账号或密码错误，保留服务端的具体提示。
  if (res.status === 401 && path !== '/api/auth/login') {
    session.setToken(null);
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new ApiError(401, 'UNAUTHORIZED', '登录已过期');
  }
  const text = await res.text();
  session.assertCurrent(t);
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? '请求失败');
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(p: string, body?: unknown) => request<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};

/** 带鉴权下载文件（导出 CSV 等） */
export async function downloadFile(path: string, filename: string) {
  const t = token();
  const res = await fetch(`${BASE}${path}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  session.assertCurrent(t);
  if (!res.ok) throw new Error('下载失败');
  const blob = await res.blob();
  session.assertCurrent(t);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
