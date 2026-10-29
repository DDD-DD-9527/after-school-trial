<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import QRCode from 'qrcode';
import { api, downloadFile } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppPagination from '../../ui/AppPagination.vue';

const route = useRoute();
const router = useRouter();
const data = ref<any>(null);
const tab = ref<'records' | 'unenrolled'>('records');
const showQr = ref(false);
const qrData = ref('');
const recordsPage = ref(1);
const recordsSize = ref(20);

async function load() {
  data.value = await api.get(`/api/admin/plans/${route.params.id}?recordsPage=${recordsPage.value}&recordsSize=${recordsSize.value}`);
}
onMounted(load);
watch([recordsPage, recordsSize], load);

async function exportRecords() {
  try {
    await downloadFile(`/api/admin/plans/${route.params.id}/records/export`, `报名名单-${new Date().toISOString().slice(0, 10)}.csv`);
    toast('已开始下载', 'success');
  } catch (e: any) {
    toast(e.message, 'error');
  }
}

const rate = computed(() => {
  const s = data.value?.stats;
  if (!s?.target) return 0;
  return Math.round((s.enrolledStudents / s.target) * 100);
});
async function publish() {
  try {
    await api.post(`/api/admin/plans/${route.params.id}/publish`);
    toast('已发布', 'success');
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
function copyLink() {
  const url = `${location.origin}/parent/enroll`;
  navigator.clipboard?.writeText(url);
  toast('报名链接已复制，可发给家长', 'success');
}

async function openQr() {
  const url = `${location.origin}/parent/enroll`;
  qrData.value = await QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#1f2329', light: '#ffffff' } });
  showQr.value = true;
}
</script>

<template>
  <div v-if="data">
    <div class="mb-4 flex items-center gap-3">
      <button class="btn btn-ghost btn-sm" @click="router.push('/admin/plans')">← 返回</button>
      <div class="text-[20px] font-semibold">{{ data.plan.name }}</div>
      <span class="badge" :class="data.plan.status === 'open' ? 'badge-green' : 'badge-gray'">
        {{ data.plan.status === 'open' ? '进行中' : '草稿' }}
      </span>
      <div class="ml-auto flex gap-2">
        <button class="btn btn-secondary btn-sm" @click="exportRecords">导出名单</button>
        <button class="btn btn-secondary btn-sm" @click="openQr">报名二维码</button>
        <button class="btn btn-secondary btn-sm" @click="copyLink">复制链接</button>
        <button v-if="data.plan.status === 'draft'" class="btn btn-primary btn-sm" @click="publish">发布</button>
      </div>
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="card card-pad"><div class="text-[13px] text-ink-2">目标学生</div><div class="text-[24px] font-semibold">{{ data.stats.target }}</div></div>
      <div class="card card-pad"><div class="text-[13px] text-ink-2">已报名学生</div><div class="text-[24px] font-semibold">{{ data.stats.enrolledStudents }}</div></div>
      <div class="card card-pad"><div class="text-[13px] text-ink-2">报名率</div><div class="text-[24px] font-semibold">{{ rate }}%</div></div>
      <div class="card card-pad"><div class="text-[13px] text-ink-2">报名记录</div><div class="text-[24px] font-semibold">{{ data.stats.records }}</div></div>
    </div>

    <div class="card mb-4 card-pad">
      <div class="mb-3 text-[15px] font-medium">课程报名进度</div>
      <div v-for="c in data.courses" :key="c.id" class="mb-3 last:mb-0">
        <div class="mb-1 flex justify-between text-[13px]">
          <span>{{ c.courseName }} <span class="text-ink-3">· {{ c.teacherName || '未指定' }}</span></span>
          <span class="text-ink-2">{{ c.enrolled }} / {{ c.capacity }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-[#f0f1f3]">
          <div class="h-full rounded-full bg-brand" :style="{ width: Math.min(100, (c.enrolled / c.capacity) * 100) + '%' }" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="flex gap-1 border-b border-line px-4 pt-3">
        <button class="px-3 pb-2 text-[14px]" :class="tab === 'records' ? 'border-b-2 border-brand font-medium text-brand' : 'text-ink-2'" @click="tab = 'records'">
          报名记录 ({{ data.records.length }})
        </button>
        <button class="px-3 pb-2 text-[14px]" :class="tab === 'unenrolled' ? 'border-b-2 border-brand font-medium text-brand' : 'text-ink-2'" @click="tab = 'unenrolled'">
          未报名 ({{ data.unenrolled.length }})
        </button>
      </div>

      <template v-if="tab === 'records'">
        <table class="table-base">
          <thead><tr><th>学生</th><th>学号</th><th>班级</th><th>课程</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="r in data.records" :key="r.id">
              <td>{{ r.studentName }}</td>
              <td class="text-ink-2">{{ r.code }}</td>
              <td class="text-ink-2">{{ r.className }}</td>
              <td>{{ r.courseName }}</td>
              <td>
                <span class="badge" :class="r.status === 'effective' ? 'badge-green' : 'badge-gray'">
                  {{ r.status === 'effective' ? '已生效' : '已退出' }}
                </span>
              </td>
              <td class="text-ink-3">{{ r.created_at }}</td>
            </tr>
            <tr v-if="!data.records.length"><td colspan="6" class="py-10 text-center text-ink-3">还没有人报名</td></tr>
          </tbody>
        </table>
        <AppPagination v-model:page="recordsPage" v-model:size="recordsSize" :total="data.recordsTotal" />
      </template>

      <template v-else>
        <table class="table-base">
          <thead><tr><th>学号</th><th>姓名</th><th>班级</th></tr></thead>
          <tbody>
            <tr v-for="s in data.unenrolled" :key="s.id">
              <td class="text-ink-2">{{ s.code }}</td>
              <td>{{ s.name }}</td>
              <td class="text-ink-2">{{ s.className }}</td>
            </tr>
            <tr v-if="!data.unenrolled.length"><td colspan="3" class="py-10 text-center text-ink-3">全部学生已报名</td></tr>
          </tbody>
        </table>
      </template>
    </div>

    <Modal :show="showQr" title="报名二维码" width="400px" @close="showQr = false">
      <div class="flex flex-col items-center">
        <img :src="qrData" alt="报名二维码" class="h-[280px] w-[280px]" />
        <div class="mt-3 text-center text-[12px] text-ink-3">
          家长扫码后登录即可报名<br />当前孩子：由家长登录后选择
        </div>
        <a :href="qrData" download="报名二维码.png" class="btn btn-secondary btn-sm mt-3">下载二维码</a>
      </div>
    </Modal>
  </div>
</template>
