<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { state } from '../../lib/auth';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppDatePicker from '../../ui/AppDatePicker.vue';
import AppTimePicker from '../../ui/AppTimePicker.vue';
import AppIcon from '../../ui/AppIcon.vue';

const rows = ref<any[]>([]);
const courses = ref<any[]>([]);
const show = ref(false);
const form = ref({
  name: `${state.me?.school?.term || '本学期'}课后服务报名`,
  startDate: '2026-10-01',
  startTime: '00:00',
  endDate: '2027-01-31',
  endTime: '23:59',
  courseIds: [] as number[],
});
const router = useRouter();
const loading = ref(false);
const error = ref('');
const openCount = computed(() => rows.value.filter((r) => r.status === 'open').length);
const draftCount = computed(() => rows.value.filter((r) => r.status === 'draft').length);
const planTotal = (r: any, key: 'enrolled' | 'capacity') => (r.courses || []).reduce((sum: number, c: any) => sum + Number(c[key] || 0), 0);
const planProgress = (r: any) => planTotal(r, 'capacity') > 0 ? Math.min(100, Math.round(planTotal(r, 'enrolled') / planTotal(r, 'capacity') * 100)) : 0;

async function load() {
  loading.value = true;
  error.value = '';
  try { rows.value = await api.get('/api/admin/plans'); }
  catch (e: any) { error.value = e.message || '报名计划加载失败'; }
  finally { loading.value = false; }
}
onMounted(async () => {
  try { courses.value = await api.get('/api/admin/courses/options'); }
  catch (e: any) { toast('课程选项加载失败：' + e.message, 'error'); }
  await load();
});

