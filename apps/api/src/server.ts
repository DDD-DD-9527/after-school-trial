import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { HttpError } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { scheduleRoutes } from './routes/schedule.js';
import { planRoutes } from './routes/plans.js';
import { enrollRoutes } from './routes/enroll.js';
import { attendanceRoutes } from './routes/attendance.js';
import { notificationRoutes } from './routes/notifications.js';
import { financeRoutes } from './routes/finance.js';

const app = Fastify({ logger: false });

await app.register(cors, { origin: true, credentials: true });

app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(scheduleRoutes);
await app.register(planRoutes);
await app.register(enrollRoutes);
await app.register(attendanceRoutes);
await app.register(notificationRoutes);
await app.register(financeRoutes);

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) {
    return reply.status(err.status).send({ code: err.code, message: err.message });
  }
  if (err instanceof ZodError) {
    return reply.status(400).send({ code: 'BAD_INPUT', message: err.issues[0]?.message ?? '参数不合法', issues: err.issues });
  }
  if ((err as any).statusCode === 400) {
    return reply.status(400).send({ code: 'BAD_JSON', message: '请求格式不正确' });
  }
  app.log.error(err);
  return reply.status(500).send({ code: 'INTERNAL', message: '服务器开小差了，请稍后再试' });
});

const port = Number(process.env.PORT || 5281);
await app.listen({ port, host: '0.0.0.0' });
console.log(`API 已启动: http://localhost:${port}`);
