<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { currentChild } from '../../lib/auth';
import { toast } from '../../lib/toast';
import AppConfirm from '../../ui/AppConfirm.vue';
import AppIcon from '../../ui/AppIcon.vue';
import ParentEmpty from './ParentEmpty.vue';

const router = useRouter();
const rows = ref<any[]>([]);
const bills = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const courseFilter = ref('effective');
const billFilter = ref('unpaid');
const confirmId = ref<number | null>(null);
const confirmChildId = ref<number | null>(null);
const confirming = ref(false);
let requestId = 0;
onBeforeUnmount(() => { requestId++; });
const effective = computed(() => rows.value.filter((row) => row.status === 'effective'));
const shownRows = computed(() => courseFilter.value === 'effective' ? effective.value : rows.value);
const liveBills = computed(() => bills.value.filter((bill) => bill.status !== 'void'));
const unpaid = computed(() => liveBills.value.filter((bill) => bill.status !== 'paid' && bill.amount_cents > bill.paid_cents));
const outstanding = computed(() => unpaid.value.reduce((sum, bill) => sum + Math.max(0, bill.amount_cents - bill.paid_cents), 0));
const paid = computed(() => liveBills.value.reduce((sum, bill) => sum + Math.max(0, bill.paid_cents), 0));
const shownBills = computed(() => billFilter.value === 'unpaid' ? unpaid.value : bills.value);
const selectedRecord = computed(() => rows.value.find((row) => row.id === confirmId.value));
const yuan = (cents: number) => cents === 0 ? '免费' : `¥${(cents / 100).toFixed(2)}`;
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
const billText = (status: string) => ({ paid: '已缴清', partial: '部分缴纳', unpaid: '待缴费', void: '已作废' }[status] || '状态待核实');
const billClass = (status: string) => status === 'paid' ? 'badge-green' : status === 'void' ? 'badge-gray' : 'badge-orange';
function closeConfirm() { confirmId.value = null; confirmChildId.value = null; }
async function load() {
  const request = ++requestId;
  const childId = currentChild.value?.id;
  rows.value = []; bills.value = []; error.value = ''; closeConfirm(); loading.value = !!childId;
  if (!childId) return;
  try {
    const [records, billList] = await Promise.all([
      api.get<any[]>(`/api/parent/enrollments?studentId=${childId}`),
      api.get<any[]>(`/api/parent/bills?studentId=${childId}`),
    ]);
    if (request !== requestId || currentChild.value?.id !== childId) return;
    rows.value = records; bills.value = billList;
  } catch (err: any) { if (request === requestId) error.value = err.message || '报名与费用暂时无法加载'; }
  finally { if (request === requestId) loading.value = false; }
}
watch(() => currentChild.value?.id, load, { immediate: true });
function openWithdraw(record: any) { if (confirming.value || record.status !== 'effective') return; confirmId.value = record.id; confirmChildId.value = currentChild.value?.id ?? null; }
async function doWithdraw() {
  if (confirming.value || !confirmId.value || !selectedRecord.value || selectedRecord.value.status !== 'effective' || confirmChildId.value !== currentChild.value?.id) return;
  const id = confirmId.value;
  const childId = confirmChildId.value;
  const context = requestId;
  confirming.value = true;
  try {
    await api.post(`/api/parent/enrollments/${id}/withdraw`);
    if (context !== requestId || currentChild.value?.id !== childId) return;
    toast('已退课，报名记录已保留', 'success');
    closeConfirm();
    await load();
  } catch (err: any) { if (context === requestId) toast(err.message || '退课未成功，请重试', 'error'); }
  finally { confirming.value = false; }
}
</script>

