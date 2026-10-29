import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from '../lib/passwords.js';

/** Preserve legacy identifiers, passwords and business facts while adding school ownership. */
export function initializeMultiSchool(database: Database.Database, options: { backupDirectory?: string } = {}): void {
  const usersTable = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql: string } | undefined;
  const schoolExists = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='school'").get();
  if (!usersTable || !schoolExists) return;
  const columns = (table: string) => (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name);
  const userColumns = columns('users');
  const rebuildUsers = !userColumns.includes('school_id') || !usersTable.sql.includes("'operator'");
  if (rebuildUsers && options.backupDirectory) {
    fs.mkdirSync(options.backupDirectory, { recursive: true });
    const destination = path.join(options.backupDirectory, `before-multischool-auto-${Date.now()}.db`);
    database.prepare('VACUUM INTO ?').run(destination);
  }
  database.transaction(() => {
    const schoolColumns = columns('school');
    const additions: Record<string, string> = {
      code: 'TEXT', status: "TEXT NOT NULL DEFAULT 'active'", contact_name: "TEXT NOT NULL DEFAULT ''",
      contact_phone: "TEXT NOT NULL DEFAULT ''", created_at: "TEXT NOT NULL DEFAULT ''",
    };
    for (const [column, definition] of Object.entries(additions)) {
      if (!schoolColumns.includes(column)) database.exec(`ALTER TABLE school ADD COLUMN ${column} ${definition}`);
    }
    database.exec("UPDATE school SET code=CASE WHEN id=1 THEN 'sunshine' ELSE 'school-'||id END WHERE code IS NULL OR code=''; UPDATE school SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE created_at=''; CREATE UNIQUE INDEX IF NOT EXISTS ux_school_code ON school(code COLLATE NOCASE);");
    if (rebuildUsers) {
      const legacySchool = (database.prepare('SELECT id FROM school ORDER BY id LIMIT 1').get() as { id: number } | undefined)?.id;
      const oldUsers = database.prepare('SELECT * FROM users ORDER BY id').all() as any[];
      if (oldUsers.length && !legacySchool) throw new Error('账号缺少可迁移的学校，请先核实原学校数据');
      database.exec(`CREATE TABLE users_v09 (
        id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('operator','admin','teacher','parent')),
        password_hash TEXT NOT NULL, teacher_id INTEGER, must_change_password INTEGER NOT NULL DEFAULT 0,
        school_id INTEGER, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        CHECK((role='operator' AND school_id IS NULL) OR (role!='operator' AND school_id IS NOT NULL))
      );`);
      const insert = database.prepare('INSERT INTO users_v09(id,phone,name,role,password_hash,teacher_id,must_change_password,school_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
      for (const user of oldUsers) {
        const teacherSchool = user.teacher_id && database.prepare('SELECT school_id FROM teachers WHERE id=?').get(user.teacher_id) as { school_id: number } | undefined;
        insert.run(user.id, user.phone, user.name, user.role, user.password_hash, user.teacher_id ?? null, user.must_change_password ?? 0,
          user.role === 'operator' ? null : user.school_id ?? teacherSchool?.school_id ?? legacySchool,
          user.status ?? 'active', user.created_at || new Date().toISOString());
      }
      database.exec('DROP TABLE users; ALTER TABLE users_v09 RENAME TO users;');
    }
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_users_school_phone ON users(school_id,phone) WHERE school_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_operator_phone ON users(phone) WHERE role='operator';
      CREATE INDEX IF NOT EXISTS ix_users_school_role ON users(school_id,role);
      CREATE TABLE IF NOT EXISTS operations_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, school_id INTEGER NOT NULL, actor_id INTEGER NOT NULL,
        actor_name TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ); CREATE INDEX IF NOT EXISTS ix_operations_logs_school ON operations_logs(school_id,id);`);
    if (!database.prepare("SELECT id FROM users WHERE role='operator'").get()) {
      database.prepare("INSERT INTO users(phone,name,role,password_hash,teacher_id,school_id,status) VALUES(?,?,'operator',?,NULL,NULL,'active')")
        .run(process.env.TRIAL_OPERATOR_PHONE || '13600000000', '运营管理员', hashPassword(process.env.TRIAL_OPERATOR_PASSWORD || 'ops123456'));
    }
  })();
}
