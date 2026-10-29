import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import Database from 'better-sqlite3';

// Use a fresh database; never import the destructive demo initializer or use apps/api/data.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'school-isolation-'));
process.env.DATA_DIR = dataDir;
const fixture = new Database(path.join(dataDir, 'app.db'));
const initializer = fs.readFileSync(fileURLToPath(new URL('../db/init.ts', import.meta.url)), 'utf8');
const schema = initializer.match(/const SCHEMA = `([\s\S]*?)`;/)![1]
  .replace(/CREATE TABLE school \([\s\S]*?\);/, `CREATE TABLE school (id INTEGER PRIMARY KEY, name TEXT NOT NULL, term TEXT NOT NULL, code TEXT UNIQUE, status TEXT DEFAULT 'active', contact_name TEXT, contact_phone TEXT, created_at TEXT DEFAULT (datetime('now')));`)
  .replace(/CREATE TABLE users \([\s\S]*?\);/, `CREATE TABLE users (id INTEGER PRIMARY KEY, phone TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, teacher_id INTEGER, must_change_password INTEGER DEFAULT 0, school_id INTEGER, status TEXT DEFAULT 'active', UNIQUE(school_id,phone));`);
fixture.exec(schema);
fixture.close();
const { raw, db, todayStr } = await import('../db.js');
const { HttpError, signToken } = await import('../auth.js');
const { adminRoutes } = await import('../routes/admin.js');
const { scheduleRoutes } = await import('../routes/schedule.js');
const { planRoutes } = await import('../routes/plans.js');
const { enrollRoutes } = await import('../routes/enroll.js');
const { financeRoutes } = await import('../routes/finance.js');
const { attendanceRoutes } = await import('../routes/attendance.js');
const { teacherAttendanceRoutes } = await import('../routes/teacher-attendance.js');
const { notificationRoutes } = await import('../routes/notifications.js');
const { notifyStudentParents, notifyCourseParents } = await import('../lib/notify.js');
const app = Fastify();
const auth = (uid = 1, role = 'admin', schoolId: number | null = 1) => ({ authorization: `Bearer ${signToken({ uid, role, name: `用户${uid}`, schoolId } as any)}` });
const parent = auth(3, 'parent');
const teacher = auth(2, 'teacher');
const admin2 = auth(11, 'admin', 2);
const call = (url: string, method: 'GET' | 'POST' | 'PUT' = 'GET', payload?: unknown, headers = auth()) => app.inject({ url, method, payload: payload as any, headers });
const blocked = (response: { statusCode: number; body: string }) => assert.ok([403, 404].includes(response.statusCode), `expected school/ownership rejection, got ${response.statusCode}: ${response.body}`);

before(async () => {
  app.setErrorHandler((err, _req, reply) => err instanceof HttpError
    ? reply.status(err.status).send({ code: err.code, message: err.message })
    : reply.status(500).send({ message: err instanceof Error ? err.message : String(err) }));
  for (const routes of [adminRoutes, scheduleRoutes, planRoutes, enrollRoutes, financeRoutes, attendanceRoutes, notificationRoutes]) await app.register(routes);
  await app.register(teacherAttendanceRoutes, { clock: () => new Date(`${todayStr()}T16:00:00+08:00`) });
  await app.ready();
});

