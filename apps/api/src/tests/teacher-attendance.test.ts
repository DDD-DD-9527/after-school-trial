import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { ZodError } from 'zod';
import { initializeTeacherAttendance } from '../db/teacher-attendance.js';
import { initializeMultiSchool } from '../db/multi-school.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-attendance-'));
process.env.DATA_DIR = dataDir;
const { raw, db, todayStr } = await import('../db.js');
const { HttpError, signToken } = await import('../auth.js');
const { teacherAttendanceRoutes } = await import('../routes/teacher-attendance.js');
const { scheduleRoutes } = await import('../routes/schedule.js');
const app = Fastify();
let time = '2026-10-30T16:00:00.000+08:00';
const headers = (uid = 2, role: 'admin' | 'teacher' | 'parent' = 'teacher') => ({ authorization: `Bearer ${signToken({ uid, role, name: `账号${uid}` })}` });
const admin = headers(1, 'admin');
const get = (url: string, auth: Record<string,string> = headers()) => app.inject({ method: 'GET', url, headers: auth });
const post = (id: number, action: 'check-in' | 'check-out', auth = headers()) => app.inject({ method: 'POST', url: `/api/teacher/attendance/${id}/${action}`, headers: auth, payload: {} });
const put = (id: number, payload: unknown, auth = admin) => app.inject({ method: 'PUT', url: `/api/admin/teacher-attendance/${id}`, headers: auth, payload: payload as any });
const listUrl = '/api/teacher/attendance?from=2026-10-30&to=2026-10-30';
const adminUrl = '/api/admin/teacher-attendance?from=2026-10-30&to=2026-10-30';

before(async () => {
  raw.exec(`
    CREATE TABLE school (id INTEGER PRIMARY KEY, name TEXT, term TEXT);
    INSERT INTO school VALUES (1,'测试学校','2026-秋');
    CREATE TABLE users (id INTEGER PRIMARY KEY, phone TEXT, name TEXT, role TEXT, password_hash TEXT, teacher_id INTEGER, must_change_password INTEGER DEFAULT 0);
    CREATE TABLE teachers (id INTEGER PRIMARY KEY, school_id INTEGER, name TEXT, phone TEXT, status TEXT);
    CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT, teacher_id INTEGER, school_id INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE class_groups (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT, teacher_id INTEGER, room TEXT);
    CREATE TABLE sessions (id INTEGER PRIMARY KEY, class_group_id INTEGER, course_id INTEGER, date TEXT, weekday INTEGER, start_time TEXT, end_time TEXT, status TEXT);
    CREATE TABLE attendance (id INTEGER PRIMARY KEY, session_id INTEGER, student_id INTEGER, status TEXT);
    CREATE TABLE session_changes(id INTEGER PRIMARY KEY,session_id INTEGER,type TEXT,before_data TEXT,after_data TEXT,reason TEXT);
    CREATE TABLE enroll_records(id INTEGER PRIMARY KEY,course_id INTEGER,student_id INTEGER,status TEXT);
    CREATE TABLE student_guardians(student_id INTEGER,guardian_id INTEGER);
    CREATE TABLE students(id INTEGER PRIMARY KEY,school_id INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE guardians(id INTEGER PRIMARY KEY,phone TEXT,school_id INTEGER NOT NULL DEFAULT 1);
    INSERT INTO teachers VALUES (1,1,'王老师','13900000001','active'),(2,1,'李老师','13900000002','active'),(3,1,'停用教师','13900000003','inactive');
    INSERT INTO users (id,phone,name,role,password_hash,teacher_id) VALUES
      (1,'138','教务主任','admin','',NULL),(2,'139','王老师','teacher','',1),(3,'140','李老师','teacher','',2),
      (4,'141','家长','parent','',NULL),(5,'142','未绑定','teacher','',NULL),(6,'143','停用教师','teacher','',3);
    INSERT INTO courses(id,name,teacher_id) VALUES (1,'基础托管',2);
    INSERT INTO class_groups VALUES (1,1,'托管班',1,'301'),(2,1,'李老师班',2,'302'),(3,1,'待排教师班',NULL,'303');
  `);
  // Exercise the production migration so legacy fixture accounts receive an active school scope.
  initializeMultiSchool(raw);
  initializeTeacherAttendance(raw);
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ code: err.code, message: err.message });
    if (err instanceof ZodError) return reply.status(400).send({ code: 'BAD_INPUT', message: err.issues[0]?.message });
    return reply.status(500).send({ message: err instanceof Error ? err.message : String(err) });
  });
  await app.register(teacherAttendanceRoutes, { clock: () => new Date(time) });
  await app.register(scheduleRoutes);
  await app.ready();
});

