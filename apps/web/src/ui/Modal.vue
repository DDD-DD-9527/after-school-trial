<script setup lang="ts">
defineProps<{ show: boolean; title?: string; width?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/30" @click="emit('close')" />
      <div class="relative w-full rounded-xl bg-white shadow-xl" :style="{ maxWidth: width || '520px' }">
        <div class="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div class="text-[15px] font-medium">{{ title }}</div>
          <button class="text-ink-3 hover:text-ink" @click="emit('close')">✕</button>
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
