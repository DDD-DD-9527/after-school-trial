<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, downloadFile } from '../../lib/api';
import { toast } from '../../lib/toast';
import AppDatePicker from '../../ui/AppDatePicker.vue';
import AppSelect from '../../ui/AppSelect.vue';
import AppPagination from '../../ui/AppPagination.vue';
import Modal from '../../ui/Modal.vue';
import AppIcon from '../../ui/AppIcon.vue';
import {
  attendanceBadge, attendanceLabel, attendanceRange, attendanceSource, attendanceStatusOptions, attendanceTime,
  canCorrectAttendance, correctionOptions, historyAction,
  type AttendanceHistory, type CorrectionStatus, type TeacherAttendanceResponse, type TeacherAttendanceRow,
} from '../../lib/teacherAttendance';

interface Filters { from: string; to: string; teacherId: number | null; status: string }
const filters = ref<Filters>({ ...attendanceRange('month'), teacherId: null, status: '' });
const applied = ref<Filters>({ ...filters.value });
const data = ref<TeacherAttendanceResponse | null>(null);
const page = ref(1);
const size = ref(20);
const loading = ref(false);
const error = ref('');
const exporting = ref(false);
const exportError = ref('');
const teachers = ref<Array<{ id: number; name: string }>>([]);
const teachersLoading = ref(false);
const teachersError = ref('');
let loadVersion = 0;

const teacherOptions = computed(() => [{ value: null, label: '全部教师' }, ...teachers.value.map((t) => ({ value: t.id, label: t.name }))]);
const stats = computed(() => [
  { label: '排课课次', value: data.value?.summary.total },
  { label: '已签到', value: data.value?.summary.checkedIn },
  { label: '已完成', value: data.value?.summary.completed, class: 'text-ok' },
  { label: '异常考勤', value: data.value?.summary.abnormal, class: 'text-warn' },
  { label: '请假', value: data.value?.summary.leave },
  { label: '待完成', value: data.value?.summary.pending },
]);

function queryParams(paginated = true) {
  const params = new URLSearchParams({ from: applied.value.from, to: applied.value.to });
  if (applied.value.teacherId !== null) params.set('teacherId', String(applied.value.teacherId));
  if (applied.value.status) params.set('status', applied.value.status);
  if (paginated) { params.set('page', String(page.value)); params.set('size', String(size.value)); }
  return params;
}

