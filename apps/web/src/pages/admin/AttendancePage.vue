<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';

const data = ref<{ today: string; sessions: any[] }>({ today: '', sessions: [] });
async function load() {
  try {
    data.value = await api.get('/api/admin/attendance/today');
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
onMounted(load);
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <div class="text-[20px] font-semibold">考勤监控</div>
        <div class="mt-1 text-[13px] text-ink-3">{{ data.today }} · 未点名的课次标红</div>
      </div>
      <button class="btn btn-secondary btn-sm" @click="load">刷新</button>
    </div>

    <div class="card">
      <table class="table-base">
        <thead><tr><th>时间</th><th>课程</th><th>教学班</th><th>教师</th><th>应到</th><th>已点名</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="s in data.sessions" :key="s.id">
            <td class="whitespace-nowrap">{{ s.start_time }}–{{ s.end_time }}</td>
            <td>{{ s.courseName }}</td>
            <td class="text-ink-2">{{ s.groupName }}</td>
            <td class="text-ink-2">{{ s.teacherName || '—' }}</td>
            <td>{{ s.enrolled }}</td>
            <td>{{ s.marked }}</td>
            <td>
              <span v-if="s.marked > 0" class="badge badge-green">已点名</span>
              <span v-else class="badge badge-red">未点名</span>
            </td>
          </tr>
          <tr v-if="!data.sessions.length"><td colspan="7" class="py-10 text-center text-ink-3">今天没有课次</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