beforeEach(() => {
  raw.pragma('foreign_keys = OFF');
  for (const table of ['teacher_attendance_logs', 'teacher_attendance', 'notifications', 'payments', 'bills', 'attendance', 'leave_requests', 'session_changes', 'enroll_records', 'enroll_plan_courses', 'enroll_plans', 'sessions', 'class_groups', 'courses', 'student_guardians', 'guardians', 'students', 'classes', 'teachers', 'users', 'school']) raw.exec(`DELETE FROM ${table}`);
  const today = todayStr();
  raw.exec(`
    INSERT INTO school(id,name,term,code,status) VALUES (1,'甲学校','2026-秋','A','active'),(2,'乙学校','2027-春','B','active');
    INSERT INTO users(id,phone,name,role,password_hash,teacher_id,school_id,status) VALUES
      (1,'138','甲管理员','admin','',NULL,1,'active'),(2,'139','甲教师','teacher','',1,1,'active'),(3,'137','甲家长','parent','',NULL,1,'active'),
      (4,'135','其他甲家长','parent','',NULL,1,'active'),(5,'136','错误角色账号','teacher','',3,1,'active'),
      (11,'138','乙管理员','admin','',NULL,2,'active'),(12,'139','乙教师','teacher','',2,2,'active'),(13,'137','乙家长','parent','',NULL,2,'active'),
      (20,'100','运营','operator','',NULL,NULL,'active');
    INSERT INTO teachers(id,school_id,name,phone,status) VALUES (1,1,'甲教师','139','active'),(2,2,'乙教师','139','active'),(3,1,'其他甲教师','136','active');
    INSERT INTO classes(id,school_id,grade,name,head_teacher_id) VALUES (1,1,'三年级','甲班',1),(2,2,'三年级','乙班',2);
    INSERT INTO students(id,school_id,code,name,class_id,status) VALUES (1,1,'001','甲孩子',1,'active'),(2,2,'001','乙孩子',2,'active'),(3,1,'003','其他甲孩子',1,'active');
    INSERT INTO guardians(id,school_id,name,phone) VALUES (1,1,'甲家长','137'),(2,2,'乙家长','137'),(3,1,'其他甲家长','135'),(4,1,'教师同号监护人','136');
    INSERT INTO student_guardians(student_id,guardian_id,relation,verified) VALUES (1,1,'家长',1),(2,2,'家长',1),(3,3,'家长',1),(1,4,'家长',1);
    INSERT INTO courses(id,school_id,term,name,teacher_id,capacity,price_cents,status) VALUES (1,1,'2026-秋','甲课程',1,40,10000,'published'),(2,2,'2026-秋','乙课程',2,40,20000,'published'),(3,1,'2026-秋','甲选修',1,40,0,'published');
    INSERT INTO class_groups(id,course_id,name,capacity,teacher_id,room) VALUES (1,1,'甲教学班',40,1,'301'),(2,2,'乙教学班',40,2,'301');
    INSERT INTO sessions(id,class_group_id,course_id,date,weekday,start_time,end_time,status) VALUES (1,1,1,'${today}',5,'16:00','17:30','planned'),(2,2,2,'${today}',5,'16:00','17:30','planned');
    INSERT INTO enroll_plans(id,school_id,term,name,start_at,end_at,status) VALUES (1,1,'2026-秋','甲计划','2020-01-01 00:00','2099-12-31 23:59','open'),(2,2,'2026-秋','乙计划','2020-01-01 00:00','2099-12-31 23:59','open');
    INSERT INTO enroll_plan_courses(id,plan_id,course_id,capacity,enrolled) VALUES (1,1,1,40,2),(2,2,2,40,1);
    INSERT INTO enroll_records(id,plan_course_id,course_id,student_id,status) VALUES (1,1,1,1,'effective'),(2,2,2,2,'effective'),(3,1,1,3,'effective');
    INSERT INTO bills(id,enroll_record_id,student_id,course_id,amount_cents,paid_cents,status) VALUES (1,1,1,1,10000,0,'unpaid'),(2,2,2,2,20000,0,'unpaid');
    INSERT INTO payments(id,bill_id,amount_cents,method,operator_id) VALUES(1,2,500,'cash',11);
    INSERT INTO teacher_attendance(session_id,teacher_id,check_in_at,updated_at) VALUES(1,1,'${today}T16:00:00+08:00','${today}T16:00:00+08:00'),(2,2,'${today}T16:00:00+08:00','${today}T16:00:00+08:00');
  `);
  raw.pragma('foreign_keys = ON');
});

