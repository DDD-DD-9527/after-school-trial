<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppSelect from '../../ui/AppSelect.vue';
import AppPagination from '../../ui/AppPagination.vue';
import AppIcon from '../../ui/AppIcon.vue';

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const q = ref('');
const teachers = ref<any[]>([]);
const show = ref(false);
const editing = ref<any>(null);
const router = useRouter();
const loading = ref(false);
const error = ref('');

const teacherOptions = computed(() => [
  { value: null, label: '未指定' },
  ...teachers.value.map((t) => ({ value: t.id, label: t.name })),
]);

const blank = { name: '', grade: '三年级', teacherId: null as number | null, capacity: 40, priceYuan: 0, description: '', refundNote: '' };
const form = ref({ ...blank });

async function load() {
  loading.value = true;
  error.value = '';
  try {
  const params = new URLSearchParams({ page: String(page.value), size: String(size.value) });
  if (q.value) params.set('q', q.value);
  const r = await api.get<{ items: any[]; total: number }>(`/api/admin/courses?${params}`);
  rows.value = r.items;
  total.value = r.total;
  } catch (e: any) {
    error.value = e.message || '课程加载失败，请重试';
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  try { teachers.value = await api.get('/api/admin/teachers'); }
  catch (e: any) { toast('教师选项加载失败：' + e.message, 'error'); }
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
    <div class="page-heading">
      <div><div class="eyebrow">教学准备</div><h1 class="page-title">课程管理</h1><p class="page-description">先建立课程，再安排课次，让每一次课后时光有序开始。</p></div>
      <button class="btn btn-primary" @click="openNew"><AppIcon name="plus" :size="17" />新建课程</button>
    </div>
    <div class="card">
      <div class="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        <div class="mr-auto"><h2 class="section-title">全部课程 <span class="ml-2 text-[13px] font-normal text-ink-3">{{ total }} 门</span></h2><p class="section-subtitle">查看教学安排，维护授课信息。</p></div>
        <input v-model="q" class="input max-w-[240px]" aria-label="搜索课程名称" placeholder="搜索课程名称" @keyup.enter="search" />
        <button class="btn btn-secondary btn-sm" @click="search"><AppIcon name="search" :size="15" />查询</button>
      </div>
      <div v-if="error" class="flex flex-wrap items-center justify-between gap-3 p-5 text-[13px]" role="alert"><span class="text-danger">{{ error }}</span><button class="btn btn-secondary btn-sm" @click="load">重新加载</button></div>
      <div class="overflow-x-auto">
      <table class="table-base min-w-[740px]">
        <thead><tr><th>课程信息</th><th>适用年级</th><th>授课教师</th><th>课程容量</th><th>课程费用</th><th class="text-right">操作</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td><div class="flex items-center gap-3"><span class="icon-tile shrink-0" :class="r.id % 3 === 0 ? 'icon-tile-mint' : r.id % 3 === 1 ? 'icon-tile-blue' : 'icon-tile-amber'"><AppIcon name="book" :size="21" /></span><div><div class="font-semibold">{{ r.name }}</div><div class="mt-1 text-[12px] text-ink-3">{{ r.term || '学期待设置' }}</div></div></div></td>
            <td><span class="badge badge-gray">{{ r.grade || '不限年级' }}</span></td>
            <td class="text-ink-2">{{ r.teacherName || '待分配教师' }}</td>
            <td><span class="font-medium">{{ r.capacity }}</span><span class="ml-1 text-[12px] text-ink-3">人</span></td>
            <td><span :class="r.price_cents === 0 ? 'text-ok' : 'font-medium'">{{ yuan(r.price_cents) }}</span><div v-if="r.price_cents > 0" class="mt-1 text-[12px] text-ink-3">线下收取</div></td>
            <td class="whitespace-nowrap text-right">
              <button class="btn btn-ghost btn-sm" @click="router.push(`/admin/courses/${r.id}`)">详情</button>
              <button class="btn btn-ghost btn-sm" @click="openEdit(r)">编辑</button>
            </td>
          </tr>
          <tr v-if="!rows.length && !error"><td colspan="6" class="py-14 text-center text-ink-3">{{ loading ? '正在加载课程…' : q ? '没有找到相关课程，试试其他关键词' : '还没有课程，点击「新建课程」开始准备' }}</td></tr>
        </tbody>
      </table>
      </div>
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