function openNew() {
  form.value = {
    name: `${state.me?.school?.term || '本学期'}课后服务报名`,
    startDate: '2026-10-01',
    startTime: '00:00',
    endDate: '2027-01-31',
    endTime: '23:59',
    courseIds: courses.value.map((c) => c.id),
  };
  show.value = true;
}
function toggleCourse(id: number) {
  const i = form.value.courseIds.indexOf(id);
  if (i >= 0) form.value.courseIds.splice(i, 1);
  else form.value.courseIds.push(id);
}
async function save() {
  try {
    if (!form.value.name) return toast('名称必填', 'error');
    await api.post('/api/admin/plans', {
      name: form.value.name,
      term: state.me?.school?.term || '本学期',
      startAt: `${form.value.startDate} ${form.value.startTime}`,
      endAt: `${form.value.endDate} ${form.value.endTime}`,
      courseIds: form.value.courseIds,
    });
    toast('已创建，发布后家长才可报名', 'success');
    show.value = false;
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
async function publish(id: number) {
  try {
    await api.post(`/api/admin/plans/${id}/publish`);
    toast('已发布', 'success');
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
const statusMap: Record<string, { text: string; cls: string }> = {
  draft: { text: '草稿', cls: 'badge-gray' },
  open: { text: '进行中', cls: 'badge-green' },
  paused: { text: '已暂停', cls: 'badge-orange' },
  closed: { text: '已结束', cls: 'badge-gray' },
};
</script>

<template>
  <div>
    <div class="page-heading">
      <div><div class="eyebrow">报名安排</div><h1 class="page-title">报名计划</h1><p class="page-description">把课程与报名时间准备好，发布后家长即可为孩子选课。</p></div>
      <button class="btn btn-primary" @click="openNew"><AppIcon name="plus" :size="17" />新建报名计划</button>
    </div>
    <div class="mb-5 flex flex-wrap items-center gap-3 text-[13px] text-ink-2"><span class="filter-chip">全部 {{ loading || error ? '—' : rows.length }}</span><span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-ok" />已开放 {{ loading || error ? '—' : openCount }}</span><span class="text-ink-3">草稿 {{ loading || error ? '—' : draftCount }}</span></div>
    <div v-if="error" class="card mb-4 flex flex-wrap items-center justify-between gap-3 p-5 text-[13px]" role="alert"><span class="text-danger">{{ error }}</span><button class="btn btn-secondary btn-sm" @click="load">重新加载</button></div>
    <div class="space-y-3">
      <div v-for="r in rows" :key="r.id" class="card p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-3"><span class="icon-tile shrink-0" :class="r.status === 'open' ? 'icon-tile-mint' : 'icon-tile-blue'"><AppIcon name="calendar" :size="22" /></span><div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-[16px] font-medium">{{ r.name }}</span>
              <span class="badge" :class="statusMap[r.status]?.cls">{{ statusMap[r.status]?.text }}</span>
            </div>
            <div class="mt-1.5 text-[12px] leading-relaxed text-ink-3">{{ r.start_at }} 至 {{ r.end_at }} · {{ r.term }}</div>
          </div></div>
          <div class="flex shrink-0 gap-2">
            <button v-if="r.status === 'draft'" class="btn btn-primary btn-sm" @click="publish(r.id)">发布报名</button>
            <button class="btn btn-secondary btn-sm" @click="router.push(`/admin/plans/${r.id}`)">计划详情<AppIcon name="arrow-right" :size="14" /></button>
          </div>
        </div>
        <div class="mt-5 grid items-center gap-4 border-t border-line pt-4 sm:grid-cols-[1fr_220px]">
        <div class="flex flex-wrap gap-2">
          <span v-for="c in r.courses" :key="c.id" class="rounded-md bg-[#f5f6f8] px-2 py-1 text-[12px] text-ink-2">
            {{ c.courseName }} · {{ c.enrolled }}/{{ c.capacity }}
          </span>
        </div>
        <div><div class="mb-2 flex items-center justify-between text-[12px]"><span class="text-ink-3">已报 {{ planTotal(r, 'enrolled') }} / {{ planTotal(r, 'capacity') }} 人次</span><span class="font-medium text-brand">{{ planProgress(r) }}%</span></div><div class="h-1.5 overflow-hidden rounded-full bg-brand-soft"><div class="h-full rounded-full bg-brand" :style="{ width: planProgress(r) + '%' }" /></div></div>
        </div>
        <p class="mt-4 flex items-center gap-1.5 text-[12px] text-ink-3"><AppIcon name="info" :size="14" />{{ r.status === 'draft' ? '草稿暂不对家长展示，确认时间与课程后发布。' : r.status === 'open' ? '已开放计划，家长可在报名时间内选课；进入详情查看名单。' : r.status === 'paused' ? '当前已暂停，请核对计划状态与报名安排。' : '报名已结束，可进入详情查看报名记录。' }}</p>
      </div>
      <div v-if="!rows.length && !error" class="card py-14 text-center text-ink-3">{{ loading ? '正在加载报名计划…' : '还没有报名计划，先创建计划并关联课程' }}</div>
    </div>

    <Modal :show="show" title="新建报名计划" width="560px" @close="show = false">
      <div class="field"><label class="label">计划名称</label><input v-model="form.name" class="input" /></div>
      <div class="grid grid-cols-2 gap-3">
        <div class="field">
          <label class="label">开始日期</label>
          <AppDatePicker v-model="form.startDate" />
        </div>
        <div class="field">
          <label class="label">开始时间</label>
          <AppTimePicker v-model="form.startTime" :step="30" />
        </div>
        <div class="field">
          <label class="label">结束日期</label>
          <AppDatePicker v-model="form.endDate" />
        </div>
        <div class="field">
          <label class="label">结束时间</label>
          <AppTimePicker v-model="form.endTime" :step="30" />
        </div>
      </div>
      <div class="field">
        <label class="label">关联课程</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in courses"
            :key="c.id"
            class="rounded-lg border px-3 py-1.5 text-[13px]"
            :class="form.courseIds.includes(c.id) ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2'"
            @click="toggleCourse(c.id)"
          >
            {{ c.name }}
          </button>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-secondary btn-sm" @click="show = false">取消</button>
        <button class="btn btn-primary btn-sm" @click="save">创建</button>
      </template>
    </Modal>
  </div>
</template>

