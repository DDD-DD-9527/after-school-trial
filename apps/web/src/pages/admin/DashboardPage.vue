<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';

interface TodaySession {
  id: number;
  start_time: string;
  end_time: string;
  courseName: string;
  groupName: string;
  room: string | null;
  teacherName: string | null;
  enrolled: number;
  marked: number;
  status: string;
}

const data = ref<{ stats: any; todaySessions: TodaySession[]; today: string } | null>(null);
const loading = ref(true);
const router = useRouter();

async function load() {
  loading.value = true;
  try {
    data.value = await api.get('/api/admin/dashboard');
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const cards = [
  { key: 'students', label: '在校学生', unit: '人' },
  { key: 'classes', label: '行政班', unit: '个' },
  { key: 'teachers', label: '授课教师', unit: '人' },
  { key: 'courses', label: '开课项目', unit: '门' },
];
</script>

<template>
  <div>
    <div class="mb-4 flex items-end justify-between">
      <div>
        <div class="text-[20px] font-semibold">工作台</div>
        <div class="mt-1 text-[13px] text-ink-3">今天 {{ data?.today }} · 2026 秋季学期</div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" @click="router.push('/admin/schedule')">去排课</button>
        <button class="btn btn-primary btn-sm" @click="router.push('/admin/plans')">发报名</button>
      </div>
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div v-for="c in cards" :key="c.key" class="card card-pad">
        <div class="text-[13px] text-ink-2">{{ c.label }}</div>
        <div class="mt-1 text-[26px] font-semibold leading-tight">
          {{ data?.stats?.[c.key] ?? 0 }}
          <span class="text-[13px] font-normal text-ink-3">{{ c.unit }}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="flex items-center justify-between border-b border-line px-4 py-3">
        <div class="text-[15px] font-medium">今日课次</div>
        <div class="text-[13px] text-ink-3">共 {{ data?.todaySessions?.length ?? 0 }} 节</div>
      </div>
      <table class="table-base">
        <thead>
          <tr>
            <th>时间</th>
            <th>课程</th>
            <th>教学班</th>
            <th>教师</th>
            <th>地点</th>
            <th>应到</th>
            <th>点名</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in data?.todaySessions" :key="s.id">
            <td class="whitespace-nowrap">{{ s.start_time }}–{{ s.end_time }}</td>
            <td>{{ s.courseName }}</td>
            <td class="text-ink-2">{{ s.groupName }}</td>
            <td class="text-ink-2">{{ s.teacherName || '—' }}</td>
            <td class="text-ink-2">{{ s.room || '—' }}</td>
            <td>{{ s.enrolled }}</td>
            <td>
              <span v-if="s.marked > 0" class="badge badge-green">已点名</span>
              <span v-else class="badge badge-orange">未点名</span>
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" @click="router.push('/admin/attendance')">查看</button>
            </td>
          </tr>
          <tr v-if="!data?.todaySessions?.length">
            <td colspan="8" class="py-10 text-center text-ink-3">今天没有课次</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
