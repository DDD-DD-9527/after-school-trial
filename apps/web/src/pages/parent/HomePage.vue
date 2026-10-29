<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { currentChild, state } from '../../lib/auth';
import { toast } from '../../lib/toast';

const router = useRouter();
const schedule = ref<any[]>([]);
const enrollments = ref<any[]>([]);
const bills = ref<any[]>([]);
const loading = ref(false);

const unpaid = computed(() => bills.value.filter((b) => b.status !== 'paid' && b.status !== 'void'));
const unpaidAmount = computed(() => unpaid.value.reduce((a, b) => a + (b.amount_cents - b.paid_cents), 0));

const todaySessions = computed(() => {
  const today = new Date().toISOString().slice(0, 10);
  return schedule.value.filter((s) => s.date === today);
});
const upcoming = computed(() => schedule.value.filter((s) => s.date >= new Date().toISOString().slice(0, 10)).slice(0, 3));

async function load() {
  const id = currentChild.value?.id;
  if (!id) return;
  loading.value = true;
  try {
    const [s, e, b] = await Promise.all([
      api.get<any[]>(`/api/parent/schedule?studentId=${id}`),
      api.get<any[]>(`/api/parent/enrollments?studentId=${id}`),
      api.get<any[]>(`/api/parent/bills?studentId=${id}`),
    ]);
    schedule.value = s;
    enrollments.value = e;
    bills.value = b;
  } catch (err: any) {
    toast(err.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(currentChild, load);

const yuan = (c: number) => (c === 0 ? '免费' : `¥${(c / 100).toFixed(2)}`);
</script>

<template>
  <div>
    <div class="mb-3 rounded-xl bg-gradient-to-br from-brand to-[#4f83ff] p-4 text-white">
      <div class="text-[13px] opacity-80">当前孩子</div>
      <div class="mt-1 text-[18px] font-medium">{{ currentChild?.name || '未绑定孩子' }}</div>
      <div class="mt-1 text-[12px] opacity-70">阳光小学 · 2026 秋季学期</div>
    </div>

    <div class="mb-3 grid grid-cols-2 gap-3">
      <button class="card p-3 text-left" @click="router.push('/parent/enroll')">
        <div class="text-[13px] text-ink-2">选课报名</div>
        <div class="mt-1 text-[15px] font-medium text-brand">去报名 →</div>
      </button>
      <button class="card p-3 text-left" @click="router.push('/parent/schedule')">
        <div class="text-[13px] text-ink-2">我的课表</div>
        <div class="mt-1 text-[15px] font-medium text-brand">查看安排 →</div>
      </button>
    </div>

    <button
      v-if="unpaid.length"
      class="card mb-3 flex w-full items-center justify-between p-3 text-left"
      @click="router.push('/parent/enrollments')"
    >
      <div>
        <div class="text-[13px] text-ink-2">待缴费</div>
        <div class="mt-0.5 text-[15px] font-medium text-danger">¥{{ (unpaidAmount / 100).toFixed(2) }}</div>
      </div>
      <span class="text-[13px] text-ink-3">共 {{ unpaid.length }} 笔 · 线下缴纳</span>
    </button>

    <div class="card mb-3">
      <div class="border-b border-line px-4 py-3 text-[15px] font-medium">今日课程</div>
      <div class="p-4">
        <div v-for="s in todaySessions" :key="s.id" class="mb-3 last:mb-0">
          <div class="text-[14px] font-medium">{{ s.courseName }}</div>
          <div class="mt-0.5 text-[12px] text-ink-2">{{ s.start_time }}–{{ s.end_time }} · {{ s.room || '教室待定' }} · {{ s.teacherName || '' }}</div>
        </div>
        <div v-if="!todaySessions.length" class="py-6 text-center text-[13px] text-ink-3">今天没有课</div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="flex items-center justify-between border-b border-line px-4 py-3">
        <div class="text-[15px] font-medium">我的报名</div>
        <button class="text-[13px] text-brand" @click="router.push('/parent/enrollments')">全部</button>
      </div>
      <div class="p-4">
        <div v-for="e in enrollments.slice(0, 2)" :key="e.id" class="mb-3 flex items-center justify-between last:mb-0">
          <div>
            <div class="text-[14px]">{{ e.courseName }}</div>
            <div class="text-[12px] text-ink-3">{{ yuan(e.price_cents) }}</div>
          </div>
          <span class="badge" :class="e.status === 'effective' ? 'badge-green' : 'badge-gray'">
            {{ e.status === 'effective' ? '已报名' : '已退出' }}
          </span>
        </div>
        <div v-if="!enrollments.length" class="py-6 text-center text-[13px] text-ink-3">还没有报名</div>
      </div>
    </div>

    <div class="card">
      <div class="border-b border-line px-4 py-3 text-[15px] font-medium">接下来</div>
      <div class="p-4">
        <div v-for="s in upcoming" :key="s.id" class="mb-2 flex justify-between text-[13px] last:mb-0">
          <span>{{ s.date }} · {{ s.courseName }}</span>
          <span class="text-ink-3">{{ s.start_time }}</span>
        </div>
        <div v-if="!upcoming.length" class="py-4 text-center text-[13px] text-ink-3">暂无安排</div>
      </div>
    </div>
  </div>
</template>
