import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { raw } from '../db.js';
import { HttpError, getUser, requireAuth } from '../auth.js';
import { schoolIdOf } from '../lib/school-scope.js';
import {
  attendanceCsv, attendanceItem, correctionSchema, parseAttendanceQuery, rules,
  sessionIdSchema, sessionInstant, shanghaiTimestamp, shanghaiToday, summarizeAttendance,
  type AttendanceItem, type AttendanceJoined, type AttendanceQuery,
} from '../lib/teacher-attendance.js';

export interface TeacherAttendanceOptions { clock?: () => Date }

const teacherGuard = { preHandler: requireAuth('teacher') };
const adminGuard = { preHandler: requireAuth('admin') };
const emptyBody = z.object({}).strict();
interface Actor { id: number; name: string; role: string; teacher_id: number | null; teacher_status: string | null; school_id: number }
const joinedSql = `SELECT s.id AS session_id, g.teacher_id, t.name AS teacher_name,
  c.name AS course_name, g.name AS group_name, g.room, s.date, s.start_time, s.end_time,
  s.status AS session_status, a.check_in_at, a.check_out_at, a.override_status, a.reason
  FROM sessions s JOIN class_groups g ON g.id=s.class_group_id AND g.course_id=s.course_id JOIN courses c ON c.id=s.course_id
  LEFT JOIN teachers t ON t.id=g.teacher_id AND t.school_id=c.school_id LEFT JOIN teacher_attendance a ON a.session_id=s.id`;

