<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { state, logout } from '../lib/auth';
import { unread, refreshUnread } from '../lib/notify';

const router = useRouter();
const route = useRoute();
onMounted(refreshUnread);

const groups = [
  { title: '', items: [{ to: '/admin', label: '工作台', icon: '▦' }] },
  {
    title: '基础数据',
    items: [
      { to: '/admin/import', label: '数据导入', icon: '⇪' },
      { to: '/admin/classes', label: '班级', icon: '▤' },
      { to: '/admin/students', label: '学生', icon: '☺' },
      { to: '/admin/teachers', label: '教师', icon: '✎' },
    ],
  },
  {
    title: '教学',
    items: [
      { to: '/admin/courses', label: '课程', icon: '◈' },
      { to: '/admin/schedule', label: '排课', icon: '◷' },
    ],
  },
  {
    title: '报名与考勤',
    items: [
      { to: '/admin/plans', label: '报名计划', icon: '✉' },
      { to: '/admin/attendance', label: '考勤监控', icon: '✓' },
      { to: '/admin/finance', label: '收费', icon: '¥' },
    ],
  },
  { title: '消息', items: [{ to: '/admin/messages', label: '消息中心', icon: '🔔' }] },
];

function go(to: string) {
  router.push(to);
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="w-[220px] shrink-0 border-r border-line bg-white">
      <div class="flex h-14 items-center gap-2 px-4 text-[15px] font-semibold">
        <span class="inline-block h-6 w-6 rounded-md bg-brand" />
        课后服务
      </div>
      <nav class="px-2 pb-6">
        <div v-for="g in groups" :key="g.title" class="mb-3">
          <div v-if="g.title" class="px-3 pb-1 pt-2 text-[12px] text-ink-3">{{ g.title }}</div>
          <button
            v-for="it in g.items"
            :key="it.to"
            class="mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[14px] transition-colors"
            :class="route.path === it.to || (it.to !== '/admin' && route.path.startsWith(it.to))
              ? 'bg-brand-soft font-medium text-brand'
              : 'text-ink-2 hover:bg-[#f5f6f8]'"
            @click="go(it.to)"
          >
            <span class="w-4 text-center text-[13px]">{{ it.icon }}</span>
            {{ it.label }}
          </button>
        </div>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 items-center justify-between border-b border-line bg-white px-5">
        <div class="text-[14px] text-ink-2">{{ state.me?.name }} · 管理员</div>
        <div class="flex items-center gap-3">
          <button class="relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-[#f5f6f8]" title="消息" @click="router.push('/admin/messages')">
            <svg class="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none">
              <path d="M5 8a5 5 0 1110 0v3.5l1.2 2.2H3.8L5 11.5V8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
              <path d="M8 16a2 2 0 004 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
            <span
              v-if="unread > 0"
              class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white"
            >
              {{ unread > 99 ? '99+' : unread }}
            </span>
          </button>
          <span class="text-[13px] text-ink-3">2026-秋</span>
          <button class="btn btn-ghost btn-sm" @click="logout">退出</button>
        </div>
      </header>
      <main class="min-w-0 flex-1 p-5">
        <router-view />
      </main>
    </div>
  </div>
</template>
