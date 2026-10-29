<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppSelect from '../../ui/AppSelect.vue';
import AppPagination from '../../ui/AppPagination.vue';

const yuan = (c: number) => `¥${(c / 100).toFixed(2)}`;

const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const q = ref('');
const status = ref('');
const courseId = ref<number | null>(null);
const courses = ref<any[]>([]);
const summary = ref<any>(null);
const loading = ref(false);

const showPay = ref(false);
const current = ref<any>(null);
const form = ref({ amount: 0, method: 'cash', note: '' });
const submitting = ref(false);

const showHistory = ref(false);
const history = ref<any[]>([]);

const courseOptions = computed(() => [{ value: null, label: '全部课程' }, ...courses.value.map((c) => ({ value: c.id, label: c.name }))]);
const methodOptions = [
  { value: 'cash', label: '现金' },
  { value: 'transfer', label: '转账' },
  { value: 'wechat', label: '微信' },
  { value: 'other', label: '其他' },
];
const statusTabs = [
  { v: '', l: '全部' },
  { v: 'unpaid', l: '待缴' },
  { v: 'partial', l: '部分缴' },
  { v: 'paid', l: '已缴清' },
];

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), size: String(size.value) });
    if (q.value) params.set('q', q.value);
    if (status.value) params.set('status', status.value);
    if (courseId.value) params.set('courseId', String(courseId.value));
    const [list, sum] = await Promise.all([
      api.get<{ items: any[]; total: number }>(`/api/admin/finance/bills?${params}`),
      api.get<any>(`/api/admin/finance/summary${courseId.value ? `?courseId=${courseId.value}` : ''}`),
    ]);
    rows.value = list.items;
    total.value = list.total;
    summary.value = sum;
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  courses.value = await api.get('/api/admin/courses/options');
  await load();
});

function search() {
  page.value = 1;
  load();
}
function pickStatus(v: string) {
  status.value = v;
  page.value = 1;
  load();
}

function openPay(r: any) {
  current.value = r;
  form.value = { amount: (r.amount_cents - r.paid_cents) / 100, method: 'cash', note: '' };
  showPay.value = true;
}

async function submitPay() {
  if (!current.value) return;
  const cents = Math.round(Number(form.value.amount) * 100);
  if (!cents || cents <= 0) return toast('请输入正确的收款金额', 'error');
  submitting.value = true;
  try {
    await api.post(`/api/admin/finance/bills/${current.value.id}/payment`, {
      amountCents: cents,
      method: form.value.method,
      note: form.value.note,
    });
    toast('收款已登记', 'success');
    showPay.value = false;
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    submitting.value = false;
  }
}

async function openHistory(r: any) {
  current.value = r;
  history.value = await api.get(`/api/admin/finance/bills/${r.id}/payments`);
  showHistory.value = true;
}

const badge = (s: string) => (s === 'paid' ? 'badge-green' : s === 'partial' ? 'badge-orange' : s === 'void' ? 'badge-gray' : 'badge-red');
const label = (s: string) => (s === 'paid' ? '已缴清' : s === 'partial' ? '部分缴' : s === 'void' ? '已作废' : '待缴费');
</script>

