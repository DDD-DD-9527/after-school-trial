<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import AppIcon from '../../ui/AppIcon.vue';

const data = ref<{ today: string; sessions: any[] }>({ today: '', sessions: [] });
const loading = ref(false);
const error = ref('');
const sessions = computed(() => data.value.sessions.filter((s) => s.status !== 'cancelled'));
const submitted = computed(() => sessions.value.filter((s) => s.status === 'done').length);
const pending = computed(() => sessions.value.filter((s) => s.enrolled > 0 && s.status !== 'done').length);
const expected = computed(() => sessions.value.reduce((sum, s) => sum + Number(s.enrolled || 0), 0));
async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api.get('/api/admin/attendance/today');
  } catch (e: any) {
    error.value = e.message || '学生点名加载失败';
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div>
    <div class="page-heading">
      <div><div class="eyebrow">今日教学执行</div><h1 class="page-title">学生点名</h1><p class="page-description">查看今天每节课的名单记录与提交进度，及时跟进尚未记录的课次。</p></div>
      <button class="btn btn-secondary" :disabled="loading" @click="load"><AppIcon name="refresh" :size="16" />{{ loading ? '刷新中…' : '刷新记录' }}</button>
    </div>
    <div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="metric-card"><span class="icon-tile icon-tile-blue"><AppIcon name="calendar" :size="19" /></span><div class="mt-4 text-[12px] text-ink-3">今日有效课次</div><div class="mt-1 text-[28px] font-semibold">{{ loading || error ? '—' : sessions.length }}<span class="ml-1 text-[12px] font-normal text-ink-3">节</span></div></div>
      <div class="metric-card"><span class="icon-tile icon-tile-mint"><AppIcon name="check-circle" :size="19" /></span><div class="mt-4 text-[12px] text-ink-3">已提交课次</div><div class="mt-1 text-[28px] font-semibold text-ok">{{ loading || error ? '—' : submitted }}</div></div>
      <div class="metric-card"><span class="icon-tile icon-tile-amber"><AppIcon name="clock" :size="19" /></span><div class="mt-4 text-[12px] text-ink-3">待提交课次</div><div class="mt-1 text-[28px] font-semibold">{{ loading || error ? '—' : pending }}</div></div>
      <div class="metric-card"><span class="icon-tile icon-tile-blue"><AppIcon name="users" :size="19" /></span><div class="mt-4 text-[12px] text-ink-3">今日应到人次</div><div class="mt-1 text-[28px] font-semibold">{{ loading || error ? '—' : expected }}</div></div>
    </div>
    <div class="card">
      <div class="section-heading border-b border-line px-5 py-4"><div><h2 class="section-title">课次点名进度</h2><p class="section-subtitle">{{ data.today || '今天' }} · 提交状态与已记录人数分别展示</p></div></div>
      <div v-if="error" class="p-5 text-[13px] text-danger" role="alert">{{ error }}<button class="btn btn-ghost btn-sm ml-2" @click="load">重试</button></div>
      <div class="overflow-x-auto"><table class="table-base min-w-[760px]">
        <thead><tr><th>上课时间</th><th>课程</th><th>教学班</th><th>教师</th><th>应到人数</th><th>名单记录</th><th>提交状态</th></tr></thead>
        <tbody>
          <tr v-for="s in sessions" :key="s.id">
            <td class="whitespace-nowrap">{{ s.start_time }}–{{ s.end_time }}</td>
            <td>{{ s.courseName }}</td>
            <td class="text-ink-2">{{ s.groupName }}</td>
            <td class="text-ink-2">{{ s.teacherName || '—' }}</td>
            <td>{{ s.enrolled }}</td>
            <td><span v-if="s.enrolled > 0" class="text-[13px]">已记录 {{ s.marked }}/{{ s.enrolled }}</span><span v-else class="text-[12px] text-ink-3">暂无学生名单</span></td>
            <td>
              <span v-if="s.enrolled === 0" class="badge badge-gray">无需点名</span>
              <span v-else-if="s.status === 'done'" class="badge badge-green">已提交</span>
              <span v-else class="badge badge-orange">待提交</span>
            </td>
          </tr>
          <tr v-if="!sessions.length && !error"><td colspan="7" class="py-14 text-center text-ink-3">{{ loading ? '正在加载今日点名…' : '今天没有需要点名的课次' }}</td></tr>
        </tbody>
      </table></div>
    </div>
    <p class="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3"><AppIcon name="info" :size="15" class="mt-0.5 shrink-0" />已提交不代表全部学生均有记录；无学生名单的课次无需点名，不计入待提交。应到人次按课次累计。此页为学生名单点名，教师本人签到签退请前往「教师考勤」。</p>
  </div>
</template>