beforeEach(() => {
  time = '2026-10-30T16:00:00.000+08:00';
  // The initial red phase has no attendance tables yet; fixtures still exercise real routes.
  for (const table of ['teacher_attendance_logs', 'teacher_attendance', 'attendance', 'sessions']) {
    if (raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) raw.exec(`DELETE FROM ${table}`);
  }
  raw.exec(`INSERT INTO sessions VALUES
    (1,1,1,'2026-10-30',5,'16:00','17:30','planned'),
    (2,2,1,'2026-10-30',5,'16:00','17:30','planned'),
    (3,1,1,'2026-10-30',5,'16:00','17:30','cancelled'),
    (4,3,1,'2026-10-30',5,'16:00','17:30','planned'),
    (5,1,1,'2026-10-31',6,'16:00','17:30','planned');
    INSERT INTO attendance VALUES (1,1,99,'present');`);
});

after(async () => {
  await app.close();
  await db.destroy();
  if (raw.open) raw.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('startup migration is repeatable and preserves sessions, student attendance, and teacher records', async () => {
  const isolated = new Database(':memory:');
  isolated.exec("CREATE TABLE sessions(id INTEGER PRIMARY KEY, status TEXT); INSERT INTO sessions VALUES(1,'done'); CREATE TABLE attendance(id INTEGER PRIMARY KEY,status TEXT); INSERT INTO attendance VALUES(1,'leave');");
  initializeTeacherAttendance(isolated);
  assert.ok(isolated.prepare("SELECT 1 FROM sqlite_master WHERE name='teacher_attendance'").get());
  isolated.prepare('INSERT INTO teacher_attendance(session_id,teacher_id,check_in_at,updated_at) VALUES (1,1,?,?)').run('2026-10-30T16:00:00.000+08:00','2026-10-30T16:00:00.000+08:00');
  initializeTeacherAttendance(isolated);
  assert.deepEqual(isolated.prepare('SELECT * FROM sessions').all(), [{ id: 1, status: 'done' }]);
  assert.deepEqual(isolated.prepare('SELECT * FROM attendance').all(), [{ id: 1, status: 'leave' }]);
  assert.equal((isolated.prepare('SELECT count(*) n FROM teacher_attendance').get() as any).n, 1);
  isolated.close();
});

test('legacy teacher today date uses Shanghai even when the server clock is still the prior UTC day', () => {
  assert.equal(todayStr(new Date('2026-10-31T17:00:00Z')),'2026-11-01');
});

test('subsecond punches retain the actual instant at late and early boundaries', async () => {
  time = '2026-10-30T16:00:00.001+08:00';
  assert.equal((await post(1,'check-in')).statusCode,200);
  let row = (await get(listUrl)).json().items[0];
  assert.equal(row.lateMinutes,1);
  assert.equal(row.checkInAt,'2026-10-30T16:00:00.001+08:00');
  time = '2026-10-30T17:29:59.999+08:00';
  assert.equal((await post(1,'check-out')).statusCode,200);
  row = (await get(listUrl)).json().items[0];
  assert.equal(row.earlyMinutes,1);
  assert.equal(row.status,'late_early');
  assert.equal(row.checkOutAt,'2026-10-30T17:29:59.999+08:00');
});

test('teacher list follows class group teacher and defaults to Shanghai month', async () => {
  time = '2026-10-31T17:00:00Z'; // November 1 in Shanghai, despite October UTC.
  const response = await get('/api/teacher/attendance');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().today, '2026-11-01');
  assert.equal(response.json().total, 0);
  const october = (await get('/api/teacher/attendance?from=2026-10-01&to=2026-10-31')).json();
  assert.deepEqual(october.items.map((row: any) => row.sessionId), [1, 5]);
  assert.equal(october.items[0].teacherName, '王老师');
  assert.equal(october.items[0].status, 'unrecorded');
  assert.equal(october.items[0].source, null);
  assert.deepEqual(october.rules, { checkInMinutesBefore: 30, checkOutMinutesAfter: 120 });
});

test('check-in allows exact opening boundary and rejects a second concurrent submission', async () => {
  time = '2026-10-30T15:29:59.000+08:00';
  assert.equal((await post(1,'check-in')).statusCode, 409);
  time = '2026-10-30T15:30:00.000+08:00';
  const responses = await Promise.all([post(1,'check-in'),post(1,'check-in')]);
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200,409]);
  const row = (await get(listUrl)).json().items[0];
  assert.equal(row.status, 'in_progress');
  assert.equal(row.checkInAt, '2026-10-30T15:30:00.000+08:00');
  assert.equal(row.lateMinutes, 0);
  assert.equal(row.source, 'self');
  assert.equal((raw.prepare('SELECT count(*) n FROM teacher_attendance_logs').get() as any).n, 1);
  assert.equal((raw.prepare('SELECT status FROM sessions WHERE id=1').get() as any).status, 'planned');
  assert.equal((raw.prepare('SELECT status FROM attendance WHERE id=1').get() as any).status, 'present');
});

