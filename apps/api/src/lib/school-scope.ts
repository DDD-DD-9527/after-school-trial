import type { FastifyRequest } from 'fastify';
import type { Selectable } from 'kysely';
import { db, type DB } from '../db.js';
import { childrenOf, getUser, HttpError } from '../auth.js';

/** requireAuth has already refreshed this value from the active account. */
export function schoolIdOf(req: FastifyRequest): number {
  const id = getUser(req).schoolId;
  if (!Number.isSafeInteger(id) || !id || id < 1) throw new HttpError(403, 'SCHOOL_REQUIRED', '当前账号没有可访问的学校');
  return id;
}

type SchoolTable = 'classes' | 'students' | 'guardians' | 'teachers' | 'courses' | 'enroll_plans';

export async function assertSchoolRow<T extends SchoolTable>(table: T, id: number, schoolId: number): Promise<Selectable<DB[T]>> {
  // This closed table union has the same id/school_id columns on every member.
  const row = await (db.selectFrom(table) as any).selectAll().where('id', '=', id).where('school_id', '=', schoolId).executeTakeFirst();
  if (!row) throw new HttpError(404, 'NOT_FOUND', '记录不存在');
  return row;
}

export async function assertSession(sessionId: number, schoolId: number) {
  const row = await db.selectFrom('sessions as s')
    .innerJoin('courses as c', 'c.id', 's.course_id')
    .innerJoin('class_groups as g', (join) => join.onRef('g.id', '=', 's.class_group_id').onRef('g.course_id', '=', 'c.id'))
    .selectAll('s').where('s.id', '=', sessionId).where('c.school_id', '=', schoolId).executeTakeFirst();
  if (!row) throw new HttpError(404, 'NOT_FOUND', '课次不存在');
  return row;
}

export async function assertChild(studentId: number, req: FastifyRequest) {
  const child = await assertSchoolRow('students', studentId, schoolIdOf(req));
  const children = await childrenOf(getUser(req).uid);
  if (!children.some((candidate) => candidate.id === studentId)) throw new HttpError(403, 'FORBIDDEN', '这不是您监护的孩子');
  return child;
}