function actorOf(req: FastifyRequest, role: 'admin' | 'teacher'): Actor {
  const user = getUser(req);
  const actor = raw.prepare(`SELECT u.id,u.name,u.role,u.teacher_id,u.school_id,t.status AS teacher_status
    FROM users u LEFT JOIN teachers t ON t.id=u.teacher_id AND t.school_id=u.school_id
    WHERE u.id=? AND u.school_id=? AND u.status='active'`).get(user.uid,schoolIdOf(req)) as Actor | undefined;
  if (!actor || actor.role !== role) throw new HttpError(403,'FORBIDDEN','账号没有此操作权限');
  if (role === 'teacher' && (!actor.teacher_id || actor.teacher_status !== 'active')) {
    throw new HttpError(403,'NO_TEACHER','当前账号未绑定有效教师或教师已停用');
  }
  return actor;
}
function sessionOf(id: number, schoolId: number): AttendanceJoined {
  const row = raw.prepare(`${joinedSql} WHERE s.id=? AND c.school_id=?`).get(id,schoolId) as AttendanceJoined | undefined;
  if (!row) throw new HttpError(404,'NOT_FOUND','课次不存在');
  return row;
}
function listItems(query: AttendanceQuery, now: Date, schoolId: number): AttendanceItem[] {
  if (query.teacherId && !raw.prepare('SELECT id FROM teachers WHERE id=? AND school_id=?').get(query.teacherId,schoolId)) {
    throw new HttpError(404,'NOT_FOUND','教师不存在');
  }
  const args: Array<string | number> = [query.from,query.to,schoolId];
  const teacherWhere = query.teacherId ? ' AND g.teacher_id=?' : '';
  if (query.teacherId) args.push(query.teacherId);
  const rows = raw.prepare(`${joinedSql} WHERE s.date>=? AND s.date<=? AND s.status!='cancelled'
    AND c.school_id=? AND g.teacher_id IS NOT NULL AND t.id IS NOT NULL${teacherWhere} ORDER BY s.date,s.start_time,s.id`).all(...args) as AttendanceJoined[];
  return rows.map((row) => attendanceItem(row,now));
}
function sessionId(req: FastifyRequest): number { return sessionIdSchema.parse((req.params as {sessionId: string}).sessionId); }
function logChange(action: 'check_in' | 'check_out' | 'override', actor: Actor, before: AttendanceItem, after: AttendanceItem, now: string, reason: string | null = null) {
  raw.prepare(`INSERT INTO teacher_attendance_logs
    (session_id,teacher_id,action,actor_id,actor_name,reason,before_status,after_status,before_data,after_data,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(before.sessionId,before.teacherId,action,actor.id,actor.name,reason,before.status,after.status,JSON.stringify(before),JSON.stringify(after),now);
}

export async function teacherAttendanceRoutes(app: FastifyInstance, options: TeacherAttendanceOptions) {
  const clock = options.clock ?? (() => new Date());
  app.get('/api/teacher/attendance',teacherGuard,async (req) => {
    const actor = actorOf(req,'teacher');
    const now = clock();
    const query = { ...parseAttendanceQuery(req.query,now),teacherId: actor.teacher_id! };
    const items = listItems(query,now,actor.school_id);
    return { today:shanghaiToday(now),now:shanghaiTimestamp(now),rules,items,total:items.length,summary:summarizeAttendance(items) };
  });
  app.get('/api/admin/teacher-attendance',adminGuard,async (req) => {
    const actor = actorOf(req,'admin');
    const now = clock();
    const query = parseAttendanceQuery(req.query,now,true);
    const scoped = listItems(query,now,actor.school_id);
    const filtered = query.status ? scoped.filter((r) => r.status === query.status) : scoped;
    const items = filtered.slice((query.page - 1) * query.size,query.page * query.size);
    return { today:shanghaiToday(now),now:shanghaiTimestamp(now),rules,items,total:filtered.length,summary:summarizeAttendance(scoped) };
  });
  app.get('/api/admin/teacher-attendance/export',adminGuard,async (req,reply) => {
    const actor = actorOf(req,'admin');
    const now = clock();
    const query = parseAttendanceQuery(req.query,now,true);
    const scoped = listItems(query,now,actor.school_id);
    const items = query.status ? scoped.filter((r) => r.status === query.status) : scoped;
    return reply.header('content-type','text/csv; charset=utf-8')
      .header('content-disposition',`attachment; filename="teacher-attendance-${query.from}-${query.to}.csv"`)
      .send(attendanceCsv(items));
  });
  app.get('/api/admin/teacher-attendance/:sessionId/history',adminGuard,async (req) => {
    const actor = actorOf(req,'admin');
    const id = sessionId(req);
    sessionOf(id,actor.school_id);
    return raw.prepare(`SELECT id,action,actor_name AS actorName,reason,before_status AS beforeStatus,
      after_status AS afterStatus,created_at AS createdAt FROM teacher_attendance_logs WHERE session_id=? ORDER BY id DESC`).all(id);
  });

  for (const action of ['check-in','check-out'] as const) {
    app.post(`/api/teacher/attendance/:sessionId/${action}`,teacherGuard,async (req) => {
      emptyBody.parse(req.body ?? {});
      const id = sessionId(req);
      // All reads, validation, mutation and audit run without yielding in one SQLite transaction.
      // A competing submission cannot replace the first recorded instant.
      return raw.transaction(() => {
        const actor = actorOf(req,'teacher');
        const now = clock();
        const timestamp = shanghaiTimestamp(now);
        const row = sessionOf(id,actor.school_id);
        if (row.teacher_id !== actor.teacher_id) throw new HttpError(403,'FORBIDDEN','不是您的授课课次');
        if (row.session_status === 'cancelled') throw new HttpError(409,'CANCELLED','课次已停课，不能打卡');
        if (row.override_status) throw new HttpError(409,'ADMIN_CORRECTED','考勤已由教务更正，不能自主打卡');
        const before = attendanceItem(row,now);
        if (action === 'check-in') {
          if (row.check_in_at) throw new HttpError(409,'ALREADY_CHECKED_IN','已签到，请勿重复提交');
          if (!before.canCheckIn) throw new HttpError(409,'OUTSIDE_WINDOW','当前不在签到时间内');
          raw.prepare(`INSERT INTO teacher_attendance(session_id,teacher_id,check_in_at,updated_by,updated_at)
            VALUES (?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET check_in_at=excluded.check_in_at,
            teacher_id=excluded.teacher_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(id,actor.teacher_id,timestamp,actor.id,timestamp);
        } else {
          if (!row.check_in_at) throw new HttpError(409,'NOT_CHECKED_IN','请先签到再签退');
          if (row.check_out_at) throw new HttpError(409,'ALREADY_CHECKED_OUT','已签退，请勿重复提交');
          if (!before.canCheckOut) throw new HttpError(409,'OUTSIDE_WINDOW','当前不在签退时间内');
          raw.prepare('UPDATE teacher_attendance SET check_out_at=?,updated_by=?,updated_at=? WHERE session_id=?').run(timestamp,actor.id,timestamp,id);
        }
        const item = attendanceItem(sessionOf(id,actor.school_id),now);
        logChange(action === 'check-in' ? 'check_in' : 'check_out',actor,before,item,timestamp);
        return { ok:true,item };
      }).immediate();
    });
  }
  app.put('/api/admin/teacher-attendance/:sessionId',adminGuard,async (req) => {
    const input = correctionSchema.parse(req.body);
    const id = sessionId(req);
    return raw.transaction(() => {
      const actor = actorOf(req,'admin');
      const now = clock();
      const timestamp = shanghaiTimestamp(now);
      const row = sessionOf(id,actor.school_id);
      if (row.session_status === 'cancelled') throw new HttpError(409,'CANCELLED','停课课次不能更正考勤');
      if (!row.teacher_id || !row.teacher_name) throw new HttpError(409,'NO_TEACHER','课次尚未分配授课教师');
      if (now.getTime() < sessionInstant(row.date,row.end_time)) throw new HttpError(409,'SESSION_NOT_ENDED','课次结束后才能更正考勤');
      const before = attendanceItem(row,now);
      // Corrections set only the override fields and preserve both original punch timestamps.
      raw.prepare(`INSERT INTO teacher_attendance(session_id,teacher_id,override_status,reason,updated_by,updated_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET override_status=excluded.override_status,
        reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(id,row.teacher_id,input.status,input.reason,actor.id,timestamp);
      const item = attendanceItem(sessionOf(id,actor.school_id),now);
      logChange('override',actor,before,item,timestamp,input.reason);
      return { ok:true,item };
    }).immediate();
  });
}
