# 课后服务 · 试用版

一个人用 3 周做出来的可试用版本：**建课 → 报名 → 课表 → 点名**。

## 技术栈（试用版取舍）

| 层 | 选择 | 说明 |
|---|---|---|
| 后端 | Fastify 5 + Kysely + TypeScript | 比 NestJS 少一层 DI 样板；路由与业务逻辑可直接迁移 |
| 数据库 | SQLite（better-sqlite3） | 免装数据库，单文件；生产切 PostgreSQL，SQL 基本兼容 |
| 前端 | Vue 3 + Vite + Tailwind v4 | 一个 H5 应用，桌面/手机共用 |
| 路由 | Vue Router | 按角色分流 |

> 与正式方案（NestJS + PostgreSQL + RLS + shadcn-vue）的差异是**刻意**的：试用版优先"能跑"，正式版再补多租户与组件体系。

## 启动

Docker Compose 和 Zeabur 部署步骤见 [DEPLOY.md](DEPLOY.md)。

```bash
npm install          # 首次
npm run db:init      # 初始化数据库 + 演示数据（会清空现有数据）
npm run dev:api      # 后端 http://localhost:5281
npm run dev:web      # 前端 http://localhost:5280
```

两个都要起。前端通过 Vite 代理把 `/api` 转发到 5281。

## 演示账号

| 角色 | 手机号 | 密码 | 能看到 |
|---|---|---|---|
| 管理员 | 13800000000 | admin123 | 工作台、导入、课程、排课、报名、考勤 |
| 教师 | 13900000001 | 123456 | 今日课表、点名 |
| 家长 | 13700000001 | 123456 | 选课、报名、课表 |

家长账号 13700000001 ~ 13700000012 对应 12 名学生。

## 目录

```
apps/api/src/
  db.ts              数据连接与类型
  db/init.ts         建表 + 种子数据
  auth.ts            登录、JWT、越权校验、家长-孩子关系
  routes/            auth / admin / schedule / plans / enroll / attendance
apps/web/src/
  router.ts          路由与角色守卫
  lib/               请求、登录态、toast
  layouts/           后台布局、移动端布局
  pages/             admin(11) / teacher(2) / parent(5)
```

## 已实现的核心规则

- 名额扣减在 SQL 层原子完成（`UPDATE ... WHERE enrolled < capacity`），并发不超卖
- 时间冲突按**真实日期 + 起止时间**比较，相邻时段不算冲突
- 报名重复提交返回 409，不产生第二条记录
- 退课释放名额，但报名记录保留（不物理删除）
- 教师只能看到自己的课次，家长只能看自己的孩子

## 试用版没做

在线支付、退款、请假审批流、消息推送、多租户、审计日志、小程序打包。

这些在《单人交付计划》里按 A/B/C 档逐段补。
