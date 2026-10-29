<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import AppIcon from '../../ui/AppIcon.vue';
import AppConfirm from '../../ui/AppConfirm.vue';

type StudentStatus = 'present' | 'late' | 'absent' | 'leave' | 'early';
interface Student { id: number; name: string; code: string; className: string | null; attendance: StudentStatus | null; leaveStatus: string | null }
interface SessionData { session: { id: number; courseName: string; groupName: string; date: string; start_time: string; end_time: string; room: string | null; status: string }; roster: Student[] }
const route = useRoute();
const router = useRouter();
const data = ref<SessionData | null>(null);
const marks = ref<Record<number, StudentStatus | ''>>({});
const saving = ref(false);
const loading = ref(false);
const error = ref('');
const search = ref('');
const filter = ref('all');
const showPartialConfirm = ref(false);
const receipt = ref('');
let loadVersion = 0;

const STATUS: Array<{ v: StudentStatus; l: string; cls: string }> = [
  { v: 'present', l: '正常', cls: 'badge-green' },
  { v: 'late', l: '迟到', cls: 'badge-orange' },
  { v: 'absent', l: '缺勤', cls: 'badge-red' },
  { v: 'leave', l: '请假', cls: 'badge-blue' },
  { v: 'early', l: '早退', cls: 'badge-gray' },
];
const filters = [{ value: 'all', label: '全部' }, { value: 'unmarked', label: '未标记' }, { value: 'abnormal', label: '迟到 / 缺勤 / 早退' }, { value: 'leave', label: '请假' }];
const controlsDisabled = computed(() => saving.value || loading.value || showPartialConfirm.value);
const counts = computed(() => {
  const roster = data.value?.roster ?? [];
  const done = roster.filter((student) => Boolean(marks.value[student.id])).length;
  return { done, total: roster.length, remaining: roster.length - done, leave: roster.filter((student) => student.leaveStatus === 'approved').length };
});
const progress = computed(() => counts.value.total ? Math.round(counts.value.done / counts.value.total * 100) : 0);
const savedCount = computed(() => data.value?.roster.filter((student) => Boolean(student.attendance)).length ?? 0);
const visibleRoster = computed(() => (data.value?.roster ?? []).filter((student) => {
  const status = marks.value[student.id];
  const matchesFilter = filter.value === 'all' || (filter.value === 'unmarked' && !status)
    || (filter.value === 'leave' && status === 'leave') || (filter.value === 'abnormal' && ['late', 'absent', 'early'].includes(status));
  const query = search.value.trim().toLocaleLowerCase();
  return matchesFilter && (!query || `${student.name} ${student.className ?? ''} ${student.code}`.toLocaleLowerCase().includes(query));
}));

