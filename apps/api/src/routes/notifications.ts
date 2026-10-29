import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { HttpError, getUser, requireAuth } from '../auth.js';

const guard = { preHandler: requireAuth('admin', 'teacher', 'parent') };
const num = (v: unknown, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', guard, async (req) => {
    const me = getUser(req);
    const q = req.query as any;
    let query = db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', me.uid)
      .orderBy('id', 'desc')
      .limit(100);
    if (q.unread === '1') query = query.where('read_at', 'is', null);
    return query.execute();
  });

  app.get('/api/notifications/unread-count', guard, async (req) => {
    const me = getUser(req);
    const row = await db
      .selectFrom('notifications')
      .select((e) => e.fn.countAll<number>().as('c'))
      .where('user_id', '=', me.uid)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return { count: Number(row?.c ?? 0) };
  });

  app.post('/api/notifications/:id/read', guard, async (req) => {
    const me = getUser(req);
    const id = num((req.params as any).id);
    const n = await db.selectFrom('notifications').select(['id', 'user_id']).where('id', '=', id).executeTakeFirst();
    if (!n) throw new HttpError(404, 'NOT_FOUND', '消息不存在');
    if (n.user_id !== me.uid) throw new HttpError(403, 'FORBIDDEN', '不能操作他人的消息');
    await db
      .updateTable('notifications')
      .set({ read_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      .where('id', '=', id)
      .execute();
    return { ok: true };
  });

  app.post('/api/notifications/read-all', guard, async (req) => {
    const me = getUser(req);
    await db
      .updateTable('notifications')
      .set({ read_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      .where('user_id', '=', me.uid)
      .where('read_at', 'is', null)
      .execute();
    return { ok: true };
  });
}
