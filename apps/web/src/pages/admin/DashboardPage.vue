<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { state } from '../../lib/auth';
import { beijingDate, type TeacherAttendanceResponse } from '../../lib/teacherAttendance';
import AppIcon from '../../ui/AppIcon.vue';
interface TodaySession { id: number; start_time: string; end_time: string; courseName: string; groupName: string; room: string | null; teacherName: string | null; enrolled: number; marked: number; status: string }
interface Dashboard { stats: { students: number; classes: number; teachers: number; courses: number }; todaySessions: TodaySession[]; today: string }
interface Finance { outstanding: number; unpaidCount: number; receivable: number; received: number }
const router = useRouter();
const data = ref<Dashboard | null>(null);
const teacher = ref<TeacherAttendanceResponse | null>(null);
const finance = ref<Finance | null>(null);
const loading = ref(true);
const error = ref('');
const secondaryErrors = ref<string[]>([]);
const sessions = computed(() => (data.value?.todaySessions ?? []).filter(s => s.status !== 'cancelled'));
const pendingRoll = computed(() => sessions.value.filter(s => s.enrolled > 0 && s.status !== 'done').length);
const marked = computed(() => sessions.value.reduce((sum, s) => sum + s.marked, 0));
const enrolled = computed(() => sessions.value.reduce((sum, s) => sum + s.enrolled, 0));
const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${data.value?.today || beijingDate()}T12:00:00+08:00`)));
const yuan = (cents: number) => `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const metrics = computed(() => [
  { label: '今日服务课次', value: data.value ? sessions.value.length : '—', unit: '节', hint: '以今日有效课表为准', icon: 'calendar', color: 'blue', to: '/admin/schedule' },
  { label: '学生点名待提交', value: data.value ? pendingRoll.value : '—', unit: '节', hint: `点名记录 ${marked.value} 条 · 当前 ${enrolled.value} 人次`, icon: 'users', color: 'amber', to: '/admin/attendance' },
  { label: '教师本人签到', value: teacher.value ? `${teacher.value.summary.checkedIn} / ${teacher.value.summary.total}` : '—', unit: '课次', hint: '与学生点名分开记录', icon: 'check-circle', color: 'mint', to: '/admin/teacher-attendance' },
  { label: '待收费用', value: finance.value ? yuan(finance.value.outstanding) : '—', unit: '', hint: finance.value ? `${finance.value.unpaidCount} 笔账单待缴清 · 全部账单` : '正在读取账单汇总', icon: 'wallet', color: 'rose', to: '/admin/finance' },
]);
const quickLinks = [
  { title: '课程管理', hint: '课程、教师与费用', icon: 'book', color: 'blue', to: '/admin/courses' },
  { title: '排课安排', hint: '时间、教室与课次', icon: 'calendar', color: 'mint', to: '/admin/schedule' },
  { title: '报名计划', hint: '发布报名、查看名单', icon: 'file', color: 'amber', to: '/admin/plans' },
  { title: '费用管理', hint: '查看账单、登记收款', icon: 'wallet', color: 'rose', to: '/admin/finance' },
];
const baseStats = [
  { key: 'students', label: '学生', unit: '人', to: '/admin/students' },
  { key: 'teachers', label: '教师', unit: '人', to: '/admin/teachers' },
  { key: 'classes', label: '行政班', unit: '个', to: '/admin/classes' },
  { key: 'courses', label: '课程', unit: '门', to: '/admin/courses' },
] as const;
async function load() {
  if (loading.value && data.value) return;
  loading.value = true; error.value = ''; secondaryErrors.value = [];
  try {
    const dashboard = await api.get<Dashboard>('/api/admin/dashboard');
    data.value = dashboard;
    const [attendanceResult, financeResult] = await Promise.allSettled([
      api.get<TeacherAttendanceResponse>(`/api/admin/teacher-attendance?from=${dashboard.today}&to=${dashboard.today}`),
      api.get<Finance>('/api/admin/finance/summary'),
    ]);
    if (attendanceResult.status === 'fulfilled') teacher.value = attendanceResult.value;
    else { teacher.value = null; secondaryErrors.value.push('教师考勤暂时无法加载'); }
    if (financeResult.status === 'fulfilled') finance.value = financeResult.value;
    else { finance.value = null; secondaryErrors.value.push('费用汇总暂时无法加载'); }
  } catch (e: unknown) { error.value = e instanceof Error ? e.message : '工作台暂时无法加载'; }
  finally { loading.value = false; }
}
function showToday() { document.getElementById('today-sessions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
onMounted(load);
</script>
<template>
  <div>
    <div class="page-heading"><div><h1 class="page-title">工作台</h1><p class="page-description">{{ dateLabel }} <span class="mx-1.5 text-[#bac3d3]">/</span> 欢迎回来，{{ state.me?.name }}</p></div><div class="flex gap-2"><button class="btn btn-secondary" :disabled="loading" @click="load"><AppIcon name="refresh" :size="16" />{{ loading ? '更新中' : '刷新' }}</button><button class="btn btn-primary" @click="router.push('/admin/plans')"><AppIcon name="plus" :size="17" />管理报名计划</button></div></div>
    <section class="dashboard-welcome"><div class="welcome-copy"><div class="eyebrow">今日课后服务</div><h2>把今天的每一节课，安排好。</h2><p>课程安排、到课记录与费用进展，在这里一目了然。</p><div class="mt-5 flex flex-wrap gap-3"><button class="btn btn-primary" @click="showToday">查看今日安排<AppIcon name="arrow-right" :size="16" /></button><button class="btn btn-ghost" @click="router.push('/admin/schedule')">前往排课</button></div></div><div class="welcome-art" aria-hidden="true"><div class="art-ring" /><div class="art-calendar"><span class="art-calendar-line" /><AppIcon name="calendar" :size="68" /><div class="art-book"><AppIcon name="book" :size="34" /></div></div><span class="art-sun" /><span class="art-leaf"><AppIcon name="leaf" :size="25" /></span></div></section>
    <div v-if="error" class="card mb-5 p-6" role="alert"><p class="text-[14px] text-danger">{{ error }}</p><button class="btn btn-secondary mt-3" @click="load">重新加载</button></div>
    <template v-else>
      <div class="dashboard-metrics"><button v-for="metric in metrics" :key="metric.label" class="metric-card text-left transition-colors hover:border-[#c5d0f0]" @click="router.push(metric.to)"><div class="flex items-center justify-between gap-2"><span class="text-[12px] font-medium text-ink-2">{{ metric.label }}</span><span class="metric-icon" :class="`icon-tile-${metric.color}`"><AppIcon :name="metric.icon" :size="18" /></span></div><div class="mt-3 flex items-baseline gap-1.5"><span class="metric-value">{{ loading ? '—' : metric.value }}</span><span class="text-[11px] text-ink-3">{{ metric.unit }}</span></div><p class="mt-2 text-[11px] text-ink-3">{{ metric.hint }}</p></button></div>
      <div v-if="secondaryErrors.length" class="mb-5 flex flex-wrap items-center gap-3 text-[12px] text-ink-2" role="alert"><AppIcon name="info" :size="15" />{{ secondaryErrors.join('；') }}<button class="text-brand" :disabled="loading" @click="load">重试</button></div>
      <div class="dashboard-columns"><section id="today-sessions" class="card min-w-0 scroll-mt-5"><div class="section-heading"><div><h2 class="section-title">今天的课堂</h2><p class="section-subtitle">{{ data?.today }} · {{ sessions.length }} 节有效课次</p></div><button class="btn btn-ghost btn-sm" @click="router.push('/admin/attendance')">学生考勤<AppIcon name="chevron-right" :size="15" /></button></div><div v-if="loading" class="py-16 text-center text-[13px] text-ink-3" role="status">正在整理今日课堂…</div><div v-else-if="!sessions.length" class="dashboard-empty"><span class="icon-tile icon-tile-blue"><AppIcon name="calendar" :size="24" /></span><h3>今天暂时没有课次安排</h3><p>需要新增安排时，先选择课程，再生成课次。</p><button class="btn btn-secondary mt-4" @click="router.push('/admin/schedule')">去安排课次</button></div><div v-else class="overflow-x-auto"><table class="table-base min-w-[630px]"><thead><tr><th>课程 / 教学班</th><th>上课安排</th><th>学生点名</th><th></th></tr></thead><tbody><tr v-for="session in sessions" :key="session.id"><td><div class="flex items-center gap-3"><span class="icon-tile icon-tile-blue"><AppIcon name="book" :size="19" /></span><div><div class="font-semibold">{{ session.courseName }}</div><div class="mt-1 text-[11px] text-ink-3">{{ session.groupName }} · {{ session.teacherName || '教师待定' }}</div></div></div></td><td><div class="text-[13px] font-medium tabular-nums">{{ session.start_time }}–{{ session.end_time }}</div><div class="mt-1 text-[11px] text-ink-3">{{ session.room || '教室待定' }}</div></td><td><span class="badge" :class="session.enrolled === 0 ? 'badge-gray' : session.status === 'done' ? 'badge-green' : 'badge-orange'">{{ session.enrolled === 0 ? '暂无学生' : session.status === 'done' ? '已提交' : '待提交' }}</span><div v-if="session.enrolled > 0" class="mt-1.5 text-[11px] text-ink-3">记录 {{ session.marked }} 条 · 当前 {{ session.enrolled }} 人</div></td><td class="text-right"><button class="icon-button" :aria-label="`查看${session.courseName}考勤`" @click="router.push('/admin/attendance')"><AppIcon name="arrow-right" :size="17" /></button></td></tr></tbody></table></div><div class="dashboard-roster"><div class="text-[12px] font-medium text-ink-2">学校基础资料</div><div class="grid grid-cols-4 gap-2"><button v-for="stat in baseStats" :key="stat.key" class="roster-stat" @click="router.push(stat.to)"><strong>{{ loading ? '—' : data?.stats[stat.key] ?? '—' }}<small>{{ stat.unit }}</small></strong><span>{{ stat.label }}</span></button></div></div></section>
      <aside class="space-y-5"><section class="card"><div class="section-heading"><div><h2 class="section-title">待办与提醒</h2><p class="section-subtitle">关注需要跟进的服务进展</p></div><span class="reminder-dot" /></div><div class="px-5"><button class="task-link" @click="router.push('/admin/attendance')"><span class="icon-tile icon-tile-amber"><AppIcon name="users" :size="19" /></span><div class="min-w-0 flex-1"><div class="task-link-title text-[13px] font-semibold">学生点名</div><p class="mt-1 text-[11px] text-ink-3">{{ loading ? '正在读取今日课次' : pendingRoll > 0 ? `今日 ${pendingRoll} 节课尚未提交点名` : '今日有名单课次均已提交' }}</p></div><AppIcon name="chevron-right" :size="15" class="text-ink-3" /></button><button class="task-link" @click="router.push('/admin/teacher-attendance')"><span class="icon-tile icon-tile-mint"><AppIcon name="check-circle" :size="19" /></span><div class="min-w-0 flex-1"><div class="task-link-title text-[13px] font-semibold">教师考勤</div><p class="mt-1 text-[11px] text-ink-3">{{ !teacher ? '查看本人打卡与核实记录' : teacher.summary.abnormal ? `今日 ${teacher.summary.abnormal} 节异常待核实` : `今日已签到 ${teacher.summary.checkedIn} / ${teacher.summary.total} 课次` }}</p></div><AppIcon name="chevron-right" :size="15" class="text-ink-3" /></button><button class="task-link" @click="router.push('/admin/finance')"><span class="icon-tile icon-tile-rose"><AppIcon name="wallet" :size="19" /></span><div class="min-w-0 flex-1"><div class="task-link-title text-[13px] font-semibold">账单与收款</div><p class="mt-1 text-[11px] text-ink-3">{{ finance ? finance.unpaidCount ? `${finance.unpaidCount} 笔账单尚待缴清` : '当前账单均已缴清' : '查看账单及线下收款登记' }}</p></div><AppIcon name="chevron-right" :size="15" class="text-ink-3" /></button></div></section><section class="dashboard-note"><AppIcon name="leaf" :size="23" /><h3>课前有准备，课中有记录</h3><p>先核对时间、教室与授课老师；课后核对点名名单和异常考勤，让每项服务都有清晰记录。</p></section></aside></div>
      <section class="mt-7"><div class="mb-3 flex items-center justify-between"><h2 class="section-title">常用工作</h2><span class="text-[11px] text-ink-3">从课程准备到服务执行</span></div><div class="quick-links"><router-link v-for="item in quickLinks" :key="item.to" :to="item.to" class="card quick-link"><span class="icon-tile" :class="`icon-tile-${item.color}`"><AppIcon :name="item.icon" :size="21" /></span><div><div class="text-[13px] font-semibold">{{ item.title }}</div><p class="mt-1 text-[11px] text-ink-3">{{ item.hint }}</p></div><AppIcon name="chevron-right" :size="15" class="ml-auto text-ink-3" /></router-link></div></section>
    </template>
  </div>
</template>
<style scoped>
.dashboard-welcome{position:relative;display:flex;align-items:center;justify-content:space-between;gap:25px;min-height:205px;margin-bottom:24px;border:1px solid #dde5f7;border-radius:20px;padding:28px 34px;background:#edf2ff;overflow:hidden}.welcome-copy{position:relative;z-index:1}.welcome-copy h2{font-size:26px;font-weight:650;letter-spacing:-.6px}.welcome-copy>p{margin-top:10px;font-size:12px;color:#687da0}.welcome-art{position:relative;flex-shrink:0;width:220px;height:165px;margin-right:20px}.art-ring{position:absolute;inset:4px 12px;border:1px dashed #b7c8ef;border-radius:50%;transform:rotate(-25deg)}.art-calendar{position:absolute;left:39px;top:20px;display:flex;align-items:center;justify-content:center;width:125px;height:130px;border:1px solid #dce4f7;border-radius:18px;background:#ffffffe0;color:#4262cc;transform:rotate(-8deg);box-shadow:0 9px 20px #3156d30a}.art-book{position:absolute;right:-41px;bottom:-9px;display:flex;align-items:center;justify-content:center;width:69px;height:65px;border:4px solid #edf2ff;border-radius:16px;background:#c9e6d9;color:#498477;transform:rotate(20deg)}.art-sun{position:absolute;right:8px;top:2px;width:25px;height:25px;background:#f4dca5;border:6px solid #f4dca530;border-radius:50%}.art-leaf{position:absolute;left:0;bottom:0;color:#87aa97}.dashboard-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:17px;margin-bottom:24px}.metric-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px}.metric-value{font-size:28px;line-height:1.2;letter-spacing:-1px;font-weight:650;font-variant-numeric:tabular-nums}.dashboard-columns{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:22px}.dashboard-roster{padding:21px 22px 16px;border-top:1px solid var(--color-line);background:#fdfdff;border-radius:0 0 16px 16px}.roster-stat{padding:14px 4px 4px;text-align:left}.roster-stat strong{display:block;font-size:22px;font-weight:600}.roster-stat small{margin-left:4px;color:#98a3b5;font-size:10px;font-weight:400}.roster-stat span{font-size:11px;color:var(--color-ink-3)}.roster-stat:hover span{color:var(--color-brand)}.reminder-dot{width:6px;height:6px;border-radius:50%;background:#d9b775}.dashboard-note{border:1px solid #e1eae5;border-radius:16px;padding:23px;background:#eff5f1;color:#7c9e88}.dashboard-note h3{margin-top:12px;font-size:13px;font-weight:600;color:#486954}.dashboard-note p{margin-top:9px;font-size:11px;line-height:1.9;color:#6d8474}.quick-links{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.quick-link{display:flex;align-items:center;gap:12px;padding:20px 17px;color:var(--color-ink);text-decoration:none;transition:border-color .15s}.quick-link:hover{border-color:#c5d0f0}.dashboard-empty{display:flex;flex-direction:column;align-items:center;padding:40px 20px;text-align:center}.dashboard-empty h3{margin-top:14px;font-size:14px;font-weight:600}.dashboard-empty p{margin-top:7px;font-size:12px;color:var(--color-ink-3)}
@media(max-width:1250px){.dashboard-columns{grid-template-columns:minmax(0,1fr) 280px}.dashboard-metrics{gap:12px}.metric-card{padding:17px}.quick-links{grid-template-columns:repeat(2,minmax(0,1fr))}.welcome-art{margin-right:0}.welcome-copy h2{font-size:24px}}
@media(max-width:1050px){.dashboard-columns{grid-template-columns:1fr}.dashboard-columns>aside{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}.dashboard-columns>aside>*{margin:0}.dashboard-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.dashboard-welcome{padding:24px;min-height:180px}.welcome-art{display:none}.welcome-copy h2{font-size:22px}.dashboard-columns>aside{display:block}.dashboard-note{margin-top:18px!important}.metric-value{font-size:25px}.quick-links{gap:10px}.quick-link{padding:16px 12px;gap:9px}.quick-link>svg{display:none}.quick-link .icon-tile{width:33px;height:33px;border-radius:10px}.quick-link p{font-size:10px}.metric-card{padding:16px}.page-heading .btn{font-size:12px}}
</style>
