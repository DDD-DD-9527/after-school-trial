import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { db, todayStr } from '../db.js';
import { HttpError, hashPassword, requireAuth } from '../auth.js';

const guard = { preHandler: requireAuth('admin') };

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/dashboard', guard, async () => {
    const [students, classes, teachers, courses] = await Promise.all([
      db.selectFrom('students').select((e) => e.fn.countAll<number>().as('c')).where('status', '=', 'active').executeTakeFirst(),
      db.selectFrom('classes').select((e) => e.fn.countAll<number>().as('c')).executeTakeFirst(),
      db.selectFrom('teachers').select((e) => e.fn.countAll<number>().as('c')).where('status', '=', 'active').executeTakeFirst(),
      db.selectFrom('courses').select((e) => e.fn.countAll<number>().as('c')).where('status', '=', 'published').executeTakeFirst(),
    ]);
    const today = todayStr();
    const todaySessions = await db
      .selectFrom('sessions as s')
      .innerJoin('courses as c', 'c.id', 's.course_id')
      .innerJoin('class_groups as g', 'g.id', 's.class_group_id')
      .leftJoin('teachers as t', 't.id', 'g.teacher_id')
      .select([
        's.id',
        's.course_id',
        's.start_time',
        's.end_time',
        's.status',
        'c.name as courseName',
        'g.name as groupName',
        'g.room',
        't.name as teacherName',
      ])
      .where('s.date', '=', today)
      .orderBy('s.start_time')
      .execute();

    const withCounts = [];
    for (const s of todaySessions) {
      const enrolled = await db
        .selectFrom('enroll_records')
        .select((e) => e.fn.countAll<number>().as('c'))
        .where('course_id', '=', s.course_id)
        .where('status', '=', 'effective')
        .executeTakeFirst();
      const done = await db
        .selectFrom('attendance')
        .select((e) => e.fn.countAll<number>().as('c'))
        .where('session_id', '=', s.id)
        .executeTakeFirst();
      withCounts.push({ ...s, enrolled: Number(enrolled?.c ?? 0), marked: Number(done?.c ?? 0) });
    }

    return {
      stats: {
        students: Number(students?.c ?? 0),
        classes: Number(classes?.c ?? 0),
        teachers: Number(teachers?.c ?? 0),
        courses: Number(courses?.c ?? 0),
      },
      todaySessions: withCounts,
      today,
    };
  });

  // ---------- 班级 ----------
  app.get('/api/admin/classes', guard, async () => {
    return db
      .selectFrom('classes as c')
      .leftJoin('teachers as t', 't.id', 'c.head_teacher_id')
      .select(['c.id', 'c.grade', 'c.name', 'c.head_teacher_id', 't.name as headTeacherName'])
      .orderBy('c.grade')
      .orderBy('c.name')
      .execute();
  });

  app.post('/api/admin/classes', guard, async (req) => {
    const b = req.body as any;
    if (!b?.grade || !b?.name) throw new HttpError(400, 'BAD_INPUT', '年级和班级名称必填');
    return db
      .insertInto('classes')
      .values({ school_id: 1, grade: String(b.grade), name: String(b.name), head_teacher_id: b.headTeacherId ? num(b.headTeacherId) : null })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  app.put('/api/admin/classes/:id', guard, async (req) => {
    const id = num((req.params as any).id);
    const b = req.body as any;
    await db
      .updateTable('classes')
      .set({ grade: String(b.grade), name: String(b.name), head_teacher_id: b.headTeacherId ? num(b.headTeacherId) : null })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });

  // ---------- 学生 ----------
  app.get('/api/admin/students', guard, async (req) => {
    const q = req.query as any;
    const page = Math.max(1, num(q.page, 1));
    const size = Math.min(100, Math.max(5, num(q.size, 20)));

    const countQuery = db
      .selectFrom('students as s')
      .select((e) => e.fn.countAll<number>().as('c'));
    const listQuery = db
      .selectFrom('students as s')
      .leftJoin('classes as c', 'c.id', 's.class_id')
      .select(['s.id', 's.code', 's.name', 's.class_id', 's.status', 'c.name as className', 'c.grade']);

    const applyFilter = (qb: any) =>
      q.q ? qb.where((eb: any) => eb.or([eb('s.name', 'like', `%${q.q}%`), eb('s.code', 'like', `%${q.q}%`)])) : qb;

    const totalRow = await applyFilter(countQuery).executeTakeFirst();
    const items = await applyFilter(listQuery).orderBy('s.code').limit(size).offset((page - 1) * size).execute();
    return { items, total: Number(totalRow?.c ?? 0), page, size };
  });

  // 导出学生（CSV，带 BOM 便于 Excel 打开）
  app.get('/api/admin/students/export', guard, async (req, reply) => {
    const q = req.query as any;
    let query = db
      .selectFrom('students as s')
      .leftJoin('classes as c', 'c.id', 's.class_id')
      .select(['s.code', 's.name', 'c.grade', 'c.name as className', 's.status'])
      .orderBy('s.code');
    if (q.q) query = query.where((eb) => eb.or([eb('s.name', 'like', `%${q.q}%`), eb('s.code', 'like', `%${q.q}%`)]));
    const rows = await query.execute();

    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['学号,姓名,年级,班级,状态'];
    for (const r of rows) {
      lines.push([r.code, r.name, r.grade ?? '', r.className ?? '', r.status === 'active' ? '在读' : r.status].map(esc).join(','));
    }
    const csv = '\uFEFF' + lines.join('\r\n');
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="students-${Date.now()}.csv"`);
    return reply.send(csv);
  });

  app.post('/api/admin/students', guard, async (req) => {
    const b = req.body as any;
    if (!b?.code || !b?.name) throw new HttpError(400, 'BAD_INPUT', '学号和姓名必填');
    return db
      .insertInto('students')
      .values({ school_id: 1, code: String(b.code), name: String(b.name), class_id: b.classId ? num(b.classId) : null, status: 'active' })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  app.put('/api/admin/students/:id', guard, async (req) => {
    const id = num((req.params as any).id);
    const b = req.body as any;
    await db
      .updateTable('students')
      .set({ name: String(b.name), class_id: b.classId ? num(b.classId) : null, status: b.status || 'active' })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });

  // ---------- 教师 ----------
  app.get('/api/admin/teachers', guard, async () => {
    return db.selectFrom('teachers').selectAll().orderBy('id').execute();
  });

  app.post('/api/admin/teachers', guard, async (req) => {
    const b = req.body as any;
    if (!b?.name || !b?.phone) throw new HttpError(400, 'BAD_INPUT', '姓名和手机号必填');
    return db
      .insertInto('teachers')
      .values({ school_id: 1, name: String(b.name), phone: String(b.phone), status: 'active' })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  app.put('/api/admin/teachers/:id', guard, async (req) => {
    const id = num((req.params as any).id);
    const b = req.body as any;
    await db
      .updateTable('teachers')
      .set({ name: String(b.name), phone: String(b.phone), status: b.status || 'active' })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });

  // ---------- 监护人 ----------
  app.get('/api/admin/guardians', guard, async () => {
    const guardians = await db.selectFrom('guardians').selectAll().orderBy('id').execute();
    const links = await db
      .selectFrom('student_guardians as sg')
      .innerJoin('students as s', 's.id', 'sg.student_id')
      .select(['sg.guardian_id', 'sg.relation', 's.id as studentId', 's.name as studentName'])
      .execute();
    return guardians.map((g) => ({
      ...g,
      children: links.filter((l) => l.guardian_id === g.id).map((l) => ({ id: l.studentId, name: l.studentName, relation: l.relation })),
    }));
  });

  // ---------- 课程 ----------
  app.get('/api/admin/courses', guard, async (req) => {
    const q = req.query as any;
    const page = Math.max(1, num(q.page, 1));
    const size = Math.min(100, Math.max(5, num(q.size, 20)));

    const build = () => {
      let qb = db.selectFrom('courses as c').leftJoin('teachers as t', 't.id', 'c.teacher_id');
      if (q.q) qb = qb.where('c.name', 'like', `%${q.q}%`);
      return qb;
    };

    const totalRow = await build().select((e) => e.fn.countAll<number>().as('c')).executeTakeFirst();
    const items = await build()
      .select([
        'c.id',
        'c.name',
        'c.term',
        'c.grade',
        'c.capacity',
        'c.price_cents',
        'c.status',
        'c.teacher_id',
        't.name as teacherName',
      ])
      .orderBy('c.id', 'desc')
      .limit(size)
      .offset((page - 1) * size)
      .execute();

    return { items, total: Number(totalRow?.c ?? 0), page, size };
  });

  // 下拉选项（不分页）
  app.get('/api/admin/courses/options', guard, async () => {
    return db
      .selectFrom('courses')
      .select(['id', 'name', 'price_cents', 'capacity'])
      .where('status', '=', 'published')
      .orderBy('id', 'desc')
      .execute();
  });

  app.post('/api/admin/courses', guard, async (req) => {
    const b = req.body as any;
    if (!b?.name) throw new HttpError(400, 'BAD_INPUT', '课程名称必填');
    return db
      .insertInto('courses')
      .values({
        school_id: 1,
        term: String(b.term || '2026-秋'),
        name: String(b.name),
        grade: b.grade ? String(b.grade) : null,
        teacher_id: b.teacherId ? num(b.teacherId) : null,
        capacity: num(b.capacity, 40),
        price_cents: num(b.priceCents, 0),
        description: b.description ? String(b.description) : null,
        refund_note: b.refundNote ? String(b.refundNote) : null,
        status: b.status || 'published',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  app.put('/api/admin/courses/:id', guard, async (req) => {
    const id = num((req.params as any).id);
    const b = req.body as any;
    await db
      .updateTable('courses')
      .set({
        name: String(b.name),
        grade: b.grade ? String(b.grade) : null,
        teacher_id: b.teacherId ? num(b.teacherId) : null,
        capacity: num(b.capacity, 40),
        price_cents: num(b.priceCents, 0),
        description: b.description ? String(b.description) : null,
        refund_note: b.refundNote ? String(b.refundNote) : null,
        status: b.status || 'published',
      })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });

  app.get('/api/admin/courses/:id', guard, async (req) => {
    const id = num((req.params as any).id);
    const course = await db
      .selectFrom('courses as c')
      .leftJoin('teachers as t', 't.id', 'c.teacher_id')
      .selectAll('c')
      .select(['t.name as teacherName'])
      .where('c.id', '=', id)
      .executeTakeFirst();
    if (!course) throw new HttpError(404, 'NOT_FOUND', '课程不存在');
    const groups = await db.selectFrom('class_groups').selectAll().where('course_id', '=', id).execute();
    const cnt = await db
      .selectFrom('sessions')
      .select((e) => e.fn.countAll<number>().as('c'))
      .where('course_id', '=', id)
      .where('status', '!=', 'cancelled')
      .executeTakeFirst();
    const enrolled = await db
      .selectFrom('enroll_records')
      .select((e) => e.fn.countAll<number>().as('c'))
      .where('course_id', '=', id)
      .where('status', '=', 'effective')
      .executeTakeFirst();
    return { ...course, groups, sessionCount: Number(cnt?.c ?? 0), enrolled: Number(enrolled?.c ?? 0) };
  });

  // ---------- 批量导入 ----------
  app.post('/api/admin/import/:type', guard, async (req) => {
    const type = (req.params as any).type as string;
    const rows = ((req.body as any)?.rows ?? []) as any[];
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'BAD_INPUT', '没有可导入的数据');
    if (rows.length > 2000) throw new HttpError(400, 'TOO_MANY', '单次最多导入 2000 行');

    const results: Array<{ row: number; ok: boolean; message: string }> = [];
    let accounts = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (type === 'teachers') {
          if (!r.name || !r.phone) throw new Error('姓名或手机号为空');
          await db.insertInto('teachers').values({ school_id: 1, name: r.name, phone: String(r.phone), status: 'active' }).execute();
        } else if (type === 'classes') {
          if (!r.grade || !r.name) throw new Error('年级或班级为空');
          const exists = await db
            .selectFrom('classes')
            .select('id')
            .where('grade', '=', r.grade)
            .where('name', '=', r.name)
            .executeTakeFirst();
          if (exists) throw new Error('班级已存在');
          await db.insertInto('classes').values({ school_id: 1, grade: r.grade, name: r.name, head_teacher_id: null }).execute();
        } else if (type === 'students') {
          if (!r.code || !r.name) throw new Error('学号或姓名为空');
          let classId: number | null = null;
          if (r.className) {
            const cls = await db.selectFrom('classes').select(['id', 'name']).execute();
            const found = cls.find((c) => c.name === r.className);
            classId = found ? found.id : null;
          }
          const sid = await db
            .insertInto('students')
            .values({ school_id: 1, code: String(r.code), name: r.name, class_id: classId, status: 'active' })
            .returning('id')
            .executeTakeFirstOrThrow();

          if (r.guardianPhone) {
            const phone = String(r.guardianPhone).trim();
            let g = await db.selectFrom('guardians').selectAll().where('phone', '=', phone).executeTakeFirst();
            if (!g) {
              const gid = await db
                .insertInto('guardians')
                .values({ school_id: 1, name: r.guardianName || '家长', phone })
                .returningAll()
                .executeTakeFirstOrThrow();
              g = gid;
            }
            // 自动开通家长账号：手机号登录，默认密码 123456
            const exists = await db.selectFrom('users').select('id').where('phone', '=', phone).executeTakeFirst();
            if (!exists) {
              await db
                .insertInto('users')
                .values({
                  phone,
                  name: r.guardianName || '家长',
                  role: 'parent',
                  password_hash: hashPassword('123456'),
                  teacher_id: null,
                  must_change_password: 1,
                })
                .execute();
              accounts++;
            }
            await db
              .insertInto('student_guardians')
              .values({ student_id: sid.id, guardian_id: g.id, relation: '家长', verified: 1 })
              .onConflict((oc) => oc.columns(['student_id', 'guardian_id']).doNothing())
              .execute();
          }
        } else {
          throw new Error('不支持的导入类型');
        }
        results.push({ row: i + 1, ok: true, message: '成功' });
      } catch (e: any) {
        const msg = String(e?.message || e);
        results.push({ row: i + 1, ok: false, message: msg.includes('UNIQUE') ? '重复数据，已跳过' : msg });
      }
    }
    return { total: rows.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, accounts, results };
  });
}
