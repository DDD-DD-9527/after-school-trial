import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeMultiSchool } from '../db/multi-school.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';

const source=fs.readFileSync(new URL('../db/init.ts',import.meta.url),'utf8');
const schema=source.match(/const SCHEMA = `([\s\S]*?)`;/)?.[1];
assert.ok(schema);
function legacy() {
  const database=new Database(':memory:');
  database.exec(schema!);
  database.prepare('INSERT INTO school(id,name,term) VALUES(1,?,?)').run('保留学校','2026-秋');
  database.prepare('INSERT INTO users(id,phone,name,role,password_hash) VALUES(7,?,?,?,?)').run('13800000000','原校管理员','admin',hashPassword('legacy123'));
  database.prepare("INSERT INTO classes(id,school_id,grade,name) VALUES(9,1,'三年级','一班')").run();
  database.prepare("INSERT INTO students(id,school_id,code,name,class_id,status) VALUES(11,1,'S001','原学生',9,'active')").run();
  return database;
}

test('migration is repeatable, preserves legacy identifiers and hashes, and writes a recoverable pre-upgrade backup',()=>{
  const database=legacy(),backupDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'migration-backup-'));
  const originalUser=database.prepare('SELECT * FROM users WHERE id=7').get() as any;
  const originalStudents=database.prepare('SELECT * FROM students').all();
  const originalClasses=database.prepare('SELECT * FROM classes').all();
  try {
    initializeMultiSchool(database,{backupDirectory});
    const users=database.prepare('SELECT * FROM users ORDER BY id').all();
    const migrated=database.prepare('SELECT * FROM users WHERE id=7').get() as any;
    for(const key of Object.keys(originalUser))assert.equal(migrated[key],originalUser[key],key);
    assert.equal(migrated.school_id,1);
    assert.ok(verifyPassword('legacy123',migrated.password_hash));
    assert.deepEqual(database.prepare('SELECT * FROM students').all(),originalStudents);
    assert.deepEqual(database.prepare('SELECT * FROM classes').all(),originalClasses);
    const files=fs.readdirSync(backupDirectory);assert.equal(files.length,1);
    const backup=new Database(path.join(backupDirectory,files[0]),{readonly:true});
    try {
      assert.deepEqual(backup.prepare('SELECT * FROM users WHERE id=7').get(),originalUser);
      assert.deepEqual(backup.prepare('SELECT * FROM students').all(),originalStudents);
      assert.equal(backup.pragma('integrity_check',{simple:true}),'ok');
    } finally {backup.close();}
    initializeMultiSchool(database,{backupDirectory});
    assert.deepEqual(database.prepare('SELECT * FROM users ORDER BY id').all(),users);
    assert.equal(fs.readdirSync(backupDirectory).length,1);
    assert.equal((database.prepare("SELECT count(*) n FROM users WHERE role='operator'").get() as any).n,1);
    assert.equal(database.pragma('integrity_check',{simple:true}),'ok');
  } finally {database.close();fs.rmSync(backupDirectory,{recursive:true,force:true});}
});

test('a rejected legacy account leaves the original schema and all business rows intact',()=>{
  const database=legacy();
  try {
    database.pragma('ignore_check_constraints = ON');
    database.prepare("UPDATE users SET role='invalid_legacy_role' WHERE id=7").run();
    database.pragma('ignore_check_constraints = OFF');
    const originalSchema=database.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const originalUsers=database.prepare('SELECT * FROM users').all();
    const originalStudents=database.prepare('SELECT * FROM students').all();
    assert.throws(()=>initializeMultiSchool(database),/CHECK constraint/);
    assert.deepEqual(database.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all(),originalSchema);
    assert.deepEqual(database.prepare('SELECT * FROM users').all(),originalUsers);
    assert.deepEqual(database.prepare('SELECT * FROM students').all(),originalStudents);
  } finally {database.close();}
});
