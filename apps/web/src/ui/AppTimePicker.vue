<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean; step?: number }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const options = computed(() => {
  const step = props.step || 15;
  const out: string[] = [];
  for (let m = 7 * 60; m <= 21 * 60; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
});

function pick(v: string) {
  emit('update:modelValue', v);
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

watch(open, async (v) => {
  if (!v) return;
  await nextTick();
  const el = listEl.value?.querySelector('[data-active="true"]') as HTMLElement | null;
  el?.scrollIntoView({ block: 'center' });
});
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
      <span :class="modelValue ? '' : 'text-ink-3'">{{ modelValue || placeholder || '选择时间' }}</span>
      <svg class="h-4 w-4 shrink-0 text-ink-3" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.2" />
        <path d="M8 5.2V8l2 1.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>

    <div
      v-if="open"
      ref="listEl"
      class="absolute left-0 z-40 mt-1 max-h-56 w-full min-w-[120px] overflow-auto rounded-lg border border-line bg-white py-1"
      style="box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12)"
    >
      <button
        v-for="t in options"
        :key="t"
        type="button"
        :data-active="t === modelValue"
        class="block w-full px-3 py-1.5 text-left text-[13px] transition-colors"
        :class="t === modelValue ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-[#f5f6f8]'"
        @click="pick(t)"
      >
        {{ t }}
      </button>
    </div>
  </div>
</template>
