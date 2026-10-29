<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const year = ref(new Date().getFullYear());
const month = ref(new Date().getMonth());

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function parse(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

watch(
  () => props.modelValue,
  (v) => {
    const d = parse(v) ?? new Date();
    year.value = d.getFullYear();
    month.value = d.getMonth();
  },
  { immediate: true }
);

const cells = computed(() => {
  const first = new Date(year.value, month.value, 1);
  const startIdx = (first.getDay() + 6) % 7; // 周一为 0
  const days = new Date(year.value, month.value + 1, 0).getDate();
  const list: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < startIdx; i++) list.push(null);
  for (let d = 1; d <= days; d++) list.push({ day: d, date: `${year.value}-${pad(month.value + 1)}-${pad(d)}` });
  return list;
});

const monthLabel = computed(() => `${year.value} 年 ${month.value + 1} 月`);
const todayStr = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
});

function shift(n: number) {
  const d = new Date(year.value, month.value + n, 1);
  year.value = d.getFullYear();
  month.value = d.getMonth();
}
function pick(date: string) {
  emit('update:modelValue', date);
  open.value = false;
}
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !open.value) return;
  event.preventDefault();
  event.stopPropagation();
  open.value = false;
  root.value?.querySelector<HTMLButtonElement>('button')?.focus();
}
function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div ref="root" class="relative" @keydown="onKeydown">
    <button
      type="button"
      class="select flex items-center justify-between gap-2 text-left"
      :class="{ 'opacity-50': disabled }"
      :disabled="disabled" :aria-expanded="open"
      @click="open = !open"
    >
      <span :class="modelValue ? '' : 'text-ink-3'">{{ modelValue || placeholder || '选择日期' }}</span>
      <svg class="h-4 w-4 shrink-0 text-ink-3" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="currentColor" stroke-width="1.2" />
        <path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute left-0 z-40 mt-1 w-[272px] rounded-xl border border-line bg-white p-3"
      style="box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12)"
    >
      <div class="mb-2 flex items-center justify-between">
        <button type="button" class="h-7 w-7 rounded-md text-ink-2 hover:bg-[#f5f6f8]" @click="shift(-1)">‹</button>
        <div class="text-[13px] font-medium">{{ monthLabel }}</div>
        <button type="button" class="h-7 w-7 rounded-md text-ink-2 hover:bg-[#f5f6f8]" @click="shift(1)">›</button>
      </div>

      <div class="mb-1 grid grid-cols-7 text-center text-[11px] text-ink-3">
        <div v-for="w in WEEK" :key="w" class="py-1">{{ w }}</div>
      </div>
      <div class="grid grid-cols-7 gap-y-0.5">
        <div v-for="(c, i) in cells" :key="i">
          <button
            v-if="c"
            type="button"
            class="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-[13px] transition-colors"
            :class="
              c.date === modelValue
                ? 'bg-brand font-medium text-white'
                : c.date === todayStr
                  ? 'text-brand hover:bg-brand-soft'
                  : 'text-ink hover:bg-[#f5f6f8]'
            "
            @click="pick(c.date)"
          >
            {{ c.day }}
          </button>
        </div>
      </div>

      <div class="mt-2 flex justify-between border-t border-line pt-2">
        <button type="button" class="text-[12px] text-ink-2 hover:text-brand" @click="pick(todayStr)">今天</button>
        <button type="button" class="text-[12px] text-ink-2 hover:text-brand" @click="open = false">关闭</button>
      </div>
    </div>
  </div>
</template>
