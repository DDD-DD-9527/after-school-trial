<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });

const paths: Record<string, string[]> = {
  home: ['m3 10 9-7 9 7', 'M5 9v11h14V9', 'M9 20v-7h6v7'],
  calendar: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M7 3v4m10-4v4M3 10h18', 'M7 14h2m3 0h2m3 0h0M7 17h2m3 0h2'],
  book: ['M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z', 'M12 5v15M6 8h3m-3 4h3m6-4h3m-3 4h3'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2', 'M16 4a4 4 0 0 1 0 8m5 9v-2a4 4 0 0 0-3-3.9', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
  user: ['M20 21v-2a7 7 0 0 0-14 0v2', 'M16.5 7.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z'],
  check: ['m5 12 4 4L19 6'],
  'check-circle': ['M22 11a10 10 0 1 1-5.9-9.1', 'm8 11 4 4L22 5'],
  clock: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'M12 6v6l4 2'],
  wallet: ['M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v11H5a3 3 0 0 1-3-3V6', 'M21 12h-5v5h5m-2.5-2.5h0'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  search: ['M19 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', 'm16 16 5 5'],
  plus: ['M12 5v14M5 12h14'],
  'arrow-right': ['M4 12h16m-6-6 6 6-6 6'],
  'arrow-left': ['M20 12H4m6-6-6 6 6 6'],
  'chevron-right': ['m9 5 7 7-7 7'],
  'chevron-left': ['m15 5-7 7 7 7'],
  'chevron-down': ['m6 9 6 6 6-6'],
  location: ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  school: ['m3 10 9-7 9 7v11H3V10Z', 'M9 21v-7h6v7M2 10h20M10 8h4'],
  info: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'M12 11v6m0-10h.01'],
  alert: ['m12 3 10 18H2L12 3Z', 'M12 9v5m0 3h.01'],
  leaf: ['M21 3C11 1 3 7 4 15c1 8 18 7 17-12Z', 'M3 22 15 10m-7 7h5m-2-3V9'],
  list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
  grid: ['M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z'],
  filter: ['M4 5h16l-6 7v7l-4 2v-9L4 5Z'],
  'log-out': ['M9 21H4V3h5', 'M9 12h13m-5-5 5 5-5 5'],
  upload: ['M12 16V3m-5 5 5-5 5 5', 'M3 15v6h18v-6'],
  download: ['M12 3v13m-5-5 5 5 5-5', 'M3 17v4h18v-4'],
  file: ['M14 2H4v20h16V8l-6-6Z', 'M14 2v6h6M8 13h8m-8 4h5'],
  edit: ['m16 3 5 5-12 12-6 1 1-6L16 3Z', 'm13 6 5 5'],
  menu: ['M3 6h18M3 12h18M3 18h18'],
  close: ['m6 6 12 12M6 18 18 6'],
  refresh: ['M21 10a9 9 0 0 0-15-6L3 7m0-5v5h5', 'M3 14a9 9 0 0 0 15 6l3-3m0 5v-5h-5'],
  shield: ['m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z', 'm8 12 3 3 5-6'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  'eye-off': ['m3 3 18 18M10 5c7-1 12 7 12 7a21 21 0 0 1-4 4M6 6a21 21 0 0 0-4 6s5 8 12 7', 'M10 10a3 3 0 0 0 4 4'],
};
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true" focusable="false">
    <path v-for="(d, i) in paths[name] || paths['grid']" :key="i" :d="d" />
  </svg>
</template>
