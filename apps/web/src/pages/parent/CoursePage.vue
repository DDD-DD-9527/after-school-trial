<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { currentChild } from '../../lib/auth';
import { toast } from '../../lib/toast';

const route = useRoute();
const router = useRouter();
const course = ref<any>(null);
const enrolling = ref(false);

async function load() {
  try {
    course.value = await api.get(`/api/parent/courses/${route.params.id}`);
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
onMounted(load);

const yuan = (c: number) => (c === 0 ? '免费' : `¥${(c / 100).toFixed(2)}`);
const wd = ['', '一', '二', '三', '四', '五', '六', '日'];

const slots = computed(() => {
  const m = new Map<string, any>();
  for (const s of course.value?.sessions ?? []) {
    const k = `${s.weekday}-${s.start_time}`;
    if (!m.has(k)) m.set(k, s);
  }
  return [...m.values()];
});

async function enroll() {
  if (!currentChild.value) return toast('未绑定孩子', 'error');
  if (!course.value?.planCourseId) return toast('该课程暂未开放报名', 'error');
  enrolling.value = true;
  try {
    await api.post('/api/parent/enroll', { planCourseId: course.value.planCourseId, studentId: currentChild.value.id });
    toast('报名成功', 'success');
    setTimeout(() => router.replace('/parent/enrollments'), 600);
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    enrolling.value = false;
  }
}
</script>

<template>
  <div v-if="course">
    <div class="mb-3 flex items-center gap-2">
      <button class="btn btn-ghost btn-sm" @click="router.back()">← 返回</button>
      <div class="text-[16px] font-medium">{{ course.name }}</div>
    </div>

    <div class="card mb-3 p-4">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-[20px] font-semibold text-brand">{{ yuan(course.price_cents) }}</div>
          <div class="mt-1 text-[12px] text-ink-3">剩余名额 {{ course.remaining }}</div>
        </div>
        <span class="badge badge-blue">{{ course.term }}</span>
      </div>
      <p class="mt-3 text-[14px] text-ink-2">{{ course.description || '暂无课程简介' }}</p>
    </div>

    <div class="card mb-3">
      <div class="border-b border-line px-4 py-3 text-[15px] font-medium">上课安排</div>
      <div class="p-4">
        <div v-for="s in slots" :key="s.id" class="mb-2 flex justify-between text-[14px] last:mb-0">
          <span>每周{{ wd[s.weekday] }}</span>
          <span class="text-ink-2">{{ s.start_time }}–{{ s.end_time }} · {{ s.room || '教室待定' }}</span>
        </div>
        <div v-if="!slots.length" class="text-[13px] text-ink-3">课表待发布</div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="border-b border-line px-4 py-3 text-[15px] font-medium">教师与退课</div>
      <div class="space-y-2 p-4 text-[13px] text-ink-2">
        <div>授课教师：{{ course.teacherName || '待定' }}</div>
        <div>退课规则：{{ course.refund_note || '未设置' }}</div>
      </div>
    </div>

    <button class="btn btn-primary btn-block btn-lg" :disabled="enrolling || course.remaining === 0" @click="enroll">
      {{ course.remaining === 0 ? '名额已满' : enrolling ? '提交中…' : `确认报名 · ${yuan(course.price_cents)}` }}
    </button>
    <p class="mt-2 text-center text-[11px] text-ink-3">试用版不在此处收款，费用由学校线下收取</p>
  </div>
</template>
