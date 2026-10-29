<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';

const route = useRoute();
const router = useRouter();
const data = ref<any>(null);
const sessions = ref<any[]>([]);
const showChange = ref(false);
const changeMode = ref<'cancel' | 'reschedule'>('cancel');
const current = ref<any>(null);
const form = ref({ date: '', startTime: '', endTime: '', reason: '' });

async function load() {
  const id = route.params.id;
  data.value = await api.get(`/api/admin/courses/${id}`);
  sessions.value = await api.get(`/api/admin/sessions?courseId=${id}`);
}
onMounted(load);

const yuan = (c: number) => (c === 0 ? '免费' : `¥${(c / 100).toFixed(2)}`);
const wd = ['', '一', '二', '三', '四', '五', '六', '日'];

function goSchedule() {
  router.push({ path: '/admin/schedule', query: { courseId: String(route.params.id) } });
}

function openCancel(s: any) {
  current.value = s;
  changeMode.value = 'cancel';
  form.value = { date: s.date, startTime: s.start_time, endTime: s.end_time, reason: '' };
  showChange.value = true;
}

function openReschedule(s: any) {
  current.value = s;
  changeMode.value = 'reschedule';
  form.value = { date: s.date, startTime: s.start_time, endTime: s.end_time, reason: '' };
  showChange.value = true;
}

async function submitChange() {
  if (!current.value) return;
  try {
    if (changeMode.value === 'cancel') {
      await api.post(`/api/admin/sessions/${current.value.id}/cancel`, { reason: form.value.reason });
      toast('已停课', 'success');
    } else {
      await api.post(`/api/admin/sessions/${current.value.id}/reschedule`, form.value);
      toast('已调课', 'success');
    }
    showChange.value = false;
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  }
}
</script>

<template>
  <div v-if="data">
    <div class="mb-4 flex items-center gap-3">
      <button class="btn btn-ghost btn-sm" @click="router.push('/admin/courses')">← 返回</button>
      <div class="text-[20px] font-semibold">{{ data.name }}</div>
      <span class="badge badge-blue">{{ data.term }}</span>
      <div class="ml-auto flex gap-2">
        <button class="btn btn-secondary btn-sm" @click="goSchedule">排课</button>
      </div>
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="card card-pad"><div class="text-[13px] text-ink-2">已报名</div><div class="text-[24px] font-semibold">{{ data.enrolled }} / {{ data.capacity }}</div></div>
      <div class="card card-pad"><div class="text-[13px] text-ink-2">课次</div><div class="text-[24px] font-semibold">{{ data.sessionCount }}</div></div>
      <div class="card card-pad"><div class="text-[13px] text-ink-2">费用</div><div class="text-[24px] font-semibold">{{ yuan(data.price_cents) }}</div></div>
      <div class="card card-pad"><div class="text-[13px] text-ink-2">授课教师</div><div class="text-[24px] font-semibold">{{ data.teacherName || '—' }}</div></div>
    </div>

    <div class="card mb-4 card-pad">
      <div class="mb-2 text-[15px] font-medium">课程信息</div>
      <p class="text-[14px] text-ink-2">{{ data.description || '暂无简介' }}</p>
      <p class="mt-2 text-[13px] text-ink-3">退课规则：{{ data.refund_note || '未设置' }}</p>
    </div>

    <div class="card">
      <div class="flex items-center justify-between border-b border-line px-4 py-3">
        <div class="text-[15px] font-medium">课次安排</div>
        <div class="text-[13px] text-ink-3">共 {{ sessions.length }} 节</div>
      </div>
      <table class="table-base">
        <thead><tr><th>日期</th><th>星期</th><th>时间</th><th>教学班</th><th>地点</th><th>状态</th><th></th></tr></thead>
        <tbody>
          <tr v-for="s in sessions" :key="s.id">
            <td>{{ s.date }}</td>
            <td class="text-ink-2">周{{ wd[s.weekday] }}</td>
            <td>{{ s.start_time }}–{{ s.end_time }}</td>
            <td class="text-ink-2">{{ s.groupName }}</td>
            <td class="text-ink-2">{{ s.room || '—' }}</td>
            <td>
              <span class="badge" :class="s.status === 'done' ? 'badge-green' : s.status === 'cancelled' ? 'badge-red' : 'badge-gray'">
                {{ s.status === 'done' ? '已完成' : s.status === 'cancelled' ? '已停课' : '待上课' }}
              </span>
            </td>
            <td class="whitespace-nowrap text-right">
              <template v-if="s.status === 'planned'">
                <button class="btn btn-ghost btn-sm" @click="openReschedule(s)">调课</button>
                <button class="btn btn-ghost btn-sm text-danger" @click="openCancel(s)">停课</button>
              </template>
              <span v-else class="text-[12px] text-ink-3">—</span>
            </td>
          </tr>
          <tr v-if="!sessions.length"><td colspan="7" class="py-10 text-center text-ink-3">还没有排课</td></tr>
        </tbody>
      </table>
    </div>

    <Modal
      :show="showChange"
      :title="changeMode === 'cancel' ? '停课确认' : '调课'"
      @close="showChange = false"
    >
      <div v-if="current" class="mb-3 rounded-lg bg-[#f7f8fa] p-3 text-[13px] text-ink-2">
        原安排：{{ current.date }} 周{{ wd[current.weekday] }} {{ current.start_time }}–{{ current.end_time }}
      </div>
      <template v-if="changeMode === 'reschedule'">
        <div class="field"><label class="label">新日期</label><input v-model="form.date" type="date" class="input" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="field"><label class="label">开始</label><input v-model="form.startTime" type="time" class="input" /></div>
          <div class="field"><label class="label">结束</label><input v-model="form.endTime" type="time" class="input" /></div>
        </div>
      </template>
      <div class="field">
        <label class="label">{{ changeMode === 'cancel' ? '停课原因' : '调课原因' }}</label>
        <input v-model="form.reason" class="input" placeholder="如 教师请假 / 场地占用" />
      </div>
      <p v-if="changeMode === 'cancel'" class="text-[12px] text-ink-3">停课后该课次不计入考勤，家长端不再显示。</p>
      <template #footer>
        <button class="btn btn-secondary btn-sm" @click="showChange = false">取消</button>
        <button class="btn btn-sm" :class="changeMode === 'cancel' ? 'btn-danger' : 'btn-primary'" @click="submitChange">
          {{ changeMode === 'cancel' ? '确认停课' : '确认调课' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
