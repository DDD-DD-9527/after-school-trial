<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { state, logout, children, currentChild, setChild } from '../lib/auth';
import { unread, refreshUnread } from '../lib/notify';

const route = useRoute();
const router = useRouter();
onMounted(refreshUnread);

const isParent = computed(() => state.me?.role === 'parent');
const tabs = computed(() =>
  isParent.value
    ? [
        { to: '/parent', label: '首页', icon: '⌂' },
        { to: '/parent/enroll', label: '选课', icon: '⊕' },
        { to: '/parent/enrollments', label: '我的报名', icon: '☰' },
        { to: '/parent/schedule', label: '课表', icon: '◷' },
      ]
    : [
        { to: '/teacher', label: '今日', icon: '◷' },
      ]
);
</script>

<template>
  <div class="min-h-screen bg-bg pb-16">
    <header class="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-white px-4">
      <div class="text-[15px] font-medium">{{ isParent ? '课后服务' : '教师端' }}</div>
      <div class="flex items-center gap-2">
        <button
          class="relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-2"
          @click="router.push(`/${state.me?.role === 'teacher' ? 'teacher' : 'parent'}/messages`)"
        >
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
        <select
          v-if="isParent && children.length > 1"
          class="rounded-md border border-line bg-white px-2 py-1 text-[13px]"
          :value="currentChild?.id"
          @change="setChild(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="c in children" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <span v-else class="text-[13px] text-ink-2">{{ isParent ? currentChild?.name : state.me?.name }}</span>
        <button class="text-[13px] text-ink-3" @click="logout">退出</button>
      </div>
    </header>

    <main class="p-4">
      <router-view />
    </main>

    <nav class="fixed bottom-0 left-0 right-0 z-20 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      <button
        v-for="t in tabs"
        :key="t.to"
        class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]"
        :class="route.path === t.to ? 'text-brand' : 'text-ink-3'"
        @click="router.push(t.to)"
      >
        <span class="text-[16px]">{{ t.icon }}</span>
        {{ t.label }}
      </button>
    </nav>
  </div>
</template>
