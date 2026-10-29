<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { state } from '../../lib/auth';
import { toast } from '../../lib/toast';
import AppIcon from '../../ui/AppIcon.vue';
import TeacherAttendanceCard from '../../components/TeacherAttendanceCard.vue';
import {
  beijingDate, attendanceTime, attendanceLabel, attendanceBadge, type AttendanceAction, type TeacherAttendanceResponse, type TeacherAttendanceRow,
} from '../../lib/teacherAttendance';

interface Session { id: number; date: string; courseName: string; groupName: string; start_time: string; end_time: string; room: string | null; status: string; enrolled: number; marked: number }
const data = ref<{ today: string; sessions: Session[] }>({ today: '', sessions: [] });
const attendance = ref<TeacherAttendanceResponse | null>(null);
const loading = ref(false);
const scheduleError = ref('');
const attendanceError = ref('');
const actionError = ref('');
const busyId = ref<number | null>(null);
const router = useRouter();
const sessions = computed(() => [...data.value.sessions].filter((session) => session.status !== 'cancelled').sort((a, b) => a.start_time.localeCompare(b.start_time)));
const pendingCount = computed(() => sessions.value.filter((session) => session.enrolled > 0 && session.status !== 'done').length);
const now = computed(() => attendance.value?.now ? Date.parse(attendance.value.now) : Date.now());
const focusSession = computed(() => sessions.value.find((session) => sessionStart(session) <= now.value && sessionEnd(session) > now.value)
  ?? sessions.value.find((session) => attendanceFor(session.id)?.canCheckOut)
  ?? sessions.value.find((session) => sessionStart(session) > now.value)
  ?? sessions.value.at(-1));