test('late arrival remains in progress then early departure produces late_early with immutable punches', async () => {
  time = '2026-10-30T16:05:00.000+08:00';
  assert.equal((await post(1,'check-in')).statusCode, 200);
  let data = (await get(listUrl)).json();
  assert.equal(data.items[0].status, 'in_progress');
  assert.equal(data.items[0].lateMinutes, 5);
  assert.equal(data.summary.abnormal, 1);
  time = '2026-10-30T17:20:00.000+08:00';
  const response = await post(1,'check-out');
  assert.equal(response.statusCode, 200);
  const original = (await get(listUrl)).json().items[0];
  assert.equal(original.status, 'late_early');
  assert.equal(original.earlyMinutes, 10);
  time = '2026-10-30T17:30:00.000+08:00';
  assert.equal((await post(1,'check-out')).statusCode, 409);
  data = (await get(listUrl)).json();
  assert.equal(data.items[0].checkOutAt, '2026-10-30T17:20:00.000+08:00');
  assert.equal(data.summary.completed, 1);
});

test('same-moment checkout is allowed after check-in and normal checkout is present', async () => {
  assert.equal((await post(1,'check-in')).statusCode, 200);
  assert.equal((await post(1,'check-out')).statusCode, 200);
  assert.equal((await get(listUrl)).json().items[0].status, 'early');
  assert.equal((await post(2,'check-in',headers(3))).statusCode, 200);
  time = '2026-10-30T17:30:00.000+08:00';
  assert.equal((await post(2,'check-out',headers(3))).statusCode, 200);
  assert.equal((await get(listUrl,headers(3))).json().items[0].status, 'present');
});

test('check-in closes exactly at class end and unrecorded is never automatic absent', async () => {
  time = '2026-10-30T17:29:59.000+08:00';
  assert.equal((await post(1,'check-in')).statusCode, 200);
  time = '2026-10-30T17:30:00.000+08:00';
  assert.equal((await post(2,'check-in',headers(3))).statusCode, 409);
  const row = (await get(listUrl,headers(3))).json().items[0];
  assert.equal(row.status, 'unrecorded');
  assert.equal(row.canCheckIn, false);
  assert.equal(row.checkInAt, null);
});

