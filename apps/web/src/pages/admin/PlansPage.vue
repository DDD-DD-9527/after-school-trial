<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppDatePicker from '../../ui/AppDatePicker.vue';
import AppTimePicker from '../../ui/AppTimePicker.vue';

const rows = ref<any[]>([]);
const courses = ref<any[]>([]);
const show = ref(false);
const form = ref({
  name: '2026 秋季课后服务报名',
  startDate: '2026-10-01',
  startTime: '00:00',
  endDate: '2027-01-31',
  endTime: '23:59',
  courseIds: [] as number[],
});
const router = useRouter();

async function load() {
  rows.value = await api.get('/api/admin/plans');
}
onMounted(async () => {
  courses.value = await api.get('/api/admin/courses/options');
  await load();
});

function openNew() {
  form.value = {
    name: '2026 秋季课后服务报名',
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
      term: '2026-秋',
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
    <div class="mb-4 flex items-center justify-between">
      <div class="text-[20px] font-semibold">报名计划</div>
      <button class="btn btn-primary btn-sm" @click="openNew">新建计划</button>
    </div>

    <div class="space-y-3">
      <div v-for="r in rows" :key="r.id" class="card card-pad">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-[16px] font-medium">{{ r.name }}</span>
              <span class="badge" :class="statusMap[r.status]?.cls">{{ statusMap[r.status]?.text }}</span>
            </div>
            <div class="mt-1 text-[13px] text-ink-3">{{ r.start_at }} 至 {{ r.end_at }} · {{ r.term }}</div>
          </div>
          <div class="flex gap-2">
            <button v-if="r.status === 'draft'" class="btn btn-primary btn-sm" @click="publish(r.id)">发布</button>
            <button class="btn btn-secondary btn-sm" @click="router.push(`/admin/plans/${r.id}`)">查看名单</button>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <span v-for="c in r.courses" :key="c.id" class="rounded-md bg-[#f5f6f8] px-2 py-1 text-[12px] text-ink-2">
            {{ c.courseName }} · {{ c.enrolled }}/{{ c.capacity }}
          </span>
        </div>
      </div>
      <div v-if="!rows.length" class="card py-14 text-center text-ink-3">还没有报名计划</div>
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

