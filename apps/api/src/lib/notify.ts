import { db } from '../db.js';

export interface NoticePayload {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

async function insertMany(userIds: number[], p: NoticePayload) {
  const unique = [...new Set(userIds)].filter((id) => Number.isFinite(id) && id > 0);
  if (!unique.length) return 0;
  for (const uid of unique) {
    await db
      .insertInto('notifications')
      .values({ user_id: uid, type: p.type, title: p.title, body: p.body ?? null, link: p.link ?? null, read_at: null })
      .execute();
  }
  return unique.length;
}

/** 某学生的所有监护人账号 */
export async function parentUserIdsOfStudent(studentId: number): Promise<number[]> {
  const rows = await db
    .selectFrom('student_guardians as sg')
    .innerJoin('students as s', 's.id', 'sg.student_id')
    .innerJoin('guardians as g', 'g.id', 'sg.guardian_id')
    .innerJoin('users as u', 'u.phone', 'g.phone')
    .select('u.id')
    .where('sg.student_id', '=', studentId)
    .whereRef('g.school_id', '=', 's.school_id')
    .whereRef('u.school_id', '=', 's.school_id')
    .where('u.role', '=', 'parent')
    .where('u.status', '=', 'active')
    .execute();
  return rows.map((r) => r.id);
}

/** 某课程所有已报名学生的监护人账号 */
export async function parentUserIdsOfCourse(courseId: number): Promise<number[]> {
  const rows = await db
    .selectFrom('enroll_records as r')
    .innerJoin('courses as c', 'c.id', 'r.course_id')
    .innerJoin('students as s', 's.id', 'r.student_id')
    .innerJoin('student_guardians as sg', 'sg.student_id', 'r.student_id')
    .innerJoin('guardians as g', 'g.id', 'sg.guardian_id')
    .innerJoin('users as u', 'u.phone', 'g.phone')
    .select('u.id')
    .where('r.course_id', '=', courseId)
    .where('r.status', '=', 'effective')
    .whereRef('s.school_id', '=', 'c.school_id')
    .whereRef('g.school_id', '=', 'c.school_id')
    .whereRef('u.school_id', '=', 'c.school_id')
    .where('u.role', '=', 'parent')
    .where('u.status', '=', 'active')
    .execute();
  return rows.map((r) => r.id);
}

/** 某课程的授课教师账号 */
export async function teacherUserIdsOfCourse(courseId: number): Promise<number[]> {
  const rows = await db
    .selectFrom('class_groups as g')
    .innerJoin('courses as c', 'c.id', 'g.course_id')
    .innerJoin('teachers as t', 't.id', 'g.teacher_id')
    .innerJoin('users as u', 'u.teacher_id', 'g.teacher_id')
    .select('u.id')
    .where('g.course_id', '=', courseId)
    .where('u.role', '=', 'teacher')
    .where('u.status', '=', 'active')
    .where('t.status', '=', 'active')
    .whereRef('t.school_id', '=', 'c.school_id')
    .whereRef('u.school_id', '=', 'c.school_id')
    .execute();
  return rows.map((r) => r.id);
}

export async function notifyStudentParents(studentId: number, p: NoticePayload) {
  return insertMany(await parentUserIdsOfStudent(studentId), p);
}

export async function notifyCourseParents(courseId: number, p: NoticePayload) {
  return insertMany(await parentUserIdsOfCourse(courseId), p);
}

export async function notifyCourseTeacher(courseId: number, p: NoticePayload) {
  return insertMany(await teacherUserIdsOfCourse(courseId), p);
}
