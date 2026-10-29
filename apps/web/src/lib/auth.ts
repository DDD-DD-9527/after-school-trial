import { reactive, computed } from 'vue';
import { api } from './api';

export interface Child {
  id: number;
  name: string;
  code: string;
  class_id: number | null;
}
export interface Me {
  id: number;
  name: string;
  role: 'admin' | 'teacher' | 'parent';
  phone: string;
  mustChangePassword?: boolean;
  children?: Child[];
  teacher?: { id: number; name: string } | null;
}

export const state = reactive<{ me: Me | null; loading: boolean; childId: number | null }>({
  me: null,
  loading: false,
  childId: Number(localStorage.getItem('childId')) || null,
});

export const children = computed(() => state.me?.children ?? []);
export const currentChild = computed(() => children.value.find((c) => c.id === state.childId) ?? children.value[0] ?? null);

export function setChild(id: number) {
  state.childId = id;
  localStorage.setItem('childId', String(id));
}

export async function login(phone: string, password: string) {
  const r = await api.post<{ token: string; user: Me }>('/api/auth/login', { phone, password });
  localStorage.setItem('token', r.token);
  state.me = r.user;
  await loadMe();
  if (state.me?.role === 'parent' && state.me.children?.length) {
    const saved = Number(localStorage.getItem('childId'));
    const ok = state.me.children.some((c) => c.id === saved);
    setChild(ok ? saved : state.me.children[0].id);
  }
  return state.me!;
}

export async function loadMe() {
  if (!localStorage.getItem('token')) return null;
  state.loading = true;
  try {
    state.me = await api.get<Me>('/api/me');
    return state.me;
  } finally {
    state.loading = false;
  }
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('childId');
  state.me = null;
  location.href = '/login';
}

export function homeOf(role: string) {
  if (role === 'admin') return '/admin';
  if (role === 'teacher') return '/teacher';
  return '/parent';
}
