import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'after-school-trial-secret';
const JWT_TTL = '7d';

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(plain, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'));
}

export interface TokenPayload {
  uid: number;
  role: 'admin' | 'teacher' | 'parent';
  name: string;
}

export function signToken(p: TokenPayload): string {
  return jwt.sign(p, JWT_SECRET, { expiresIn: JWT_TTL });
}

export function readToken(req: FastifyRequest): TokenPayload | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(h.slice(7), JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export function requireAuth(...roles: Array<'admin' | 'teacher' | 'parent'>) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const p = readToken(req);
    if (!p) throw new HttpError(401, 'UNAUTHORIZED', '请先登录');
    if (roles.length && !roles.includes(p.role)) {
      throw new HttpError(403, 'FORBIDDEN', '没有权限访问');
    }
    (req as unknown as { user: TokenPayload }).user = p;
  };
}

export function getUser(req: FastifyRequest): TokenPayload {
  return (req as unknown as { user: TokenPayload }).user;
}

/** 家长 -> 当前可管理的孩子列表 */
export async function childrenOf(uid: number) {
  return db
    .selectFrom('students as s')
    .innerJoin('student_guardians as sg', 'sg.student_id', 's.id')
    .innerJoin('guardians as g', 'g.id', 'sg.guardian_id')
    .innerJoin('users as u', 'u.phone', 'g.phone')
    .select(['s.id', 's.name', 's.code', 's.class_id'])
    .where('u.id', '=', uid)
    .where('s.status', '=', 'active')
    .execute();
}