test('checkout has an inclusive 120 minute end boundary then becomes missing_checkout', async () => {
  assert.equal((await post(1,'check-in')).statusCode, 200);
  assert.equal((await post(2,'check-in',headers(3))).statusCode, 200);
  time = '2026-10-30T19:30:00.000+08:00';
  assert.equal((await post(1,'check-out')).statusCode, 200);
  time = '2026-10-30T19:30:01.000+08:00';
  assert.equal((await post(2,'check-out',headers(3))).statusCode, 409);
  assert.equal((await get(listUrl,headers(3))).json().items[0].status, 'missing_checkout');
});

test('checkout before check-in and clock moving before recorded arrival are rejected', async () => {
  assert.equal((await post(1,'check-out')).statusCode, 409);
  assert.equal((await post(1,'check-in')).statusCode, 200);
  time = '2026-10-30T15:59:59.000+08:00';
  assert.equal((await post(1,'check-out')).statusCode, 409);
});

test('all attendance endpoints enforce roles, binding, active teacher and ownership', async () => {
  assert.equal((await get(listUrl,{})).statusCode, 401);
  assert.equal((await get(listUrl,headers(4,'parent'))).statusCode, 403);
  assert.equal((await get(listUrl,headers(5))).statusCode, 403);
  assert.equal((await get(listUrl,headers(6))).statusCode, 403);
  assert.equal((await post(2,'check-in')).statusCode, 403);
  assert.equal((await post(1,'check-in',headers(4,'parent'))).statusCode, 403);
  assert.equal((await post(999,'check-in')).statusCode, 404);
  assert.equal((await post(3,'check-in')).statusCode, 409);
  assert.equal((await post(5,'check-in')).statusCode, 409);
  assert.equal((await get(adminUrl)).statusCode, 403);
  assert.equal((await get('/api/admin/teacher-attendance/1/history',headers(4,'parent'))).statusCode,403);
  assert.equal((await get('/api/admin/teacher-attendance/export',headers(4,'parent'))).statusCode,403);
});

