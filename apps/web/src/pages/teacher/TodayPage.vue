<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';

const data = ref<{ today: string; sessions: any[] }>({ today: '', sessions: [] });
const router = useRouter();

async function load() {
  try {
    data.value = await api.get('/api/teacher/today');
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
onMounted(load);
</script>

<template>
  <div>
    <div class="mb-3 flex items-end justify-between">
      <div>
        <div class="text-[18px] font-semibold">今日课表</div>
        <div class="mt-0.5 text-[12px] text-ink-3">{{ data.today }}</div>
      </div>
      <button class="btn btn-ghost btn-sm" @click="load">刷新</button>
    </div>

    <div class="space-y-3">
      <div
        v-for="s in data.sessions"
        :key="s.id"
        class="card card-pad"
        @click="router.push(`/teacher/sessions/${s.id}`)"
      >
        <div class="flex items-start justify-between">
          <div>
            <div class="text-[16px] font-medium">{{ s.courseName }}</div>
            <div class="mt-1 text-[13px] text-ink-2">{{ s.start_time }}–{{ s.end_time }} · {{ s.room || '未安排教室' }}</div>
          </div>
          <span class="badge" :class="s.marked > 0 ? 'badge-green' : 'badge-orange'">
            {{ s.marked > 0 ? '已点名' : '待点名' }}
          </span>
        </div>
        <div class="mt-3 flex items-center gap-4 text-[13px] text-ink-3">
          <span>应到 {{ s.enrolled }} 人</span>
          <span>已点 {{ s.marked }} 人</span>
          <span class="ml-auto text-brand">去点名 →</span>
        </div>
      </div>

      <div v-if="!data.sessions.length" class="card py-14 text-center text-[13px] text-ink-3">今天没有课</div>
    </div>
  </div>
</template>
