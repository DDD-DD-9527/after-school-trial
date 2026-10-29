import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { HttpError, getUser, requireAuth } from '../auth.js';
import { notifyStudentParents } from '../lib/notify.js';
import { assertChild, assertSchoolRow, schoolIdOf } from '../lib/school-scope.js';

const adminGuard = { preHandler: requireAuth('admin') };
const parentGuard = { preHandler: requireAuth('parent') };
const num = (v: unknown, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const METHOD_LABEL: Record<string, string> = { cash: '现金', transfer: '转账', wechat: '微信', other: '其他' };

async function billOf(id: number, schoolId: number) {
  const bill = await db.selectFrom('bills as b')
    .innerJoin('courses as c', 'c.id', 'b.course_id')
    .innerJoin('students as s', 's.id', 'b.student_id')
    .selectAll('b')
    .where('b.id', '=', id)
    .where('c.school_id', '=', schoolId)
    .where('s.school_id', '=', schoolId)
    .executeTakeFirst();
  if (!bill) throw new HttpError(404, 'NOT_FOUND', '账单不存在');
  return bill;
}

export async function financeRoutes(app: FastifyInstance) {
  // ---------- 汇总 ----------
  app.get('/api/admin/finance/summary', adminGuard, async (req) => {
    const schoolId = schoolIdOf(req);
    const q = req.query as any;
    let base = db.selectFrom('bills as b')
      .innerJoin('courses as c', 'c.id', 'b.course_id')
      .innerJoin('students as s', 's.id', 'b.student_id')
      .selectAll('b').where('b.status', '!=', 'void')
      .where('c.school_id', '=', schoolId).where('s.school_id', '=', schoolId);
    if (q.courseId) {
      await assertSchoolRow('courses', num(q.courseId), schoolId);
      base = base.where('b.course_id', '=', num(q.courseId));
    }
    const bills = await base.execute();
    const receivable = bills.reduce((a, b) => a + b.amount_cents, 0);
    const received = bills.reduce((a, b) => a + b.paid_cents, 0);
    return {
      receivable,
      received,
      outstanding: receivable - received,
      billCount: bills.length,
      paidCount: bills.filter((b) => b.status === 'paid').length,
      unpaidCount: bills.filter((b) => b.status !== 'paid').length,
    };
  });

  // ---------- 账单列表 ----------
  app.get('/api/admin/finance/bills', adminGuard, async (req) => {
    const schoolId = schoolIdOf(req);
    const q = req.query as any;
    const page = Math.max(1, num(q.page, 1));
    const size = Math.min(100, Math.max(5, num(q.size, 20)));
    if (q.courseId) await assertSchoolRow('courses', num(q.courseId), schoolId);

    const build = () => {
      let qb = db
        .selectFrom('bills as b')
        .innerJoin('students as s', 's.id', 'b.student_id')
        .leftJoin('classes as c', (join) => join.onRef('c.id', '=', 's.class_id').on('c.school_id', '=', schoolId))
        .innerJoin('courses as co', 'co.id', 'b.course_id')
        .where('co.school_id', '=', schoolId)
        .where('s.school_id', '=', schoolId);
      if (q.courseId) qb = qb.where('b.course_id', '=', num(q.courseId));
      if (q.status) qb = qb.where('b.status', '=', String(q.status));
      if (q.q) qb = qb.where((eb) => eb.or([eb('s.name', 'like', `%${q.q}%`), eb('s.code', 'like', `%${q.q}%`)]));
      return qb;
    };

    const totalRow = await build().select((e) => e.fn.countAll<number>().as('c')).executeTakeFirst();
    const items = await build()
      .select([
        'b.id',
        'b.amount_cents',
        'b.paid_cents',
        'b.status',
        'b.created_at',
        's.name as studentName',
        's.code',
        'c.name as className',
        'co.name as courseName',
      ])
      .orderBy('b.id', 'desc')
      .limit(size)
      .offset((page - 1) * size)
      .execute();

    return { items, total: Number(totalRow?.c ?? 0), page, size };
  });

  // ---------- 收款 ----------
  app.post('/api/admin/finance/bills/:id/payment', adminGuard, async (req) => {
    const me = getUser(req);
    const id = num((req.params as any).id);
    const b = req.body as any;
    const amount = num(b?.amountCents);
    const method = String(b?.method || 'cash');
    const note = String(b?.note || '').slice(0, 200);

    if (!amount || amount <= 0) throw new HttpError(400, 'BAD_INPUT', '收款金额必须大于 0');
    if (!METHOD_LABEL[method]) throw new HttpError(400, 'BAD_INPUT', '不支持的收款方式');

    const bill = await billOf(id, schoolIdOf(req));
    if (bill.status === 'void') throw new HttpError(400, 'BAD_STATE', '账单已作废，不能收款');
    if (bill.paid_cents + amount > bill.amount_cents) {
      throw new HttpError(400, 'OVERPAY', `收费金额超过应缴（剩余 ${(bill.amount_cents - bill.paid_cents) / 100} 元）`);
    }

    await db
      .insertInto('payments')
      .values({ bill_id: id, amount_cents: amount, method, note, operator_id: me.uid })
      .execute();

    const paid = bill.paid_cents + amount;
    await db
      .updateTable('bills')
      .set({ paid_cents: paid, status: paid >= bill.amount_cents ? 'paid' : 'partial' })
      .where('id', '=', id)
      .execute();

    const course = await db.selectFrom('courses').select(['name']).where('id', '=', bill.course_id).executeTakeFirst();
    await notifyStudentParents(bill.student_id, {
      type: 'payment',
      title: paid >= bill.amount_cents ? '缴费完成' : '收款已登记',
      body: `「${course?.name ?? '课程'}」已收取 ${(amount / 100).toFixed(2)} 元（${METHOD_LABEL[method]}），累计 ${(paid / 100).toFixed(2)} / ${(bill.amount_cents / 100).toFixed(2)} 元`,
      link: '/parent/enrollments',
    });

    return { ok: true, paid_cents: paid, status: paid >= bill.amount_cents ? 'paid' : 'partial' };
  });

  // ---------- 收款记录 ----------
  app.get('/api/admin/finance/bills/:id/payments', adminGuard, async (req) => {
    const schoolId = schoolIdOf(req);
    const id = num((req.params as any).id);
    await billOf(id, schoolId);
    return db
      .selectFrom('payments as p')
      .leftJoin('users as u', (join) => join.onRef('u.id', '=', 'p.operator_id').on('u.school_id', '=', schoolId))
      .select(['p.id', 'p.amount_cents', 'p.method', 'p.note', 'p.paid_at', 'u.name as operatorName'])
      .where('p.bill_id', '=', id)
      .orderBy('p.id', 'desc')
      .execute();
  });

  // ---------- 家长：我的账单 ----------
  app.get('/api/parent/bills', parentGuard, async (req) => {
    const studentId = num((req.query as any).studentId);
    if (!studentId) return [];
    await assertChild(studentId, req);
    return db
      .selectFrom('bills as b')
      .innerJoin('courses as c', 'c.id', 'b.course_id')
      .select(['b.id', 'b.amount_cents', 'b.paid_cents', 'b.status', 'b.created_at', 'c.name as courseName'])
      .where('b.student_id', '=', studentId)
      .where('c.school_id', '=', schoolIdOf(req))
      .orderBy('b.id', 'desc')
      .execute();
  });
}
