import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { db, todayStr } from '../db.js';
import { HttpError, getUser, requireAuth } from '../auth.js';

const teacherGuard = { preHandler: requireAuth('teacher') };
const adminGuard = { preHandler: requireAuth('admin') };
const num = (v: unknown, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const VALID = new Set(['present', 'late', 'absent', 'leave', 'early']);

async function teacherIdOf(uid: number): Promise<number> {
  const u = await db.selectFrom('users').select(['teacher_id']).where('id', '=', uid).executeTakeFirst();
  if (!u?.teacher_id) throw new HttpError(403, 'NO_TEACHER', '当前账号未关联教师');
  return u.teacher_id;
}

export async function attendanceRoutes(app: FastifyInstance) {
  app.get('/api/teacher/today', teacherGuard, async (req) => {
    const tid = await teacherIdOf(getUser(req).uid);
    const today = todayStr();
    const rows = await db
      .selectFrom('sessions as s')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .select(['s.id', 's.date', 's.start_time', 's.end_time', 's.status', 'c.id as courseId', 'c.name as courseName', 'g.name as groupName', 'g.room'])
      .where('s.date', '=', today)
      .where('g.teacher_id', '=', tid)
      .where('s.status', '!=', 'cancelled')
      .orderBy('s.start_time')
      .execute();

    const out = [];
    for (const r of rows) {
      const enrolled = await db
        .selectFrom('enroll_records')
        .select((e) => e.fn.countAll<number>().as('c'))
        .where('course_id', '=', r.courseId)
        .where('status', '=', 'effective')
        .executeTakeFirst();
      const marked = await db
        .selectFrom('attendance')
        .select((e) => e.fn.countAll<number>().as('c'))
        .where('session_id', '=', r.id)
        .executeTakeFirst();
      out.push({ ...r, enrolled: Number(enrolled?.c ?? 0), marked: Number(marked?.c ?? 0) });
    }
    return { today, sessions: out };
  });

  app.get('/api/teacher/courses', teacherGuard, async (req) => {
    const tid = await teacherIdOf(getUser(req).uid);
    return db
      .selectFrom('courses as c')
      .innerJoin('class_groups as g', 'g.course_id', 'c.id')
      .select(['c.id', 'c.name', 'c.term', 'c.price_cents', 'g.id as groupId', 'g.name as groupName', 'g.room'])
      .where('g.teacher_id', '=', tid)
      .execute();
  });

  app.get('/api/teacher/sessions/:id', teacherGuard, async (req) => {
    const tid = await teacherIdOf(getUser(req).uid);
    const id = num((req.params as any).id);
    const s = await db
      .selectFrom('sessions as s')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .select([
        's.id',
        's.date',
        's.start_time',
        's.end_time',
        's.status',
        's.course_id',
        'c.name as courseName',
        'g.name as groupName',
        'g.room',
        'g.teacher_id',
      ])
      .where('s.id', '=', id)
      .executeTakeFirst();
    if (!s) throw new HttpError(404, 'NOT_FOUND', '课次不存在');
    if (s.teacher_id !== tid) throw new HttpError(403, 'FORBIDDEN', '不是您的课次');

    const roster = await db
      .selectFrom('enroll_records as r')
      .innerJoin('students as st', 'st.id', 'r.student_id')
      .leftJoin('classes as cl', 'cl.id', 'st.class_id')
      .leftJoin('attendance as a', (join) => join.onRef('a.student_id', '=', 'st.id').on('a.session_id', '=', id))
      .leftJoin('leave_requests as lv', (join) => join.onRef('lv.student_id', '=', 'st.id').on('lv.session_id', '=', id))
      .select(['st.id', 'st.name', 'st.code', 'cl.name as className', 'a.status as attendance', 'lv.status as leaveStatus'])
      .where('r.course_id', '=', s.course_id)
      .where('r.status', '=', 'effective')
      .orderBy('cl.name')
      .orderBy('st.code')
      .execute();

    return { session: s, roster };
  });

  app.post('/api/teacher/sessions/:id/attendance', teacherGuard, async (req) => {
    const tid = await teacherIdOf(getUser(req).uid);
    const id = num((req.params as any).id);
    const s = await db
      .selectFrom('sessions as s')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .select(['s.id', 'g.teacher_id'])
      .where('s.id', '=', id)
      .executeTakeFirst();
    if (!s) throw new HttpError(404, 'NOT_FOUND', '课次不存在');
    if (s.teacher_id !== tid) throw new HttpError(403, 'FORBIDDEN', '不是您的课次');

    const items = ((req.body as any)?.items ?? []) as Array<{ studentId: number; status: string }>;
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'BAD_INPUT', '没有要提交的考勤');
    for (const it of items) {
      if (!VALID.has(it.status)) throw new HttpError(400, 'BAD_INPUT', `未知的考勤状态：${it.status}`);
    }

    for (const it of items) {
      await sql`
        INSERT INTO attendance (session_id, student_id, status, updated_by, updated_at)
        VALUES (${id}, ${num(it.studentId)}, ${it.status}, ${tid}, datetime('now'))
        ON CONFLICT(session_id, student_id)
        DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at
      `.execute(db);
    }
    await db.updateTable('sessions').set({ status: 'done' }).where('id', '=', id).execute();
    return { ok: true, count: items.length };
  });

  app.get('/api/admin/attendance/today', adminGuard, async () => {
    const today = todayStr();
    const rows = await db
      .selectFrom('sessions as s')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .leftJoin('teachers as t', 't.id', 'g.teacher_id')
      .select(['s.id', 's.start_time', 's.end_time', 's.status', 'c.name as courseName', 'g.name as groupName', 'g.room', 't.name as teacherName', 's.course_id'])
      .where('s.date', '=', today)
      .where('s.status', '!=', 'cancelled')
      .orderBy('s.start_time')
      .execute();

    const out = [];
    for (const r of rows) {
      const enrolled = await db
        .selectFrom('enroll_records')
        .select((e) => e.fn.countAll<number>().as('c'))
        .where('course_id', '=', r.course_id)
        .where('status', '=', 'effective')
        .executeTakeFirst();
      const marked = await db
        .selectFrom('attendance')
        .select((e) => e.fn.countAll<number>().as('c'))
        .where('session_id', '=', r.id)
        .executeTakeFirst();
      out.push({ ...r, enrolled: Number(enrolled?.c ?? 0), marked: Number(marked?.c ?? 0) });
    }
    return { today, sessions: out };
  });
}