after(async () => {
  await app.close();
  await db.destroy();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('admin lists, dashboard, CSV exports and plan statistics only contain their school', async () => {
  assert.deepEqual((await call('/api/admin/dashboard')).json().stats, { students: 2, classes: 1, teachers: 2, courses: 2 });
  assert.deepEqual((await call('/api/admin/classes')).json().map((r: any) => r.id), [1]);
  assert.equal((await call('/api/admin/students')).json().total, 2);
  assert.equal((await call('/api/admin/courses')).json().total, 2);
  assert.equal((await call('/api/admin/courses/options')).json().length, 2);
  assert.equal((await call('/api/admin/guardians')).json().length, 3);
  assert.equal((await call('/api/admin/sessions')).json().length, 1);
  assert.equal((await call('/api/admin/plans')).json().length, 1);
  assert.equal((await call('/api/admin/plans/1')).json().stats.target, 2);
  assert.doesNotMatch((await call('/api/admin/students/export')).body, /乙孩子|乙班/);
  blocked(await call('/api/admin/courses/2'));
  blocked(await call('/api/admin/plans/2'));
  blocked(await call('/api/admin/plans/2/records/export'));
});

test('admin rejects foreign primary and referenced IDs without partial writes', async () => {
  blocked(await call('/api/admin/classes/2', 'PUT', { grade: '一年级', name: '越权' }));
  blocked(await call('/api/admin/students/2', 'PUT', { name: '越权' }));
  blocked(await call('/api/admin/teachers/2', 'PUT', { name: '越权', phone: '000' }));
  blocked(await call('/api/admin/courses/2', 'PUT', { name: '越权' }));
  blocked(await call('/api/admin/classes', 'POST', { grade: '一年级', name: '越权', headTeacherId: 2 }));
  blocked(await call('/api/admin/students', 'POST', { code: '999', name: '越权', classId: 2 }));
  blocked(await call('/api/admin/courses', 'POST', { name: '越权', teacherId: 2 }));
  const before = raw.prepare('SELECT count(*) n FROM enroll_plans').get() as any;
  blocked(await call('/api/admin/plans', 'POST', { name: '越权', startAt: '2026-01-01', endAt: '2027-01-01', courseIds: [1, 2] }));
  assert.equal((raw.prepare('SELECT count(*) n FROM enroll_plans').get() as any).n, before.n);
  blocked(await call('/api/admin/plans/2/pause', 'POST', {}));
  blocked(await call('/api/admin/plans/2/publish', 'POST', {}));
  assert.equal((raw.prepare('SELECT name FROM students WHERE id=2').get() as any).name, '乙孩子');
});

test('new records and imports use the current school, including repeated guardian phone', async () => {
  const created = await call('/api/admin/classes', 'POST', { grade: '一年级', name: '乙新增班' }, admin2);
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().school_id, 2);
  const imported = await call('/api/admin/import/students', 'POST', { rows: [{ code: '009', name: '乙新孩子', className: '乙班', guardianPhone: '135', guardianName: '乙新家长' }] }, admin2);
  assert.equal(imported.json().ok, 1, imported.body);
  const student = raw.prepare("SELECT * FROM students WHERE name='乙新孩子'").get() as any;
  assert.equal(student.school_id, 2);
  assert.equal(student.class_id, 2);
  assert.equal((raw.prepare("SELECT count(*) n FROM users WHERE phone='135'").get() as any).n, 2);
  assert.equal((raw.prepare("SELECT school_id FROM guardians WHERE name='乙新家长'").get() as any).school_id, 2);
});

for (const [endpoint, table] of [['courses', 'courses'], ['plans', 'enroll_plans']] as const) {
  test(`${endpoint} creation defaults to the current school term and preserves an explicit term`, async () => {
    const body = { name: '按本校学期创建', startAt: '2027-01-01 00:00', endAt: '2027-06-30 23:59' };
    for (const [headers, expectedSchool, expectedTerm] of [[auth(), 1, '2026-秋'], [admin2, 2, '2027-春']] as const) {
      const response = await call(`/api/admin/${endpoint}`, 'POST', body, headers);
      assert.equal(response.statusCode, 200, response.body);
      const saved = raw.prepare(`SELECT school_id,term FROM ${table} WHERE id=?`).get(response.json().id) as any;
      assert.deepEqual(saved, { school_id: expectedSchool, term: expectedTerm });
    }
    const explicit = await call(`/api/admin/${endpoint}`, 'POST', { ...body, term: '2028-秋' }, admin2);
    assert.equal(explicit.statusCode, 200, explicit.body);
    assert.equal((raw.prepare(`SELECT term FROM ${table} WHERE id=?`).get(explicit.json().id) as any).term, '2028-秋');
  });
}

test('schedule validates course and group ownership and ignores another school room conflicts', async () => {
  const input = { courseId: 1, groupId: 2, weekdays: [5], startDate: todayStr(), endDate: todayStr(), startTime: '18:00', endTime: '19:00' };
  blocked(await call('/api/admin/schedule/generate', 'POST', input));
  blocked(await call('/api/admin/schedule/preview', 'POST', { ...input, courseId: 2 }));
  blocked(await call('/api/admin/schedule/generate', 'POST', { ...input, courseId: 3, groupId: 1 }));
  blocked(await call('/api/admin/sessions/2/cancel', 'POST', {}));
  blocked(await call('/api/admin/sessions/2/reschedule', 'POST', { date: todayStr(), startTime: '18:00', endTime: '19:00' }));
  blocked(await call('/api/admin/sessions/2/changes'));
  raw.prepare('DELETE FROM sessions WHERE id=1').run();
  const preview = await call('/api/admin/schedule/preview', 'POST', { ...input, groupId: 1, weekdays: [1,2,3,4,5,6,7], startTime: '16:00', endTime: '17:30' });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.deepEqual(preview.json().conflicts, []);
});

test('parent child query parameters reject other families and schools across every read endpoint', async () => {
  for (const endpoint of ['plans', 'enrollments', 'schedule', 'leaves', 'bills']) {
    blocked(await call(`/api/parent/${endpoint}?studentId=2`, 'GET', undefined, parent));
    blocked(await call(`/api/parent/${endpoint}?studentId=3`, 'GET', undefined, parent));
  }
  blocked(await call('/api/parent/courses/2', 'GET', undefined, parent));
  assert.equal((await call('/api/parent/plans?studentId=1', 'GET', undefined, parent)).json().length, 1);
  blocked(await call('/api/parent/enroll', 'POST', { studentId: 1, planCourseId: 2 }, parent));
  blocked(await call('/api/parent/enrollments/2/withdraw', 'POST', {}, parent));
  blocked(await call('/api/parent/leaves', 'POST', { studentId: 1, sessionId: 2 }, parent));
  assert.equal((raw.prepare('SELECT enrolled FROM enroll_plan_courses WHERE id=2').get() as any).enrolled, 1);
  assert.equal((raw.prepare('SELECT count(*) n FROM leave_requests').get() as any).n, 0);
});

test('finance summaries, payments and student attendance reject cross school access without writing', async () => {
  assert.equal((await call('/api/admin/finance/summary')).json().receivable, 10000);
  assert.equal((await call('/api/admin/finance/bills')).json().total, 1);
  blocked(await call('/api/admin/finance/summary?courseId=2'));
  blocked(await call('/api/admin/finance/bills?courseId=2'));
  blocked(await call('/api/admin/finance/bills/2/payments'));
  blocked(await call('/api/admin/finance/bills/2/payment', 'POST', { amountCents: 500 }));
  blocked(await call('/api/teacher/sessions/2', 'GET', undefined, teacher));
  blocked(await call('/api/teacher/sessions/1/attendance', 'POST', { items: [{ studentId: 1, status: 'present' }, { studentId: 2, status: 'present' }] }, teacher));
  assert.equal((raw.prepare('SELECT count(*) n FROM attendance').get() as any).n, 0);
  assert.equal((raw.prepare('SELECT paid_cents FROM bills WHERE id=2').get() as any).paid_cents, 0);
});

test('second school can publish, enroll, collect payment and notify its own existing parent account', async () => {
  const created = await call('/api/admin/courses', 'POST', { name: '乙新收费课程', teacherId: 2, priceCents: 5000 }, admin2);
  assert.equal(created.statusCode, 200, created.body);
  const course = created.json();
  assert.equal(course.school_id, 2);
  const planResponse = await call('/api/admin/plans', 'POST', { name: '乙新计划', startAt: '2020-01-01 00:00', endAt: '2099-12-31 23:59', courseIds: [course.id] }, admin2);
  assert.equal(planResponse.statusCode, 200, planResponse.body);
  const plan = planResponse.json();
  assert.equal(plan.school_id, 2);
  assert.equal((await call(`/api/admin/plans/${plan.id}/publish`, 'POST', {}, admin2)).statusCode, 200);
  const pc = raw.prepare('SELECT id FROM enroll_plan_courses WHERE plan_id=?').get(plan.id) as any;
  const enrollment = await call('/api/parent/enroll', 'POST', { studentId: 2, planCourseId: pc.id }, auth(13, 'parent', 2));
  assert.equal(enrollment.statusCode, 200, enrollment.body);
  const bill = raw.prepare('SELECT id FROM bills WHERE enroll_record_id=?').get(enrollment.json().record.id) as any;
  const payment = await call(`/api/admin/finance/bills/${bill.id}/payment`, 'POST', { amountCents: 5000, method: 'cash' }, admin2);
  assert.equal(payment.statusCode, 200, payment.body);
  assert.equal(payment.json().status, 'paid');
  const recipients = (raw.prepare('SELECT DISTINCT user_id FROM notifications').all() as any[]).map((r) => r.user_id);
  assert.deepEqual(recipients, [13]);
  assert.equal((await call('/api/admin/finance/summary')).json().receivable, 10000);
  assert.equal((await call('/api/parent/bills?studentId=2', 'GET', undefined, auth(13, 'parent', 2))).json().length, 2);
});

test('teacher attendance lists, CSV and corrections remain inside the current school', async () => {
  const query = `from=${todayStr()}&to=${todayStr()}`;
  const response = await call(`/api/admin/teacher-attendance?${query}`);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().total, 1);
  assert.doesNotMatch((await call(`/api/admin/teacher-attendance/export?${query}`)).body, /乙课程|乙教师/);
  blocked(await call('/api/admin/teacher-attendance/2/history'));
  blocked(await call('/api/admin/teacher-attendance/2', 'PUT', { status: 'absent', reason: '越权更正' }));
  blocked(await call('/api/teacher/attendance/2/check-out', 'POST', {}, teacher));
});

