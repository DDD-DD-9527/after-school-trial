import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { db, todayStr } from '../db.js';
import { HttpError, childrenOf, getUser, requireAuth } from '../auth.js';
import { notifyStudentParents, notifyCourseTeacher } from '../lib/notify.js';
import { ensureBill, voidUnpaidBill } from '../lib/billing.js';

const guard = { preHandler: requireAuth('parent') };
const num = (v: unknown, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

async function assertChild(uid: number, studentId: number) {
  const children = await childrenOf(uid);
  if (!children.some((c) => c.id === studentId)) {
    throw new HttpError(403, 'FORBIDDEN', '这不是您监护的孩子');
  }
}

export async function enrollRoutes(app: FastifyInstance) {
  app.get('/api/parent/plans', guard, async (req) => {
    const studentId = num((req.query as any).studentId);
    const plans = await db
      .selectFrom('enroll_plans')
      .selectAll()
      .where('status', '=', 'open')
      .orderBy('id', 'desc')
      .execute();
    const out = [];
    for (const p of plans) {
      const courses = await db
        .selectFrom('enroll_plan_courses as pc')
        .innerJoin('courses as c', 'c.id', 'pc.course_id')
        .leftJoin('teachers as t', 't.id', 'c.teacher_id')
        .select([
          'pc.id as planCourseId',
          'pc.capacity',
          'pc.enrolled',
          'c.id as courseId',
          'c.name',
          'c.description',
          'c.price_cents',
          'c.grade',
          't.name as teacherName',
        ])
        .where('pc.plan_id', '=', p.id)
        .execute();
      const mine = studentId
        ? await db
            .selectFrom('enroll_records')
            .select(['plan_course_id', 'status'])
            .where('student_id', '=', studentId)
            .execute()
        : [];
      out.push({
        ...p,
        courses: courses.map((c) => ({
          ...c,
          remaining: Math.max(0, c.capacity - c.enrolled),
          mine: mine.find((m) => m.plan_course_id === c.planCourseId)?.status ?? null,
        })),
      });
    }
    return out;
  });

  app.get('/api/parent/courses/:id', guard, async (req) => {
    const id = num((req.params as any).id);
    const course = await db
      .selectFrom('courses as c')
      .leftJoin('teachers as t', 't.id', 'c.teacher_id')
      .selectAll('c')
      .select(['t.name as teacherName'])
      .where('c.id', '=', id)
      .executeTakeFirst();
    if (!course) throw new HttpError(404, 'NOT_FOUND', '课程不存在');
    const sessions = await db
      .selectFrom('sessions as s')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .select(['s.id', 's.date', 's.weekday', 's.start_time', 's.end_time', 'g.room'])
      .where('s.course_id', '=', id)
      .where('s.status', '!=', 'cancelled')
      .orderBy('s.date')
      .execute();
    const pc = await db
      .selectFrom('enroll_plan_courses')
      .selectAll()
      .where('course_id', '=', id)
      .executeTakeFirst();
    return { ...course, sessions, planCourseId: pc?.id ?? null, remaining: pc ? Math.max(0, pc.capacity - pc.enrolled) : 0 };
  });

  app.post('/api/parent/enroll', guard, async (req) => {
    const p = getUser(req);
    const b = req.body as any;
    const planCourseId = num(b?.planCourseId);
    const studentId = num(b?.studentId);
    if (!planCourseId || !studentId) throw new HttpError(400, 'BAD_INPUT', '参数不完整');
    await assertChild(p.uid, studentId);

    const pc = await db
      .selectFrom('enroll_plan_courses as pc')
      .innerJoin('enroll_plans as p', 'p.id', 'pc.plan_id')
      .innerJoin('courses as c', 'c.id', 'pc.course_id')
      .select(['pc.id', 'pc.capacity', 'pc.enrolled', 'pc.course_id', 'p.status as planStatus', 'p.start_at', 'p.end_at', 'c.capacity as courseCapacity'])
      .where('pc.id', '=', planCourseId)
      .executeTakeFirst();
    if (!pc) throw new HttpError(404, 'NOT_FOUND', '报名项目不存在');
    if (pc.planStatus !== 'open') throw new HttpError(400, 'PLAN_CLOSED', '报名未开放');
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    if (now < pc.start_at) throw new HttpError(400, 'NOT_STARTED', '报名尚未开始');
    if (now > pc.end_at) throw new HttpError(400, 'ENDED', '报名已结束');

    const dup = await db
      .selectFrom('enroll_records')
      .select('id')
      .where('plan_course_id', '=', planCourseId)
      .where('student_id', '=', studentId)
      .where('status', '=', 'effective')
      .executeTakeFirst();
    if (dup) throw new HttpError(409, 'DUPLICATED', '已经报过这门课了');

    // 时间冲突：按真实日期 + 起止时间比较（相邻不算冲突）
    const newSessions = await db
      .selectFrom('sessions')
      .select(['date', 'start_time', 'end_time'])
      .where('course_id', '=', pc.course_id)
      .where('status', '!=', 'cancelled')
      .where('date', '>=', todayStr())
      .execute();
    const oldSessions = await db
      .selectFrom('sessions as s')
      .innerJoin('enroll_records as r', 'r.course_id', 's.course_id')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .select(['s.date', 's.start_time', 's.end_time', 'c.name as courseName'])
      .where('r.student_id', '=', studentId)
      .where('r.status', '=', 'effective')
      .where('s.status', '!=', 'cancelled')
      .where('s.date', '>=', todayStr())
      .execute();

    const oldByDate = new Map<string, Array<{ s: number; e: number; courseName: string }>>();
    for (const s of oldSessions) {
      const list = oldByDate.get(s.date) ?? [];
      list.push({ s: toMin(s.start_time), e: toMin(s.end_time), courseName: s.courseName });
      oldByDate.set(s.date, list);
    }
    for (const n of newSessions) {
      const list = oldByDate.get(n.date);
      if (!list) continue;
      const ns = toMin(n.start_time);
      const ne = toMin(n.end_time);
      for (const o of list) {
        if (ns < o.e && o.s < ne) {
          throw new HttpError(
            409,
            'TIME_CONFLICT',
            `时间冲突：${n.date} ${n.start_time}-${n.end_time} 与「${o.courseName}」重叠`
          );
        }
      }
    }

    // 原子占位：只有 enrolled < capacity 才能 +1
    const upd = await db
      .updateTable('enroll_plan_courses')
      .set({ enrolled: sql<number>`enrolled + 1` })
      .where('id', '=', planCourseId)
      .where('enrolled', '<', sql<number>`capacity`)
      .executeTakeFirst();
    if (Number(upd.numUpdatedRows ?? 0) === 0) {
      throw new HttpError(409, 'FULL', '名额已满，请选择其他课程');
    }

    try {
      const rec = await db
        .insertInto('enroll_records')
        .values({ plan_course_id: planCourseId, course_id: pc.course_id, student_id: studentId, status: 'effective' })
        .returningAll()
        .executeTakeFirstOrThrow();

      const course = await db.selectFrom('courses').select(['name']).where('id', '=', pc.course_id).executeTakeFirst();
      const child = await db.selectFrom('students').select(['name']).where('id', '=', studentId).executeTakeFirst();
      await ensureBill(rec.id, studentId, pc.course_id);
      await notifyStudentParents(studentId, {
        type: 'enroll',
        title: '报名成功',
        body: `${child?.name ?? '孩子'}已成功报名「${course?.name ?? '课程'}」`,
        link: '/parent/enrollments',
      });

      return { ok: true, record: rec };
    } catch (e) {
      await db
        .updateTable('enroll_plan_courses')
        .set({ enrolled: sql<number>`enrolled - 1` })
        .where('id', '=', planCourseId)
        .execute();
      throw new HttpError(409, 'DUPLICATED', '已经报过这门课了');
    }
  });

  app.get('/api/parent/enrollments', guard, async (req) => {
    const studentId = num((req.query as any).studentId);
    if (!studentId) return [];
    return db
      .selectFrom('enroll_records as r')
      .innerJoin('courses as c', 'c.id', 'r.course_id')
      .innerJoin('class_groups as g', 'g.course_id', 'c.id')
      .leftJoin('teachers as t', 't.id', 'c.teacher_id')
      .select([
        'r.id',
        'r.status',
        'r.created_at',
        'c.name as courseName',
        'c.price_cents',
        'g.room',
        't.name as teacherName',
      ])
      .where('r.student_id', '=', studentId)
      .orderBy('r.created_at', 'desc')
      .execute();
  });

  app.post('/api/parent/enrollments/:id/withdraw', guard, async (req) => {
    const p = getUser(req);
    const id = num((req.params as any).id);
    const rec = await db.selectFrom('enroll_records').selectAll().where('id', '=', id).executeTakeFirst();
    if (!rec) throw new HttpError(404, 'NOT_FOUND', '报名记录不存在');
    await assertChild(p.uid, rec.student_id);
    if (rec.status !== 'effective') throw new HttpError(400, 'BAD_STATE', '当前状态不能退课');
    await db.updateTable('enroll_records').set({ status: 'withdrawn' }).where('id', '=', id).execute();
    await voidUnpaidBill(id);
    await db
      .updateTable('enroll_plan_courses')
      .set({ enrolled: sql<number>`enrolled - 1` })
      .where('id', '=', rec.plan_course_id)
      .where('enrolled', '>', 0)
      .execute();
    return { ok: true };
  });

  app.get('/api/parent/schedule', guard, async (req) => {
    const studentId = num((req.query as any).studentId);
    if (!studentId) return [];
    return db
      .selectFrom('sessions as s')
      .innerJoin('enroll_records as r', 'r.course_id', 's.course_id')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .leftJoin('teachers as t', 't.id', 'g.teacher_id')
      .leftJoin('leave_requests as lv', (join) => join.onRef('lv.session_id', '=', 's.id').on('lv.student_id', '=', studentId))
      .select([
        's.id',
        's.date',
        's.weekday',
        's.start_time',
        's.end_time',
        's.status',
        'c.name as courseName',
        'g.room',
        't.name as teacherName',
        'lv.status as leaveStatus',
      ])
      .where('r.student_id', '=', studentId)
      .where('r.status', '=', 'effective')
      .where('s.status', '!=', 'cancelled')
      .orderBy('s.date')
      .orderBy('s.start_time')
      .limit(300)
      .execute();
  });

  // 请假（试用版：提交即生效）
  app.post('/api/parent/leaves', guard, async (req) => {
    const p = getUser(req);
    const b = req.body as any;
    const studentId = num(b?.studentId);
    const sessionId = num(b?.sessionId);
    const reason = String(b?.reason || '').slice(0, 200);
    if (!studentId || !sessionId) throw new HttpError(400, 'BAD_INPUT', '参数不完整');
    await assertChild(p.uid, studentId);

    const s = await db
      .selectFrom('sessions as s')
      .innerJoin('enroll_records as r', 'r.course_id', 's.course_id')
      .select(['s.id', 's.date', 's.status'])
      .where('s.id', '=', sessionId)
      .where('r.student_id', '=', studentId)
      .where('r.status', '=', 'effective')
      .executeTakeFirst();
    if (!s) throw new HttpError(400, 'NOT_ENROLLED', '没有报名该课次');
    if (s.status === 'cancelled') throw new HttpError(400, 'CANCELLED', '该课次已停课');
    if (s.date < todayStr()) throw new HttpError(400, 'PAST', '已过去的课次不能请假');

    await sql`
      INSERT INTO leave_requests (student_id, session_id, reason, status)
      VALUES (${studentId}, ${sessionId}, ${reason}, 'approved')
      ON CONFLICT(session_id, student_id)
      DO UPDATE SET reason = excluded.reason, status = 'approved'
    `.execute(db);

    const sDetail = await db
      .selectFrom('sessions as s')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .select(['c.id as courseId', 'c.name as courseName', 's.date', 's.start_time', 's.end_time'])
      .where('s.id', '=', sessionId)
      .executeTakeFirst();
    const st = await db.selectFrom('students').select(['name']).where('id', '=', studentId).executeTakeFirst();
    if (sDetail) {
      await notifyCourseTeacher(sDetail.courseId, {
        type: 'leave',
        title: '学生请假',
        body: `${st?.name ?? '学生'} 请假：${sDetail.date} ${sDetail.start_time}-${sDetail.end_time}「${sDetail.courseName}」${reason ? '（' + reason + '）' : ''}`,
      });
    }

    return { ok: true };
  });

  app.get('/api/parent/leaves', guard, async (req) => {
    const studentId = num((req.query as any).studentId);
    if (!studentId) return [];
    return db
      .selectFrom('leave_requests as lv')
      .innerJoin('sessions as s', 's.id', 'lv.session_id')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .select(['lv.id', 'lv.status', 'lv.reason', 'lv.created_at', 's.date', 's.start_time', 's.end_time', 'c.name as courseName'])
      .where('lv.student_id', '=', studentId)
      .orderBy('s.date', 'desc')
      .limit(100)
      .execute();
  });
}

