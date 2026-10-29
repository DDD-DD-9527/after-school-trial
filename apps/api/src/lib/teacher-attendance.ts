import { z } from 'zod';
import { HttpError } from '../auth.js';

export const attendanceStatuses = ['pending','in_progress','present','late','early','late_early','unrecorded','missing_checkout','absent','leave'] as const;
export type TeacherAttendanceStatus = typeof attendanceStatuses[number];
export const correctionSchema = z.object({
  status: z.enum(['present','late','early','late_early','absent','leave']),
  reason: z.string().trim().min(1,'请填写更正原因').max(200,'更正原因最多200字'),
}).strict();
const positiveInt = z.coerce.number().int().positive();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'日期格式应为YYYY-MM-DD').refine((date) => {
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0,10) === date;
},'日期不合法');
const dateFields = { from: dateSchema.optional(), to: dateSchema.optional() };
const teacherQuery = z.object(dateFields).strict();
const adminQuery = z.object({ ...dateFields, teacherId: positiveInt.optional(), status: z.enum(attendanceStatuses).optional(), page: positiveInt.default(1), size: positiveInt.max(200).default(20) }).strict();
export const sessionIdSchema = positiveInt;
export const rules = { checkInMinutesBefore: 30, checkOutMinutesAfter: 120 } as const;
const MINUTE = 60_000;

/** Persist instants with an explicit offset; schedule dates/times are Asia/Shanghai. */
export function shanghaiTimestamp(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * MINUTE).toISOString().slice(0,-1) + '+08:00';
}
export function shanghaiToday(date: Date): string { return shanghaiTimestamp(date).slice(0,10); }
export function sessionInstant(date: string, time: string): number { return Date.parse(`${date}T${time}:00+08:00`); }

export interface AttendanceQuery { from: string; to: string; teacherId?: number; status?: TeacherAttendanceStatus; page: number; size: number }
export function parseAttendanceQuery(query: unknown, now: Date, admin = false): AttendanceQuery {
  const parsed = (admin ? adminQuery : teacherQuery).parse(query) as Partial<AttendanceQuery>;
  const today = shanghaiToday(now);
  const from = parsed.from ?? `${today.slice(0,7)}-01`;
  const month = Number(today.slice(5,7));
  const last = new Date(Date.UTC(Number(today.slice(0,4)), month, 0)).toISOString().slice(0,10);
  const to = parsed.to ?? last;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days < 1) throw new HttpError(400,'BAD_RANGE','开始日期不能晚于结束日期');
  if (days > 366) throw new HttpError(400,'BAD_RANGE','查询范围最多366天');
  return { ...parsed, from, to, page: parsed.page ?? 1, size: parsed.size ?? 20 };
}

