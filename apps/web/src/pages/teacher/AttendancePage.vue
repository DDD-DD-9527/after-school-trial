<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { state } from '../../lib/auth';
import { toast } from '../../lib/toast';
import TeacherAttendanceCard from '../../components/TeacherAttendanceCard.vue';
import AppDatePicker from '../../ui/AppDatePicker.vue';
import AppIcon from '../../ui/AppIcon.vue';
import {
  attendanceRange, attendanceTime, type AttendanceAction, type TeacherAttendanceResponse, type TeacherAttendanceRow,
} from '../../lib/teacherAttendance';

type RangePreset = 'today' | 'week' | 'month' | 'custom';
const range = ref(attendanceRange('month'));
const appliedRange = ref({ ...range.value });
const preset = ref<RangePreset>('month');
const filter = ref('all');
const data = ref<TeacherAttendanceResponse | null>(null);
const loading = ref(false);
const error = ref('');
const busyId = ref<number | null>(null);
const actionError = ref('');
let loadVersion = 0;
const presets: Array<{ value: RangePreset; label: string }> = [{ value: 'today', label: '今天' }, { value: 'week', label: '本周' }, { value: 'month', label: '本月' }, { value: 'custom', label: '自定义' }];
const stats = computed(() => [
  { label: '授课课次', value: data.value?.summary.total, color: '' },
  { label: '已完成', value: data.value?.summary.completed, color: 'text-[#157f74]' },
  { label: '考勤异常', value: data.value?.summary.abnormal, color: 'text-warn' },
  { label: '待完成', value: data.value?.summary.pending, color: 'text-brand' },
]);
const teacherName = computed(() => state.me?.teacher?.name || state.me?.name || '老师');
const rangeLabel = computed(() => {
  const { from, to } = appliedRange.value;
  return from === to ? from : `${from} 至 ${to}`;
});
function isAbnormal(row: TeacherAttendanceRow) {
  return ['late', 'early', 'late_early', 'unrecorded', 'missing_checkout', 'absent'].includes(row.status) || (row.status === 'in_progress' && row.lateMinutes > 0);
}
const groups = computed(() => {
  const records = [...(data.value?.items ?? [])].filter((row) => filter.value === 'all'
    || (filter.value === 'abnormal' && isAbnormal(row)) || (filter.value === 'pending' && ['pending', 'in_progress'].includes(row.status)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  const result: Array<{ date: string; records: TeacherAttendanceRow[] }> = [];
  for (const row of records) {
    const group = result.at(-1);
    if (group?.date === row.date) group.records.push(row);
    else result.push({ date: row.date, records: [row] });
  }
  return result;
});
const visibleCount = computed(() => groups.value.reduce((total, group) => total + group.records.length, 0));
function dayLabel(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00+08:00`));
}

async function load() {
  if (!range.value.from || !range.value.to || range.value.from > range.value.to) {
    error.value = '请选择有效日期，开始日期不能晚于结束日期';
    return false;
  }
  const version = ++loadVersion;
  const requestedRange = { ...range.value };
  loading.value = true;
  error.value = '';
  try {
    const query = new URLSearchParams(requestedRange);
    const result = await api.get<TeacherAttendanceResponse>(`/api/teacher/attendance?${query}`);
    if (version === loadVersion) { data.value = result; appliedRange.value = requestedRange; }
    return true;
  } catch (e: unknown) {
    if (version === loadVersion) error.value = e instanceof Error ? e.message : '考勤加载失败，请重试';
    return false;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

function quickRange(value: RangePreset) {
  if (loading.value || busyId.value !== null) return;
  preset.value = value;
  if (value === 'custom') return;
  range.value = attendanceRange(value, data.value?.today);
  load();
}

async function act(row: TeacherAttendanceRow, action: AttendanceAction) {
  if (busyId.value !== null || loading.value) return;
  if ((action === 'check-in' && !row.canCheckIn) || (action === 'check-out' && !row.canCheckOut)) return;
  busyId.value = row.sessionId;
  actionError.value = '';
  try {
    await api.post(`/api/teacher/attendance/${row.sessionId}/${action}`, {});
    const refreshed = await load();
    toast(refreshed ? (action === 'check-in' ? '签到成功' : '签退成功') : '打卡已提交，请重试加载以确认记录', refreshed ? 'success' : 'info');
  } catch (e: unknown) {
    actionError.value = e instanceof Error ? e.message : '打卡失败，请重试';
    await load();
  } finally { busyId.value = null; }
}
onMounted(load);
</script>

<template>
  <div>
    <div class="page-heading mb-5 flex items-start justify-between gap-3"><div><p class="eyebrow">{{ teacherName }}的授课记录</p><h1 class="page-title mt-1">我的考勤</h1><p class="page-description mt-2">查看每一次签到、签退与最终考勤结果。</p></div><button class="btn btn-ghost btn-sm mt-1" :disabled="loading || busyId !== null" @click="load">{{ loading ? '加载中…' : '刷新' }}</button></div>
    <section class="card mb-5 overflow-hidden">
      <div class="flex items-center gap-2 border-b border-line px-4 py-3 text-[12px] text-ink-2"><span class="icon-tile icon-tile-blue"><AppIcon name="calendar" :size="18" /></span><span>{{ rangeLabel }}</span></div>
      <div class="grid grid-cols-4 gap-1 px-2 py-5"><div v-for="stat in stats" :key="stat.label" class="text-center"><p class="text-[25px] font-semibold tabular-nums tracking-tight" :class="stat.color">{{ loading || error ? '—' : stat.value ?? '—' }}</p><p class="mt-1.5 text-[11px] text-ink-3">{{ stat.label }}</p></div></div>
      <p class="border-t border-line bg-[#fafbfe] px-4 py-2.5 text-[11px] leading-relaxed text-ink-3">汇总为以上日期内全部课次，不随下方状态筛选变化；“已完成”含已签退的迟到、早退课次。</p>
    </section>
    <section class="mb-5">
      <div class="grid grid-cols-4 gap-1 rounded-xl border border-line bg-white p-1"><button v-for="item in presets" :key="item.value" class="min-h-10 rounded-lg px-1 text-[13px] font-medium transition-colors" :class="preset === item.value ? 'bg-brand text-white shadow-sm' : 'text-ink-2'" :disabled="loading || busyId !== null" :aria-pressed="preset === item.value" @click="quickRange(item.value)">{{ item.label }}</button></div>
      <div v-if="preset === 'custom'" class="card mt-3 p-3.5"><div class="grid grid-cols-2 gap-2"><div><label class="label">开始日期</label><AppDatePicker v-model="range.from" :disabled="loading || busyId !== null" /></div><div><label class="label">结束日期</label><AppDatePicker v-model="range.to" :disabled="loading || busyId !== null" /></div></div><button class="btn btn-primary btn-block mt-3" :disabled="loading || busyId !== null" @click="load">查询所选日期</button></div>
    </section>
    <div class="mobile-section-heading mb-3 flex items-center justify-between gap-2"><h2 class="section-title">考勤明细</h2><span class="text-[12px] text-ink-3">最近日期在前</span></div>
    <div class="mb-4 flex flex-wrap gap-2"><button v-for="item in [{ value: 'all', label: '全部课次' }, { value: 'abnormal', label: '仅看异常' }, { value: 'pending', label: '待完成' }]" :key="item.value" class="filter-chip" :class="{ 'filter-chip-active': filter === item.value }" :aria-pressed="filter === item.value" @click="filter = item.value">{{ item.label }}</button><span v-if="data && !loading && !error" class="ml-auto self-center text-[11px] text-ink-3">{{ visibleCount }} 条</span></div>
    <div v-if="actionError" role="alert" class="mb-3 rounded-xl border border-red-100 bg-red-50 p-3 text-[13px] leading-relaxed text-danger">{{ actionError }}。可刷新记录后再次操作。</div>
    <div v-if="loading" class="card py-14 text-center text-[13px] text-ink-3" role="status">正在加载你的考勤记录…</div>
    <div v-else-if="error" class="card p-6 text-center" role="alert"><div class="icon-tile icon-tile-rose mx-auto mb-3"><AppIcon name="alert" /></div><p class="font-medium">考勤记录暂时无法显示</p><p class="mt-2 text-[13px] text-ink-2">{{ error }}</p><button class="btn btn-secondary mt-4" @click="load">重新加载</button></div>
    <div v-else-if="!data?.items.length" class="card px-5 py-12 text-center"><div class="icon-tile icon-tile-mint mx-auto mb-3"><AppIcon name="calendar" /></div><p class="text-[15px] font-semibold">这段时间暂无授课安排</p><p class="mt-2 text-[12px] text-ink-3">可以切换日期范围查看其他记录。</p></div>
    <div v-else-if="!groups.length" class="card px-5 py-12 text-center"><div class="icon-tile icon-tile-mint mx-auto mb-3"><AppIcon name="check-circle" /></div><p class="text-[15px] font-semibold">{{ filter === 'abnormal' ? '所选日期内没有考勤异常' : '所选日期内没有待完成课次' }}</p><button class="btn btn-ghost btn-sm mt-3" @click="filter = 'all'">查看全部课次</button></div>
    <div v-else class="space-y-5">
      <section v-for="group in groups" :key="group.date"><div class="mb-2.5 flex items-center gap-2 px-0.5"><span class="h-1.5 w-1.5 rounded-full bg-[#8192b4]" /><h3 class="text-[13px] font-semibold text-ink-2">{{ dayLabel(group.date) }}</h3><span v-if="group.date === data?.today" class="badge badge-blue">今天</span><span class="ml-auto text-[11px] text-ink-3">{{ group.records.length }} 节</span></div><div class="grid gap-3 lg:grid-cols-2"><article v-for="record in group.records" :key="record.sessionId" class="card p-4"><div class="mb-3 flex items-start gap-3"><span class="icon-tile icon-tile-blue shrink-0"><AppIcon name="book" :size="18" /></span><div class="min-w-0"><h4 class="text-[16px] font-semibold">{{ record.courseName }}</h4><p class="mt-1 text-[13px] font-medium tabular-nums text-ink-2">{{ record.startTime }}–{{ record.endTime }}</p><p class="mt-1.5 text-[12px] text-ink-3">{{ record.groupName || '未分班' }} · {{ record.room || '未安排教室' }}</p></div></div><TeacherAttendanceCard :record="record" :now="data?.now ?? ''" :busy="busyId !== null" @action="act(record, $event)" /></article></div></section>
    </div>
    <div v-if="data && !error" class="mt-5 rounded-xl border border-[#e5eaf2] bg-[#eef2f7] p-3.5 text-[11px] leading-relaxed text-ink-3"><p class="flex items-start gap-1.5"><AppIcon name="info" :size="15" class="mt-0.5 shrink-0" /><span>课前 {{ data.rules.checkInMinutesBefore }} 分钟开放签到，下课后 {{ data.rules.checkOutMinutesAfter }} 分钟内可签退。迟到签到、提前签退将提示确认；教务更正会保留原始打卡记录。</span></p><p class="mt-2 pl-5">数据更新于 {{ attendanceTime(data.now) }}（北京时间）</p></div>
  </div>
</template>
