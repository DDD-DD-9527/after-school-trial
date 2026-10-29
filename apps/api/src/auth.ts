import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db.js';
export { hashPassword, verifyPassword } from './lib/passwords.js';
const JWT_SECRET = process.env.JWT_SECRET || 'after-school-trial-secret';
const JWT_TTL = '7d';
export type Role = 'operator' | 'admin' | 'teacher' | 'parent';
export interface TokenPayload { uid: number; role: Role; name: string; schoolId?: number | null }
export function signToken(payload: TokenPayload): string { return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL }); }
export function readToken(req: FastifyRequest): TokenPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try { return jwt.verify(header.slice(7), JWT_SECRET) as TokenPayload; } catch { return null; }
}
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function requireAuth(...roles: Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const payload = readToken(req);
    if (!payload || !Number.isSafeInteger(payload.uid)) throw new HttpError(401, 'UNAUTHORIZED', '请先登录');
    const user = await db.selectFrom('users').selectAll().where('id', '=', payload.uid).executeTakeFirst();
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', '账号已失效，请重新登录');
    if (user.role !== payload.role || (payload.schoolId !== undefined && payload.schoolId !== user.school_id)) throw new HttpError(403, 'FORBIDDEN', '登录身份已变化，请重新登录');
    if (user.status !== 'active') throw new HttpError(403, 'ACCOUNT_DISABLED', '账号已停用，请联系管理员');
    if (roles.length && !roles.includes(user.role)) throw new HttpError(403, 'FORBIDDEN', '没有权限访问');
    if (user.role !== 'operator') {
      const school = user.school_id ? await db.selectFrom('school').select(['id', 'status']).where('id', '=', user.school_id).executeTakeFirst() : null;
      if (!school || school.status !== 'active') throw new HttpError(403, 'SCHOOL_DISABLED', '学校服务已停用，请联系学校管理员');
    }
    if (user.must_change_password === 1 && !['/api/me', '/api/auth/change-password'].includes(req.url.split('?')[0])) {
      throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', '首次登录请先修改初始密码');
    }
    (req as unknown as { user: TokenPayload }).user = { uid: user.id, role: user.role, name: user.name, schoolId: user.school_id };
  };
}
export function getUser(req: FastifyRequest): TokenPayload { return (req as unknown as { user: TokenPayload }).user; }
export async function childrenOf(uid: number) {
  return db.selectFrom('students as s')
    .innerJoin('student_guardians as sg', 'sg.student_id', 's.id')
    .innerJoin('guardians as g', join => join.onRef('g.id', '=', 'sg.guardian_id').onRef('g.school_id', '=', 's.school_id'))
    .innerJoin('users as u', join => join.onRef('u.phone', '=', 'g.phone').onRef('u.school_id', '=', 's.school_id'))
    .select(['s.id', 's.name', 's.code', 's.class_id']).where('u.id', '=', uid).where('u.role', '=', 'parent').where('u.status', '=', 'active').where('s.status', '=', 'active').execute();
}
