<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { listNotices, markAllRead, markRead, refreshUnread, type Notice } from '../lib/notify';
import { toast } from '../lib/toast';
import { state } from '../lib/auth';

const rows = ref<Notice[]>([]);
const loading = ref(true);
const router = useRouter();

const backTo = computed(() => (state.me?.role === 'admin' ? '/admin' : state.me?.role === 'teacher' ? '/teacher' : '/parent'));

async function load() {
  loading.value = true;
  try {
    rows.value = await listNotices();
    await refreshUnread();
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function open(n: Notice) {
  if (!n.read_at) {
    await markRead(n.id);
    n.read_at = 'read';
  }
  if (n.link) router.push(n.link);
}

async function readAll() {
  await markAllRead();
  rows.value = rows.value.map((r) => ({ ...r, read_at: r.read_at ?? 'read' }));
  toast('已全部标记为已读', 'success');
}

const typeIcon: Record<string, string> = {
  enroll: '✓',
  leave: '✎',
  session_cancel: '!',
  session_reschedule: '↻',
};
</script>

<template>
  <div :class="state.me?.role === 'admin' ? '' : ''">
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button v-if="state.me?.role === 'admin'" class="btn btn-ghost btn-sm" @click="router.push(backTo)">← 返回</button>
        <div class="text-[18px] font-semibold">消息</div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" @click="load">刷新</button>
        <button class="btn btn-secondary btn-sm" @click="readAll">全部已读</button>
      </div>
    </div>

    <div class="space-y-2">
      <button
        v-for="n in rows"
        :key="n.id"
        class="card block w-full p-4 text-left transition-colors hover:border-brand/40"
        @click="open(n)"
      >
        <div class="flex items-start gap-3">
          <div
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]"
            :class="n.read_at ? 'bg-[#f2f3f5] text-ink-3' : 'bg-brand-soft text-brand'"
          >
            {{ typeIcon[n.type] || '•' }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-[14px]" :class="n.read_at ? 'text-ink-2' : 'font-medium text-ink'">{{ n.title }}</span>
              <span v-if="!n.read_at" class="h-1.5 w-1.5 rounded-full bg-danger" />
            </div>
            <p class="mt-0.5 text-[13px] leading-relaxed text-ink-2">{{ n.body }}</p>
            <div class="mt-1 text-[11px] text-ink-3">{{ n.created_at }}</div>
          </div>
        </div>
      </button>

      <div v-if="!loading && !rows.length" class="card py-14 text-center text-[13px] text-ink-3">还没有消息</div>
    </div>
  </div>
</template>

