<script setup lang="ts">
import AppIcon from '../../ui/AppIcon.vue';
withDefaults(defineProps<{ title: string; description: string; icon?: string }>(), { icon: 'book' });
</script>

<template>
  <div class="card parent-empty">
    <div class="icon-tile icon-tile-blue mx-auto mb-4"><AppIcon :name="icon" :size="25" /></div>
    <h2 class="text-[16px] font-semibold">{{ title }}</h2>
    <p class="mx-auto mt-2 max-w-[280px] text-[13px] leading-6 text-ink-2">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>

<style scoped>
.parent-empty { padding: 36px 20px; text-align: center; }
</style>
