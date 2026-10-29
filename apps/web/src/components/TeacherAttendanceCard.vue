<script setup lang="ts">
import { ref, watch } from 'vue';
import AppConfirm from '../ui/AppConfirm.vue';
import AppIcon from '../ui/AppIcon.vue';
import {
  attendanceBadge, attendanceLabel, attendanceSource, attendanceTime, sessionEndTime,
  type AttendanceAction, type TeacherAttendanceRow,
} from '../lib/teacherAttendance';

const props = defineProps<{ record: TeacherAttendanceRow; busy?: boolean; now: string }>();
const emit = defineEmits<{ (event: 'action', action: AttendanceAction): void }>();
const showEarlyConfirm = ref(false);
const showLateConfirm = ref(false);
let clockReceivedAt = Date.now();
watch(() => props.now, () => { clockReceivedAt = Date.now(); });
watch(() => props.record.sessionId, () => { showEarlyConfirm.value = false; showLateConfirm.value = false; });

function checkIn() {
  if (props.busy || !props.record.canCheckIn) return;
  const serverNow = Date.parse(props.now) + (Date.now() - clockReceivedAt);
  const start = Date.parse(`${props.record.date}T${props.record.startTime}+08:00`);
  if (serverNow > start) showLateConfirm.value = true;
  else emit('action', 'check-in');
}

function confirmLate() {
  if (props.busy || !props.record.canCheckIn) return;
  showLateConfirm.value = false;
  emit('action', 'check-in');
}

function checkOut() {
  if (props.busy || !props.record.canCheckOut) return;
  const serverNow = Date.parse(props.now) + (Date.now() - clockReceivedAt);
  if (serverNow < sessionEndTime(props.record)) showEarlyConfirm.value = true;
  else emit('action', 'check-out');
}

function confirmEarly() {
  if (props.busy || !props.record.canCheckOut) return;
  showEarlyConfirm.value = false;
  emit('action', 'check-out');
}
</script>

<template>
  <div class="rounded-xl border border-[#e5eaf5] bg-[#f7f9fd] p-3.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1.5 text-[13px] font-semibold"><AppIcon name="user" :size="16" />本人考勤</span>
      <span class="badge" :class="attendanceBadge(record.status)">{{ attendanceLabel(record.status) }}</span>
    </div>
    <p v-if="record.source === 'admin'" class="mt-2 text-[11px] leading-relaxed text-brand">以上为教务更正后的最终状态，以下保留原始打卡时间。</p>
    <div class="mt-3 grid grid-cols-2 gap-3 text-[12px]">
      <div><div class="text-ink-3">签到时间</div><div class="mt-1 break-words text-ink-2">{{ attendanceTime(record.checkInAt) }}</div></div>
      <div><div class="text-ink-3">签退时间</div><div class="mt-1 break-words text-ink-2">{{ attendanceTime(record.checkOutAt) }}</div></div>
    </div>
    <div v-if="record.lateMinutes || record.earlyMinutes" class="mt-2 flex flex-wrap gap-3 text-[12px]" :class="record.source === 'admin' ? 'text-ink-3' : 'text-warn'">
      <span v-if="record.lateMinutes">{{ record.source === 'admin' ? '原始签到迟到' : '迟到' }} {{ record.lateMinutes }} 分钟</span>
      <span v-if="record.earlyMinutes">{{ record.source === 'admin' ? '原始签退早退' : '早退' }} {{ record.earlyMinutes }} 分钟</span>
    </div>
    <div v-if="record.source" class="mt-2 text-[12px] text-ink-3">记录来源：{{ attendanceSource(record.source) }}</div>
    <div v-if="record.reason" class="mt-2 break-words text-[12px] leading-relaxed text-ink-2">更正备注：{{ record.reason }}</div>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button v-if="record.canCheckIn" class="btn btn-primary min-h-10" :disabled="busy" @click="checkIn"><AppIcon name="check-circle" :size="17" />{{ busy ? '提交中…' : '本人签到' }}</button>
      <button v-if="record.canCheckOut" class="btn btn-primary min-h-10" :disabled="busy" @click="checkOut"><AppIcon name="log-out" :size="17" />{{ busy ? '提交中…' : '本人签退' }}</button>
      <span class="text-[12px] leading-relaxed text-ink-3">{{ record.actionHint }}</span>
    </div>
    <AppConfirm :show="showLateConfirm" title="确认迟到签到" confirm-text="确认签到" :message="`本课次已于 ${record.startTime} 开始，现在签到会记录迟到。确认继续吗？`" :loading="busy" @close="showLateConfirm = false" @confirm="confirmLate" />
    <AppConfirm
      :show="showEarlyConfirm" title="确认提前签退" confirm-text="确认签退" danger
      :message="`本课次将于 ${record.endTime} 下课，现在签退会记录为早退。确认继续吗？`"
      :loading="busy" @close="showEarlyConfirm = false" @confirm="confirmEarly"
    />
  </div>
</template>
