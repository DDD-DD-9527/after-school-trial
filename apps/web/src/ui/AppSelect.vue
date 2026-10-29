<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  modelValue: string | number | null;
  options: Array<{ value: string | number | null; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string | number | null): void }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const current = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue);
  return hit?.label ?? props.placeholder ?? '请选择';
});
const isEmpty = computed(() => props.modelValue === null || props.modelValue === undefined || props.modelValue === '');

function pick(v: string | number | null) {
  emit('update:modelValue', v);
  open.value = false;
}
function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="select flex items-center justify-between gap-2 text-left"
      :class="{ 'opacity-50': disabled }"
      :disabled="disabled"
      @click="open = !open"
    >
      <span class="truncate" :class="isEmpty ? 'text-ink-3' : ''">{{ current }}</span>
      <svg class="h-3 w-3 shrink-0 text-ink-3 transition-transform" :class="{ 'rotate-180': open }" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-auto rounded-lg border border-line bg-white py-1"
      style="box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1)"
    >
      <button
        v-for="o in options"
        :key="String(o.value)"
        type="button"
        class="block w-full px-3 py-2 text-left text-[14px] transition-colors"
        :class="o.value === modelValue ? 'bg-brand-soft font-medium text-brand' : 'text-ink hover:bg-[#f5f6f8]'"
        @click="pick(o.value)"
      >
        {{ o.label }}
      </button>
      <div v-if="!options.length" class="px-3 py-2 text-[13px] text-ink-3">无可选内容</div>
    </div>
  </div>
</template>
