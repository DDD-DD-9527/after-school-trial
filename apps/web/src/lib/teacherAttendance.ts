export type TeacherAttendanceStatus =
  | 'pending' | 'in_progress' | 'present' | 'late' | 'early' | 'late_early'
  | 'unrecorded' | 'missing_checkout' | 'absent' | 'leave';

export type AttendanceAction = 'check-in' | 'check-out';
export type CorrectionStatus = 'present' | 'late' | 'early' | 'late_early' | 'absent' | 'leave';

export interface TeacherAttendanceRow {
  sessionId: number;
  teacherId: number;
  teacherName: string;
  courseName: string;
  groupName: string;
  room: string | null;
  date: string;
  startTime: string;
  endTime: string;
  sessionStatus: string;
  status: TeacherAttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  earlyMinutes: number;
  reason: string | null;
  source: 'self' | 'admin' | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
  actionHint: string;
}

export interface AttendanceSummary {
  total: number;
  checkedIn: number;
  completed: number;
  abnormal: number;
  leave: number;
  pending: number;
}

export interface TeacherAttendanceResponse {
  today: string;
  now: string;
  rules: { checkInMinutesBefore: number; checkOutMinutesAfter: number };
  items: TeacherAttendanceRow[];
  total: number;
  summary: AttendanceSummary;
}

export interface AttendanceHistory {
  id: number;
  action: string;
  actorName: string;
  reason: string | null;
  beforeStatus: TeacherAttendanceStatus | null;
  afterStatus: TeacherAttendanceStatus;
  createdAt: string;
}

export const attendanceLabels: Record<TeacherAttendanceStatus, string> = {
  pending: '待签到', in_progress: '已签到待签退', present: '正常', late: '迟到',
  early: '早退', late_early: '迟到且早退', unrecorded: '未记录',
  missing_checkout: '漏签退', absent: '缺勤', leave: '请假',
};

export const correctionOptions: Array<{ value: CorrectionStatus; label: string }> =
  (['present', 'late', 'early', 'late_early', 'absent', 'leave'] as CorrectionStatus[])
    .map((value) => ({ value, label: attendanceLabels[value] }));

export const attendanceStatusOptions = [
  { value: '', label: '全部状态' },
  ...Object.entries(attendanceLabels).map(([value, label]) => ({ value, label })),
];

export function attendanceLabel(status: string | null | undefined): string {
  return status ? attendanceLabels[status as TeacherAttendanceStatus] ?? status : '—';
}

export function attendanceBadge(status: TeacherAttendanceStatus): string {
  if (status === 'present') return 'badge-green';
  if (status === 'in_progress' || status === 'leave') return 'badge-blue';
  if (status === 'pending') return 'badge-gray';
  if (status === 'absent' || status === 'unrecorded' || status === 'missing_checkout') return 'badge-red';
  return 'badge-orange';
}

export function attendanceSource(source: TeacherAttendanceRow['source']): string {
  return source === 'admin' ? '管理员更正' : source === 'self' ? '本人打卡' : '—';
}

export function beijingDate(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function attendanceTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

export function attendanceRange(preset: 'today' | 'week' | 'month', today = beijingDate()) {
  const date = new Date(`${today}T12:00:00+08:00`);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'month') {
    const [year, month] = today.split('-').map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${last}` };
  }
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = date.getTime() - ((weekday + 6) % 7) * 86400000;
  return { from: beijingDate(monday), to: beijingDate(monday + 6 * 86400000) };
}

export function sessionEndTime(row: TeacherAttendanceRow): number {
  return Date.parse(`${row.date}T${row.endTime}+08:00`);
}

export function canCorrectAttendance(row: TeacherAttendanceRow, serverNow: string): boolean {
  return row.sessionStatus !== 'cancelled' && Number.isFinite(sessionEndTime(row))
    && Date.parse(serverNow) >= sessionEndTime(row);
}

export function historyAction(action: string): string {
  const labels: Record<string, string> = {
    'check-in': '本人签到', check_in: '本人签到', checkin: '本人签到',
    'check-out': '本人签退', check_out: '本人签退', checkout: '本人签退',
    override: '考勤更正', correction: '考勤更正', correct: '考勤更正', admin_update: '考勤更正',
  };
  return labels[action] ?? action;
}
