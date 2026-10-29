<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';

const route = useRoute();
const router = useRouter();
const data = ref<{ session: any; roster: any[] } | null>(null);
const marks = ref<Record<number, string>>({});
const saving = ref(false);

const STATUS = [
  { v: 'present', l: '正常', cls: 'badge-green' },
  { v: 'late', l: '迟到', cls: 'badge-orange' },
  { v: 'absent', l: '缺勤', cls: 'badge-red' },
  { v: 'leave', l: '请假', cls: 'badge-blue' },
  { v: 'early', l: '早退', cls: 'badge-gray' },
];

async function load() {
  data.value = await api.get(`/api/teacher/sessions/${route.params.id}`);
  const m: Record<number, string> = {};
  for (const r of data.value!.roster) {
    m[r.id] = r.attendance || (r.leaveStatus === 'approved' ? 'leave' : '');
  }
  marks.value = m;
}
onMounted(load);

const counts = computed(() => {
  const c = { done: 0, total: data.value?.roster.length ?? 0 };
  for (const v of Object.values(marks.value)) if (v) c.done++;
  return c;
});

function setAll(status: string) {
  const m = { ...marks.value };
  for (const r of data.value!.roster) m[r.id] = status;
  marks.value = m;
}

async function submit() {
  const items = Object.entries(marks.value)
    .filter(([, v]) => v)
    .map(([k, v]) => ({ studentId: Number(k), status: v }));
  if (!items.length) return toast('还没有标记任何学生', 'error');
  saving.value = true;
  try {
    await api.post(`/api/teacher/sessions/${route.params.id}/attendance`, { items });
    toast(`已提交 ${items.length} 人`, 'success');
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="data">
    <div class="mb-3 flex items-center gap-2">
      <button class="btn btn-ghost btn-sm" @click="router.back()">← 返回</button>
      <div class="text-[16px] font-medium">{{ data.session.courseName }}</div>
    </div>
    <div class="mb-3 text-[12px] text-ink-3">
      {{ data.session.date }} {{ data.session.start_time }}–{{ data.session.end_time }} · {{ data.session.room || '未安排教室' }}
    </div>

    <div class="card mb-3 flex items-center justify-between p-3">
      <div class="text-[13px] text-ink-2">已标记 {{ counts.done }} / {{ counts.total }}</div>
      <div class="flex gap-1.5">
        <button class="btn btn-secondary btn-sm" @click="setAll('present')">全到</button>
        <button class="btn btn-secondary btn-sm" @click="setAll('')">清空</button>
      </div>
    </div>

    <div class="space-y-2">
      <div v-for="r in data.roster" :key="r.id" class="card p-3">
        <div class="mb-2 flex items-center justify-between">
          <div>
            <span class="text-[15px]">{{ r.name }}</span>
            <span class="ml-2 text-[12px] text-ink-3">{{ r.className }} · {{ r.code }}</span>
            <span v-if="r.leaveStatus === 'approved'" class="ml-2 badge badge-blue">家长已请假</span>
          </div>
          <span v-if="marks[r.id]" class="badge" :class="STATUS.find((s) => s.v === marks[r.id])?.cls">
            {{ STATUS.find((s) => s.v === marks[r.id])?.l }}
          </span>
        </div>
        <div class="flex gap-1.5">
          <button
            v-for="s in STATUS"
            :key="s.v"
            class="flex-1 rounded-md border py-1.5 text-[12px]"
            :class="marks[r.id] === s.v ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2'"
            @click="marks[r.id] = s.v"
          >
            {{ s.l }}
          </button>
        </div>
      </div>
      <div v-if="!data.roster.length" class="card py-14 text-center text-[13px] text-ink-3">这门课还没有学生报名</div>
    </div>

    <div class="sticky bottom-0 -mx-4 mt-3 border-t border-line bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <button class="btn btn-primary btn-block btn-lg" :disabled="saving" @click="submit">
        {{ saving ? '提交中…' : `提交点名（${counts.done} 人）` }}
      </button>
    </div>
  </div>
</template>
