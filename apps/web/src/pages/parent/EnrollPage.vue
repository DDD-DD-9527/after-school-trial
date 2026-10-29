<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { currentChild } from '../../lib/auth';
import AppIcon from '../../ui/AppIcon.vue';
import CourseCover from './CourseCover.vue';
import ParentEmpty from './ParentEmpty.vue';

const router = useRouter();
const plans = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const search = ref('');
const filter = ref('all');
const selectedPlan = ref<number | null>(null);
const now = ref(Date.now());
const clock = setInterval(() => { now.value = Date.now(); }, 30000);
let requestId = 0;
onBeforeUnmount(() => { requestId++; clearInterval(clock); });
async function load() {
  const request = ++requestId;
  const childId = currentChild.value?.id;
  plans.value = []; error.value = ''; selectedPlan.value = null; loading.value = !!childId;
  if (!childId) return;
  try {
    const result = await api.get<any[]>(`/api/parent/plans?studentId=${childId}`);
    if (request === requestId && currentChild.value?.id === childId) plans.value = result;
  } catch (err: any) { if (request === requestId) error.value = err.message || '课程暂时无法加载'; }
  finally { if (request === requestId) loading.value = false; }
}
watch(() => currentChild.value?.id, load, { immediate: true });
const courses = computed(() => plans.value.flatMap((plan) => plan.courses.map((course: any) => ({ ...course, planId: plan.id, planName: plan.name, term: plan.term, startAt: plan.start_at, endAt: plan.end_at }))));
function windowState(course: any) {
  const parse = (value: string) => Date.parse(`${value.replace(' ', 'T')}${/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? '' : '+08:00'}`);
  if (now.value < parse(course.startAt)) return '尚未开始';
  if (now.value > parse(course.endAt)) return '报名已结束';
  return '';
}
const available = (course: any) => !['effective', 'withdrawn'].includes(course.mine) && course.remaining > 0 && !windowState(course);
const filtered = computed(() => courses.value.filter((course: any) => {
  const query = search.value.trim().toLocaleLowerCase();
  return (!selectedPlan.value || course.planId === selectedPlan.value)
    && (!query || `${course.name} ${course.teacherName || ''} ${course.description || ''}`.toLocaleLowerCase().includes(query))
    && (filter.value === 'all' || (filter.value === 'available' ? available(course) : course.mine === 'effective'));
}));
const groups = computed(() => plans.value.map((plan) => ({ ...plan, courses: filtered.value.filter((course: any) => course.planId === plan.id) })).filter((plan) => plan.courses.length));
const yuan = (cents: number) => cents === 0 ? '免费' : `¥${(cents / 100).toFixed(2)}`;
function resetFilters() { search.value = ''; filter.value = 'all'; selectedPlan.value = null; }
function openCourse(course: any) { router.push({ path: `/parent/course/${course.courseId}`, query: { planCourseId: course.planCourseId } }); }
</script>

