<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ name: string; large?: boolean }>();
const tone = computed(() => [...props.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4);
</script>

<template>
  <div class="course-cover" :class="[`tone-${tone}`, { large }]" aria-hidden="true">
    <span class="cover-orbit" /><span class="cover-square" />
    <span class="cover-letter">{{ name.slice(0, 1) }}</span>
    <span class="cover-dot" />
  </div>
</template>

<style scoped>
.course-cover { position: relative; display: grid; width: 76px; height: 86px; flex: none; place-items: center; overflow: hidden; border-radius: 13px; background: #edf0fc; color: #3156d3; }
.tone-1 { background: #e8f4ef; color: #157f74; }
.tone-2 { background: #fbf1df; color: #a26c20; }
.tone-3 { background: #f4ecf5; color: #8a5f9e; }
.cover-letter { position: relative; z-index: 1; font-size: 30px; font-weight: 650; line-height: 1; }
.cover-orbit { position: absolute; width: 70px; height: 70px; border: 1px solid currentColor; border-radius: 50%; opacity: .16; right: -26px; top: -19px; }
.cover-square { position: absolute; width: 46px; height: 46px; border: 1px solid currentColor; opacity: .14; transform: rotate(25deg); left: -23px; bottom: -14px; }
.cover-dot { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: currentColor; right: 12px; bottom: 14px; opacity: .4; }
.large { width: 94px; height: 104px; border-radius: 17px; }
.large .cover-letter { font-size: 39px; }
</style>
