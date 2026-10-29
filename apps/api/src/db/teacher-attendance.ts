import type Database from 'better-sqlite3';

/** Additive startup migration: never initializes or rewrites the existing trial data. */
export function initializeTeacherAttendance(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS teacher_attendance (
      session_id INTEGER PRIMARY KEY,
      teacher_id INTEGER NOT NULL,
      check_in_at TEXT,
      check_out_at TEXT,
      override_status TEXT CHECK (override_status IS NULL OR override_status IN ('present','late','early','late_early','absent','leave')),
      reason TEXT,
      updated_by INTEGER,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_teacher_attendance_teacher ON teacher_attendance(teacher_id);
    CREATE TABLE IF NOT EXISTS teacher_attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      teacher_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('check_in','check_out','override')),
      actor_id INTEGER NOT NULL,
      actor_name TEXT NOT NULL,
      reason TEXT,
      before_status TEXT NOT NULL,
      after_status TEXT NOT NULL,
      before_data TEXT NOT NULL,
      after_data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_teacher_attendance_logs_session ON teacher_attendance_logs(session_id,id);
  `);
}
