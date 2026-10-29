<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, downloadFile } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppSelect from '../../ui/AppSelect.vue';
import AppPagination from '../../ui/AppPagination.vue';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const classes = ref<any[]>([]);
const q = ref('');
const loading = ref(false);
const show = ref(false);
const editing = ref<any>(null);
const form = ref({ code: '', name: '', classId: null as number | null });

const classOptions = computed(() => [
  { value: null, label: '未分班' },
  ...classes.value.map((c) => ({ value: c.id, label: `${c.grade}${c.name}` })),
]);

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), size: String(size.value) });
    if (q.value) params.set('q', q.value);
    const r = await api.get<{ items: any[]; total: number }>(`/api/admin/students?${params}`);
    rows.value = r.items;
    total.value = r.total;
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  classes.value = await api.get('/api/admin/classes');
  await load();
});
watch([page, size], load);

function search() {
  page.value = 1;
  load();
}

function openNew() {
  editing.value = null;
  form.value = { code: '', name: '', classId: classes.value[0]?.id ?? null };
  show.value = true;
}
function openEdit(r: any) {
  editing.value = r;
  form.value = { code: r.code, name: r.name, classId: r.class_id };
  show.value = true;
}
async function save() {
  try {
    if (!form.value.code || !form.value.name) return toast('学号和姓名必填', 'error');
    if (editing.value) await api.put(`/api/admin/students/${editing.value.id}`, form.value);
    else await api.post('/api/admin/students', form.value);
    toast('已保存', 'success');
    show.value = false;
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
async function exportCsv() {
  try {
    await downloadFile(`/api/admin/students/export${q.value ? `?q=${encodeURIComponent(q.value)}` : ''}`, `学生名单-${new Date().toISOString().slice(0, 10)}.csv`);
    toast('已开始下载', 'success');
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div class="text-[20px] font-semibold">学生</div>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" @click="exportCsv">导出</button>
        <button class="btn btn-primary btn-sm" @click="openNew">新增学生</button>
      </div>
    </div>

    <div class="card">
      <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <input v-model="q" class="input max-w-[260px]" placeholder="搜索姓名或学号" @keyup.enter="search" />
        <button class="btn btn-secondary btn-sm" @click="search">查询</button>
        <span class="ml-auto text-[13px] text-ink-3">共 {{ total }} 人</span>
      </div>

      <table class="table-base">
        <thead>
          <tr><th>学号</th><th>姓名</th><th>班级</th><th>状态</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="text-ink-2">{{ r.code }}</td>
            <td>{{ r.name }}</td>
            <td>{{ r.grade }}{{ r.className }}</td>
            <td><span class="badge badge-green">在读</span></td>
            <td class="text-right"><button class="btn btn-ghost btn-sm" @click="openEdit(r)">编辑</button></td>
          </tr>
          <tr v-if="!rows.length"><td colspan="5" class="py-10 text-center text-ink-3">{{ loading ? '加载中…' : '暂无学生' }}</td></tr>
        </tbody>
      </table>

      <AppPagination v-model:page="page" v-model:size="size" :total="total" />
    </div>

    <Modal :show="show" :title="editing ? '编辑学生' : '新增学生'" @close="show = false">
      <div class="field"><label class="label">学号</label><input v-model="form.code" class="input" :disabled="!!editing" /></div>
      <div class="field"><label class="label">姓名</label><input v-model="form.name" class="input" /></div>
      <div class="field">
        <label class="label">班级</label>
        <AppSelect v-model="form.classId" :options="classOptions" />
      </div>
      <template #footer>
        <button class="btn btn-secondary btn-sm" @click="show = false">取消</button>
        <button class="btn btn-primary btn-sm" @click="save">保存</button>
      </template>
    </Modal>
  </div>
</template>
