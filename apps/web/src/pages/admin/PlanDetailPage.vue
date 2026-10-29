<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import QRCode from 'qrcode';
import { api, downloadFile } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';
import AppPagination from '../../ui/AppPagination.vue';
import AppIcon from '../../ui/AppIcon.vue';

const route = useRoute();
const router = useRouter();
const data = ref<any>(null);
const tab = ref<'records' | 'unenrolled'>('records');
const showQr = ref(false);
const qrData = ref('');
const recordsPage = ref(1);
const recordsSize = ref(20);
const loading = ref(false);
const error = ref('');
const statusText: Record<string, string> = { open: '已开放', draft: '草稿', paused: '已暂停', closed: '已结束' };

async function load() {
  loading.value = true;
  error.value = '';
  try { data.value = await api.get(`/api/admin/plans/${route.params.id}?recordsPage=${recordsPage.value}&recordsSize=${recordsSize.value}`); }
  catch (e: any) { error.value = e.message || '报名计划加载失败'; }
  finally { loading.value = false; }
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
  <div>
    <button class="btn btn-ghost btn-sm mb-3" @click="router.push('/admin/plans')"><AppIcon name="arrow-left" :size="15" />返回报名计划</button>
    <div v-if="loading && !data" class="card py-14 text-center text-[13px] text-ink-3" role="status">正在加载报名详情…</div>
    <div v-if="error" class="card mb-4 flex flex-wrap items-center justify-between gap-3 p-5 text-[13px]" role="alert"><span class="text-danger">{{ error }}</span><button class="btn btn-secondary btn-sm" @click="load">重新加载</button></div>
    <template v-if="data">
    <div class="page-heading">
      <div class="min-w-0"><div class="eyebrow">报名计划详情 · {{ statusText[data.plan.status] || data.plan.status }}</div><h1 class="page-title">{{ data.plan.name }}</h1><p class="page-description">核对课程名额、查看报名名单，了解还有哪些孩子尚未报名。</p></div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-secondary btn-sm" @click="exportRecords"><AppIcon name="download" :size="15" />导出报名记录</button>
        <button class="btn btn-secondary btn-sm" @click="openQr"><AppIcon name="grid" :size="15" />报名二维码</button>
        <button class="btn btn-secondary btn-sm" @click="copyLink">复制链接</button>
        <button v-if="data.plan.status === 'draft'" class="btn btn-primary btn-sm" @click="publish">发布</button>
      </div>
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="metric-card"><div class="text-[13px] text-ink-2">目标学生</div><div class="mt-3 text-[28px] font-semibold">{{ data.stats.target }} <span class="text-[12px] font-normal text-ink-3">人</span></div></div>
      <div class="metric-card"><div class="text-[13px] text-ink-2">已报名学生</div><div class="mt-3 text-[28px] font-semibold text-ok">{{ data.stats.enrolledStudents }} <span class="text-[12px] font-normal text-ink-3">人</span></div></div>
      <div class="metric-card"><div class="text-[13px] text-ink-2">学生报名率</div><div class="mt-3 text-[28px] font-semibold text-brand">{{ data.stats.target ? rate + '%' : '—' }}</div></div>
      <div class="metric-card"><div class="text-[13px] text-ink-2">报名记录数</div><div class="mt-3 text-[28px] font-semibold">{{ data.stats.records }}</div><p class="mt-1 text-[12px] text-ink-3">包含已退出记录</p></div>
    </div>

    <div class="card mb-4 card-pad">
      <div class="mb-4"><h2 class="section-title">课程名额进度</h2><p class="section-subtitle">每门课程的已报名人次与容量，一名学生可以报名多门课程。</p></div>
      <div v-for="c in data.courses" :key="c.id" class="mb-3 last:mb-0">
        <div class="mb-1 flex justify-between text-[13px]">
          <span>{{ c.courseName }} <span class="text-ink-3">· {{ c.teacherName || '未指定' }}</span></span>
          <span class="text-ink-2">{{ c.enrolled }} / {{ c.capacity }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-[#f0f1f3]">
          <div class="h-full rounded-full bg-brand" :style="{ width: (c.capacity > 0 ? Math.min(100, (c.enrolled / c.capacity) * 100) : 0) + '%' }" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="flex gap-1 border-b border-line px-4 pt-3">
        <button class="px-3 pb-2 text-[14px]" :class="tab === 'records' ? 'border-b-2 border-brand font-medium text-brand' : 'text-ink-2'" @click="tab = 'records'">
          报名记录 ({{ data.recordsTotal }})
        </button>
        <button class="px-3 pb-2 text-[14px]" :class="tab === 'unenrolled' ? 'border-b-2 border-brand font-medium text-brand' : 'text-ink-2'" @click="tab = 'unenrolled'">
          未报名 ({{ data.unenrolled.length }})
        </button>
      </div>

      <template v-if="tab === 'records'">
        <div class="overflow-x-auto"><table class="table-base min-w-[740px]">
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
        </table></div>
        <AppPagination v-model:page="recordsPage" v-model:size="recordsSize" :total="data.recordsTotal" />
      </template>

      <template v-else>
        <div class="overflow-x-auto"><table class="table-base min-w-[480px]">
          <thead><tr><th>学号</th><th>姓名</th><th>班级</th></tr></thead>
          <tbody>
            <tr v-for="s in data.unenrolled" :key="s.id">
              <td class="text-ink-2">{{ s.code }}</td>
              <td>{{ s.name }}</td>
              <td class="text-ink-2">{{ s.className }}</td>
            </tr>
            <tr v-if="!data.unenrolled.length"><td colspan="3" class="py-10 text-center text-ink-3">全部学生已报名</td></tr>
          </tbody>
        </table></div>
      </template>
    </div>

    <Modal :show="showQr" title="报名二维码" width="400px" @close="showQr = false">
      <div class="flex flex-col items-center">
        <img :src="qrData" alt="报名二维码" class="h-[280px] w-[280px]" />
        <div class="mt-3 text-center text-[12px] text-ink-3">
          通用选课入口，家长登录后选择孩子与课程<br />请按计划的开放时间安排报名
        </div>
        <a :href="qrData" download="报名二维码.png" class="btn btn-secondary btn-sm mt-3">下载二维码</a>
      </div>
    </Modal>
    </template>
  </div>
</template>
