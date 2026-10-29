<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ page: number; size: number; total: number; sizes?: number[] }>();
const emit = defineEmits<{ (e: 'update:page', v: number): void; (e: 'update:size', v: number): void }>();

const sizes = computed(() => props.sizes ?? [20, 50, 100]);
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.size)));
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.size + 1));
const to = computed(() => Math.min(props.total, props.page * props.size));

const items = computed(() => {
  const total = pages.value;
  const cur = props.page;
  const out: Array<number | '...'> = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) out.push(i);
    return out;
  }
  out.push(1);
  if (cur > 3) out.push('...');
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) out.push(i);
  if (cur < total - 2) out.push('...');
  out.push(total);
  return out;
});

function go(p: number) {
  if (p < 1 || p > pages.value || p === props.page) return;
  emit('update:page', p);
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <div class="text-[13px] text-ink-3">共 {{ total }} 条 · 当前 {{ from }}–{{ to }}</div>
    <div class="flex items-center gap-1.5">
      <select
        class="h-8 rounded-md border border-line bg-white px-2 text-[13px] text-ink-2"
        :value="size"
        @change="emit('update:size', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="s in sizes" :key="s" :value="s">{{ s }} 条/页</option>
      </select>
      <button class="h-8 min-w-8 rounded-md border border-line px-2 text-[13px] text-ink-2 disabled:opacity-40" :disabled="page <= 1" @click="go(page - 1)">
        ‹
      </button>
      <template v-for="(p, i) in items" :key="i">
        <span v-if="p === '...'" class="px-1 text-ink-3">…</span>
        <button
          v-else
          class="h-8 min-w-8 rounded-md border px-2 text-[13px]"
          :class="p === page ? 'border-brand bg-brand text-white' : 'border-line text-ink-2 hover:bg-[#f5f6f8]'"
          @click="go(p as number)"
        >
          {{ p }}
        </button>
      </template>
      <button class="h-8 min-w-8 rounded-md border border-line px-2 text-[13px] text-ink-2 disabled:opacity-40" :disabled="page >= pages" @click="go(page + 1)">
        ›
      </button>
    </div>
  </div>
</template>