export interface AttendanceJoined {
  session_id: number;
  teacher_id: number | null;
  teacher_name: string | null;
  course_name: string;
  group_name: string;
  room: string | null;
  date: string;
  start_time: string;
  end_time: string;
  session_status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  override_status: TeacherAttendanceStatus | null;
  reason: string | null;
}
export interface AttendanceItem {
  sessionId: number;
  teacherId: number | null;
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

export function attendanceItem(row: AttendanceJoined, now: Date): AttendanceItem {
  const start = sessionInstant(row.date,row.start_time);
  const end = sessionInstant(row.date,row.end_time);
  const nowMs = now.getTime();
  const checkedIn = row.check_in_at ? Date.parse(row.check_in_at) : null;
  const checkedOut = row.check_out_at ? Date.parse(row.check_out_at) : null;
  const lateMinutes = checkedIn === null ? 0 : Math.max(0,Math.ceil((checkedIn - start) / MINUTE));
  const earlyMinutes = checkedOut === null ? 0 : Math.max(0,Math.ceil((end - checkedOut) / MINUTE));
  const canSelf = !row.override_status && row.session_status !== 'cancelled' && !!row.teacher_id;
  const canCheckIn = canSelf && checkedIn === null && nowMs >= start - rules.checkInMinutesBefore * MINUTE && nowMs < end;
  const canCheckOut = canSelf && checkedIn !== null && checkedOut === null && nowMs >= checkedIn && nowMs <= end + rules.checkOutMinutesAfter * MINUTE;
  let status: TeacherAttendanceStatus;
  if (row.override_status) status = row.override_status;
  else if (checkedOut !== null) status = lateMinutes ? (earlyMinutes ? 'late_early' : 'late') : (earlyMinutes ? 'early' : 'present');
  else if (checkedIn !== null) status = nowMs > end + rules.checkOutMinutesAfter * MINUTE ? 'missing_checkout' : 'in_progress';
  else status = nowMs >= end ? 'unrecorded' : 'pending';
  let actionHint = '已完成签到签退';
  if (row.session_status === 'cancelled') actionHint = '课次已停课';
  else if (row.override_status) actionHint = '教务已更正考勤，如有疑问请联系教务';
  else if (status === 'pending') actionHint = canCheckIn ? '可以签到' : '尚未到签到时间';
  else if (status === 'in_progress') actionHint = lateMinutes ? `已迟到${lateMinutes}分钟，请在下课后签退` : '已签到，请在下课后签退';
  else if (status === 'unrecorded') actionHint = '已超过签到时间，请联系教务处理';
  else if (status === 'missing_checkout') actionHint = '已超过签退时间，请联系教务处理';
  return {
    sessionId: row.session_id, teacherId: row.teacher_id, teacherName: row.teacher_name ?? '',
    courseName: row.course_name, groupName: row.group_name, room: row.room, date: row.date,
    startTime: row.start_time, endTime: row.end_time, sessionStatus: row.session_status,
    status, checkInAt: row.check_in_at, checkOutAt: row.check_out_at, lateMinutes, earlyMinutes,
    reason: row.reason, source: row.override_status ? 'admin' : checkedIn !== null ? 'self' : null,
    canCheckIn, canCheckOut, actionHint,
  };
}

export function summarizeAttendance(items: AttendanceItem[]) {
  const summary = { total: items.length, checkedIn: 0, completed: 0, abnormal: 0, leave: 0, pending: 0 };
  for (const item of items) {
    if (item.checkInAt) summary.checkedIn++;
    if (['present','late','early','late_early'].includes(item.status)) summary.completed++;
    if (['late','early','late_early','unrecorded','missing_checkout','absent'].includes(item.status) || (item.status === 'in_progress' && item.lateMinutes > 0)) summary.abnormal++;
    if (item.status === 'leave') summary.leave++;
    if (item.status === 'pending' || item.status === 'in_progress') summary.pending++;
  }
  return summary;
}

const statusLabels: Record<TeacherAttendanceStatus,string> = { pending:'待签到',in_progress:'已签到待签退',present:'正常',late:'迟到',early:'早退',late_early:'迟到且早退',unrecorded:'未记录',missing_checkout:'缺签退',absent:'缺勤',leave:'请假' };
function csvCell(input: unknown): string {
  const value = String(input ?? '');
  // Quoting alone does not stop spreadsheet formula execution.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"','""')}"`;
}
export function attendanceCsv(items: AttendanceItem[]): string {
  const header = ['课次ID','教师','课程','教学班','教室','日期','开始时间','结束时间','考勤状态','签到时间','签退时间','迟到分钟','早退分钟','来源','更正原因'];
  const rows = items.map((r) => [r.sessionId,r.teacherName,r.courseName,r.groupName,r.room,r.date,r.startTime,r.endTime,statusLabels[r.status],r.checkInAt,r.checkOutAt,r.lateMinutes,r.earlyMinutes,r.source === 'admin' ? '教务更正' : r.source === 'self' ? '自主打卡' : '',r.reason]);
  return '\uFEFF' + [header,...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
