<script setup lang="ts">
defineProps<{ text?: string; hint?: string }>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-14 text-center">
    <div class="text-[15px] text-ink-2">{{ text || '暂无数据' }}</div>
    <div v-if="hint" class="text-[13px] text-ink-3">{{ hint }}</div>
    <slot />
  </div>
</template>