test('notifications resolve guardians by school and parent role even when phone numbers repeat', async () => {
  await notifyStudentParents(1, { type: 'test', title: '甲消息' });
  await notifyCourseParents(1, { type: 'test', title: '甲课程消息' });
  const recipients = (raw.prepare('SELECT DISTINCT user_id FROM notifications ORDER BY user_id').all() as any[]).map((r) => r.user_id);
  assert.deepEqual(recipients, [3, 4]);
  assert.equal((await call('/api/notifications', 'GET', undefined, auth(13, 'parent', 2))).json().length, 0);
  blocked(await call('/api/notifications', 'GET', undefined, auth(20, 'operator', null)));
  blocked(await call('/api/admin/dashboard', 'GET', undefined, auth(20, 'operator', null)));
});

test('historical inconsistent relations do not expose a foreign teaching group or inflate school counts', async () => {
  raw.prepare('INSERT INTO sessions(id,class_group_id,course_id,date,weekday,start_time,end_time,status) VALUES(3,2,1,?,5,\'18:00\',\'19:00\',\'planned\')').run(todayStr());
  raw.exec("INSERT INTO enroll_records(id,plan_course_id,course_id,student_id,status) VALUES(4,1,1,2,'effective'); INSERT INTO attendance(id,session_id,student_id,status) VALUES(1,1,2,'present');");
  const dashboard = (await call('/api/admin/dashboard')).json();
  assert.deepEqual(dashboard.todaySessions.map((row: any) => row.id), [1]);
  assert.equal(dashboard.todaySessions[0].enrolled, 2);
  assert.equal(dashboard.todaySessions[0].marked, 0);
  assert.equal((await call('/api/admin/courses/1')).json().enrolled, 2);
  assert.equal((await call('/api/admin/courses/1')).json().sessionCount, 1);
  assert.deepEqual((await call('/api/admin/sessions')).json().map((row: any) => row.id), [1]);
  assert.deepEqual((await call('/api/parent/courses/1', 'GET', undefined, parent)).json().sessions.map((row: any) => row.id), [1]);
  assert.deepEqual((await call('/api/parent/schedule?studentId=1', 'GET', undefined, parent)).json().map((row: any) => row.id), [1]);
});

test('historical cross school plan links cannot be published or counted as valid enrollments', async () => {
  raw.exec(`INSERT INTO enroll_plans(id,school_id,term,name,start_at,end_at,status) VALUES(3,1,'2026-秋','历史错误计划','2020-01-01','2099-12-31','draft');
    INSERT INTO enroll_plan_courses(id,plan_id,course_id,capacity,enrolled) VALUES(3,3,2,40,0);
    INSERT INTO students(id,school_id,code,name,status) VALUES(4,1,'004','历史记录孩子','active');
    INSERT INTO enroll_records(id,plan_course_id,course_id,student_id,status) VALUES(4,1,2,4,'effective');`);
  const details = (await call('/api/admin/plans/1')).json();
  assert.equal(details.records.length, 2);
  assert.equal(details.recordsTotal, 2);
  assert.equal(details.stats.enrolledStudents, 2);
  blocked(await call('/api/admin/plans/3/publish', 'POST', {}));
  assert.equal((raw.prepare('SELECT status FROM enroll_plans WHERE id=3').get() as any).status, 'draft');
});
