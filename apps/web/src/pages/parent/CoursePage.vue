<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { children, currentChild } from '../../lib/auth';
import { toast } from '../../lib/toast';
import { beijingDate } from '../../lib/teacherAttendance';
import AppIcon from '../../ui/AppIcon.vue';
import CourseCover from './CourseCover.vue';
import ParentEmpty from './ParentEmpty.vue';

const route = useRoute();
const router = useRouter();
const course = ref<any>(null);
const choices = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const enrolling = ref(false);
const now = ref(Date.now());
let requestId = 0;
const clock = setInterval(() => { now.value = Date.now(); }, 30000);
onBeforeUnmount(() => { requestId++; clearInterval(clock); });
const chosen = computed(() => {
  const id = Number(route.query.planCourseId);
  return id ? choices.value.find((item) => item.planCourseId === id) : choices.value.find((item) => item.planCourseId === course.value?.planCourseId) ?? choices.value[0];
});
const alreadyEnrolled = computed(() => choices.value.some((item) => item.mine === 'effective'));
const remaining = computed(() => chosen.value?.remaining ?? 0);
const windowState = computed(() => {
  if (!chosen.value) return '暂未开放报名';
  const parse = (value: string) => Date.parse(`${value.replace(' ', 'T')}${/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? '' : '+08:00'}`);
  if (now.value < parse(chosen.value.start_at)) return '报名尚未开始';
  if (now.value > parse(chosen.value.end_at)) return '报名已结束';
  return '';
});
const canEnroll = computed(() => !!currentChild.value && !loading.value && !alreadyEnrolled.value && chosen.value?.mine !== 'withdrawn' && !!chosen.value && !windowState.value && remaining.value > 0 && !enrolling.value);
const actionLabel = computed(() => {
  if (enrolling.value) return '正在提交报名…';
  if (!currentChild.value) return '请先关联孩子';
  if (alreadyEnrolled.value) return '孩子已报名';
  if (chosen.value?.mine === 'withdrawn') return '该计划已退课';
  if (windowState.value) return windowState.value;
  if (remaining.value <= 0) return '名额已满';
  return '确认报名';
});
const wd = ['', '一', '二', '三', '四', '五', '六', '日'];
const slots = computed(() => {
  const entries = new Map<string, any>();
  for (const session of futureSessions.value.length ? futureSessions.value : course.value?.sessions ?? []) {
    const key = `${session.weekday}-${session.start_time}-${session.end_time}-${session.room || ''}`;
    if (!entries.has(key)) entries.set(key, session);
  }
  return [...entries.values()];
});
const futureSessions = computed(() => (course.value?.sessions ?? [])
  .filter((session: any) => session.date >= beijingDate(now.value) && Date.parse(`${session.date}T${session.end_time}+08:00`) > now.value)
  .sort((a: any, b: any) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`)));
const yuan = (cents: number) => cents === 0 ? '免费' : `¥${(cents / 100).toFixed(2)}`;
async function load() {
  const request = ++requestId;
  const childId = currentChild.value?.id;
  const courseId = String(route.params.id);
  course.value = null; choices.value = []; error.value = ''; loading.value = true;
  try {
    const [detail, plans] = await Promise.all([
      api.get<any>(`/api/parent/courses/${encodeURIComponent(courseId)}`),
      childId ? api.get<any[]>(`/api/parent/plans?studentId=${childId}`) : Promise.resolve([]),
    ]);
    if (request !== requestId || currentChild.value?.id !== childId) return;
    course.value = detail;
    choices.value = plans.flatMap((plan) => plan.courses.filter((item: any) => item.courseId === Number(courseId)).map((item: any) => ({ ...item, name: plan.name, start_at: plan.start_at, end_at: plan.end_at })));
  } catch (err: any) { if (request === requestId) error.value = err.message || '课程详情暂时无法加载'; }
  finally { if (request === requestId) loading.value = false; }
}
watch(() => [route.params.id, route.query.planCourseId, currentChild.value?.id], load, { immediate: true });
async function enroll() {
  if (!canEnroll.value || !chosen.value || !currentChild.value) return;
  const childId = currentChild.value.id;
  const context = requestId;
  const planCourseId = chosen.value.planCourseId;
  enrolling.value = true;
  try {
    await api.post('/api/parent/enroll', { planCourseId, studentId: childId });
    if (context !== requestId || currentChild.value?.id !== childId) return;
    chosen.value.mine = 'effective';
    toast('报名成功，可在报名与费用中查看', 'success');
    await router.replace('/parent/enrollments');
  } catch (err: any) {
    if (context !== requestId) return;
    toast(err.message || '报名未成功，请重试', 'error');
    if (['FULL', 'DUPLICATED', 'PLAN_CLOSED', 'ENDED', 'NOT_STARTED'].includes(err.code)) await load();
  } finally { enrolling.value = false; }
}
</script>

<template>
  <div class="course-detail space-y-5">
    <button class="inline-flex items-center gap-1 text-[13px] text-ink-2" @click="router.push('/parent/enroll')"><AppIcon name="arrow-left" :size="17" />返回选课</button>
    <div v-if="loading" class="card p-8 text-center text-[14px] text-ink-2" role="status">正在了解课程安排…</div>
    <div v-else-if="error" class="card p-5" role="alert"><p class="text-[14px] text-ink-2">{{ error }}</p><button class="btn btn-secondary btn-sm mt-3" @click="load">重新加载</button></div>
    <template v-else-if="course">
      <section class="course-intro card p-5">
        <div class="flex items-center gap-4"><CourseCover :name="course.name" large /><div class="min-w-0 flex-1"><span class="text-[12px] text-ink-3">{{ course.term }} · {{ course.grade || '不限年级' }}</span><h1 class="mt-2 text-[24px] font-semibold leading-8">{{ course.name }}</h1><span v-if="alreadyEnrolled" class="badge badge-green mt-2">孩子已报名</span><span v-else-if="chosen?.mine === 'withdrawn'" class="badge badge-gray mt-2">已退课</span><span v-else-if="chosen" class="mt-2 block text-[12px] text-ink-2">{{ remaining > 0 ? `剩余 ${remaining} 个名额` : '当前名额已满' }}</span></div></div>
        <p v-if="chosen?.mine === 'withdrawn'" class="mt-4 rounded-lg bg-[#f5f7fc] p-3 text-[12px] leading-6 text-ink-2">该报名计划已退课。如需重新报名，请联系学校。</p>
        <div class="mt-6 border-t border-line pt-4"><h2 class="text-[15px] font-semibold">这门课学什么</h2><p class="mt-2 whitespace-pre-line text-[14px] leading-7 text-ink-2">{{ course.description || '学校暂未发布详细课程介绍，报名前可联系学校了解。' }}</p></div>
      </section>

      <div class="detail-grid">
        <section class="card p-5"><h2 class="flex items-center gap-2 text-[16px] font-semibold"><AppIcon name="calendar" :size="19" class="text-brand" />教师与上课安排</h2><div class="mt-4 flex items-center gap-3"><span class="icon-tile icon-tile-mint"><AppIcon name="user" :size="21" /></span><div><p class="text-[14px] font-medium">{{ course.teacherName || '教师待定' }}</p><p class="mt-0.5 text-[12px] text-ink-3">授课教师</p></div></div><div class="mt-4 space-y-3"><div v-for="slot in slots" :key="`${slot.weekday}-${slot.start_time}-${slot.end_time}-${slot.room}`" class="slot-row"><span class="slot-day">周{{ wd[slot.weekday] }}</span><div><p class="text-[14px] font-medium">{{ slot.start_time }}–{{ slot.end_time }}</p><p class="mt-1 text-[12px] text-ink-2">{{ slot.room || '教室待定' }}</p></div></div><p v-if="!slots.length" class="text-[13px] leading-6 text-ink-2">课表待学校发布，报名前请确认上课时间。</p></div><p v-if="futureSessions.length" class="mt-4 border-t border-line pt-3 text-[12px] leading-5 text-ink-3">已发布 {{ futureSessions.length }} 节后续课次，最近一节为 {{ futureSessions[0].date }} {{ futureSessions[0].start_time }}。具体安排以孩子课表为准。</p><p v-else-if="slots.length" class="mt-4 text-[12px] leading-5 text-ink-3">以上为已发布课次时段，目前暂无后续课次，请联系学校确认。</p></section>
        <section class="card p-5"><h2 class="flex items-center gap-2 text-[16px] font-semibold"><AppIcon name="wallet" :size="19" class="text-brand" />费用与退课规则</h2><div class="mt-4 flex items-baseline justify-between"><span class="text-[13px] text-ink-2">课程费用</span><strong class="text-[24px] font-semibold text-brand">{{ yuan(course.price_cents) }}</strong></div><p class="mt-3 rounded-lg bg-[#f6f7fa] px-3 py-2 text-[12px] leading-6 text-ink-2">{{ course.price_cents > 0 ? '报名后请向学校线下缴纳，本页面不支持线上支付。' : '此课程免费，报名后无需缴费。' }}</p><div class="mt-5"><h3 class="text-[13px] font-medium">退课说明</h3><p class="mt-2 whitespace-pre-line text-[13px] leading-6 text-ink-2">{{ course.refund_note || '学校暂未发布退课说明，请报名前联系学校确认。' }}</p></div><p v-if="chosen" class="mt-4 border-t border-line pt-3 text-[12px] leading-6 text-ink-3">{{ chosen.name }}<br />报名时间：{{ chosen.start_at }} 至 {{ chosen.end_at }}</p></section>
      </div>

      <section v-if="currentChild" class="card flex items-center gap-3 p-4"><span class="icon-tile icon-tile-blue"><AppIcon name="users" :size="21" /></span><div class="flex-1"><p class="text-[12px] text-ink-3">本次为谁报名</p><p class="mt-1 text-[15px] font-semibold">{{ currentChild.name }}</p></div><span v-if="children.length > 1" class="text-[12px] text-ink-3">可在页面顶部切换</span></section>
      <ParentEmpty v-else icon="users" title="还没有关联孩子" description="请联系学校核实学生与监护人信息，关联后即可报名。" />

      <div class="course-action"><div class="action-inner"><div><p class="text-[11px] text-ink-3">课程费用</p><strong class="mt-0.5 block text-[22px] font-semibold text-brand">{{ yuan(course.price_cents) }}</strong></div><button v-if="alreadyEnrolled" class="btn btn-secondary btn-lg" @click="router.push('/parent/enrollments')">查看报名<AppIcon name="arrow-right" :size="17" /></button><button v-else class="btn btn-primary btn-lg" :disabled="!canEnroll" @click="enroll">{{ actionLabel }}<AppIcon v-if="canEnroll" name="arrow-right" :size="17" /></button></div></div>
    </template>
  </div>
</template>

<style scoped>
.course-detail { padding-bottom: 100px; }
.detail-grid { display: grid; gap: 16px; }
.slot-row { display: flex; align-items: center; gap: 13px; }
.slot-day { display: grid; place-items: center; width: 40px; height: 44px; border-radius: 9px; background: #f1f4fb; color: #3156d3; font-size: 12px; font-weight: 500; }
.course-action { position: fixed; z-index: 25; bottom: calc(76px + env(safe-area-inset-bottom)); left: 0; right: 0; padding: 12px 20px; border-top: 1px solid #e4e8f0; background: #fffffff5; backdrop-filter: blur(14px); box-shadow: 0 -4px 24px #28345105; }
.action-inner { display: flex; justify-content: space-between; align-items: center; gap: 16px; width: 100%; max-width: 1080px; margin: 0 auto; }
.action-inner .btn { min-width: 154px; }
@media (min-width: 700px) { .detail-grid { grid-template-columns: 1.1fr 1fr; } }
@media (min-width: 1024px) { .course-action { left: var(--mobile-sidebar-width, 232px); bottom: 0; padding: 15px 36px; } .action-inner { max-width: 1008px; } }
</style>