async function load() {
  const version = ++loadVersion;
  loading.value = true;
  error.value = '';
  try {
    while (version === loadVersion) {
      const result = await api.get<TeacherAttendanceResponse>(`/api/admin/teacher-attendance?${queryParams()}`);
      if (version !== loadVersion) return false;
      const lastPage = Math.max(1, Math.ceil(result.total / size.value));
      if (page.value > lastPage) {
        page.value = lastPage;
        continue;
      }
      data.value = result;
      return true;
    }
    return false;
  } catch (e: unknown) {
    if (version === loadVersion) error.value = e instanceof Error ? e.message : '考勤加载失败，请重试';
    return false;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

async function loadTeachers() {
  if (teachersLoading.value) return;
  teachersLoading.value = true;
  teachersError.value = '';
  try { teachers.value = await api.get('/api/admin/teachers'); }
  catch (e: unknown) { teachersError.value = e instanceof Error ? e.message : '教师选项加载失败'; }
  finally { teachersLoading.value = false; }
}

function search() {
  if (loading.value || submitting.value) return;
  if (!filters.value.from || !filters.value.to || filters.value.from > filters.value.to) return toast('请选择有效日期，开始日期不能晚于结束日期', 'error');
  applied.value = { ...filters.value };
  page.value = 1;
  load();
}

function quickRange(preset: 'today' | 'week' | 'month') {
  if (loading.value || submitting.value) return;
  filters.value = { ...filters.value, ...attendanceRange(preset, data.value?.today) };
  search();
}

function reset() {
  if (loading.value || submitting.value) return;
  filters.value = { ...attendanceRange('month', data.value?.today), teacherId: null, status: '' };
  search();
}

function changePage(value: number) {
  if (loading.value || submitting.value) return;
  page.value = value;
  load();
}

function changeSize(value: number) {
  if (loading.value || submitting.value) return;
  size.value = value;
  page.value = 1;
  load();
}

async function exportCsv() {
  if (exporting.value || loading.value) return;
  exporting.value = true;
  exportError.value = '';
  try {
    await downloadFile(`/api/admin/teacher-attendance/export?${queryParams(false)}`, `教师考勤-${applied.value.from}-${applied.value.to}.csv`);
    toast('考勤已导出', 'success');
  } catch (e: unknown) { exportError.value = e instanceof Error ? e.message : '导出失败，请重试'; }
  finally { exporting.value = false; }
}

const current = ref<TeacherAttendanceRow | null>(null);
const showCorrection = ref(false);
const correction = ref<{ status: CorrectionStatus; reason: string }>({ status: 'present', reason: '' });
const submitting = ref(false);
const correctionError = ref('');

function openCorrection(row: TeacherAttendanceRow) {
  if (!data.value || !canCorrectAttendance(row, data.value.now) || submitting.value) return;
  current.value = row;
  correction.value = {
    status: correctionOptions.some((o) => o.value === row.status) ? row.status as CorrectionStatus : 'present',
    reason: '',
  };
  correctionError.value = '';
  showCorrection.value = true;
}

async function saveCorrection() {
  if (submitting.value || !current.value) return;
  const reason = correction.value.reason.trim();
  if (!reason || reason.length > 200) { correctionError.value = '请填写 1–200 字的更正原因'; return; }
  if (!correctionOptions.some((o) => o.value === correction.value.status)) { correctionError.value = '请选择有效考勤结果'; return; }
  submitting.value = true;
  correctionError.value = '';
  try {
    await api.put(`/api/admin/teacher-attendance/${current.value.sessionId}`, { status: correction.value.status, reason });
    showCorrection.value = false;
    page.value = 1;
    const refreshed = await load();
    toast(refreshed ? '考勤已更正' : '更正已保存，请重试加载以查看最新记录', refreshed ? 'success' : 'info');
  } catch (e: unknown) { correctionError.value = e instanceof Error ? e.message : '更正失败，请重试'; }
  finally { submitting.value = false; }
}

const showHistory = ref(false);
const historyRow = ref<TeacherAttendanceRow | null>(null);
const history = ref<AttendanceHistory[]>([]);
const historyLoading = ref(false);
const historyError = ref('');
let historyVersion = 0;

async function openHistory(row: TeacherAttendanceRow) {
  historyRow.value = row;
  showHistory.value = true;
  history.value = [];
  await loadHistory();
}

async function loadHistory() {
  if (!historyRow.value) return;
  const version = ++historyVersion;
  historyLoading.value = true;
  historyError.value = '';
  try {
    const result = await api.get<AttendanceHistory[]>(`/api/admin/teacher-attendance/${historyRow.value.sessionId}/history`);
    if (version === historyVersion) history.value = result;
  } catch (e: unknown) {
    if (version === historyVersion) historyError.value = e instanceof Error ? e.message : '记录加载失败，请重试';
  } finally { if (version === historyVersion) historyLoading.value = false; }
}

onMounted(() => Promise.allSettled([load(), loadTeachers()]));
</script>

<template>
  <div>
    <div class="page-heading">
      <div><div class="eyebrow">授课执行记录</div><h1 class="page-title">教师考勤</h1><p class="page-description">核对每节课的教师签到与签退，查询异常，课后核实并留痕更正。</p></div>
      <button class="btn btn-primary" :disabled="loading || exporting || !data" @click="exportCsv"><AppIcon name="download" :size="16" />{{ exporting ? '导出中…' : '导出当前筛选' }}</button>
    </div>
    <div class="card mb-4 p-4">
      <div class="mb-4 flex items-center gap-2"><span class="icon-tile icon-tile-blue"><AppIcon name="filter" :size="17" /></span><div><h2 class="section-title">查询授课记录</h2><p class="section-subtitle">按课次日期与教师确定查询范围。</p></div></div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div><label class="label">开始日期</label><AppDatePicker v-model="filters.from" :disabled="loading || submitting" /></div>
        <div><label class="label">结束日期</label><AppDatePicker v-model="filters.to" :disabled="loading || submitting" /></div>
        <div><label class="label">教师</label><AppSelect v-model="filters.teacherId" :options="teacherOptions" :disabled="loading || teachersLoading || submitting" /></div>
        <div><label class="label">考勤状态</label><AppSelect v-model="filters.status" :options="attendanceStatusOptions" :disabled="loading || submitting" /></div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button class="btn btn-secondary btn-sm" :disabled="loading || submitting" @click="quickRange('today')">今天</button>
        <button class="btn btn-secondary btn-sm" :disabled="loading || submitting" @click="quickRange('week')">本周</button>
        <button class="btn btn-secondary btn-sm" :disabled="loading || submitting" @click="quickRange('month')">本月</button>
        <span class="mr-auto text-[12px] text-ink-3">修改条件后点击查询，导出与当前查询一致</span>
        <button class="btn btn-secondary btn-sm" :disabled="loading || submitting" @click="reset">重置</button>
        <button class="btn btn-primary btn-sm" :disabled="loading || submitting" @click="search">{{ loading ? '查询中…' : '查询' }}</button>
      </div>
      <div v-if="teachersError" class="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-danger" role="alert">教师选项加载失败：{{ teachersError }}<button class="text-brand" :disabled="teachersLoading" @click="loadTeachers">重试</button></div>
    </div>
    <div class="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <div v-for="stat in stats" :key="stat.label" class="metric-card">
        <div class="text-[13px] text-ink-2">{{ stat.label }}</div>
        <div class="mt-1 text-[24px] font-semibold" :class="stat.class">{{ loading || error ? '—' : stat.value ?? '—' }}</div>
      </div>
    </div>
    <p class="mb-4 text-[12px] leading-relaxed text-ink-3">此页记录教师本人到课，与学生点名分开。统计按查询日期和教师计算，不随状态筛选及翻页变化。待完成包含待签到、待签退；异常包含迟到、早退、未记录、漏签退和缺勤。未记录不自动等于缺勤。</p>
    <div v-if="exportError" class="mb-3 flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 p-3 text-[13px] text-danger" role="alert">{{ exportError }}<button class="text-brand" :disabled="exporting" @click="exportCsv">重新导出</button></div>
    <div class="card">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div><h2 class="section-title">教师课次明细</h2><p class="section-subtitle">{{ applied.from }} 至 {{ applied.to }} · 原始打卡事实与核实结论分别保留</p></div>
        <div class="flex items-center gap-2"><span v-if="data" class="text-[12px] text-ink-3">更新于 {{ attendanceTime(data.now) }}（北京时间）</span><button class="btn btn-ghost btn-sm" :disabled="loading || submitting" @click="load">刷新</button></div>
      </div>
      <div v-if="loading" class="py-14 text-center text-[13px] text-ink-3" role="status">正在加载教师考勤…</div>
      <div v-else-if="error" class="p-6 text-center" role="alert"><p class="text-[13px] text-danger">{{ error }}</p><button class="btn btn-secondary btn-sm mt-3" @click="load">重试</button></div>
      <template v-else>
        <div class="overflow-x-auto">
          <table class="table-base min-w-[1080px]">
            <thead><tr><th>教师 / 课程</th><th>授课日期 / 时段</th><th>签到 / 签退（北京时间）</th><th>考勤结果</th><th>来源 / 备注</th><th class="text-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="row in data?.items ?? []" :key="row.sessionId">
                <td><div class="font-medium">{{ row.teacherName }}</div><div class="mt-1 text-[13px]">{{ row.courseName }}</div><div class="mt-1 text-[12px] text-ink-3">{{ row.groupName || '未分班' }} · {{ row.room || '未安排教室' }}</div></td>
                <td class="whitespace-nowrap"><div>{{ row.date }}</div><div class="mt-1 text-[12px] text-ink-3">{{ row.startTime }}–{{ row.endTime }}</div><div v-if="row.sessionStatus === 'cancelled'" class="mt-1 text-[12px] text-ink-3">课次已取消</div></td>
                <td class="whitespace-nowrap text-[12px]"><div>签到 {{ attendanceTime(row.checkInAt) }}</div><div class="mt-1 text-ink-3">签退 {{ attendanceTime(row.checkOutAt) }}</div></td>
                <td><span class="badge" :class="attendanceBadge(row.status)">{{ attendanceLabel(row.status) }}</span><div v-if="row.lateMinutes" class="mt-1 text-[12px]" :class="row.source === 'admin' ? 'text-ink-3' : 'text-warn'">{{ row.source === 'admin' ? '原始签到迟到' : '迟到' }} {{ row.lateMinutes }} 分钟</div><div v-if="row.earlyMinutes" class="mt-1 text-[12px]" :class="row.source === 'admin' ? 'text-ink-3' : 'text-warn'">{{ row.source === 'admin' ? '原始签退早退' : '早退' }} {{ row.earlyMinutes }} 分钟</div></td>
                <td class="max-w-[220px]"><div class="text-[12px] text-ink-2">{{ attendanceSource(row.source) }}</div><div v-if="row.reason" class="mt-1 break-words text-[12px] text-ink-3">{{ row.reason }}</div></td>
                <td class="whitespace-nowrap text-right"><button class="btn btn-ghost btn-sm" :disabled="submitting || !data || !canCorrectAttendance(row, data.now)" :title="row.sessionStatus === 'cancelled' ? '已取消课次不可更正' : !data || !canCorrectAttendance(row, data.now) ? '课次结束后可更正，请刷新后重试' : '更正考勤结果'" @click="openCorrection(row)">更正</button><button class="btn btn-ghost btn-sm" @click="openHistory(row)">记录</button></td>
              </tr>
              <tr v-if="!data?.items.length"><td colspan="6" class="py-14 text-center text-ink-3">当前条件下暂无教师考勤</td></tr>
            </tbody>
          </table>
        </div>
        <AppPagination :page="page" :size="size" :total="data?.total ?? 0" @update:page="changePage" @update:size="changeSize" />
      </template>
    </div>
    <Modal :show="showCorrection" title="更正教师考勤" width="480px" @close="!submitting && (showCorrection = false)">
      <div v-if="current" class="mb-4 rounded-lg bg-[#f7f8fa] p-3 text-[13px] leading-relaxed text-ink-2"><div>{{ current.teacherName }} · {{ current.courseName }}</div><div>{{ current.date }} {{ current.startTime }}–{{ current.endTime }}</div><div class="mt-1">当前结果：{{ attendanceLabel(current.status) }}</div></div>
      <div class="field"><label class="label">考勤结果</label><AppSelect v-model="correction.status" :options="correctionOptions" :disabled="submitting" /></div>
      <div class="field"><label class="label" for="attendance-correction-reason">更正原因 <span class="text-danger">*</span></label><textarea id="attendance-correction-reason" v-model="correction.reason" class="input min-h-[96px] resize-y py-2" maxlength="200" placeholder="请说明更正依据，1–200 字" :disabled="submitting" /><div class="mt-1 text-right text-[12px] text-ink-3">{{ correction.reason.length }}/200</div></div>
      <p class="text-[12px] leading-relaxed text-ink-3">更正后保留真实签到、签退时间，并保存操作记录。</p>
      <p v-if="correctionError" class="mt-3 text-[13px] text-danger" role="alert">{{ correctionError }}</p>
      <template #footer><button class="btn btn-secondary btn-sm" :disabled="submitting" @click="showCorrection = false">取消</button><button class="btn btn-primary btn-sm" :disabled="submitting" @click="saveCorrection">{{ submitting ? '保存中…' : '保存更正' }}</button></template>
    </Modal>
    <Modal :show="showHistory" title="考勤操作记录" width="640px" @close="showHistory = false">
      <div v-if="historyRow" class="mb-4 text-[13px] text-ink-2">{{ historyRow.teacherName }} · {{ historyRow.courseName }} · {{ historyRow.date }}</div>
      <div v-if="historyLoading" class="py-10 text-center text-[13px] text-ink-3" role="status">正在加载记录…</div>
      <div v-else-if="historyError" class="py-6 text-center" role="alert"><p class="text-[13px] text-danger">{{ historyError }}</p><button class="btn btn-secondary btn-sm mt-3" @click="loadHistory">重试</button></div>
      <div v-else-if="!history.length" class="py-10 text-center text-[13px] text-ink-3">暂无操作记录</div>
      <div v-else class="space-y-3">
        <div v-for="item in history" :key="item.id" class="rounded-lg border border-line p-3">
          <div class="flex flex-wrap items-center justify-between gap-1 text-[13px]"><span class="font-medium">{{ historyAction(item.action) }} · {{ item.actorName || '—' }}</span><span class="text-[12px] text-ink-3">{{ attendanceTime(item.createdAt) }}</span></div>
          <div class="mt-2 text-[13px] text-ink-2">{{ attendanceLabel(item.beforeStatus) }} → {{ attendanceLabel(item.afterStatus) }}</div>
          <div v-if="item.reason" class="mt-2 break-words text-[13px] leading-relaxed text-ink-2">原因：{{ item.reason }}</div>
        </div>
      </div>
    </Modal>
  </div>
</template>
