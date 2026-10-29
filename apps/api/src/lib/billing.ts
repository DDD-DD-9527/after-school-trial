import { db } from '../db.js';

function nowStr() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** 报名生效后按课程价格生成账单；免费课程不生成 */
export async function ensureBill(enrollRecordId: number, studentId: number, courseId: number) {
  const course = await db.selectFrom('courses').select(['price_cents']).where('id', '=', courseId).executeTakeFirst();
  const price = Number(course?.price_cents ?? 0);
  if (price <= 0) return null;

  const existing = await db.selectFrom('bills').select('id').where('enroll_record_id', '=', enrollRecordId).executeTakeFirst();
  if (existing) return existing.id;

  const b = await db
    .insertInto('bills')
    .values({
      enroll_record_id: enrollRecordId,
      student_id: studentId,
      course_id: courseId,
      amount_cents: price,
      paid_cents: 0,
      status: 'unpaid',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return b.id;
}

/** 退课时：未收款的账单作废；已收款的保留，由财务线下退款 */
export async function voidUnpaidBill(enrollRecordId: number) {
  await db
    .updateTable('bills')
    .set({ status: 'void' })
    .where('enroll_record_id', '=', enrollRecordId)
    .where('paid_cents', '=', 0)
    .execute();
}

export function billStatusLabel(status: string) {
  return status === 'paid' ? '已缴清' : status === 'partial' ? '部分缴' : status === 'void' ? '已作废' : '待缴费';
}

export { nowStr };