<template>
  <div class="space-y-5">
    <div><p class="eyebrow">发现热爱，慢慢成长</p><h1 class="page-title mt-1">选一门喜欢的课</h1><p class="page-description mt-2">{{ currentChild ? `为 ${currentChild.name} 挑选 · 报名前记得确认上课安排` : '学校开放的课后课程，都在这里' }}</p></div>
    <ParentEmpty v-if="!currentChild" icon="users" title="还没有关联孩子" description="请联系学校核实学生与监护人信息，关联后即可查看孩子可报名的课程。" />
    <template v-else>
      <div class="space-y-3">
        <label class="search-field"><AppIcon name="search" :size="20" class="shrink-0 text-ink-3" /><input v-model="search" aria-label="搜索课程或教师" placeholder="搜索感兴趣的课程或教师" /><button v-if="search" class="text-[12px] text-ink-2" @click="search = ''">清空</button></label>
        <div class="flex flex-wrap gap-2" role="group" aria-label="报名状态筛选"><button v-for="item in [{ value: 'all', label: '全部课程' }, { value: 'available', label: '可报名' }, { value: 'mine', label: '已报名' }]" :key="item.value" class="filter-chip" :class="{ 'filter-chip-active': filter === item.value }" :aria-pressed="filter === item.value" @click="filter = item.value">{{ item.label }}</button></div>
        <div v-if="plans.length > 1" class="plan-filter" role="group" aria-label="报名计划筛选"><button :class="{ active: selectedPlan === null }" @click="selectedPlan = null">所有计划</button><button v-for="plan in plans" :key="plan.id" :class="{ active: selectedPlan === plan.id }" @click="selectedPlan = plan.id">{{ plan.name }}</button></div>
      </div>
      <div v-if="loading" class="card p-7 text-center text-[14px] text-ink-2" role="status">正在查找学校开放的课程…</div>
      <div v-else-if="error" class="card p-5" role="alert"><p class="text-[14px] text-ink-2">{{ error }}</p><button class="btn btn-secondary btn-sm mt-3" @click="load">重新加载</button></div>
      <ParentEmpty v-else-if="!courses.length" title="课程还在准备中" description="当前没有开放的报名课程，学校发布报名计划后会在这里展示。" />
      <ParentEmpty v-else-if="!filtered.length" icon="search" title="暂时没有符合条件的课程" description="试试其他关键词，或查看全部课程。"><button class="btn btn-secondary" @click="resetFilters">查看全部课程</button></ParentEmpty>
      <template v-else>
        <section v-for="group in groups" :key="group.id">
          <div class="mb-3 flex items-end justify-between gap-3"><div><h2 class="text-[16px] font-semibold">{{ group.name }}</h2><p class="mt-1 text-[12px] text-ink-3">{{ group.term }} · {{ group.courses.length }} 门课程</p></div><AppIcon name="grid" :size="19" class="text-ink-3" /></div>
          <div class="course-grid">
            <button v-for="course in group.courses" :key="course.planCourseId" class="card course-card" @click="openCourse(course)">
              <div class="flex gap-4"><CourseCover :name="course.name" /><div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-2"><h3 class="text-[17px] font-semibold leading-6">{{ course.name }}</h3><AppIcon name="chevron-right" :size="17" class="mt-1 shrink-0 text-ink-3" /></div><p class="mt-2 text-[12px] leading-5 text-ink-2">{{ course.teacherName || '教师待定' }} · {{ course.grade || '不限年级' }}</p><p class="mt-1 line-clamp-2 text-[12px] leading-5 text-ink-3">{{ course.description || '点击了解课程与上课安排' }}</p></div></div>
              <div class="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3"><div><span class="text-[18px] font-semibold text-brand">{{ yuan(course.price_cents) }}</span><span v-if="course.price_cents > 0" class="ml-1 text-[11px] text-ink-3">/ 课程</span></div><span v-if="course.mine === 'effective'" class="badge badge-green"><AppIcon name="check" :size="13" class="mr-1" />已报名</span><span v-else-if="course.mine === 'withdrawn'" class="badge badge-gray">已退课</span><span v-else-if="windowState(course)" class="badge badge-gray">{{ windowState(course) }}</span><span v-else-if="course.remaining <= 0" class="badge badge-gray">名额已满</span><span v-else class="text-[12px] text-[#157f74]">余 {{ course.remaining }} 个名额</span></div>
            </button>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.search-field { display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 14px; border: 1px solid #e1e5ee; border-radius: 12px; background: #fff; }
.search-field:focus-within { border-color: #3156d3; box-shadow: 0 0 0 3px #3156d310; }
.search-field input { width: 100%; min-width: 0; background: transparent; outline: none; font-size: 14px; }
.plan-filter { display: flex; gap: 16px; overflow-x: auto; padding: 1px 0 4px; }
.plan-filter button { flex: none; color: #8792a4; font-size: 12px; }
.plan-filter .active { color: #3156d3; font-weight: 600; }
.course-grid { display: grid; gap: 12px; }
.course-card { padding: 17px; text-align: left; transition: border-color .15s, box-shadow .15s; }
.course-card:hover { border-color: #bdc9ed; box-shadow: 0 5px 16px #26366106; }
@media (min-width: 700px) { .course-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
