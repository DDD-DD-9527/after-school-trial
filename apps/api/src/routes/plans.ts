import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { HttpError, requireAuth } from '../auth.js';
import { assertSchoolRow, schoolIdOf } from '../lib/school-scope.js';

const guard = { preHandler: requireAuth('admin') };
const num = (v: unknown, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

export async function planRoutes(app: FastifyInstance) {
  app.get('/api/admin/plans', guard, async (req) => {
    const schoolId = schoolIdOf(req);
    const plans = await db.selectFrom('enroll_plans').where('school_id', '=', schoolId).selectAll().orderBy('id', 'desc').execute();
    const out = [];
    for (const p of plans) {
      const cs = await db
        .selectFrom('enroll_plan_courses as pc')
        .innerJoin('courses as c', 'c.id', 'pc.course_id').where('c.school_id', '=', schoolId)
        .select(['pc.id', 'pc.course_id', 'pc.capacity', 'pc.enrolled', 'c.name as courseName'])
        .where('pc.plan_id', '=', p.id)
        .execute();
      out.push({ ...p, courses: cs, totalEnrolled: cs.reduce((a, b) => a + b.enrolled, 0) });
    }
    return out;
  });

  app.post('/api/admin/plans', guard, async (req) => {
    const schoolId = schoolIdOf(req);
    const b = req.body as any;
    if (!b?.name) throw new HttpError(400, 'BAD_INPUT', '计划名称必填');
    if (!b?.startAt || !b?.endAt) throw new HttpError(400, 'BAD_INPUT', '请填写起止时间');
    const term = b.term ? String(b.term) : (await db.selectFrom('school').select('term').where('id', '=', schoolId).executeTakeFirstOrThrow()).term;
    const courseIds = [...new Set<number>(Array.isArray(b.courseIds) ? b.courseIds.map((x: unknown) => num(x)) : [])];
    const courses = await Promise.all(courseIds.map((id) => assertSchoolRow('courses', id, schoolId)));
    const plan = await db
      .insertInto('enroll_plans')
      .values({
        school_id: schoolId,
        term,
        name: String(b.name),
        start_at: String(b.startAt),
        end_at: String(b.endAt),
        status: 'draft',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    for (const c of courses) {
      const cid = c.id;
      await db
        .insertInto('enroll_plan_courses')
        .values({ plan_id: plan.id, course_id: cid, capacity: c.capacity, enrolled: 0 })
        .execute();
    }
    return plan;
  });

  app.post('/api/admin/plans/:id/publish', guard, async (req) => {
    const schoolId = schoolIdOf(req);
    const id = num((req.params as any).id);
    await assertSchoolRow('enroll_plans', id, schoolId);
    const cs = await db.selectFrom('enroll_plan_courses').selectAll().where('plan_id', '=', id).execute();
    if (cs.length === 0) throw new HttpError(400, 'NO_COURSE', '请先关联课程');
    await Promise.all(cs.map((link) => assertSchoolRow('courses', link.course_id, schoolId)));
    await db.updateTable('enroll_plans').where('school_id', '=', schoolId).set({ status: 'open' }).where('id', '=', id).execute();
    return { ok: true };
  });

  app.post('/api/admin/plans/:id/pause', guard, async (req) => {
    const schoolId = schoolIdOf(req);
    const id = num((req.params as any).id);
    await assertSchoolRow('enroll_plans', id, schoolId);
    await db.updateTable('enroll_plans').where('school_id', '=', schoolId).set({ status: 'paused' }).where('id', '=', id).execute();
    return { ok: true };
  });

  app.get('/api/admin/plans/:id', guard, async (req) => {
    const schoolId = schoolIdOf(req);
    const id = num((req.params as any).id);
    await assertSchoolRow('enroll_plans', id, schoolId);
    const q = req.query as any;
    const recordsPage = Math.max(1, num(q.recordsPage, 1));
    const recordsSize = Math.min(100, Math.max(5, num(q.recordsSize, 20)));

    const plan = await db.selectFrom('enroll_plans').where('school_id', '=', schoolId).selectAll().where('id', '=', id).executeTakeFirst();
    if (!plan) throw new HttpError(404, 'NOT_FOUND', '计划不存在');
    const courses = await db
      .selectFrom('enroll_plan_courses as pc')
      .innerJoin('courses as c', 'c.id', 'pc.course_id').where('c.school_id', '=', schoolId)
      .leftJoin('teachers as t', (join) => join.onRef('t.id', '=', 'c.teacher_id').on('t.school_id', '=', schoolId))
      .select([
        'pc.id',
        'pc.course_id',
        'pc.capacity',
        'pc.enrolled',
        'c.name as courseName',
        'c.price_cents',
        't.name as teacherName',
      ])
      .where('pc.plan_id', '=', id)
      .execute();

    const pcIds = courses.map((c) => c.id);

    const recordsTotalRow = pcIds.length
      ? await db
          .selectFrom('enroll_records')
          .innerJoin('students as st', 'st.id', 'enroll_records.student_id').where('st.school_id', '=', schoolId)
          .innerJoin('courses as record_course', 'record_course.id', 'enroll_records.course_id').where('record_course.school_id', '=', schoolId)
          .innerJoin('enroll_plan_courses as valid_link', (join) => join.onRef('valid_link.id', '=', 'enroll_records.plan_course_id').onRef('valid_link.course_id', '=', 'enroll_records.course_id'))
          .select((e) => e.fn.countAll<number>().as('c'))
          .where('plan_course_id', 'in', pcIds)
          .executeTakeFirst()
      : null;

    const records = pcIds.length
      ? await db
          .selectFrom('enroll_records as r')
          .innerJoin('enroll_plan_courses as valid_link', (join) => join.onRef('valid_link.id', '=', 'r.plan_course_id').onRef('valid_link.course_id', '=', 'r.course_id'))
          .innerJoin('students as s', 's.id', 'r.student_id').where('s.school_id', '=', schoolId)
          .leftJoin('classes as cl', (join) => join.onRef('cl.id', '=', 's.class_id').on('cl.school_id', '=', schoolId))
          .innerJoin('courses as c', 'c.id', 'r.course_id').where('c.school_id', '=', schoolId)
          .select([
            'r.id',
            'r.status',
            'r.created_at',
            's.name as studentName',
            's.code',
            'cl.name as className',
            'c.name as courseName',
          ])
          .where('r.plan_course_id', 'in', pcIds)
          .orderBy('r.created_at', 'desc')
          .limit(recordsSize)
          .offset((recordsPage - 1) * recordsSize)
          .execute()
      : [];

    const totalStudents = await db
      .selectFrom('students').where('school_id', '=', schoolId)
      .select((e) => e.fn.countAll<number>().as('c'))
      .where('status', '=', 'active')
      .executeTakeFirst();

    const effectiveCodesRows = pcIds.length
      ? await db
          .selectFrom('enroll_records as r')
          .innerJoin('enroll_plan_courses as valid_link', (join) => join.onRef('valid_link.id', '=', 'r.plan_course_id').onRef('valid_link.course_id', '=', 'r.course_id'))
          .innerJoin('students as s', 's.id', 'r.student_id').where('s.school_id', '=', schoolId)
          .innerJoin('courses as record_course', 'record_course.id', 'r.course_id').where('record_course.school_id', '=', schoolId)
          .select('s.code')
          .where('r.plan_course_id', 'in', pcIds)
          .where('r.status', '=', 'effective')
          .execute()
      : [];
    const effectiveCodes = new Set(effectiveCodesRows.map((r) => r.code));

    const unenrolledAll = await db
      .selectFrom('students as s').where('s.school_id', '=', schoolId)
      .leftJoin('classes as cl', (join) => join.onRef('cl.id', '=', 's.class_id').on('cl.school_id', '=', schoolId))
      .select(['s.id', 's.code', 's.name', 'cl.name as className'])
      .where('s.status', '=', 'active')
      .execute();

    return {
      plan,
      courses,
      records,
      recordsTotal: Number(recordsTotalRow?.c ?? 0),
      recordsPage,
      recordsSize,
      stats: {
        target: Number(totalStudents?.c ?? 0),
        enrolledStudents: effectiveCodes.size,
        records: Number(recordsTotalRow?.c ?? 0),
      },
      unenrolled: unenrolledAll.filter((s) => !effectiveCodes.has(s.code)).slice(0, 500),
    };
  });

  // 报名记录导出
  app.get('/api/admin/plans/:id/records/export', guard, async (req, reply) => {
    const schoolId = schoolIdOf(req);
    const id = num((req.params as any).id);
    await assertSchoolRow('enroll_plans', id, schoolId);
    const pcs = await db.selectFrom('enroll_plan_courses').select('id').where('plan_id', '=', id).execute();
    const pcIds = pcs.map((p) => p.id);
    const rows = pcIds.length
      ? await db
          .selectFrom('enroll_records as r')
          .innerJoin('enroll_plan_courses as valid_link', (join) => join.onRef('valid_link.id', '=', 'r.plan_course_id').onRef('valid_link.course_id', '=', 'r.course_id'))
          .innerJoin('students as s', 's.id', 'r.student_id').where('s.school_id', '=', schoolId)
          .leftJoin('classes as cl', (join) => join.onRef('cl.id', '=', 's.class_id').on('cl.school_id', '=', schoolId))
          .innerJoin('courses as c', 'c.id', 'r.course_id').where('c.school_id', '=', schoolId)
          .select([
            's.code',
            's.name as studentName',
            'cl.name as className',
            'c.name as courseName',
            'r.status',
            'r.created_at',
          ])
          .where('r.plan_course_id', 'in', pcIds)
          .orderBy('s.code')
          .execute()
      : [];

    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['学号,学生,班级,课程,状态,报名时间'];
    for (const r of rows) {
      lines.push(
        [r.code, r.studentName, r.className ?? '', r.courseName, r.status === 'effective' ? '已生效' : '已退出', r.created_at]
          .map(esc)
          .join(',')
      );
    }
    const csv = '\uFEFF' + lines.join('\r\n');
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="plan-${id}-records.csv"`);
    return reply.send(csv);
  });
}
