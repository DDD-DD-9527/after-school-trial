<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api } from '../../lib/api';
import { currentChild } from '../../lib/auth';
import { toast } from '../../lib/toast';
import AppConfirm from '../../ui/AppConfirm.vue';

const rows = ref<any[]>([]);
const bills = ref<any[]>([]);
const loading = ref(true);
const confirmId = ref<number | null>(null);
const confirming = ref(false);

async function load() {
  const id = currentChild.value?.id;
  if (!id) return;
  loading.value = true;
  try {
    const [list, billList] = await Promise.all([
      api.get<any[]>(`/api/parent/enrollments?studentId=${id}`),
      api.get<any[]>(`/api/parent/bills?studentId=${id}`),
    ]);
    rows.value = list;
    bills.value = billList;
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(currentChild, load);

async function doWithdraw() {
  if (!confirmId.value) return;
  confirming.value = true;
  try {
    await api.post(`/api/parent/enrollments/${confirmId.value}/withdraw`);
    toast('已退课', 'success');
    confirmId.value = null;
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    confirming.value = false;
  }
}
const yuan = (c: number) => (c === 0 ? '免费' : `¥${(c / 100).toFixed(2)}`);
function billOf(courseName: string) {
  return bills.value.find((b) => b.courseName === courseName && b.status !== 'void');
}
const billText = (s: string) => (s === 'paid' ? '已缴清' : s === 'partial' ? '部分缴' : '待缴费');
const billCls = (s: string) => (s === 'paid' ? 'badge-green' : s === 'partial' ? 'badge-orange' : 'badge-red');
</script>

<template>
  <div>
    <div class="mb-3 text-[18px] font-semibold">我的报名</div>
    <div class="space-y-3">
      <div v-for="r in rows" :key="r.id" class="card p-4">
        <div class="flex items-start justify-between">
          <div>
            <div class="text-[15px] font-medium">{{ r.courseName }}</div>
            <div class="mt-1 text-[12px] text-ink-2">{{ r.teacherName || '教师待定' }} · {{ r.room || '教室待定' }}</div>
          </div>
          <span class="badge" :class="r.status === 'effective' ? 'badge-green' : 'badge-gray'">
            {{ r.status === 'effective' ? '已报名' : '已退出' }}
          </span>
        </div>
        <div class="mt-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[14px] text-ink-2">{{ yuan(r.price_cents) }}</span>
            <span
              v-if="r.price_cents > 0 && billOf(r.courseName)"
              class="badge"
              :class="billCls(billOf(r.courseName)!.status)"
            >
              {{ billText(billOf(r.courseName)!.status) }}
            </span>
          </div>
          <button v-if="r.status === 'effective'" class="btn btn-secondary btn-sm" @click="confirmId = r.id">退课</button>
        </div>
      </div>
      <div v-if="!loading && !rows.length" class="card py-14 text-center text-[13px] text-ink-3">还没有报名记录</div>
    </div>

    <AppConfirm
      :show="confirmId !== null"
      title="确认退课"
      message="退课后名额会立即释放给其他同学，报名记录会保留。"
      confirm-text="确认退课"
      danger
      :loading="confirming"
      @close="confirmId = null"
      @confirm="doWithdraw"
    />
  </div>
</template>
