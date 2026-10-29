<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppSelect from '../../ui/AppSelect.vue';
import AppPagination from '../../ui/AppPagination.vue';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const q = ref('');
const teachers = ref<any[]>([]);
const show = ref(false);
const editing = ref<any>(null);
const router = useRouter();

const teacherOptions = computed(() => [
  { value: null, label: '未指定' },
  ...teachers.value.map((t) => ({ value: t.id, label: t.name })),
]);

const blank = { name: '', grade: '三年级', teacherId: null as number | null, capacity: 40, priceYuan: 0, description: '', refundNote: '' };
const form = ref({ ...blank });

async function load() {
  const params = new URLSearchParams({ page: String(page.value), size: String(size.value) });
  if (q.value) params.set('q', q.value);
  const r = await api.get<{ items: any[]; total: number }>(`/api/admin/courses?${params}`);
  rows.value = r.items;
  total.value = r.total;
}
onMounted(async () => {
  teachers.value = await api.get('/api/admin/teachers');
  await load();
});
watch([page, size], load);

function search() {
  page.value = 1;
  load();
}

function openNew() {
  editing.value = null;
  form.value = { ...blank };
  show.value = true;
}
function openEdit(r: any) {
  editing.value = r;
  form.value = {
    name: r.name,
    grade: r.grade,
    teacherId: r.teacher_id,
    capacity: r.capacity,
    priceYuan: r.price_cents / 100,
    description: '',
    refundNote: '',
  };
  show.value = true;
}
async function save() {
  try {
    if (!form.value.name) return toast('课程名称必填', 'error');
    const payload = {
      name: form.value.name,
      grade: form.value.grade,
      teacherId: form.value.teacherId,
      capacity: Number(form.value.capacity) || 40,
      priceCents: Math.round(Number(form.value.priceYuan) * 100),
      description: form.value.description,
      refundNote: form.value.refundNote,
      status: 'published',
    };
    if (editing.value) await api.put(`/api/admin/courses/${editing.value.id}`, payload);
    else await api.post('/api/admin/courses', payload);
    toast('已保存', 'success');
    show.value = false;
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
const yuan = (c: number) => (c === 0 ? '免费' : `¥${(c / 100).toFixed(2)}`);
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div class="text-[20px] font-semibold">课程</div>
      <button class="btn btn-primary btn-sm" @click="openNew">新建课程</button>
    </div>
    <div class="card">
      <div class="flex items-center gap-2 border-b border-line px-4 py-3">
        <input v-model="q" class="input max-w-[240px]" placeholder="搜索课程名称" @keyup.enter="search" />
        <button class="btn btn-secondary btn-sm" @click="search">查询</button>
        <span class="ml-auto text-[13px] text-ink-3">共 {{ total }} 门</span>
      </div>
      <table class="table-base">
        <thead><tr><th>课程</th><th>年级</th><th>教师</th><th>容量</th><th>费用</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="font-medium">{{ r.name }}</td>
            <td class="text-ink-2">{{ r.grade || '不限' }}</td>
            <td class="text-ink-2">{{ r.teacherName || '未指定' }}</td>
            <td>{{ r.capacity }}</td>
            <td>{{ yuan(r.price_cents) }}</td>
            <td class="text-right">
              <button class="btn btn-ghost btn-sm" @click="router.push(`/admin/courses/${r.id}`)">详情</button>
              <button class="btn btn-ghost btn-sm" @click="openEdit(r)">编辑</button>
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="6" class="py-10 text-center text-ink-3">还没有课程，先新建一门</td></tr>
        </tbody>
      </table>
      <AppPagination v-model:page="page" v-model:size="size" :total="total" />
    </div>

    <Modal :show="show" :title="editing ? '编辑课程' : '新建课程'" width="560px" @close="show = false">
      <div class="field"><label class="label">课程名称</label><input v-model="form.name" class="input" placeholder="如 基础托管 / 围棋社团" /></div>
      <div class="grid grid-cols-2 gap-3">
        <div class="field"><label class="label">年级</label><input v-model="form.grade" class="input" /></div>
        <div class="field"><label class="label">容量</label><input v-model="form.capacity" type="number" class="input" /></div>
        <div class="field">
          <label class="label">授课教师</label>
          <AppSelect v-model="form.teacherId" :options="teacherOptions" />
        </div>
        <div class="field"><label class="label">费用（元）</label><input v-model="form.priceYuan" type="number" class="input" /></div>
      </div>
      <div class="field"><label class="label">课程简介</label><textarea v-model="form.description" class="input h-20 py-2" /></div>
      <div class="field"><label class="label">退课规则</label><textarea v-model="form.refundNote" class="input h-16 py-2" /></div>
      <template #footer>
        <button class="btn btn-secondary btn-sm" @click="show = false">取消</button>
        <button class="btn btn-primary btn-sm" @click="save">保存</button>
      </template>
    </Modal>
  </div>
</template>
