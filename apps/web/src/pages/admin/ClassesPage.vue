<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppSelect from '../../ui/AppSelect.vue';

const rows = ref<any[]>([]);
const teachers = ref<any[]>([]);
const show = ref(false);
const editing = ref<any>(null);
const form = ref({ grade: '三年级', name: '', headTeacherId: null as number | null });

const teacherOptions = computed(() => [
  { value: null, label: '未指定' },
  ...teachers.value.map((t) => ({ value: t.id, label: t.name })),
]);

async function load() {
  rows.value = await api.get('/api/admin/classes');
}
onMounted(async () => {
  teachers.value = await api.get('/api/admin/teachers');
  await load();
});

function openNew() {
  editing.value = null;
  form.value = { grade: '三年级', name: '', headTeacherId: null };
  show.value = true;
}
function openEdit(r: any) {
  editing.value = r;
  form.value = { grade: r.grade, name: r.name, headTeacherId: r.head_teacher_id };
  show.value = true;
}
async function save() {
  try {
    if (!form.value.name) return toast('班级名称必填', 'error');
    if (editing.value) await api.put(`/api/admin/classes/${editing.value.id}`, form.value);
    else await api.post('/api/admin/classes', form.value);
    toast('已保存', 'success');
    show.value = false;
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div class="text-[20px] font-semibold">班级</div>
      <button class="btn btn-primary btn-sm" @click="openNew">新增班级</button>
    </div>
    <div class="card">
      <table class="table-base">
        <thead><tr><th>年级</th><th>班级</th><th>班主任</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td>{{ r.grade }}</td>
            <td>{{ r.name }}</td>
            <td class="text-ink-2">{{ r.headTeacherName || '未指定' }}</td>
            <td class="text-right"><button class="btn btn-ghost btn-sm" @click="openEdit(r)">编辑</button></td>
          </tr>
          <tr v-if="!rows.length"><td colspan="4" class="py-10 text-center text-ink-3">暂无班级</td></tr>
        </tbody>
      </table>
    </div>

    <Modal :show="show" :title="editing ? '编辑班级' : '新增班级'" @close="show = false">
      <div class="field"><label class="label">年级</label><input v-model="form.grade" class="input" /></div>
      <div class="field"><label class="label">班级名称</label><input v-model="form.name" class="input" placeholder="如 1班" /></div>
      <div class="field">
        <label class="label">班主任</label>
        <AppSelect v-model="form.headTeacherId" :options="teacherOptions" />
      </div>
      <template #footer>
        <button class="btn btn-secondary btn-sm" @click="show = false">取消</button>
        <button class="btn btn-primary btn-sm" @click="save">保存</button>
      </template>
    </Modal>
  </div>
</template>
