<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { listNotices, markAllRead, markRead, refreshUnread, unread, type Notice } from '../lib/notify';
import { toast } from '../lib/toast';
import { state } from '../lib/auth';
import AppIcon from '../ui/AppIcon.vue';

const rows = ref<Notice[]>([]);
const loading = ref(true);
const error = ref('');
const unreadOnly = ref(false);
const readingAll = ref(false);
const opening = ref<number | null>(null);
const router = useRouter();
let request = 0;
const description = computed(() => state.me?.role === 'admin' ? '集中查看报名、请假与课程变更，及时跟进学校的日常安排。' : state.me?.role === 'teacher' ? '课程调整和学生请假，及时了解每一节课的变化。' : '报名、请假和课程变更，学校的安排及时知晓。');
const typeIcon: Record<string, string> = { enroll: 'check-circle', leave: 'file', session_cancel: 'alert', session_reschedule: 'calendar' };
const typeLabel: Record<string, string> = { enroll: '报名通知', leave: '请假通知', session_cancel: '停课通知', session_reschedule: '调课通知' };
function noticeTime(value: string) {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const time = new Date(normalized);
  return Number.isNaN(time.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time);
}
async function load() {
  if (readingAll.value || opening.value !== null) return;
  const current = ++request;
  loading.value = true;
  error.value = '';
  try {
    const notices = await listNotices(unreadOnly.value);
    if (current !== request) return;
    rows.value = notices;
    await refreshUnread();
  } catch (e: unknown) {
    if (current === request) error.value = e instanceof Error ? e.message : '消息加载失败，请重试';
  } finally { if (current === request) loading.value = false; }
}
onMounted(load);
watch(unreadOnly, load);
async function open(notice: Notice) {
  if (opening.value !== null || readingAll.value || loading.value) return;
  ++request;
  opening.value = notice.id;
  try {
    if (!notice.read_at) {
      await markRead(notice.id);
      notice.read_at = 'read';
      if (unreadOnly.value) rows.value = rows.value.filter(row => row.id !== notice.id);
    }
    if (notice.link) await router.push(notice.link);
  } catch (e: unknown) { toast(e instanceof Error ? e.message : '暂时无法打开消息', 'error'); }
  finally { opening.value = null; }
}
async function readAll() {
  if (readingAll.value || opening.value !== null || loading.value || !unread.value) return;
  ++request;
  readingAll.value = true;
  try {
    await markAllRead();
    rows.value = unreadOnly.value ? [] : rows.value.map(row => ({ ...row, read_at: row.read_at ?? 'read' }));
    toast('已全部标记为已读', 'success');
  } catch (e: unknown) { toast(e instanceof Error ? e.message : '标记失败，请重试', 'error'); }
  finally { readingAll.value = false; }
}
</script>

<template>
  <div>
    <div class="page-heading">
      <div><div class="eyebrow">及时知晓每一项变化</div><h1 class="page-title">消息中心</h1><p class="page-description">{{ description }}</p></div>
      <button class="btn btn-secondary" :disabled="loading || readingAll || opening !== null" @click="load"><AppIcon name="refresh" :size="16" />刷新</button>
    </div>
    <section class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div class="flex gap-2"><button class="filter-chip" :disabled="readingAll || opening !== null" :class="{ 'filter-chip-active': !unreadOnly }" :aria-pressed="!unreadOnly" @click="unreadOnly = false">全部消息</button><button class="filter-chip" :disabled="readingAll || opening !== null" :class="{ 'filter-chip-active': unreadOnly }" :aria-pressed="unreadOnly" @click="unreadOnly = true">未读<span v-if="unread" class="ml-1 tabular-nums">{{ unread }}</span></button></div>
        <button class="btn btn-ghost btn-sm" :disabled="!unread || readingAll || opening !== null || loading" @click="readAll"><AppIcon name="check" :size="16" />{{ readingAll ? '标记中…' : '全部已读' }}</button>
      </div>
      <div v-if="loading" class="py-16 text-center text-[13px] text-ink-3" role="status">正在整理消息…</div>
      <div v-else-if="error" class="px-5 py-12 text-center" role="alert"><p class="text-[13px] text-danger">{{ error }}</p><button class="btn btn-secondary mt-4" @click="load">重新加载</button></div>
      <div v-else-if="!rows.length" class="flex flex-col items-center px-5 py-16"><span class="icon-tile icon-tile-blue mb-4"><AppIcon name="bell" :size="24" /></span><h2 class="text-[15px] font-semibold">{{ unreadOnly ? '未读消息都处理好了' : '暂时没有新消息' }}</h2><p class="mt-2 max-w-[280px] text-center text-[12px] leading-6 text-ink-3">报名、请假或课程安排发生变化时，会在这里通知你。</p></div>
      <div v-else class="divide-y divide-line">
        <button v-for="notice in rows" :key="notice.id" class="notice-row flex w-full items-start gap-3 px-5 py-5 text-left transition-colors hover:bg-[#f8faff] sm:gap-4 sm:px-6" :class="{ 'bg-[#fbfcff]': !notice.read_at }" :disabled="opening !== null || readingAll" @click="open(notice)">
          <span class="icon-tile shrink-0" :class="notice.read_at ? 'bg-bg text-ink-3' : 'icon-tile-blue'"><AppIcon :name="typeIcon[notice.type] || 'bell'" :size="20" /></span>
          <span class="min-w-0 flex-1"><span class="flex flex-wrap items-center gap-2"><span class="text-[14px] leading-6" :class="notice.read_at ? 'text-ink-2' : 'font-semibold text-ink'">{{ notice.title }}</span><span v-if="!notice.read_at" class="h-1.5 w-1.5 rounded-full bg-brand" aria-label="未读" /></span><span v-if="notice.body" class="mt-1 block text-[13px] leading-6 text-ink-2">{{ notice.body }}</span><span class="mt-2 block text-[11px] text-ink-3">{{ typeLabel[notice.type] || '服务通知' }}<span class="mx-2 text-[#c7cedb]">·</span>{{ noticeTime(notice.created_at) }}</span></span>
          <AppIcon v-if="notice.link" name="chevron-right" :size="16" class="mt-2 shrink-0 text-ink-3" />
        </button>
      </div>
      <p v-if="!loading && rows.length >= 100" class="border-t border-line px-5 py-4 text-center text-[11px] text-ink-3">当前展示最近 100 条{{ unreadOnly ? '未读' : '' }}消息</p>
    </section>
  </div>
</template>
<style scoped>.notice-row:disabled{opacity:1}.notice-row:disabled:not(:hover){cursor:default}</style>
