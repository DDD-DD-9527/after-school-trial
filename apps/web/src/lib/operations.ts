import { api } from './api';

export interface School {
  id: number; code: string; name: string; term: string; status: 'active' | 'inactive';
  contactName: string; contactPhone: string; createdAt: string;
}
export interface SchoolStats { students: number; teachers: number; courses: number; admins: number; outstanding: number }
export interface SchoolOverview extends School { stats: SchoolStats }
export interface SchoolAdmin { id: number; name: string; phone: string; status: 'active' | 'inactive'; createdAt: string }
export interface SchoolDetail {
  school: School; stats: SchoolStats; admins: SchoolAdmin[];
  recentEvents: Array<{ id: number; action: string; actorName: string; detail: string; createdAt: string }>;
}
export interface OperationsDashboard {
  summary: { schools: number; activeSchools: number; admins: number; students: number; teachers: number; courses: number; unpaidCents: number };
  schools: SchoolOverview[];
}
export interface CreateSchool {
  name: string; code: string; term: string; contactName: string; contactPhone: string;
  adminName: string; adminPhone: string; adminPassword: string;
}
export const operations = {
  dashboard: () => api.get<OperationsDashboard>('/api/ops/dashboard'),
  schools: (q = '', status = '') => api.get<SchoolOverview[]>(`/api/ops/schools?${new URLSearchParams({ q, ...(status ? { status } : {}) })}`),
  detail: (id: string | number) => api.get<SchoolDetail>(`/api/ops/schools/${encodeURIComponent(id)}`),
  create: (body: CreateSchool) => api.post<{ school: School; admin: Pick<SchoolAdmin, 'id' | 'name' | 'phone'> }>('/api/ops/schools', body),
  update: (id: number, body: Pick<School, 'name' | 'term' | 'contactName' | 'contactPhone' | 'status'>) => api.put(`/api/ops/schools/${id}`, body),
  createAdmin: (id: number, body: { name: string; phone: string; password: string }) => api.post(`/api/ops/schools/${id}/admins`, body),
  updateAdmin: (id: number, admin: Pick<SchoolAdmin, 'id' | 'name' | 'status'>) => api.put(`/api/ops/schools/${id}/admins/${admin.id}`, { name: admin.name, status: admin.status }),
};
export const money = (cents: number) => `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function dateTime(value: string, withTime = false) {
  if (!value) return '—';
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(date);
}
export const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
export const validPhone = (phone: string) => /^1\d{10}$/.test(phone);
const eventLabels: Record<string,string> = {
  school_created: '开通学校', school_updated: '更新学校资料', school_enabled: '恢复学校服务', school_disabled: '停用学校服务',
  admin_created: '新增校管理员', admin_updated: '更新管理员资料', admin_enabled: '启用管理员账号', admin_disabled: '停用管理员账号',
};
export const eventLabel = (action: string) => eventLabels[action] || '学校服务变更';
