<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import AppSelect from '../../ui/AppSelect.vue';
import AppDatePicker from '../../ui/AppDatePicker.vue';
import AppTimePicker from '../../ui/AppTimePicker.vue';

const route = useRoute();
const courses = ref<any[]>([]);
const form = ref({
  courseId: null as number | null,
  weekdays: [3] as number[],
  startDate: '2026-11-02',
  endDate: '2027-01-22',
  startTime: '16:00',
  endTime: '17:30',
  room: '',
});
const preview = ref<{ dates: string[]; count: number; conflicts: any[]; ok: boolean } | null>(null);
const loading = ref(false);

const weeks = [
  { v: 1, l: '一' },
  { v: 2, l: '二' },
  { v: 3, l: '三' },
  { v: 4, l: '四' },
  { v: 5, l: '五' },
];

const courseOptions = computed(() => courses.value.map((c) => ({ value: c.id, label: c.name })));

onMounted(async () => {
  courses.value = await api.get('/api/admin/courses/options');
  const q = Number(route.query.courseId);
  form.value.courseId = q || courses.value[0]?.id || null;
});

function toggleDay(v: number) {
  const i = form.value.weekdays.indexOf(v);
  if (i >= 0) form.value.weekdays.splice(i, 1);
  else form.value.weekdays.push(v);
  preview.value = null;
}

async function doPreview() {
  if (!form.value.courseId) return toast('请选择课程', 'error');
  if (!form.value.weekdays.length) return toast('请选择星期', 'error');
  loading.value = true;
  try {
    preview.value = await api.post('/api/admin/schedule/preview', form.value);
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function doGenerate() {
  loading.value = true;
  try {
    const r = await api.post<{ created: number; total: number }>('/api/admin/schedule/generate', form.value);
    toast(`已生成 ${r.created} 节课次`, 'success');
    preview.value = null;
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="mb-4 text-[20px] font-semibold">排课</div>

    <div class="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div class="card card-pad">
        <div class="field">
          <label class="label">课程</label>
          <AppSelect v-model="form.courseId" :options="courseOptions" placeholder="请选择课程" />
        </div>

        <div class="field">
          <label class="label">星期</label>
          <div class="flex gap-2">
            <button
              v-for="w in weeks"
              :key="w.v"
              class="h-9 w-9 rounded-lg border text-[14px] transition-colors"
              :class="form.weekdays.includes(w.v) ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-ink-2 hover:border-ink-3'"
              @click="toggleDay(w.v)"
            >
              {{ w.l }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="field">
            <label class="label">开始日期</label>
            <AppDatePicker v-model="form.startDate" @update:model-value="preview = null" />
          </div>
          <div class="field">
            <label class="label">结束日期</label>
            <AppDatePicker v-model="form.endDate" @update:model-value="preview = null" />
          </div>
          <div class="field">
            <label class="label">开始时间</label>
            <AppTimePicker v-model="form.startTime" :step="15" @update:model-value="preview = null" />
          </div>
          <div class="field">
            <label class="label">结束时间</label>
            <AppTimePicker v-model="form.endTime" :step="15" @update:model-value="preview = null" />
          </div>
        </div>

        <div class="field">
          <label class="label">教室</label>
          <input v-model="form.room" class="input" placeholder="如 综合楼 302" />
        </div>

        <button class="btn btn-primary btn-block" :disabled="loading" @click="doPreview">预览课次</button>
      </div>

      <div class="card">
        <div class="flex items-center justify-between border-b border-line px-4 py-3">
          <div class="text-[15px] font-medium">预览</div>
          <div v-if="preview" class="text-[13px] text-ink-3">共 {{ preview.count }} 节</div>
        </div>
        <div class="p-4">
          <template v-if="preview">
            <div v-if="preview.conflicts.length" class="mb-3 rounded-lg bg-[#fdecea] p-3">
              <div class="mb-1 text-[13px] font-medium text-danger">发现 {{ preview.conflicts.length }} 处冲突</div>
              <div v-for="(c, i) in preview.conflicts.slice(0, 8)" :key="i" class="text-[12px] text-danger">
                {{ c.date }} · {{ c.message }}
              </div>
            </div>
            <div v-else class="mb-3 rounded-lg bg-[#e8f8ef] p-3 text-[13px] text-ok">无冲突，可以生成</div>

            <div class="mb-3 flex flex-wrap gap-1.5">
              <span v-for="d in preview.dates.slice(0, 40)" :key="d" class="rounded bg-[#f2f3f5] px-2 py-1 text-[12px] text-ink-2">{{ d }}</span>
              <span v-if="preview.dates.length > 40" class="px-2 py-1 text-[12px] text-ink-3">…共 {{ preview.dates.length }} 天</span>
            </div>

            <button class="btn btn-primary" :disabled="!preview.ok || loading" @click="doGenerate">确认生成 {{ preview.count }} 节课次</button>
          </template>
          <div v-else class="py-14 text-center text-[13px] text-ink-3">左侧填写排课信息后点「预览课次」</div>
        </div>
      </div>
    </div>
  </div>
</template>

