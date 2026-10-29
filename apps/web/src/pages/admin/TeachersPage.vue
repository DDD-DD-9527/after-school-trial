<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppIcon from '../../ui/AppIcon.vue';

const rows = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const show = ref(false);
const editing = ref<any>(null);
const form = ref({ name: '', phone: '' });

async function load() {
  loading.value = true;
  error.value = '';
  try { rows.value = await api.get('/api/admin/teachers'); }
  catch (e: any) { error.value = e.message || '教师资料加载失败'; }
  finally { loading.value = false; }
}
onMounted(load);

function openNew() {
  editing.value = null;
  form.value = { name: '', phone: '' };
  show.value = true;
}
function openEdit(r: any) {
  editing.value = r;
  form.value = { name: r.name, phone: r.phone };
  show.value = true;
}
async function save() {
  try {
    if (!form.value.name || !form.value.phone) return toast('姓名和手机号必填', 'error');
    if (editing.value) await api.put(`/api/admin/teachers/${editing.value.id}`, form.value);
    else await api.post('/api/admin/teachers', form.value);
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
      <div><div class="eyebrow">基础资料</div><h1 class="page-title">授课教师</h1><p class="page-description">维护教师姓名与联系方式，在课程和教学班中安排授课人员。</p></div>
      <button class="btn btn-primary" @click="openNew"><AppIcon name="plus" :size="17" />新增教师</button>
    </div>
    <div class="card">
      <div class="section-heading border-b border-line px-5 py-4"><div><h2 class="section-title">教师名册</h2><p class="section-subtitle">信息保持准确，授课与考勤记录更清晰。</p></div><span class="text-[13px] text-ink-3">{{ loading || error ? '—' : rows.length }} 位教师</span></div>
      <div v-if="error" class="flex items-center justify-between gap-3 p-5 text-[13px]" role="alert"><span class="text-danger">{{ error }}</span><button class="btn btn-secondary btn-sm" @click="load">重试</button></div>
      <div class="overflow-x-auto"><table class="table-base min-w-[540px]">
        <thead><tr><th>姓名</th><th>手机号</th><th>状态</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td><div class="flex items-center gap-2.5"><span class="icon-tile icon-tile-mint"><AppIcon name="user" :size="18" /></span><span class="font-medium">{{ r.name }}</span></div></td>
            <td class="text-ink-2">{{ r.phone }}</td>
            <td><span class="badge badge-green">在职</span></td>
            <td class="text-right"><button class="btn btn-ghost btn-sm" @click="openEdit(r)">编辑</button></td>
          </tr>
          <tr v-if="!rows.length && !error"><td colspan="4" class="py-14 text-center text-ink-3">{{ loading ? '正在加载教师资料…' : '还没有教师，可新增教师或从「数据导入」批量录入' }}</td></tr>
        </tbody>
      </table></div>
    </div>
    <p class="mt-3 text-[12px] text-ink-3">提示：教师登录账号需与手机号一致，试用版由初始化数据生成。</p>

    <Modal :show="show" :title="editing ? '编辑教师' : '新增教师'" @close="show = false">
      <div class="field"><label class="label">姓名</label><input v-model="form.name" class="input" /></div>
      <div class="field"><label class="label">手机号</label><input v-model="form.phone" class="input" /></div>
      <template #footer>
        <button class="btn btn-secondary btn-sm" @click="show = false">取消</button>
        <button class="btn btn-primary btn-sm" @click="save">保存</button>
      </template>
    </Modal>
  </div>
</template>