test('dates, range, teacher, status, pagination and integer session identifiers are validated', async () => {
  for (const query of ['from=2026-02-30','from=2026-10-31&to=2026-10-01','from=2025-01-01&to=2026-10-30','from=x','to=2026-13-01']) {
    const response = await get(`/api/teacher/attendance?${query}`);
    assert.equal(response.statusCode,400,`${query}: ${response.body}`);
  }
  for (const query of ['teacherId=abc','teacherId=-1','status=unknown','page=0','size=201','size=1.5']) {
    assert.equal((await get(`/api/admin/teacher-attendance?${query}`,admin)).statusCode,400,query);
  }
  assert.equal((await post(-1,'check-in')).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/teacher/attendance/1.5/check-in',headers:headers(),payload:{}})).statusCode,400);
  assert.equal((await get('/api/teacher/attendance?from=2026-01-01&to=2027-01-01')).statusCode,200); // 366 inclusive days.
});

test('admin correction requires a trimmed reason, valid final status, ended active class and assigned teacher', async () => {
  assert.equal((await put(1,{status:'present',reason:'已核实'})).statusCode,409);
  time = '2026-10-30T17:30:00.000+08:00';
  for (const payload of [{status:'present',reason:''},{status:'late',reason:'  '},{status:'present',reason:'a'.repeat(201)},{status:'pending',reason:'原因'}]) {
    assert.equal((await put(1,payload)).statusCode,400);
  }
  assert.equal((await put(3,{status:'leave',reason:'停课'})).statusCode,409);
  assert.equal((await put(4,{status:'leave',reason:'无任课教师'})).statusCode,409);
  assert.equal((await put(999,{status:'leave',reason:'不存在'})).statusCode,404);
  assert.equal((await put(1,{status:'present',reason:'已核实'},headers())).statusCode,403);
});

test('admin correction preserves raw timestamps, audits before and after, and blocks later self actions', async () => {
  time = '2026-10-30T16:05:00.000+08:00';
  await post(1,'check-in');
  time = '2026-10-30T17:20:00.000+08:00';
  await post(1,'check-out');
  time = '2026-10-30T17:31:00.000+08:00';
  assert.equal((await put(1,{status:'present',reason:'  门禁核实正常  '})).statusCode,200);
  let row = (await get(listUrl)).json().items[0];
  assert.equal(row.status,'present');
  assert.equal(row.checkInAt,'2026-10-30T16:05:00.000+08:00');
  assert.equal(row.checkOutAt,'2026-10-30T17:20:00.000+08:00');
  assert.equal(row.reason,'门禁核实正常');
  assert.equal(row.source,'admin');
  assert.equal(row.canCheckOut,false);
  assert.equal((await post(1,'check-in')).statusCode,409);
  assert.equal((await post(1,'check-out')).statusCode,409);
  const history = (await get('/api/admin/teacher-attendance/1/history',admin)).json();
  assert.equal(history.length,3);
  const correction = history.find((r: any) => r.action==='override');
  assert.equal(correction.actorName,'教务主任');
  assert.equal(correction.beforeStatus,'late_early');
  assert.equal(correction.afterStatus,'present');
  assert.equal(correction.reason,'门禁核实正常');
  const saved = raw.prepare("SELECT before_data,after_data FROM teacher_attendance_logs WHERE action='override'").get() as any;
  assert.equal(JSON.parse(saved.before_data).checkOutAt,'2026-10-30T17:20:00.000+08:00');
  assert.equal(JSON.parse(saved.after_data).checkInAt,'2026-10-30T16:05:00.000+08:00');
  assert.equal((await put(1,{status:'leave',reason:'再次核实请假'})).statusCode,200);
  row = (await get(listUrl)).json().items[0];
  assert.equal(row.status,'leave');
  assert.equal(row.checkInAt,'2026-10-30T16:05:00.000+08:00');
});

test('list summary ignores status filtering and page while export includes every matching row', async () => {
  time = '2026-10-30T20:00:00.000+08:00';
  await put(1,{status:'absent',reason:'核实缺勤'});
  await put(2,{status:'leave',reason:'批准请假'});
  const response = await get(`${adminUrl}&status=absent&page=2&size=1`,admin);
  assert.equal(response.statusCode,200);
  assert.equal(response.json().total,1);
  assert.equal(response.json().items.length,0);
  assert.deepEqual(response.json().summary,{total:2,checkedIn:0,completed:0,abnormal:1,leave:1,pending:0});
  const scoped = (await get(`${adminUrl}&teacherId=1`,admin)).json();
  assert.deepEqual(scoped.items.map((r: any)=>r.sessionId),[1]);
  assert.equal(scoped.summary.total,1);
  const csv = await get(`${adminUrl.replace('teacher-attendance?','teacher-attendance/export?')}&page=2&size=1`,admin);
  assert.equal(csv.statusCode,200);
  assert.match(csv.headers['content-type']!,/text\/csv/);
  assert.ok(csv.body.startsWith('\uFEFF'));
  assert.match(csv.body,/王老师/);
  assert.match(csv.body,/李老师/);
  assert.match(csv.body,/核实缺勤/);
});

test('CSV escapes quotes, newlines and formula prefixes in names and reasons', async () => {
  time = '2026-10-30T20:00:00.000+08:00';
  raw.prepare('UPDATE teachers SET name=? WHERE id=1').run('=2+2');
  try {
    await put(1,{status:'present',reason:'=HYPERLINK("http://example.com")\n核实'});
    const csv = await get('/api/admin/teacher-attendance/export?from=2026-10-30&to=2026-10-30&teacherId=1',admin);
    assert.match(csv.body,/"'=2\+2"/);
    assert.match(csv.body,/"'=HYPERLINK\(""http:\/\/example.com""\)\n核实"/);
  } finally { raw.prepare('UPDATE teachers SET name=? WHERE id=1').run('王老师'); }
});

test('audit failure rolls the punch back atomically', async () => {
  raw.exec("CREATE TRIGGER reject_teacher_audit BEFORE INSERT ON teacher_attendance_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
  try {
    assert.equal((await post(1,'check-in')).statusCode,500);
    assert.equal((raw.prepare('SELECT count(*) n FROM teacher_attendance').get() as any).n,0);
  } finally { raw.exec('DROP TRIGGER reject_teacher_audit'); }
});

test('concurrent duplicate checkout saves only one departure and one audit event', async () => {
  await post(1,'check-in');
  time = '2026-10-30T17:30:00.000+08:00';
  const responses = await Promise.all([post(1,'check-out'),post(1,'check-out')]);
  assert.deepEqual(responses.map((r)=>r.statusCode).sort(),[200,409]);
  const row = (await get(listUrl)).json().items[0];
  assert.equal(row.checkOutAt,'2026-10-30T17:30:00.000+08:00');
  assert.equal(row.status,'present');
  assert.equal((raw.prepare("SELECT count(*) n FROM teacher_attendance_logs WHERE action='check_out'").get() as any).n,1);
});

test('audit failure rolls an admin correction back while preserving the previous punches and reason', async () => {
  await post(1,'check-in');
  time = '2026-10-30T17:30:00.000+08:00';
  await put(1,{status:'present',reason:'首次核实'});
  raw.exec("CREATE TRIGGER reject_teacher_audit BEFORE INSERT ON teacher_attendance_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
  try {
    assert.equal((await put(1,{status:'absent',reason:'错误更正'})).statusCode,500);
    const row = (await get(listUrl)).json().items[0];
    assert.equal(row.status,'present');
    assert.equal(row.reason,'首次核实');
    assert.equal(row.checkInAt,'2026-10-30T16:00:00.000+08:00');
    assert.equal((raw.prepare("SELECT count(*) n FROM teacher_attendance_logs WHERE action='override'").get() as any).n,1);
  } finally { raw.exec('DROP TRIGGER reject_teacher_audit'); }
});

test('a recorded teacher arrival prevents cancelling or rescheduling the original class', async () => {
  assert.equal((await post(1,'check-in')).statusCode,200);
  for (const action of ['cancel','reschedule']) {
    const response = await app.inject({method:'POST',url:`/api/admin/sessions/1/${action}`,headers:admin,payload:{reason:'调整',date:'2026-11-01',startTime:'16:00',endTime:'17:30'}});
    assert.equal(response.statusCode,409,action);
    assert.equal(response.json().code,'TEACHER_ATTENDANCE_EXISTS');
  }
  assert.deepEqual(raw.prepare('SELECT date,status FROM sessions WHERE id=1').get(),{date:'2026-10-30',status:'planned'});
});

for (const action of ['cancel','reschedule']) {
  test(`concurrent ${action} and check-in cannot leave a punch attached to a changed class`, async () => {
    const [schedule,punch] = await Promise.all([
      app.inject({method:'POST',url:`/api/admin/sessions/1/${action}`,headers:admin,payload:{reason:'调整',date:'2026-11-01',startTime:'16:00',endTime:'17:30'}}),
      post(1,'check-in'),
    ]);
    const record = raw.prepare('SELECT * FROM teacher_attendance WHERE session_id=1').get();
    if (record) {
      assert.equal(punch.statusCode,200);
      assert.equal(schedule.statusCode,409);
      assert.equal(schedule.json().code,'TEACHER_ATTENDANCE_EXISTS');
      assert.deepEqual(raw.prepare('SELECT date,status FROM sessions WHERE id=1').get(),{date:'2026-10-30',status:'planned'});
    } else {
      assert.equal(schedule.statusCode,200);
      assert.equal(punch.statusCode,409);
    }
  });
}