const focusLabel = computed(() => !focusSession.value ? '' : sessionStart(focusSession.value) <= now.value && sessionEnd(focusSession.value) > now.value ? '正在上课' : sessionStart(focusSession.value) > now.value ? '下一节课' : '今日最近一节');
const dateLabel = computed(() => {
  const today = data.value.today || attendance.value?.today || beijingDate();
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${today}T12:00:00+08:00`));
});
const teacherName = computed(() => state.me?.teacher?.name || state.me?.name || '老师');
function sessionStart(session: Session) { return Date.parse(`${session.date || data.value.today}T${session.start_time}+08:00`); }
function sessionEnd(session: Session) { return Date.parse(`${session.date || data.value.today}T${session.end_time}+08:00`); }
function rollCall(session: Session) {
  if (session.enrolled <= 0) return { label: '暂无学生', badge: 'badge-gray', action: '查看名单' };
  if (session.status === 'done') return { label: '已提交', badge: 'badge-green', action: '核对名单' };
  if (session.marked > 0) return { label: '待提交', badge: 'badge-orange', action: '继续点名' };
  return { label: '待点名', badge: 'badge-orange', action: '开始点名' };
}

async function load() {
  if (loading.value) return false;
  loading.value = true;
  scheduleError.value = '';
  attendanceError.value = '';
  try {
    const today = beijingDate();
    const [schedule, records] = await Promise.allSettled([
      api.get<{ today: string; sessions: Session[] }>('/api/teacher/today'),
      api.get<TeacherAttendanceResponse>(`/api/teacher/attendance?from=${today}&to=${today}`),
    ]);
    if (schedule.status === 'fulfilled') data.value = schedule.value;
    else scheduleError.value = schedule.reason?.message || '课表加载失败';
    if (records.status === 'fulfilled') {
      attendance.value = records.value;
      if (records.value.today !== today) attendance.value = await api.get<TeacherAttendanceResponse>(`/api/teacher/attendance?from=${records.value.today}&to=${records.value.today}`);
    } else attendanceError.value = records.reason?.message || '教师考勤加载失败';
    return !scheduleError.value && !attendanceError.value;
  } catch (e: unknown) {
    attendanceError.value = e instanceof Error ? e.message : '教师考勤加载失败';
    return false;
  } finally { loading.value = false; }
}

function attendanceFor(sessionId: number) { return attendance.value?.items.find((record) => record.sessionId === sessionId); }

async function act(row: TeacherAttendanceRow | undefined, action: AttendanceAction) {
  if (!row || busyId.value !== null || loading.value) return;
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
    <section class="mobile-hero mb-5 overflow-hidden border border-[#dfe6f7] bg-[#eef2fc] p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3"><div><p class="text-[12px] text-[#62779f]">{{ dateLabel }}</p><h1 class="mt-1.5 text-[22px] sm:mt-2 sm:text-[24px] font-semibold tracking-tight">{{ teacherName }}，你好</h1><p class="mt-2 hidden text-[13px] text-ink-2 sm:block">{{ loading ? '正在准备今天的教学安排' : scheduleError ? '教学安排待刷新' : sessions.length ? '每一堂课，从容开始。' : '今天没有授课安排，享受你的留白。' }}</p></div><span class="icon-tile icon-tile-blue mt-1"><AppIcon name="book" :size="24" /></span></div>
      <div class="mt-3 flex items-center gap-6 border-t border-[#dce3f4] pt-3 sm:mt-5 sm:pt-4"><div><span class="text-[22px] font-semibold sm:text-[25px]">{{ loading || scheduleError ? '—' : sessions.length }}</span><span class="ml-2 text-[12px] text-ink-2">今日课次</span></div><div class="h-7 w-px bg-[#d7deee]" /><div><span class="text-[22px] font-semibold sm:text-[25px]" :class="pendingCount ? 'text-brand' : ''">{{ loading || scheduleError ? '—' : pendingCount }}</span><span class="ml-2 text-[12px] text-ink-2">待提交课次</span></div></div>
    </section>
    <div class="mobile-section-heading mb-3 flex items-center justify-between"><h2 class="section-title">今日教学</h2><button class="btn btn-ghost btn-sm" :disabled="loading || busyId !== null" @click="load"><AppIcon name="calendar" :size="15" />{{ loading ? '加载中…' : '刷新课表' }}</button></div>
    <div v-if="actionError" class="mb-3 rounded-xl border border-red-100 bg-red-50 p-3 text-[13px] leading-relaxed text-danger" role="alert">{{ actionError }}。可刷新记录后再次操作。</div>
    <div v-if="attendanceError" class="card mb-3 p-3 text-[13px]" role="alert"><p class="text-danger">本人考勤暂时无法加载：{{ attendanceError }}</p><button class="btn btn-ghost btn-sm mt-1" :disabled="loading || busyId !== null" @click="load">重新加载考勤</button></div>
    <div v-if="loading" class="card py-14 text-center text-[13px] text-ink-3" role="status">正在加载今日课表与考勤…</div>
    <div v-else-if="scheduleError" class="card p-6 text-center" role="alert"><div class="icon-tile icon-tile-rose mx-auto mb-3"><AppIcon name="alert" /></div><p class="font-medium">课表暂时未能加载</p><p class="mt-2 hidden text-[13px] text-ink-2 sm:block">{{ scheduleError }}</p><button class="btn btn-secondary mt-4" @click="load">重新加载</button></div>
    <div v-else-if="!sessions.length" class="card p-7 text-center"><div class="icon-tile icon-tile-mint mx-auto mb-4"><AppIcon name="leaf" :size="26" /></div><h3 class="text-[16px] font-semibold">今天没有课</h3><p class="mt-2 text-[13px] leading-relaxed text-ink-3">今日无需点名，可查看其他日期的本人考勤。</p><button class="btn btn-secondary mt-5" @click="router.push('/teacher/attendance')">查看我的考勤<AppIcon name="arrow-right" :size="16" /></button></div>
    <template v-else>
      <section v-if="focusSession" class="card mb-5 overflow-hidden border-[#dce3f4]">
        <div class="border-t-[3px] border-brand p-4 sm:p-5"><div class="mb-3 flex items-center justify-between gap-2"><span class="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand"><span class="h-1.5 w-1.5 rounded-full bg-brand" />{{ focusLabel }}</span><span class="text-[12px] text-ink-3">{{ focusSession.groupName || '授课课堂' }}</span></div><h3 class="text-[22px] font-semibold tracking-tight">{{ focusSession.courseName }}</h3><div class="mt-4 flex items-center gap-2 text-[22px] font-semibold tabular-nums tracking-tight"><AppIcon name="clock" :size="20" class="text-brand" />{{ focusSession.start_time }}<span class="text-[15px] font-normal text-ink-3">至</span>{{ focusSession.end_time }}</div><div class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ink-2"><span class="inline-flex items-center gap-1"><AppIcon name="location" :size="16" />{{ focusSession.room || '未安排教室' }}</span><span class="inline-flex items-center gap-1"><AppIcon name="users" :size="16" />应到 {{ focusSession.enrolled }} 人</span></div></div>
        <div class="px-4 pb-4 sm:px-5 sm:pb-5">
          <TeacherAttendanceCard v-if="!attendanceError && attendance && attendanceFor(focusSession.id)" :record="attendanceFor(focusSession.id)!" :now="attendance.now" :busy="busyId !== null" @action="act(attendanceFor(focusSession.id), $event)" />
          <div v-else-if="!attendanceError" class="rounded-xl bg-[#f7f9fd] p-3 text-[12px] text-ink-3">此课次暂无本人考勤记录</div>
          <div class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4"><div><p class="inline-flex items-center gap-1.5 text-[13px] font-semibold"><AppIcon name="users" :size="16" />学生点名</p><p class="mt-1.5 text-[12px] text-ink-3">{{ focusSession.enrolled > 0 ? `记录 ${focusSession.marked} 条 · 名单 ${focusSession.enrolled} 人` : '当前无需提交点名' }}</p></div><button class="btn" :class="attendanceFor(focusSession.id)?.canCheckIn || attendanceFor(focusSession.id)?.canCheckOut ? 'btn-secondary' : 'btn-primary'" @click="router.push(`/teacher/sessions/${focusSession.id}`)">{{ rollCall(focusSession).action }}<AppIcon name="arrow-right" :size="16" /></button></div>
        </div>
      </section>
      <div class="mobile-section-heading mb-3 flex items-center justify-between"><h2 class="section-title">一天的课堂</h2><span class="text-[12px] text-ink-3">按时间排列 · 提交后可继续核对</span></div>
      <div class="space-y-3">
        <article v-for="(session, index) in sessions" :key="session.id" class="card flex overflow-hidden" :class="{ 'border-[#cdd8f7]': session.id === focusSession?.id }">
          <div class="flex w-[74px] shrink-0 flex-col items-center border-r border-line bg-[#fafbfe] py-4"><span class="text-[15px] font-semibold tabular-nums">{{ session.start_time }}</span><span class="mt-1 text-[11px] text-ink-3">{{ session.end_time }}</span><span class="mt-4 flex h-6 w-6 items-center justify-center rounded-full text-[11px]" :class="session.id === focusSession?.id ? 'bg-brand text-white' : 'bg-[#eaf0f7] text-[#7183a1]'">{{ index + 1 }}</span></div>
          <div class="min-w-0 flex-1 p-3.5"><div class="flex flex-wrap items-start justify-between gap-1.5"><h3 class="text-[15px] font-semibold">{{ session.courseName }}</h3><span class="badge" :class="rollCall(session).badge">{{ rollCall(session).label }}</span></div><p class="mt-2 text-[12px] text-ink-3">{{ session.groupName || '未分班' }} · {{ session.room || '未安排教室' }}</p><div v-if="attendanceFor(session.id) && !attendanceError" class="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3"><span>本人</span><span class="badge" :class="attendanceBadge(attendanceFor(session.id)!.status)">{{ attendanceLabel(attendanceFor(session.id)!.status) }}</span></div><div class="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2"><span class="text-[11px] text-ink-3">记录 {{ session.marked }} 条 · 名单 {{ session.enrolled }} 人</span><button class="btn btn-ghost btn-sm -mr-2 text-brand" @click="router.push(`/teacher/sessions/${session.id}`)">{{ rollCall(session).action }}<AppIcon name="chevron-right" :size="15" /></button></div></div>
        </article>
      </div>
      <div class="mt-5 flex items-center justify-between gap-2 rounded-xl bg-[#eaf3f0] p-3.5"><div class="flex items-center gap-2"><AppIcon name="check-circle" :size="19" class="text-[#157f74]" /><span class="text-[13px] text-[#31655d]">本人打卡与学生点名分别记录</span></div><button class="shrink-0 text-[12px] font-medium text-[#157f74]" @click="router.push('/teacher/attendance')">我的考勤</button></div>
    </template>
    <p v-if="attendance && !attendanceError" class="mt-4 text-[11px] leading-relaxed text-ink-3">课前 {{ attendance.rules.checkInMinutesBefore }} 分钟开放签到 · 下课后 {{ attendance.rules.checkOutMinutesAfter }} 分钟内签退<br />更新于 {{ attendanceTime(attendance.now) }}（北京时间）</p>
  </div>
</template>
