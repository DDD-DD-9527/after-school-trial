import { Kysely, SqliteDialect, type Generated } from 'kysely';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_FILE = path.join(DATA_DIR, 'app.db');

export interface School {
  id: Generated<number>;
  name: string;
  term: string;
}
export interface User {
  id: Generated<number>;
  phone: string;
  name: string;
  role: 'admin' | 'teacher' | 'parent';
  password_hash: string;
  teacher_id: number | null;
  must_change_password: Generated<number>;
}
export interface ClassRow {
  id: Generated<number>;
  school_id: number;
  grade: string;
  name: string;
  head_teacher_id: number | null;
}
export interface Student {
  id: Generated<number>;
  school_id: number;
  code: string;
  name: string;
  class_id: number | null;
  status: string;
}
export interface Guardian {
  id: Generated<number>;
  school_id: number;
  name: string;
  phone: string;
}
export interface StudentGuardian {
  student_id: number;
  guardian_id: number;
  relation: string;
  verified: Generated<number>;
}
export interface Teacher {
  id: Generated<number>;
  school_id: number;
  name: string;
  phone: string;
  status: string;
}
export interface Course {
  id: Generated<number>;
  school_id: number;
  term: string;
  name: string;
  grade: string | null;
  teacher_id: number | null;
  capacity: number;
  price_cents: number;
  description: string | null;
  refund_note: string | null;
  status: string;
}
export interface ClassGroup {
  id: Generated<number>;
  course_id: number;
  name: string;
  capacity: number;
  teacher_id: number | null;
  room: string | null;
}
export interface Session {
  id: Generated<number>;
  class_group_id: number;
  course_id: number;
  date: string;
  weekday: number;
  start_time: string;
  end_time: string;
  status: string;
}
export interface EnrollPlan {
  id: Generated<number>;
  school_id: number;
  term: string;
  name: string;
  start_at: string;
  end_at: string;
  status: string;
}
export interface EnrollPlanCourse {
  id: Generated<number>;
  plan_id: number;
  course_id: number;
  capacity: number;
  enrolled: number;
}
export interface EnrollRecord {
  id: Generated<number>;
  plan_course_id: number;
  course_id: number;
  student_id: number;
  status: string;
  created_at: Generated<string>;
}
export interface Attendance {
  id: Generated<number>;
  session_id: number;
  student_id: number;
  status: string;
  updated_by: number | null;
  updated_at: Generated<string>;
}

export interface SessionChange {
  id: Generated<number>;
  session_id: number;
  type: string;
  before_data: string | null;
  after_data: string | null;
  reason: string | null;
  created_at: Generated<string>;
}

export interface LeaveRequest {
  id: Generated<number>;
  student_id: number;
  session_id: number;
  reason: string | null;
  status: string;
  created_at: Generated<string>;
}

export interface Notification {
  id: Generated<number>;
  user_id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: Generated<string>;
}

export interface Bill {
  id: Generated<number>;
  enroll_record_id: number;
  student_id: number;
  course_id: number;
  amount_cents: number;
  paid_cents: number;
  status: string;
  created_at: Generated<string>;
}

export interface Payment {
  id: Generated<number>;
  bill_id: number;
  amount_cents: number;
  method: string;
  note: string | null;
  operator_id: number | null;
  paid_at: Generated<string>;
}

export interface DB {
  school: School;
  users: User;
  classes: ClassRow;
  students: Student;
  guardians: Guardian;
  student_guardians: StudentGuardian;
  teachers: Teacher;
  courses: Course;
  class_groups: ClassGroup;
  sessions: Session;
  enroll_plans: EnrollPlan;
  enroll_plan_courses: EnrollPlanCourse;
  enroll_records: EnrollRecord;
  attendance: Attendance;
  session_changes: SessionChange;
  leave_requests: LeaveRequest;
  notifications: Notification;
  bills: Bill;
  payments: Payment;
}

const sqlite = new Database(DB_FILE);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = new Kysely<DB>({
  dialect: new SqliteDialect({ database: sqlite }),
});

export const raw = sqlite;

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nowStr(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

