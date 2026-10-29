<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { currentChild } from '../../lib/auth';
import { toast } from '../../lib/toast';

const router = useRouter();
const plans = ref<any[]>([]);
const loading = ref(true);

async function load() {
  const id = currentChild.value?.id;
  loading.value = true;
  try {
    plans.value = await api.get<any[]>(`/api/parent/plans${id ? `?studentId=${id}` : ''}`);
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(currentChild, load);

const courses = computed(() => plans.value.flatMap((p) => p.courses.map((c: any) => ({ ...c, planId: p.id }))));
const yuan = (c: number) => (c === 0 ? '免费' : `¥${(c / 100).toFixed(2)}`);
</script>

<template>
  <div>
    <div class="mb-3 text-[18px] font-semibold">选课报名</div>
    <div class="mb-3 rounded-lg bg-white p-3 text-[12px] text-ink-3">
      当前孩子：<span class="text-ink">{{ currentChild?.name }}</span> · 报名前请确认课程时间不冲突
    </div>

    <div class="space-y-3">
      <div v-for="c in courses" :key="c.planCourseId" class="card p-4" @click="router.push(`/parent/course/${c.courseId}`)">
        <div class="flex items-start justify-between">
          <div>
            <div class="text-[16px] font-medium">{{ c.name }}</div>
            <div class="mt-1 text-[12px] text-ink-2">{{ c.teacherName || '教师待定' }} · {{ c.grade || '不限年级' }}</div>
          </div>
          <div class="text-right">
            <div class="text-[16px] font-semibold text-brand">{{ yuan(c.price_cents) }}</div>
            <div class="mt-0.5 text-[12px] text-ink-3">剩余 {{ c.remaining }}</div>
          </div>
        </div>
        <div class="mt-2 line-clamp-2 text-[13px] text-ink-2">{{ c.description || '暂无简介' }}</div>
        <div class="mt-3 flex items-center justify-between">
          <span v-if="c.remaining === 0" class="badge badge-red">已满</span>
          <span v-else-if="c.mine === 'effective'" class="badge badge-green">已报名</span>
          <span v-else class="badge badge-blue">可报名</span>
          <span class="text-[13px] text-brand">查看详情 →</span>
        </div>
      </div>

      <div v-if="!loading && !courses.length" class="card py-14 text-center text-[13px] text-ink-3">
        当前没有进行中的报名
      </div>
    </div>
  </div>
</template>
