import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { HttpError, requireAuth } from '../auth.js';
import { notifyCourseParents } from '../lib/notify.js';

const guard = { preHandler: requireAuth('admin') };

interface ScheduleInput {
  courseId: number;
  groupId?: number | null;
  weekdays: number[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  room?: string | null;
}

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function fmt(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function toMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function datesBetween(startDate: string, endDate: string, weekdays: number[]): string[] {
  const s = parseDate(startDate);
  const e = parseDate(endDate);
  if (s > e) throw new HttpError(400, 'BAD_INPUT', '开始日期不能晚于结束日期');
  if ((e.getTime() - s.getTime()) / 86400000 > 400) throw new HttpError(400, 'TOO_LONG', '排课范围不要超过一年');
  const out: string[] = [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay() === 0 ? 7 : d.getDay();
    if (weekdays.includes(wd)) out.push(fmt(d));
  }
  return out;
}

async function findConflicts(input: ScheduleInput): Promise<Array<{ date: string; message: string }>> {
  const course = await db
    .selectFrom('courses as c')
    .leftJoin('class_groups as g', 'g.course_id', 'c.id')
    .select(['c.teacher_id', 'g.room as groupRoom', 'g.teacher_id as groupTeacher'])
    .where('c.id', '=', input.courseId)
    .executeTakeFirst();
  if (!course) throw new HttpError(404, 'NOT_FOUND', '课程不存在');

  const teacherId = course.groupTeacher ?? course.teacher_id;
  const room = input.room ?? course.groupRoom ?? null;
  const dates = datesBetween(input.startDate, input.endDate, input.weekdays);
  if (dates.length === 0) return [];

  const existing = await db
    .selectFrom('sessions as s')
    .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
    .leftJoin('teachers as t', 't.id', 'g.teacher_id')
    .select(['s.date', 's.start_time', 's.end_time', 'g.room', 'g.teacher_id', 't.name as teacherName'])
    .where('s.date', '>=', input.startDate)
    .where('s.date', '<=', input.endDate)
    .where('s.status', '!=', 'cancelled')
    .execute();

  const startMin = toMin(input.startTime);
  const endMin = toMin(input.endTime);
  const conflicts: Array<{ date: string; message: string }> = [];

  for (const d of dates) {
    for (const e of existing) {
      if (e.date !== d) continue;
      const overlap = startMin < toMin(e.end_time) && toMin(e.start_time) < endMin;
      if (!overlap) continue;
      if (teacherId && e.teacher_id === teacherId) {
        conflicts.push({ date: d, message: `教师时间冲突：${e.teacherName ?? '该教师'} 已有 ${e.start_time}-${e.end_time}` });
      } else if (room && e.room === room) {
        conflicts.push({ date: d, message: `场地冲突：${room} 已被占用 ${e.start_time}-${e.end_time}` });
      }
    }
  }
  return conflicts;
}

export async function scheduleRoutes(app: FastifyInstance) {
  app.post('/api/admin/schedule/preview', guard, async (req) => {
    const b = req.body as any;
    const input: ScheduleInput = {
      courseId: num(b.courseId),
      groupId: b.groupId ? num(b.groupId) : null,
      weekdays: Array.isArray(b.weekdays) ? b.weekdays.map((x: unknown) => num(x)) : [],
      startDate: String(b.startDate || ''),
      endDate: String(b.endDate || ''),
      startTime: String(b.startTime || ''),
      endTime: String(b.endTime || ''),
      room: b.room ? String(b.room) : null,
    };
    if (!input.courseId) throw new HttpError(400, 'BAD_INPUT', '请选择课程');
    if (input.weekdays.length === 0) throw new HttpError(400, 'BAD_INPUT', '请选择星期');
    if (!input.startDate || !input.endDate) throw new HttpError(400, 'BAD_INPUT', '请选择日期范围');
    if (toMin(input.endTime) <= toMin(input.startTime)) throw new HttpError(400, 'BAD_INPUT', '结束时间必须晚于开始时间');

    const dates = datesBetween(input.startDate, input.endDate, input.weekdays);
    const conflicts = await findConflicts(input);
    return { dates, count: dates.length, conflicts, ok: conflicts.length === 0 };
  });

  app.post('/api/admin/schedule/generate', guard, async (req) => {
    const b = req.body as any;
    const input: ScheduleInput = {
      courseId: num(b.courseId),
      groupId: b.groupId ? num(b.groupId) : null,
      weekdays: Array.isArray(b.weekdays) ? b.weekdays.map((x: unknown) => num(x)) : [],
      startDate: String(b.startDate || ''),
      endDate: String(b.endDate || ''),
      startTime: String(b.startTime || ''),
      endTime: String(b.endTime || ''),
      room: b.room ? String(b.room) : null,
    };
    const conflicts = await findConflicts(input);
    if (conflicts.length > 0) throw new HttpError(409, 'CONFLICT', `存在 ${conflicts.length} 处冲突，请先调整`);

    let groupId = input.groupId;
    if (!groupId) {
      const g = await db.selectFrom('class_groups').selectAll().where('course_id', '=', input.courseId).executeTakeFirst();
      if (!g) throw new HttpError(400, 'BAD_INPUT', '该课程还没有教学班');
      groupId = g.id;
    }
    const dates = datesBetween(input.startDate, input.endDate, input.weekdays);
    let created = 0;
    for (const d of dates) {
      const wd = parseDate(d).getDay() === 0 ? 7 : parseDate(d).getDay();
      try {
        await db
          .insertInto('sessions')
          .values({
            class_group_id: groupId,
            course_id: input.courseId,
            date: d,
            weekday: wd,
            start_time: input.startTime,
            end_time: input.endTime,
            status: 'planned',
          })
          .execute();
        created++;
      } catch {
        // 唯一索引：已存在则跳过
      }
    }
    return { created, total: dates.length };
  });

  app.get('/api/admin/sessions', guard, async (req) => {
    const q = req.query as any;
    let query = db
      .selectFrom('sessions as s')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .leftJoin('teachers as t', 't.id', 'g.teacher_id')
      .select([
        's.id',
        's.course_id',
        's.date',
        's.weekday',
        's.start_time',
        's.end_time',
        's.status',
        'c.name as courseName',
        'g.name as groupName',
        'g.room',
        't.name as teacherName',
      ])
      .orderBy('s.date')
      .orderBy('s.start_time');
    if (q.date) query = query.where('s.date', '=', String(q.date));
    if (q.courseId) query = query.where('s.course_id', '=', num(q.courseId));
    if (q.from) query = query.where('s.date', '>=', String(q.from));
    if (q.to) query = query.where('s.date', '<=', String(q.to));
    return query.limit(500).execute();
  });

  // 停课
  app.post('/api/admin/sessions/:id/cancel', guard, async (req) => {
    const id = num((req.params as any).id);
    const reason = String((req.body as any)?.reason || '');
    const s = await db.selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirst();
    if (!s) throw new HttpError(404, 'NOT_FOUND', '课次不存在');
    if (s.status === 'cancelled') throw new HttpError(400, 'BAD_STATE', '该课次已停课');
    if (s.status === 'done') throw new HttpError(400, 'BAD_STATE', '已完成的课次不能停课，请走更正流程');

    await db.updateTable('sessions').set({ status: 'cancelled' }).where('id', '=', id).execute();
    await db
      .insertInto('session_changes')
      .values({ session_id: id, type: 'cancel', before_data: JSON.stringify(s), after_data: null, reason })
      .execute();
    const c = await db.selectFrom('courses').select(['name']).where('id', '=', s.course_id).executeTakeFirst();
    await notifyCourseParents(s.course_id, {
      type: 'session_cancel',
      title: '课次停课',
      body: `「${c?.name ?? '课程'}」${s.date} ${s.start_time}-${s.end_time} 的课已停课${reason ? '，原因：' + reason : ''}`,
      link: '/parent/schedule',
    });
    return { ok: true };
  });

  // 调课
  app.post('/api/admin/sessions/:id/reschedule', guard, async (req) => {
    const id = num((req.params as any).id);
    const b = req.body as any;
    const date = String(b?.date || '');
    const startTime = String(b?.startTime || '');
    const endTime = String(b?.endTime || '');
    const reason = String(b?.reason || '');

    if (!date || !startTime || !endTime) throw new HttpError(400, 'BAD_INPUT', '请选择新的日期和时间');
    if (toMin(endTime) <= toMin(startTime)) throw new HttpError(400, 'BAD_INPUT', '结束时间必须晚于开始时间');

    const s = await db.selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirst();
    if (!s) throw new HttpError(404, 'NOT_FOUND', '课次不存在');
    if (s.status === 'cancelled') throw new HttpError(400, 'BAD_STATE', '已停课的课次不能调课');
    if (s.status === 'done') throw new HttpError(400, 'BAD_STATE', '已完成的课次不能调课');

    const g = await db
      .selectFrom('class_groups')
      .selectAll()
      .where('id', '=', s.class_group_id)
      .executeTakeFirst();

    const sameDay = await db
      .selectFrom('sessions as s')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .select(['s.id', 's.start_time', 's.end_time', 'g.teacher_id', 'g.room'])
      .where('s.date', '=', date)
      .where('s.id', '!=', id)
      .where('s.status', '!=', 'cancelled')
      .execute();

    const overlap = sameDay.filter((c) => toMin(startTime) < toMin(c.end_time) && toMin(c.start_time) < toMin(endTime));
    const tHit = g?.teacher_id ? overlap.find((c) => c.teacher_id === g.teacher_id) : null;
    if (tHit) throw new HttpError(409, 'CONFLICT', `教师在该时段已有课次 ${tHit.start_time}-${tHit.end_time}`);
    const rHit = g?.room ? overlap.find((c) => c.room === g.room) : null;
    if (rHit) throw new HttpError(409, 'CONFLICT', `教室 ${g?.room} 在该时段已被占用`);

    const wd = parseDate(date).getDay() === 0 ? 7 : parseDate(date).getDay();
    await db
      .updateTable('sessions')
      .set({ date, weekday: wd, start_time: startTime, end_time: endTime, status: 'planned' })
      .where('id', '=', id)
      .execute();
    await db
      .insertInto('session_changes')
      .values({
        session_id: id,
        type: 'reschedule',
        before_data: JSON.stringify({ date: s.date, start_time: s.start_time, end_time: s.end_time }),
        after_data: JSON.stringify({ date, start_time: startTime, end_time: endTime }),
        reason,
      })
      .execute();
    const c = await db.selectFrom('courses').select(['name']).where('id', '=', s.course_id).executeTakeFirst();
    await notifyCourseParents(s.course_id, {
      type: 'session_reschedule',
      title: '课次调整',
      body: `「${c?.name ?? '课程'}」原 ${s.date} ${s.start_time}-${s.end_time} 调整为 ${date} ${startTime}-${endTime}`,
      link: '/parent/schedule',
    });
    return { ok: true };
  });

  // 课次变更记录
  app.get('/api/admin/sessions/:id/changes', guard, async (req) => {
    const id = num((req.params as any).id);
    return db.selectFrom('session_changes').selectAll().where('session_id', '=', id).orderBy('id', 'desc').execute();
  });
}
