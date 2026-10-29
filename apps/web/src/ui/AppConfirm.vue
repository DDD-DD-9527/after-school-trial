<script setup lang="ts">
import Modal from './Modal.vue';

defineProps<{ show: boolean; title: string; message?: string; confirmText?: string; danger?: boolean; loading?: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm'): void }>();
</script>

<template>
  <Modal :show="show" :title="title" width="400px" @close="emit('close')">
    <p class="text-[14px] leading-relaxed text-ink-2">{{ message }}</p>
    <slot />
    <template #footer>
      <button class="btn btn-secondary btn-sm" @click="emit('close')">取消</button>
      <button class="btn btn-sm" :class="danger ? 'btn-danger' : 'btn-primary'" :disabled="loading" @click="emit('confirm')">
        {{ loading ? '处理中…' : confirmText || '确认' }}
      </button>
    </template>
  </Modal>
</template>
