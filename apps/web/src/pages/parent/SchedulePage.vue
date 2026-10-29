<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { currentChild } from '../../lib/auth';
import { toast } from '../../lib/toast';
import { beijingDate } from '../../lib/teacherAttendance';
import Modal from '../../ui/Modal.vue';
import AppIcon from '../../ui/AppIcon.vue';
import ParentEmpty from './ParentEmpty.vue';

const router = useRouter();
const rows = ref<any[]>([]);
const enrollmentCount = ref(0);
const loading = ref(false);
const error = ref('');
const view = ref<'today' | 'upcoming' | 'history'>('upcoming');
const visibleDays = ref(10);
const showLeave = ref(false);
const target = ref<any>(null);
const targetChildId = ref<number | null>(null);
const reason = ref('');
const submitting = ref(false);
const now = ref(Date.now());
const today = computed(() => beijingDate(now.value));
let requestId = 0;
const clock = setInterval(() => { now.value = Date.now(); }, 30000);
onBeforeUnmount(() => { requestId++; clearInterval(clock); });
const wd = ['', '一', '二', '三', '四', '五', '六', '日'];
const todayCount = computed(() => rows.value.filter((session) => session.date === today.value).length);
const futureCount = computed(() => rows.value.filter((session) => session.date >= today.value).length);
const grouped = computed(() => {
  const entries = new Map<string, any[]>();
  const sessions = rows.value.filter((session) => view.value === 'today' ? session.date === today.value : view.value === 'history' ? session.date < today.value : session.date >= today.value)
    .sort((a, b) => view.value === 'history' ? b.date.localeCompare(a.date) || a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  for (const session of sessions) { const list = entries.get(session.date) ?? []; list.push(session); entries.set(session.date, list); }
  return [...entries.entries()];
});
const visibleGroups = computed(() => grouped.value.slice(0, visibleDays.value));
function closeLeave() { showLeave.value = false; target.value = null; targetChildId.value = null; reason.value = ''; }
watch(view, () => { visibleDays.value = 10; closeLeave(); });
watch(today, () => { visibleDays.value = 10; closeLeave(); });
async function load() {
  const request = ++requestId;
  const childId = currentChild.value?.id;
  rows.value = []; enrollmentCount.value = 0; error.value = ''; closeLeave(); visibleDays.value = 10; loading.value = !!childId;
  if (!childId) return;
  try {
    const [sessions, enrollments] = await Promise.all([
      api.get<any[]>(`/api/parent/schedule?studentId=${childId}`),
      api.get<any[]>(`/api/parent/enrollments?studentId=${childId}`),
    ]);
    if (request !== requestId || currentChild.value?.id !== childId) return;
    rows.value = sessions; enrollmentCount.value = enrollments.filter((record) => record.status === 'effective').length;
  } catch (err: any) { if (request === requestId) error.value = err.message || '课表暂时无法加载'; }
  finally { if (request === requestId) loading.value = false; }
}
watch(() => currentChild.value?.id, () => { view.value = 'upcoming'; load(); }, { immediate: true });
function sessionState(session: any) {
  if (session.leaveStatus === 'approved') return '已请假';
  if (Date.parse(`${session.date}T${session.end_time}+08:00`) <= now.value) return '已结束';
  return Date.parse(`${session.date}T${session.start_time}+08:00`) <= now.value ? '上课中' : '待上课';
}
function canLeave(session: any) {
  return session && session.date >= today.value && session.status !== 'cancelled' && session.leaveStatus !== 'approved'
    && Date.parse(`${session.date}T${session.end_time}+08:00`) > now.value;
}
function openLeave(session: any) {
  if (submitting.value || !canLeave(session) || !currentChild.value) return;
  target.value = session; targetChildId.value = currentChild.value.id; reason.value = ''; showLeave.value = true;
}
async function submitLeave() {
  if (submitting.value || !showLeave.value || !currentChild.value || targetChildId.value !== currentChild.value.id || !canLeave(target.value)) return;
  const childId = currentChild.value.id;
  const sessionId = target.value.id;
  const context = requestId;
  const selectedView = view.value;
  const leaveReason = reason.value.trim();
  submitting.value = true;
  try {
    await api.post('/api/parent/leaves', { studentId: childId, sessionId, reason: leaveReason });
    if (context !== requestId || currentChild.value?.id !== childId) return;
    const session = rows.value.find((item) => item.id === sessionId);
    if (session) session.leaveStatus = 'approved';
    if (view.value === selectedView) closeLeave();
    toast('请假已生效，老师点名时会自动标记', 'success');
  } catch (err: any) { if (context === requestId) toast(err.message || '请假未成功，请重试', 'error'); }
  finally { submitting.value = false; }
}
const dateLabel = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
</script>

<template>
  <div class="space-y-5">
    <div><p class="eyebrow">把每一天，安排得刚刚好</p><h1 class="page-title mt-1">孩子的课表</h1><p class="page-description mt-2">{{ currentChild ? `${currentChild.name} 的上课安排 · 请假可在对应课程中办理` : '查看上课安排，提前做好准备' }}</p></div>
    <ParentEmpty v-if="!currentChild" icon="users" title="还没有关联孩子" description="请联系学校核实学生与监护人信息，关联后即可查看孩子的课表。" />
    <template v-else>
      <div class="schedule-switch" role="group" aria-label="课程日期范围"><button :class="{ active: view === 'today' }" :aria-pressed="view === 'today'" @click="view = 'today'">今天<span v-if="todayCount">{{ todayCount }}</span></button><button :class="{ active: view === 'upcoming' }" :aria-pressed="view === 'upcoming'" @click="view = 'upcoming'">接下来<span v-if="futureCount">{{ futureCount }}</span></button><button :class="{ active: view === 'history' }" :aria-pressed="view === 'history'" @click="view = 'history'">历史安排</button></div>
      <div v-if="loading" class="card p-7 text-center text-[14px] text-ink-2" role="status">正在整理孩子的课表…</div>
      <div v-else-if="error" class="card p-5" role="alert"><p class="text-[14px] text-ink-2">{{ error }}</p><button class="btn btn-secondary btn-sm mt-3" @click="load">重新加载</button></div>
      <ParentEmpty v-else-if="!enrollmentCount && !rows.length" title="选好课程，课表就会出现在这里" description="孩子目前没有有效报名。先了解课程，再安排适合的课后时光。"><button class="btn btn-primary" @click="router.push('/parent/enroll')">去选课程<AppIcon name="arrow-right" :size="17" /></button></ParentEmpty>
      <ParentEmpty v-else-if="!grouped.length" icon="calendar" :title="view === 'today' ? '今天没有课，放松一下' : view === 'history' ? '还没有历史课程安排' : '暂时没有后续课程安排'" :description="view === 'today' ? '切换到接下来，看看之后的课程。' : view === 'history' ? '过去的课程安排会保留在这里，方便回看。' : '已报名课程的课表可能还在准备中，请留意学校发布的安排。'"><button v-if="view === 'today'" class="btn btn-secondary" @click="view = 'upcoming'">查看接下来</button></ParentEmpty>
      <div v-else class="space-y-5">
        <section v-for="[date, list] in visibleGroups" :key="date" class="schedule-day"><div class="day-heading"><span class="day-dot" :class="{ 'is-today': date === today }" /><h2 class="text-[15px] font-semibold">{{ dateLabel(date) }}<span class="ml-2 text-[12px] font-normal text-ink-3">周{{ wd[list[0].weekday] }}</span></h2><span v-if="date === today" class="badge badge-blue">今天</span><span class="ml-auto text-[12px] text-ink-3">{{ list.length }} 节</span></div><div class="day-sessions"><article v-for="session in list" :key="session.id" class="card session-card"><div class="session-time"><strong>{{ session.start_time }}</strong><span>{{ session.end_time }}</span></div><div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-2"><h3 class="text-[15px] font-semibold leading-6">{{ session.courseName }}</h3><span class="badge" :class="sessionState(session) === '已请假' ? 'badge-blue' : sessionState(session) === '上课中' ? 'badge-green' : 'badge-gray'">{{ sessionState(session) }}</span></div><div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2"><span class="inline-flex items-center gap-1"><AppIcon name="location" :size="13" />{{ session.room || '教室待定' }}</span><span class="inline-flex items-center gap-1"><AppIcon name="user" :size="13" />{{ session.teacherName || '教师待定' }}</span></div><div v-if="canLeave(session)" class="mt-3 flex justify-end"><button class="leave-button" :disabled="submitting" @click="openLeave(session)">这节课请假<AppIcon name="chevron-right" :size="14" /></button></div></div></article></div></section>
        <button v-if="grouped.length > visibleDays" class="btn btn-secondary btn-block" @click="visibleDays += 10">查看更多安排 · 还有 {{ grouped.length - visibleDays }} 天<AppIcon name="chevron-right" :size="16" /></button><p v-else class="text-center text-[12px] text-ink-3">已展示{{ view === 'history' ? '历史' : view === 'today' ? '今天' : '接下来' }}的全部已加载安排</p>
      </div>
      <p v-if="!loading && rows.length >= 300" class="text-[12px] leading-6 text-ink-3">已加载 300 条课程安排，若未找到所需课次，请联系学校核实。</p>
    </template>
    <Modal :show="showLeave" title="为这节课请假" @close="closeLeave"><div v-if="target" class="mb-4 rounded-xl bg-[#f5f7fc] p-4"><p class="text-[15px] font-semibold">{{ target.courseName }}</p><p class="mt-1 text-[13px] text-ink-2">{{ target.date }} {{ target.start_time }}–{{ target.end_time }}</p><p class="mt-2 text-[12px] text-ink-3">请假学生：{{ currentChild?.name }}</p></div><div class="field"><label class="label" for="leave-reason">请假原因（选填）</label><textarea id="leave-reason" v-model="reason" class="leave-reason" rows="3" maxlength="200" placeholder="如身体不适、家中有事，最多 200 字" /><p class="mt-1 text-right text-[11px] text-ink-3">{{ reason.length }}/200</p></div><p class="flex items-start gap-2 text-[12px] leading-6 text-ink-2"><AppIcon name="info" :size="16" class="mt-1 shrink-0 text-brand" />提交后立即生效，老师点名时会自动标记为请假。如需取消，请联系学校。</p><template #footer><button class="btn btn-secondary" :disabled="submitting" @click="closeLeave">先不请假</button><button class="btn btn-primary" :disabled="submitting || !canLeave(target)" @click="submitLeave">{{ submitting ? '提交中…' : '确认请假' }}</button></template></Modal>
  </div>
</template>

<style scoped>
.schedule-switch { display: flex; padding: 5px; gap: 4px; border: 1px solid #e8ebf2; border-radius: 12px; background: #eceff6; }
.schedule-switch button { display: flex; flex: 1; align-items: center; justify-content: center; gap: 6px; min-height: 37px; border-radius: 8px; font-size: 13px; color: #7a879c; }
.schedule-switch button.active { color: #3156d3; background: #fff; font-weight: 600; box-shadow: 0 2px 5px #26366108; }
.schedule-switch button span { font-size: 10px; font-weight: 500; }
.day-heading { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; }
.day-dot { width: 9px; height: 9px; border-radius: 50%; background: #c9d2e6; border: 2px solid #f5f6fa; box-shadow: 0 0 0 1px #d3daea; }
.day-dot.is-today { background: #3156d3; box-shadow: 0 0 0 1px #3156d3; }
.day-sessions { display: grid; gap: 12px; margin-left: 4px; padding-left: 16px; border-left: 1px solid #dfe4ee; }
.session-card { display: flex; gap: 13px; padding: 16px; }
.session-time { display: flex; width: 47px; flex: none; flex-direction: column; padding-top: 2px; font-variant-numeric: tabular-nums; }
.session-time strong { font-size: 15px; font-weight: 600; }
.session-time span { margin-top: 5px; font-size: 11px; color: #8a95a6; }
.leave-button { display: flex; align-items: center; gap: 1px; padding: 4px 0 0 6px; color: #3156d3; font-size: 12px; }
.leave-button:disabled { opacity: .5; }
.leave-reason { width: 100%; resize: vertical; min-height: 90px; padding: 10px 12px; font-size: 14px; border: 1px solid #dfe4ee; border-radius: 9px; outline: none; }
.leave-reason:focus { border-color: #3156d3; box-shadow: 0 0 0 3px #3156d310; }
@media (min-width: 750px) { .day-sessions { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