async function load() {
  const version = ++loadVersion;
  loading.value = true;
  error.value = '';
  try {
    const result = await api.get<SessionData>(`/api/teacher/sessions/${route.params.id}`);
    if (version !== loadVersion) return false;
    const next: Record<number, StudentStatus | ''> = {};
    for (const student of result.roster) next[student.id] = student.leaveStatus === 'approved' ? 'leave' : student.attendance || '';
    data.value = result;
    marks.value = next;
    return true;
  } catch (e: unknown) {
    if (version === loadVersion) error.value = e instanceof Error ? e.message : '学生名单加载失败';
    return false;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

function setAll(status: StudentStatus | '') {
  if (controlsDisabled.value || !data.value) return;
  const next = { ...marks.value };
  for (const student of data.value.roster) {
    if (student.leaveStatus === 'approved') next[student.id] = 'leave';
    else if (!status || !next[student.id]) next[student.id] = status;
  }
  marks.value = next;
  receipt.value = '';
}

function mark(student: Student, status: StudentStatus) {
  if (controlsDisabled.value || student.leaveStatus === 'approved') return;
  marks.value[student.id] = status;
  receipt.value = '';
}

async function submit() {
  if (saving.value || loading.value || !data.value) return;
  if (!counts.value.done) return toast('还没有标记任何学生', 'error');
  if (counts.value.remaining) { showPartialConfirm.value = true; return; }
  await saveAttendance();
}

async function saveAttendance() {
  if (saving.value || loading.value || !data.value) return;
  showPartialConfirm.value = false;
  const items = data.value.roster.filter((student) => Boolean(marks.value[student.id]))
    .map((student) => ({ studentId: student.id, status: marks.value[student.id] }));
  if (!items.length) return;
  const sessionId = route.params.id;
  saving.value = true;
  receipt.value = '';
  try {
    const result = await api.post<{ ok: boolean; count: number }>(`/api/teacher/sessions/${sessionId}/attendance`, { items });
    if (route.params.id !== sessionId) return;
    const refreshed = await load();
    receipt.value = refreshed
      ? `已保存 ${result.count} 人${counts.value.remaining ? `，还有 ${counts.value.remaining} 人未标记，可继续补充。` : '，本课次学生均已标记。'}`
      : `已提交 ${result.count} 人，请重试加载以确认最新记录。`;
    toast(refreshed ? '点名记录已保存' : '已提交，请刷新确认', refreshed ? 'success' : 'info');
  } catch (e: unknown) {
    toast(e instanceof Error ? e.message : '点名提交失败，请重试', 'error');
  } finally {
    saving.value = false;
  }
}

watch(() => route.params.id, () => { data.value = null; receipt.value = ''; showPartialConfirm.value = false; search.value = ''; filter.value = 'all'; load(); });
onMounted(load);
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between gap-3">
      <button class="btn btn-ghost btn-sm -ml-2" @click="router.back()"><AppIcon name="arrow-left" :size="17" />返回课表</button>
      <span class="text-[12px] text-ink-3">学生点名</span>
    </div>
    <div v-if="loading && !data" class="card py-16 text-center text-[13px] text-ink-3" role="status">正在准备学生名单…</div>
    <div v-else-if="error" class="card p-6 text-center" role="alert">
      <div class="icon-tile icon-tile-rose mx-auto mb-3"><AppIcon name="alert" /></div>
      <p class="font-medium">名单暂时未能加载</p><p class="mt-2 text-[13px] text-ink-2">{{ error }}</p>
      <button class="btn btn-secondary mt-4" :disabled="loading || saving" @click="load">{{ loading ? '加载中…' : '重新加载' }}</button>
    </div>
    <template v-else-if="data">
      <section class="card mb-4 overflow-hidden">
        <div class="border-b border-line p-4">
          <div class="mb-2 flex items-center gap-2"><span class="icon-tile icon-tile-blue"><AppIcon name="book" /></span><span class="text-[12px] text-ink-3">{{ data.session.groupName || '授课课堂' }}</span></div>
          <h1 class="text-[22px] font-semibold leading-snug tracking-tight">{{ data.session.courseName }}</h1>
          <p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-2"><span class="inline-flex items-center gap-1"><AppIcon name="calendar" :size="14" />{{ data.session.date }}</span><span>{{ data.session.start_time }}–{{ data.session.end_time }}</span></p>
          <p class="mt-2 flex items-center gap-1 text-[12px] text-ink-2"><AppIcon name="location" :size="14" />{{ data.session.room || '未安排教室' }}</p>
        </div>
        <div class="bg-[#f9faff] p-4">
          <div class="flex items-end justify-between gap-3"><div><div class="text-[12px] text-ink-2">现场点名进度</div><div class="mt-1"><span class="text-[28px] font-semibold tracking-tight">{{ counts.done }}</span><span class="ml-1 text-[14px] text-ink-3">/ {{ counts.total }} 人</span></div></div><span class="mb-1 text-[13px] font-medium" :class="counts.remaining ? 'text-brand' : 'text-[#157f74]'">{{ !counts.total ? '暂无学生' : counts.remaining ? `还差 ${counts.remaining} 人` : '全部已标记' }}</span></div>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e6eaf4]" role="progressbar" :aria-valuenow="counts.done" :aria-valuemax="counts.total" aria-valuemin="0" aria-label="学生点名进度"><div class="h-full rounded-full bg-brand transition-all" :style="{ width: `${progress}%` }" /></div>
          <p v-if="counts.leave" class="mt-2 text-[11px] leading-relaxed text-ink-3">其中 {{ counts.leave }} 人家长请假已批准，已保留为请假。</p>
        </div>
      </section>
      <div v-if="receipt" class="mb-4 flex items-start gap-2 rounded-xl border border-[#cde5df] bg-[#edf7f3] p-3 text-[13px] leading-relaxed text-[#157f74]" role="status"><AppIcon name="check-circle" :size="18" class="mt-0.5 shrink-0" />{{ receipt }}</div>
      <div v-else-if="savedCount" class="mb-3 text-[12px] text-ink-3">已有 {{ savedCount }} 人保存过点名，可核对后继续补充。</div>
      <section v-if="data.roster.length">
        <div class="mobile-section-heading mb-3 flex items-center justify-between gap-2"><h2 class="section-title">学生名单 <span class="ml-1 text-[12px] font-normal text-ink-3">{{ counts.total }} 人</span></h2><div class="flex gap-1"><button class="btn btn-ghost btn-sm" :disabled="controlsDisabled" @click="setAll('')">清空标记</button><button class="btn btn-secondary btn-sm" :disabled="controlsDisabled" @click="setAll('present')"><AppIcon name="check" :size="15" />其余全到</button></div></div>
        <p class="mb-3 text-[11px] leading-5 text-ink-3">其余全到仅补充未标记学生，保留已标状态；家长请假始终保留。</p>
        <label class="relative mb-3 block"><AppIcon name="search" :size="17" class="pointer-events-none absolute left-3 top-[11px] text-ink-3" /><input v-model="search" class="input h-10 pl-10" placeholder="搜索姓名、班级或学号" aria-label="搜索学生" :disabled="controlsDisabled" /></label>
        <div class="mb-4 flex flex-wrap gap-2"><button v-for="item in filters" :key="item.value" class="filter-chip" :class="{ 'filter-chip-active': filter === item.value }" :aria-pressed="filter === item.value" :disabled="controlsDisabled" @click="filter = item.value">{{ item.label }}<span v-if="item.value === 'unmarked'" class="ml-1">{{ counts.remaining }}</span></button></div>
        <div class="space-y-3">
          <article v-for="student in visibleRoster" :key="student.id" class="card p-3.5" :class="{ 'border-[#cdd8f7]': !marks[student.id] }">
            <div class="mb-3 flex items-start justify-between gap-2"><div class="flex min-w-0 items-center gap-2.5"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0f3fa] text-[15px] font-medium text-[#637697]">{{ student.name.slice(-2) }}</span><div class="min-w-0"><h3 class="text-[15px] font-semibold">{{ student.name }}</h3><p class="mt-1 break-words text-[11px] text-ink-3">{{ student.className || '未分班' }} · {{ student.code }}</p></div></div><span class="badge shrink-0" :class="STATUS.find((status) => status.v === marks[student.id])?.cls || 'badge-gray'">{{ STATUS.find((status) => status.v === marks[student.id])?.l || '未标记' }}</span></div>
            <div v-if="student.leaveStatus === 'approved'" class="mb-3 flex items-center gap-1.5 rounded-lg bg-[#eef3ff] px-2.5 py-2 text-[12px] text-brand"><AppIcon name="check-circle" :size="15" />家长请假已批准 · 请假状态已保留</div>
            <div class="grid grid-cols-5 gap-1.5" role="group" :aria-label="`${student.name}的点名状态`"><button v-for="status in STATUS" :key="status.v" class="min-h-11 rounded-lg border px-1 text-[12px] font-medium transition-colors disabled:opacity-50" :class="marks[student.id] === status.v ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-ink-2'" :aria-pressed="marks[student.id] === status.v" :disabled="controlsDisabled || student.leaveStatus === 'approved'" @click="mark(student, status.v)">{{ status.l }}</button></div>
          </article>
          <div v-if="!visibleRoster.length" class="card py-12 text-center text-[13px] text-ink-3">没有符合条件的学生<button class="btn btn-ghost btn-sm mt-2 block mx-auto" @click="search = ''; filter = 'all'">查看全部学生</button></div>
        </div>
      </section>
      <div v-else class="card px-5 py-12 text-center"><div class="icon-tile icon-tile-mint mx-auto mb-3"><AppIcon name="users" /></div><p class="text-[14px] font-medium">这节课暂无报名学生</p><p class="mt-2 text-[12px] text-ink-3">当前无需提交学生点名。</p></div>
      <div v-if="data.roster.length" class="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 -mx-4 mt-5 border-t border-line bg-white/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm lg:bottom-0">
        <p class="mb-2 text-center text-[12px]" :class="counts.remaining ? 'text-warn' : 'text-ink-3'">{{ counts.remaining ? `还有 ${counts.remaining} 人未标记，提交后可继续补充` : '请核对现场情况后提交' }}</p>
        <button class="btn btn-primary btn-block btn-lg" :disabled="controlsDisabled || !counts.done" @click="submit"><AppIcon name="check-circle" :size="18" />{{ saving ? '正在保存点名…' : `保存点名 · ${counts.done} 人` }}</button>
      </div>
    </template>
    <AppConfirm :show="showPartialConfirm" title="仍有学生未标记" :message="`本课次还有 ${counts.remaining} 人未标记。本次仅保存已标记的 ${counts.done} 人，不代表整班点名完成，是否继续？`" confirm-text="仅保存已标记学生" :loading="saving" @close="showPartialConfirm = false" @confirm="saveAttendance" />
  </div>
</template>
