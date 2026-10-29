<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';

const rows = ref<any[]>([]);
const show = ref(false);
const editing = ref<any>(null);
const form = ref({ name: '', phone: '' });

async function load() {
  rows.value = await api.get('/api/admin/teachers');
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
    <div class="mb-4 flex items-center justify-between">
      <div class="text-[20px] font-semibold">教师</div>
      <button class="btn btn-primary btn-sm" @click="openNew">新增教师</button>
    </div>
    <div class="card">
      <table class="table-base">
        <thead><tr><th>姓名</th><th>手机号</th><th>状态</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td>{{ r.name }}</td>
            <td class="text-ink-2">{{ r.phone }}</td>
            <td><span class="badge badge-green">在职</span></td>
            <td class="text-right"><button class="btn btn-ghost btn-sm" @click="openEdit(r)">编辑</button></td>
          </tr>
          <tr v-if="!rows.length"><td colspan="4" class="py-10 text-center text-ink-3">暂无教师</td></tr>
        </tbody>
      </table>
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
