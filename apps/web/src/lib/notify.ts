import { ref } from 'vue';
import { api } from './api';

export const unread = ref(0);

export async function refreshUnread() {
  try {
    const r = await api.get<{ count: number }>('/api/notifications/unread-count');
    unread.value = r.count;
  } catch {
    // 未登录或网络异常时静默
  }
}

export interface Notice {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listNotices(unreadOnly = false): Promise<Notice[]> {
  return api.get<Notice[]>(`/api/notifications${unreadOnly ? '?unread=1' : ''}`);
}

export async function markRead(id: number) {
  await api.post(`/api/notifications/${id}/read`);
  await refreshUnread();
}

export async function markAllRead() {
  await api.post('/api/notifications/read-all');
  unread.value = 0;
}
