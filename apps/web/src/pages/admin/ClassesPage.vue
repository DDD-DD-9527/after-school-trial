<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppSelect from '../../ui/AppSelect.vue';
import AppIcon from '../../ui/AppIcon.vue';

const rows = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const teachers = ref<any[]>([]);
const show = ref(false);
const editing = ref<any>(null);
const form = ref({ grade: '三年级', name: '', headTeacherId: null as number | null });

const teacherOptions = computed(() => [
  { value: null, label: '未指定' },
  ...teachers.value.map((t) => ({ value: t.id, label: t.name })),
]);

async function load() {
  loading.value = true;
  error.value = '';
  try { rows.value = await api.get('/api/admin/classes'); }
  catch (e: any) { error.value = e.message || '班级资料加载失败'; }
  finally { loading.value = false; }
}
onMounted(async () => {
  try { teachers.value = await api.get('/api/admin/teachers'); }
  catch (e: any) { toast('教师选项加载失败：' + e.message, 'error'); }
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
    <div class="page-heading">
      <div><div class="eyebrow">基础资料</div><h1 class="page-title">班级档案</h1><p class="page-description">维护行政班与班主任，帮助学生资料和报名名单准确归属。</p></div>
      <button class="btn btn-primary" @click="openNew"><AppIcon name="plus" :size="17" />新增班级</button>
    </div>
    <div class="card">
      <div class="section-heading border-b border-line px-5 py-4"><div><h2 class="section-title">行政班级</h2><p class="section-subtitle">行政班与课程教学班分开管理。</p></div><span class="text-[13px] text-ink-3">{{ loading || error ? '—' : rows.length }} 个班级</span></div>
      <div v-if="error" class="flex items-center justify-between gap-3 p-5 text-[13px]" role="alert"><span class="text-danger">{{ error }}</span><button class="btn btn-secondary btn-sm" @click="load">重试</button></div>
      <div class="overflow-x-auto"><table class="table-base min-w-[560px]">
        <thead><tr><th>年级</th><th>班级</th><th>班主任</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td>{{ r.grade }}</td>
            <td><div class="flex items-center gap-2.5"><span class="icon-tile icon-tile-blue"><AppIcon name="school" :size="18" /></span><span class="font-medium">{{ r.name }}</span></div></td>
            <td class="text-ink-2">{{ r.headTeacherName || '未指定' }}</td>
            <td class="text-right"><button class="btn btn-ghost btn-sm" @click="openEdit(r)">编辑</button></td>
          </tr>
          <tr v-if="!rows.length && !error"><td colspan="4" class="py-14 text-center text-ink-3">{{ loading ? '正在加载班级资料…' : '还没有班级，可新增班级或从「数据导入」批量录入' }}</td></tr>
        </tbody>
      </table></div>
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
