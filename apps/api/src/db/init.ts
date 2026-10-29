import { raw, db } from '../db.js';
import { hashPassword } from '../auth.js';
import { initializeTeacherAttendance } from './teacher-attendance.js';
import { initializeMultiSchool } from './multi-school.js';

const SCHEMA = `
DROP TABLE IF EXISTS operations_logs;
DROP TABLE IF EXISTS teacher_attendance_logs;
DROP TABLE IF EXISTS teacher_attendance;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS session_changes;
DROP TABLE IF EXISTS leave_requests;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS enroll_records;
DROP TABLE IF EXISTS enroll_plan_courses;
DROP TABLE IF EXISTS enroll_plans;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS class_groups;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS student_guardians;
DROP TABLE IF EXISTS guardians;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS school;

CREATE TABLE school (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  term TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','parent')),
  password_hash TEXT NOT NULL,
  teacher_id INTEGER,
  must_change_password INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  grade TEXT NOT NULL,
  name TEXT NOT NULL,
  head_teacher_id INTEGER,
  UNIQUE (school_id, grade, name)
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  class_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE (school_id, code)
);

CREATE TABLE guardians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL
);

CREATE TABLE student_guardians (
  student_id INTEGER NOT NULL,
  guardian_id INTEGER NOT NULL,
  relation TEXT NOT NULL DEFAULT '家长',
  verified INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (student_id, guardian_id)
);

CREATE TABLE teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT,
  teacher_id INTEGER,
  capacity INTEGER NOT NULL DEFAULT 40,
  price_cents INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  refund_note TEXT,
  status TEXT NOT NULL DEFAULT 'published'
);

CREATE TABLE class_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  teacher_id INTEGER,
  room TEXT
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_group_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  UNIQUE (class_group_id, date, start_time)
);

CREATE TABLE enroll_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  name TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE enroll_plan_courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  enrolled INTEGER NOT NULL DEFAULT 0,
  UNIQUE (plan_id, course_id)
);

CREATE TABLE enroll_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_course_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'effective',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (plan_course_id, student_id)
);

CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, student_id)
);

CREATE TABLE session_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  before_data TEXT,
  after_data TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, student_id)
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX ix_notifications_user ON notifications (user_id, read_at);

CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enroll_record_id INTEGER NOT NULL UNIQUE,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL,
  note TEXT,
  operator_id INTEGER,
  paid_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX ix_bills_course ON bills (course_id, status);
CREATE INDEX ix_bills_student ON bills (student_id);

CREATE INDEX ix_students_class ON students (class_id);
CREATE INDEX ix_sessions_date ON sessions (date, class_group_id);
CREATE INDEX ix_sessions_course ON sessions (course_id);
CREATE INDEX ix_enroll_records_student ON enroll_records (student_id, status);
CREATE INDEX ix_attendance_session ON attendance (session_id);
`;

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function dstr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const FAMILY = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙'];
const GIVEN = ['小明', '雨欣', '子轩', '思远', '梓涵', '浩然', '若曦', '宇航', '欣怡', '俊杰', '可欣', '天佑'];

raw.exec(SCHEMA);
initializeTeacherAttendance(raw);

// 学校
raw.prepare('INSERT INTO school (id, name, term) VALUES (1, ?, ?)').run('阳光小学', '2026-秋');

// 教师
const teachers = [
  { name: '王老师', phone: '13900000001' },
  { name: '李老师', phone: '13900000002' },
  { name: '张老师', phone: '13900000003' },
];
const insTeacher = raw.prepare('INSERT INTO teachers (school_id, name, phone) VALUES (1, ?, ?)');
const teacherIds = teachers.map((t) => Number(insTeacher.run(t.name, t.phone).lastInsertRowid));

// 班级
const insClass = raw.prepare('INSERT INTO classes (school_id, grade, name, head_teacher_id) VALUES (1, ?, ?, ?)');
const classA = Number(insClass.run('三年级', '1班', teacherIds[0]).lastInsertRowid);
const classB = Number(insClass.run('三年级', '2班', teacherIds[1]).lastInsertRowid);

// 学生 + 监护人
const insStudent = raw.prepare('INSERT INTO students (school_id, code, name, class_id) VALUES (1, ?, ?, ?)');
const insGuardian = raw.prepare('INSERT INTO guardians (school_id, name, phone) VALUES (1, ?, ?)');
const insSG = raw.prepare('INSERT INTO student_guardians (student_id, guardian_id, relation) VALUES (?, ?, ?)');

const studentIds: number[] = [];
for (let i = 0; i < 12; i++) {
  const name = FAMILY[i] + GIVEN[i];
  const code = `2026${String(i + 1).padStart(3, '0')}`;
  const cls = i < 6 ? classA : classB;
  const sid = Number(insStudent.run(code, name, cls).lastInsertRowid);
  studentIds.push(sid);
  const phone = `137000000${String(i + 1).padStart(2, '0')}`;
  const gid = Number(insGuardian.run(name.slice(0, 1) + '女士', phone).lastInsertRowid);
  insSG.run(sid, gid, i % 2 === 0 ? '母亲' : '父亲');
}

