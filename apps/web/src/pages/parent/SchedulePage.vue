<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../../lib/api';
import { currentChild } from '../../lib/auth';
import { toast } from '../../lib/toast';
import Modal from '../../ui/Modal.vue';

const rows = ref<any[]>([]);
const loading = ref(true);
const showLeave = ref(false);
const target = ref<any>(null);
const reason = ref('');
const submitting = ref(false);

const today = computed(() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});

async function load() {
  const id = currentChild.value?.id;
  if (!id) return;
  loading.value = true;
  try {
    rows.value = await api.get<any[]>(`/api/parent/schedule?studentId=${id}`);
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(currentChild, load);

const wd = ['', '一', '二', '三', '四', '五', '六', '日'];

const grouped = computed(() => {
  const m = new Map<string, any[]>();
  for (const r of rows.value) {
    const key = r.date;
    const list = m.get(key) ?? [];
    list.push(r);
    m.set(key, list);
  }
  return [...m.entries()].slice(0, 30);
});

function openLeave(s: any) {
  target.value = s;
  reason.value = '';
  showLeave.value = true;
}

async function submitLeave() {
  if (!currentChild.value || !target.value) return;
  submitting.value = true;
  try {
    await api.post('/api/parent/leaves', {
      studentId: currentChild.value.id,
      sessionId: target.value.id,
      reason: reason.value,
    });
    toast('请假已提交，老师点名时会自动标记', 'success');
    showLeave.value = false;
    await load();
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <div class="mb-3 text-[18px] font-semibold">我的课表</div>

    <div class="space-y-3">
      <div v-for="[date, list] in grouped" :key="date" class="card p-4">
        <div class="mb-2 text-[13px] text-ink-3">{{ date }} · 周{{ wd[list[0].weekday] }}</div>
        <div v-for="s in list" :key="s.id" class="mb-2 border-b border-[#f2f3f5] pb-2 last:mb-0 last:border-0 last:pb-0">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-[14px] font-medium">
                {{ s.courseName }}
                <span v-if="s.leaveStatus === 'approved'" class="ml-1.5 badge badge-blue">已请假</span>
              </div>
              <div class="text-[12px] text-ink-3">{{ s.room || '教室待定' }} · {{ s.teacherName || '' }}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[13px] text-ink-2">{{ s.start_time }}–{{ s.end_time }}</span>
              <button
                v-if="s.date >= today && s.leaveStatus !== 'approved'"
                class="btn btn-ghost btn-sm"
                @click="openLeave(s)"
              >
                请假
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!loading && !grouped.length" class="card py-14 text-center text-[13px] text-ink-3">暂无课程安排</div>
    </div>

    <Modal :show="showLeave" title="请假" @close="showLeave = false">
      <div v-if="target" class="mb-3 rounded-lg bg-[#f7f8fa] p-3 text-[13px] text-ink-2">
        {{ target.courseName }} · {{ target.date }} {{ target.start_time }}–{{ target.end_time }}
      </div>
      <div class="field">
        <label class="label">请假原因（选填）</label>
        <input v-model="reason" class="input" placeholder="如 身体不适 / 家中有事" />
      </div>
      <p class="text-[12px] text-ink-3">提交后立即生效，老师点名时该学生会自动标记为「请假」。</p>
      <template #footer>
        <button class="btn btn-secondary btn-sm" @click="showLeave = false">取消</button>
        <button class="btn btn-primary btn-sm" :disabled="submitting" @click="submitLeave">
          {{ submitting ? '提交中…' : '确认请假' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
