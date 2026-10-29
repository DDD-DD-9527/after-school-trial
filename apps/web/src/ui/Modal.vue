<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ show: boolean; title?: string; width?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const titleId = useId();
const dialog = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
watch(() => props.show, async (show) => {
  if (show) {
    previousFocus = document.activeElement as HTMLElement | null;
    await nextTick();
    if (props.show) dialog.value?.focus();
  } else if (previousFocus?.isConnected) previousFocus.focus();
}, { immediate: true });
onBeforeUnmount(() => { if (props.show && previousFocus?.isConnected) previousFocus.focus(); });
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
  if (event.key !== 'Tab') return;
  const nodes = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
    .filter(node => node.getClientRects().length > 0);
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/30" @click="emit('close')" />
      <div ref="dialog" role="dialog" aria-modal="true" :aria-labelledby="title ? titleId : undefined" :aria-label="title ? undefined : '操作确认'" tabindex="-1" class="relative w-full rounded-2xl bg-white shadow-xl outline-none" :style="{ maxWidth: width || '520px' }" @keydown="onKey">
        <div class="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div :id="titleId" class="text-[15px] font-semibold">{{ title }}</div>
          <button type="button" class="icon-button -mr-1" aria-label="关闭弹窗" @click="emit('close')"><AppIcon name="close" :size="18" /></button>
        </div>
        <div class="max-h-[70vh] overflow-auto px-5 py-4">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex justify-end gap-2 border-t border-line px-5 py-3">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