<template>
  <div>
    <div class="mb-4 text-[20px] font-semibold">收费</div>

    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="card card-pad">
        <div class="text-[13px] text-ink-2">应收</div>
        <div class="mt-1 text-[24px] font-semibold">{{ summary ? yuan(summary.receivable) : '—' }}</div>
      </div>
      <div class="card card-pad">
        <div class="text-[13px] text-ink-2">实收</div>
        <div class="mt-1 text-[24px] font-semibold text-ok">{{ summary ? yuan(summary.received) : '—' }}</div>
      </div>
      <div class="card card-pad">
        <div class="text-[13px] text-ink-2">未收</div>
        <div class="mt-1 text-[24px] font-semibold text-danger">{{ summary ? yuan(summary.outstanding) : '—' }}</div>
      </div>
      <div class="card card-pad">
        <div class="text-[13px] text-ink-2">账单</div>
        <div class="mt-1 text-[24px] font-semibold">
          {{ summary?.paidCount ?? 0 }}<span class="text-[13px] font-normal text-ink-3"> 已缴 / {{ summary?.billCount ?? 0 }} 总数</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div class="w-[180px]">
          <AppSelect v-model="courseId" :options="courseOptions" @update:model-value="search" />
        </div>
        <div class="flex gap-1">
          <button
            v-for="t in statusTabs"
            :key="t.v"
            class="rounded-md px-3 py-1.5 text-[13px]"
            :class="status === t.v ? 'bg-brand-soft font-medium text-brand' : 'text-ink-2 hover:bg-[#f5f6f8]'"
            @click="pickStatus(t.v)"
          >
            {{ t.l }}
          </button>
        </div>
        <input v-model="q" class="input ml-auto max-w-[220px]" placeholder="搜索学生姓名/学号" @keyup.enter="search" />
        <button class="btn btn-secondary btn-sm" @click="search">查询</button>
      </div>

      <table class="table-base">
        <thead>
          <tr><th>学生</th><th>班级</th><th>课程</th><th>应缴</th><th>已缴</th><th>状态</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td>{{ r.studentName }} <span class="ml-1 text-[12px] text-ink-3">{{ r.code }}</span></td>
            <td class="text-ink-2">{{ r.className }}</td>
            <td>{{ r.courseName }}</td>
            <td>{{ yuan(r.amount_cents) }}</td>
            <td :class="r.paid_cents >= r.amount_cents ? 'text-ok' : 'text-ink-2'">{{ yuan(r.paid_cents) }}</td>
            <td><span class="badge" :class="badge(r.status)">{{ label(r.status) }}</span></td>
            <td class="text-right">
              <button v-if="r.status !== 'paid' && r.status !== 'void'" class="btn btn-primary btn-sm" @click="openPay(r)">登记收款</button>
              <button v-if="r.paid_cents > 0" class="btn btn-ghost btn-sm" @click="openHistory(r)">收款记录</button>
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="7" class="py-10 text-center text-ink-3">{{ loading ? '加载中…' : '暂无账单' }}</td></tr>
        </tbody>
      </table>

      <AppPagination v-model:page="page" v-model:size="size" :total="total" />
    </div>

    <Modal :show="showPay" title="登记收款" width="440px" @close="showPay = false">
      <div v-if="current" class="mb-3 rounded-lg bg-[#f7f8fa] p-3 text-[13px] text-ink-2">
        {{ current.studentName }} · {{ current.courseName }}<br />
        应缴 {{ yuan(current.amount_cents) }}，已缴 {{ yuan(current.paid_cents) }}
      </div>
      <div class="field">
        <label class="label">收款金额（元）</label>
        <input v-model="form.amount" type="number" step="0.01" class="input" />
      </div>
      <div class="field">
        <label class="label">收款方式</label>
        <AppSelect v-model="form.method" :options="methodOptions" />
      </div>
      <div class="field">
        <label class="label">备注（选填）</label>
        <input v-model="form.note" class="input" placeholder="如 家长转账 / 现金" />
      </div>
      <template #footer>
        <button class="btn btn-secondary btn-sm" @click="showPay = false">取消</button>
        <button class="btn btn-primary btn-sm" :disabled="submitting" @click="submitPay">{{ submitting ? '提交中…' : '确认收款' }}</button>
      </template>
    </Modal>

    <Modal :show="showHistory" title="收款记录" width="480px" @close="showHistory = false">
      <table class="table-base">
        <thead><tr><th>时间</th><th>金额</th><th>方式</th><th>经办</th><th>备注</th></tr></thead>
        <tbody>
          <tr v-for="p in history" :key="p.id">
            <td class="text-[12px] text-ink-2">{{ p.paid_at }}</td>
            <td>{{ yuan(p.amount_cents) }}</td>
            <td>{{ methodOptions.find((m) => m.value === p.method)?.label || p.method }}</td>
            <td class="text-ink-2">{{ p.operatorName || '—' }}</td>
            <td class="text-ink-3">{{ p.note || '—' }}</td>
          </tr>
          <tr v-if="!history.length"><td colspan="5" class="py-8 text-center text-ink-3">暂无记录</td></tr>
        </tbody>
      </table>
    </Modal>
  </div>
</template>

