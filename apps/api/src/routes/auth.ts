import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import {
  HttpError,
  childrenOf,
  getUser,
  hashPassword,
  requireAuth,
  signToken,
  verifyPassword,
} from '../auth.js';

const loginSchema = z.object({
  phone: z.string().min(5),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req) => {
    const { phone, password } = loginSchema.parse(req.body);
    const user = await db.selectFrom('users').selectAll().where('phone', '=', phone).executeTakeFirst();
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'BAD_CREDENTIALS', '手机号或密码不正确');
    }
    const token = signToken({ uid: user.id, role: user.role, name: user.name });
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        phone: user.phone,
        mustChangePassword: user.must_change_password === 1,
      },
    };
  });

  app.post('/api/auth/change-password', { preHandler: requireAuth() }, async (req) => {
    const p = getUser(req);
    const b = req.body as any;
    const oldPassword = String(b?.oldPassword || '');
    const newPassword = String(b?.newPassword || '');
    if (newPassword.length < 6) throw new HttpError(400, 'WEAK_PASSWORD', '新密码至少 6 位');
    if (newPassword === oldPassword) throw new HttpError(400, 'SAME_PASSWORD', '新密码不能与旧密码相同');

    const user = await db.selectFrom('users').selectAll().where('id', '=', p.uid).executeTakeFirst();
    if (!user) throw new HttpError(404, 'NOT_FOUND', '账号不存在');
    if (!verifyPassword(oldPassword, user.password_hash)) {
      throw new HttpError(400, 'BAD_OLD_PASSWORD', '原密码不正确');
    }
    await db
      .updateTable('users')
      .set({ password_hash: hashPassword(newPassword), must_change_password: 0 })
      .where('id', '=', p.uid)
      .execute();
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requireAuth() }, async (req) => {
    const p = getUser(req);
    const user = await db.selectFrom('users').selectAll().where('id', '=', p.uid).executeTakeFirstOrThrow();
    const base = {
      id: user.id,
      name: user.name,
      role: user.role,
      phone: user.phone,
      mustChangePassword: user.must_change_password === 1,
    };
    if (user.role === 'parent') {
      const children = await childrenOf(user.id);
      return { ...base, children };
    }
    if (user.role === 'teacher' && user.teacher_id) {
      const t = await db.selectFrom('teachers').selectAll().where('id', '=', user.teacher_id).executeTakeFirst();
      return { ...base, teacher: t ? { id: t.id, name: t.name } : null };
    }
    return base;
  });
}
