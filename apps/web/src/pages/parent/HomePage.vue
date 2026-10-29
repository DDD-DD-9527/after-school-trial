<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { currentChild } from '../../lib/auth';
import { beijingDate } from '../../lib/teacherAttendance';
import AppIcon from '../../ui/AppIcon.vue';
import ParentEmpty from './ParentEmpty.vue';

const router = useRouter();
const schedule = ref<any[]>([]);
const enrollments = ref<any[]>([]);
const bills = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const now = ref(Date.now());
const clock = setInterval(() => { now.value = Date.now(); }, 30000);
let requestId = 0;
onBeforeUnmount(() => { clearInterval(clock); requestId++; });
const today = computed(() => beijingDate(now.value));
const effective = computed(() => enrollments.value.filter((row) => row.status === 'effective'));
const unpaid = computed(() => bills.value.filter((bill) => bill.status !== 'paid' && bill.status !== 'void' && bill.amount_cents > bill.paid_cents));
const unpaidAmount = computed(() => unpaid.value.reduce((sum, bill) => sum + Math.max(0, bill.amount_cents - bill.paid_cents), 0));
const ordered = computed(() => [...schedule.value].sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`)));
const todaySessions = computed(() => ordered.value.filter((session) => session.date === today.value));
const nextSession = computed(() => ordered.value.find((session) => session.leaveStatus !== 'approved' && Date.parse(`${session.date}T${session.end_time}+08:00`) > now.value));
const dateLabel = (date: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00+08:00`));
const yuan = (cents: number) => cents === 0 ? '免费' : `¥${(cents / 100).toFixed(2)}`;
function sessionStatus(session: any) {
  if (session.leaveStatus === 'approved') return '已请假';
  if (Date.parse(`${session.date}T${session.end_time}+08:00`) <= now.value) return '已结束';
  return Date.parse(`${session.date}T${session.start_time}+08:00`) <= now.value ? '上课中' : '待上课';
}
async function load() {
  const request = ++requestId;
  const childId = currentChild.value?.id;
  schedule.value = []; enrollments.value = []; bills.value = []; error.value = ''; loading.value = !!childId;
  if (!childId) return;
  try {
    const [sessions, records, billList] = await Promise.all([
      api.get<any[]>(`/api/parent/schedule?studentId=${childId}`),
      api.get<any[]>(`/api/parent/enrollments?studentId=${childId}`),
      api.get<any[]>(`/api/parent/bills?studentId=${childId}`),
    ]);
    if (request !== requestId || currentChild.value?.id !== childId) return;
    schedule.value = sessions; enrollments.value = records; bills.value = billList;
  } catch (err: any) {
    if (request === requestId) error.value = err.message || '课程安排暂时无法加载';
  } finally { if (request === requestId) loading.value = false; }
}
watch(() => currentChild.value?.id, load, { immediate: true });
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="eyebrow">孩子的课后时光</p>
        <h1 class="mt-1 text-[26px] font-semibold tracking-tight">{{ currentChild ? `${currentChild.name}，今天好` : '欢迎来到课后服务' }}</h1>
        <p class="mt-1 text-[13px] text-ink-2">{{ dateLabel(today) }}</p>
      </div>
      <span class="child-avatar">{{ currentChild?.name?.slice(-1) || '童' }}</span>
    </div>

    <ParentEmpty v-if="!currentChild" icon="users" title="先关联孩子，开启课后安排" description="当前账号还没有关联孩子，请联系学校核实学生与监护人信息。" />
    <div v-else-if="loading" class="card p-7 text-center text-[14px] text-ink-2" role="status">正在整理孩子的课程安排…</div>
    <div v-else-if="error" class="card p-5" role="alert"><p class="text-[14px] text-ink-2">{{ error }}</p><button class="btn btn-secondary btn-sm mt-3" @click="load">重新加载</button></div>
    <template v-else>
      <section class="card today-card">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-[15px] font-semibold"><AppIcon name="calendar" class="text-brand" />今天上什么</div>
          <span class="text-[12px] text-ink-3">{{ todaySessions.length ? `${todaySessions.length} 节安排` : '好好安排课余时光' }}</span>
        </div>
        <div v-if="todaySessions.length" class="mt-4 divide-y divide-line">
          <div v-for="session in todaySessions" :key="session.id" class="flex gap-3 py-3 first:pt-0 last:pb-0">
            <div class="time-block"><strong>{{ session.start_time }}</strong><span>{{ session.end_time }}</span></div>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2"><h2 class="text-[16px] font-semibold">{{ session.courseName }}</h2><span class="badge" :class="sessionStatus(session) === '上课中' ? 'badge-green' : 'badge-gray'">{{ sessionStatus(session) }}</span></div>
              <p class="mt-1 text-[12px] leading-5 text-ink-2">{{ session.room || '教室待定' }} · {{ session.teacherName || '教师待定' }}</p>
            </div>
          </div>
        </div>
        <div v-else class="py-7 text-center"><div class="mx-auto mb-3 icon-tile icon-tile-mint"><AppIcon name="leaf" :size="26" /></div><h2 class="text-[17px] font-semibold">今天没有课程安排</h2><p class="mt-1 text-[13px] text-ink-2">{{ effective.length ? '看看接下来的安排，提前做好准备。' : '挑一门喜欢的课，让课后时光更丰富。' }}</p></div>
        <div v-if="nextSession && nextSession.date > today" class="next-session mt-4 flex items-start gap-3"><AppIcon name="clock" :size="18" class="mt-0.5 shrink-0 text-brand" /><div class="text-[12px] leading-5"><span class="text-ink-2">下一节 · {{ dateLabel(nextSession.date) }} {{ nextSession.start_time }}</span><p class="font-medium text-ink">{{ nextSession.courseName }}</p></div></div>
      </section>

      <div class="grid grid-cols-2 gap-3">
        <button class="card quick-entry" @click="router.push('/parent/enroll')"><span class="icon-tile icon-tile-blue"><AppIcon name="book" :size="22" /></span><span class="mt-3 text-[15px] font-semibold">发现好课程</span><span class="mt-1 text-[12px] text-ink-2">选一份热爱与成长</span><AppIcon name="arrow-right" :size="17" class="quick-arrow" /></button>
        <button class="card quick-entry" @click="router.push('/parent/schedule')"><span class="icon-tile icon-tile-mint"><AppIcon name="calendar" :size="22" /></span><span class="mt-3 text-[15px] font-semibold">查看课表</span><span class="mt-1 text-[12px] text-ink-2">查安排，也可请假</span><AppIcon name="arrow-right" :size="17" class="quick-arrow" /></button>
      </div>

      <button v-if="unpaid.length" class="payment-reminder w-full" @click="router.push('/parent/enrollments')"><span class="icon-tile icon-tile-amber"><AppIcon name="wallet" :size="22" /></span><span class="flex-1 text-left"><span class="block text-[14px] font-semibold">有 {{ unpaid.length }} 笔费用待缴</span><span class="mt-1 block text-[12px] text-ink-2">待缴 {{ yuan(unpaidAmount) }} · 请向学校线下缴纳</span></span><AppIcon name="chevron-right" :size="18" class="shrink-0 text-ink-3" /></button>

      <section>
        <div class="mobile-section-heading mb-3 flex items-center justify-between"><h2 class="section-title">正在学习</h2><button class="flex items-center gap-1 text-[13px] text-brand" @click="router.push('/parent/enrollments')">报名与费用<AppIcon name="chevron-right" :size="16" /></button></div>
        <div v-if="effective.length" class="card divide-y divide-line px-4"><div v-for="record in effective.slice(0, 3)" :key="record.id" class="flex items-center gap-3 py-4"><span class="course-initial">{{ record.courseName.slice(0, 1) }}</span><div class="min-w-0 flex-1"><h3 class="text-[14px] font-medium">{{ record.courseName }}</h3><p class="mt-1 text-[12px] text-ink-2">{{ record.teacherName || '教师待定' }} · {{ yuan(record.price_cents) }}</p></div><span class="badge badge-green">已报名</span></div></div>
        <ParentEmpty v-else title="还没有正在学习的课程" description="先看看学校开放的课程，了解安排后再报名。"><button class="btn btn-primary" @click="router.push('/parent/enroll')">去选课程<AppIcon name="arrow-right" :size="17" /></button></ParentEmpty>
      </section>
    </template>
  </div>
</template>

<style scoped>
.child-avatar { display: grid; place-items: center; width: 50px; height: 50px; flex: none; border-radius: 18px; background: #e8edf9; color: #3156d3; font-size: 21px; font-weight: 600; border: 4px solid #fff; }
.today-card { padding: 20px; border-top: 3px solid #3156d3; }
.time-block { display: flex; flex-direction: column; width: 51px; flex: none; border-right: 2px solid #dfe5f9; }
.time-block strong { font-size: 15px; font-variant-numeric: tabular-nums; }
.time-block span { margin-top: 4px; color: #8a95a6; font-size: 11px; }
.next-session { padding: 12px; border-radius: 10px; background: #f5f7fc; }
.quick-entry { position: relative; display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 17px; }
.quick-arrow { position: absolute; right: 14px; top: 24px; color: #a0abc0; }
.payment-reminder { display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid #eee3ce; border-radius: 14px; background: #fffaf0; }
.course-initial { display: grid; place-items: center; width: 38px; height: 42px; flex: none; border-radius: 10px; background: #f0f3fc; color: #3156d3; font-weight: 600; }
</style>