// 课程
const insCourse = raw.prepare(
  `INSERT INTO courses (school_id, term, name, grade, teacher_id, capacity, price_cents, description, refund_note)
   VALUES (1, '2026-秋', ?, '三年级', ?, ?, ?, ?, ?)`
);
const courseHost = Number(
  insCourse.run(
    '基础托管',
    teacherIds[0],
    40,
    0,
    '周一至周五放学后托管，含作业辅导与阅读。',
    '开课前可全额退；开课后按已上课次扣减。'
  ).lastInsertRowid
);
const courseGo = Number(
  insCourse.run(
    '围棋社团',
    teacherIds[1],
    20,
    80000,
    '零基础入门，每周一次，含棋具使用。',
    '开课前可全额退；开课后不退材料费。'
  ).lastInsertRowid
);

// 教学班
const insGroup = raw.prepare(
  'INSERT INTO class_groups (course_id, name, capacity, teacher_id, room) VALUES (?, ?, ?, ?, ?)'
);
const groupHost = Number(insGroup.run(courseHost, '托管-三年级', 40, teacherIds[0], '本班教室').lastInsertRowid);
const groupGo = Number(insGroup.run(courseGo, '围棋-周三班', 20, teacherIds[1], '综合楼 302').lastInsertRowid);

// 课次：从本周一开始，12 周（保证试用当天就有课）
const insSession = raw.prepare(
  'INSERT INTO sessions (class_group_id, course_id, date, weekday, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
);
const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dow = start.getDay() === 0 ? 7 : start.getDay();
start.setDate(start.getDate() - (dow - 1)); // 本周一
for (let w = 0; w < 12; w++) {
  for (let d = 0; d < 5; d++) {
    const day = new Date(start);
    day.setDate(start.getDate() + w * 7 + d);
    const ds = dstr(day);
    insSession.run(groupHost, courseHost, ds, d + 1, '16:00', '17:30');
    if (d === 2) {
      insSession.run(groupGo, courseGo, ds, d + 1, '16:00', '17:30');
    }
  }
}

// 账号
const insUser = raw.prepare(
  'INSERT INTO users (phone, name, role, password_hash, teacher_id) VALUES (?, ?, ?, ?, ?)'
);
insUser.run('13800000000', '教务主任', 'admin', hashPassword('admin123'), null);
teachers.forEach((t, i) => {
  insUser.run(t.phone, t.name, 'teacher', hashPassword('123456'), teacherIds[i]);
});
for (let i = 0; i < 12; i++) {
  const phone = `137000000${String(i + 1).padStart(2, '0')}`;
  insUser.run(phone, `${FAMILY[i]}家长`, 'parent', hashPassword('123456'), null);
}

// 报名计划（长期开放，便于试用）
const planId = Number(
  raw
    .prepare(
      `INSERT INTO enroll_plans (school_id, term, name, start_at, end_at, status)
       VALUES (1, '2026-秋', '2026 秋季课后服务报名', '2026-10-01 00:00', '2027-01-31 23:59', 'open')`
    )
    .run().lastInsertRowid
);
raw
  .prepare('INSERT INTO enroll_plan_courses (plan_id, course_id, capacity, enrolled) VALUES (?, ?, ?, 0)')
  .run(planId, courseHost, 40);
raw
  .prepare('INSERT INTO enroll_plan_courses (plan_id, course_id, capacity, enrolled) VALUES (?, ?, ?, 0)')
  .run(planId, courseGo, 20);

// 预置一些报名，让演示有数据（学生 2-9 报托管，10-11 报围棋，学生 1 留给现场演示）
const pcHost = raw.prepare('SELECT id FROM enroll_plan_courses WHERE plan_id = ? AND course_id = ?').get(planId, courseHost) as any;
const pcGo = raw.prepare('SELECT id FROM enroll_plan_courses WHERE plan_id = ? AND course_id = ?').get(planId, courseGo) as any;
const insRecord = raw.prepare(
  'INSERT INTO enroll_records (plan_course_id, course_id, student_id, status) VALUES (?, ?, ?, ?)'
);
for (let i = 1; i <= 8; i++) {
  insRecord.run(pcHost.id, courseHost, studentIds[i], 'effective');
}
const insBill = raw.prepare(
  'INSERT INTO bills (enroll_record_id, student_id, course_id, amount_cents, paid_cents, status) VALUES (?, ?, ?, ?, ?, ?)'
);
const insPayment = raw.prepare(
  'INSERT INTO payments (bill_id, amount_cents, method, note, operator_id) VALUES (?, ?, ?, ?, ?)'
);
for (const i of [9, 10]) {
  const r = insRecord.run(pcGo.id, courseGo, studentIds[i], 'effective');
  const recId = Number(r.lastInsertRowid);
  if (i === 10) {
    // 演示：一个已缴清，一个待缴
    const b = insBill.run(recId, studentIds[i], courseGo, 80000, 80000, 'paid');
    insPayment.run(Number(b.lastInsertRowid), 80000, 'cash', '现金缴纳', 1);
  } else {
    insBill.run(recId, studentIds[i], courseGo, 80000, 0, 'unpaid');
  }
}
raw.prepare('UPDATE enroll_plan_courses SET enrolled = 8 WHERE id = ?').run(pcHost.id);
raw.prepare('UPDATE enroll_plan_courses SET enrolled = 2 WHERE id = ?').run(pcGo.id);

initializeMultiSchool(raw);
console.log('✅ 初始化完成');
console.log('   运营    13600000000 / ops123456');
console.log('   管理员  13800000000 / admin123');
console.log('   教师    13900000001 / 123456');
console.log('   家长    13700000001 / 123456');
await db.destroy();