<template>
  <div class="space-y-5">
    <div><p class="eyebrow">每一份选择，都清楚有数</p><h1 class="page-title mt-1">报名与费用</h1><p class="page-description mt-2">{{ currentChild ? `${currentChild.name} 的课程报名和缴费记录` : '查看课程报名和缴费记录' }}</p></div>
    <ParentEmpty v-if="!currentChild" icon="users" title="还没有关联孩子" description="请联系学校核实学生与监护人信息，关联后即可查看孩子的报名与账单。" />
    <div v-else-if="loading" class="card p-7 text-center text-[14px] text-ink-2" role="status">正在整理报名与账单…</div>
    <div v-else-if="error" class="card p-5" role="alert"><p class="text-[14px] text-ink-2">{{ error }}</p><button class="btn btn-secondary btn-sm mt-3" @click="load">重新加载</button></div>
    <template v-else>
      <section class="fee-overview card"><div class="flex items-center gap-2 text-[13px] text-ink-2"><AppIcon name="wallet" :size="18" />待缴金额</div><div class="mt-2 text-[32px] font-semibold tracking-tight" :class="outstanding ? 'text-[#9a681e]' : 'text-ink'">{{ money(outstanding) }}</div><p class="mt-1 text-[12px] text-ink-2">{{ outstanding ? `${unpaid.length} 笔待缴账单，请向学校线下缴纳` : '当前没有待缴费用' }}</p><div class="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4"><div><span class="text-[12px] text-ink-3">已报名课程</span><strong class="mt-1 block text-[18px] font-semibold">{{ effective.length }} <span class="text-[12px] font-normal text-ink-2">门</span></strong></div><div><span class="text-[12px] text-ink-3">账单已缴金额</span><strong class="mt-1 block text-[18px] font-semibold">{{ money(paid) }}</strong></div></div></section>
      <section>
        <div class="mb-3 flex items-center justify-between gap-3"><h2 class="section-title">孩子的课程</h2><div class="mini-tabs"><button :class="{ active: courseFilter === 'effective' }" @click="courseFilter = 'effective'">有效报名</button><button :class="{ active: courseFilter === 'all' }" @click="courseFilter = 'all'">全部记录</button></div></div>
        <div v-if="shownRows.length" class="enrollment-grid"><article v-for="record in shownRows" :key="record.id" class="card p-4"><div class="flex items-start justify-between gap-3"><div><h3 class="text-[16px] font-semibold">{{ record.courseName }}</h3><p class="mt-2 text-[12px] leading-5 text-ink-2">{{ record.teacherName || '教师待定' }} · {{ record.room || '教室待定' }}</p></div><span class="badge" :class="record.status === 'effective' ? 'badge-green' : 'badge-gray'">{{ record.status === 'effective' ? '已报名' : '已退出' }}</span></div><div class="mt-4 flex items-center justify-between border-t border-line pt-3"><span class="text-[14px] font-medium">{{ yuan(record.price_cents) }}<span class="ml-1 text-[11px] font-normal text-ink-3">课程费用</span></span><button v-if="record.status === 'effective'" class="withdraw-link" :disabled="confirming" @click="openWithdraw(record)">退课</button><span v-else class="text-[11px] text-ink-3">报名记录已保留</span></div></article></div>
        <ParentEmpty v-else :title="rows.length ? '目前没有有效报名' : '还没有报名课程'" description="发现感兴趣的课程，了解安排和费用后再报名。"><button class="btn btn-primary" @click="router.push('/parent/enroll')">去选课程<AppIcon name="arrow-right" :size="17" /></button></ParentEmpty>
      </section>
      <section>
        <div class="mb-3 flex items-center justify-between gap-3"><h2 class="section-title">费用账单</h2><div class="mini-tabs"><button :class="{ active: billFilter === 'unpaid' }" @click="billFilter = 'unpaid'">待缴 {{ unpaid.length }}</button><button :class="{ active: billFilter === 'all' }" @click="billFilter = 'all'">全部账单</button></div></div>
        <div v-if="shownBills.length" class="card divide-y divide-line px-4"><article v-for="bill in shownBills" :key="bill.id" class="py-4"><div class="flex items-start justify-between gap-3"><div><h3 class="text-[14px] font-medium">{{ bill.courseName }}</h3><p class="mt-1 text-[11px] text-ink-3">账单 #{{ bill.id }} · {{ bill.created_at?.slice(0, 10) }}</p></div><span class="badge" :class="billClass(bill.status)">{{ billText(bill.status) }}</span></div><div class="mt-3 grid grid-cols-3 gap-2 text-[12px]"><div><p class="text-ink-3">应缴</p><p class="mt-1 font-medium">{{ money(bill.amount_cents) }}</p></div><div><p class="text-ink-3">已缴</p><p class="mt-1 font-medium">{{ money(bill.paid_cents) }}</p></div><div class="text-right"><p class="text-ink-3">{{ bill.status === 'void' ? '状态' : '待缴' }}</p><p class="mt-1 font-medium" :class="bill.status !== 'void' && bill.amount_cents > bill.paid_cents ? 'text-[#9a681e]' : ''">{{ bill.status === 'void' ? '账单已作废' : money(Math.max(0, bill.amount_cents - bill.paid_cents)) }}</p></div></div></article></div>
        <div v-else class="card flex items-center gap-3 p-5"><span class="icon-tile icon-tile-mint"><AppIcon :name="billFilter === 'unpaid' ? 'check-circle' : 'wallet'" :size="24" /></span><div><p class="text-[14px] font-medium">{{ billFilter === 'unpaid' ? '没有待缴账单' : '暂无费用账单' }}</p><p class="mt-1 text-[12px] leading-5 text-ink-2">{{ billFilter === 'unpaid' ? '已缴记录可以在全部账单中查看。' : '付费课程报名后的费用会展示在这里。' }}</p></div></div>
        <p class="mt-3 flex items-start gap-2 text-[12px] leading-6 text-ink-3"><AppIcon name="info" :size="15" class="mt-1 shrink-0" />本页面不支持线上缴费。缴费登记、已缴费用的退费处理，请联系学校核实。</p>
      </section>
    </template>
    <AppConfirm :show="confirmId !== null" title="确认退出这门课程？" :message="`退出「${selectedRecord?.courseName || ''}」后，名额会立即释放，后续课表将移除该课程。报名记录仍会保留，已缴费用如何处理请联系学校确认。`" confirm-text="确认退课" danger :loading="confirming" @close="closeConfirm" @confirm="doWithdraw" />
  </div>
</template>

<style scoped>
.fee-overview { position: relative; overflow: hidden; padding: 22px; border-color: #e2e6ee; background: #fff; }
.fee-overview::after { position: absolute; content: ''; width: 112px; height: 112px; right: -35px; top: -29px; border: 16px solid #f4f6fb; border-radius: 50%; pointer-events: none; }
.mini-tabs { display: flex; gap: 12px; font-size: 12px; color: #8a95a6; }
.mini-tabs button { padding: 4px 0; }
.mini-tabs .active { color: #3156d3; font-weight: 600; }
.enrollment-grid { display: grid; gap: 12px; }
.withdraw-link { padding: 4px 0 4px 12px; font-size: 12px; color: #8a95a6; }
.withdraw-link:hover { color: #bd4747; }
.withdraw-link:disabled { opacity: .5; }
@media (min-width: 700px) { .enrollment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
