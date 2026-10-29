# Docker Compose / Zeabur 部署

本项目作为独立个人仓库维护，目标分支为 `main`，部署环境为个人演示环境。

## 容器结构

一个容器：Nginx 托管前端构建产物，并将 `/api/` 和 `/health` 转发到内部 Fastify API。前端使用相对路径，登录通过 Bearer Token，同源访问无需配置公司接口、Cookie 或跨域代理。容器默认对外监听 `8080`，内部 API 使用 `5281`。

SQLite 数据文件位于 `/data/app.db`。仅在文件不存在时自动建表并生成 README 中的演示账号；重启、重建容器不会重置已有数据库。已有空文件或损坏文件不会被自动覆盖，需要自行检查和恢复。

## 本地 Docker Compose

需要 Docker Desktop（Linux 容器模式）和 Docker Compose v2。

```powershell
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 将输出填到 .env 的 JWT_SECRET；启动前检查 HOST_PORT 是否空闲。
Get-NetTCPConnection -State Listen | Select-Object -ExpandProperty LocalPort -Unique
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

默认打开 <http://localhost:5280>，健康检查 <http://localhost:5280/health>。端口占用时修改 `.env` 的 `HOST_PORT`，非小黑板项目不使用 `5173`。

```powershell
docker compose down       # 停止并保留数据卷
docker compose up -d      # 再启动
```

不要使用 `docker compose down -v`，该命令会删除数据库所在卷。不要对已有数据执行 `npm run db:init`，该脚本会清空表。

## Zeabur：从个人 GitHub 仓库部署

Compose 文件用于本地运行；Zeabur 从仓库根目录的 Dockerfile 构建同一服务，无需依赖平台解析 Compose。

1. Zeabur 新建项目，添加服务 → 从 GitHub 部署，选择个人仓库和 `main` 分支，根目录为 `/`。
2. 确认使用仓库根目录 `Dockerfile`；不覆盖容器启动命令。
3. 在服务环境变量中设置：

   | 变量 | 值 |
   |---|---|
   | `JWT_SECRET` | 独立生成的随机字符串，至少 32 字节，后续部署保持不变 |
   | `PORT` | `8080`（如平台注入其他端口，程序会跟随；不可使用内部端口 5281） |
   | `DATA_DIR` | `/data` |
   | `TZ` | `Asia/Shanghai` |

4. 在首次启动前为服务添加持久化存储，挂载路径 **`/data`**。如果已启动，先停服务并确认数据迁移，避免挂载新卷后看不到旧数据。
5. 服务保持 **1 个实例**，SQLite 不支持本部署方式横向扩容。
6. 网络设置暴露 HTTP 端口 `8080`，生成 Zeabur 域名或绑定自定义域名。健康检查路径使用 `/health`，首次初始化允许至少 60 秒。
7. 打开站点，验证登录、课程列表和浏览器刷新子路由；重启服务后再登录，确认数据仍在。

平台页面名称可能随版本调整，关键是 Dockerfile 构建、PORT 对应端口和 `/data` 持久化挂载。

## 数据与演示账号

初次部署会生成公开写在 README 的演示账号，适合演示。用于真实数据之前，应修改演示账号密码、限制站点访问，并备份持久化数据。

SQLite 使用 WAL。备份时使用 SQLite backup API，或停止服务后复制 `/data` 全目录；不要在线只复制 `app.db` 而遗漏 WAL。

代码更新只需重新部署镜像，卷继续复用。此版本没有数据库迁移框架，未来修改表结构时需另行设计迁移，不能靠重新执行初始化脚本升级。

## 本次校验（2026-10-29）

- 前端 `npm run build`、后端 `npm run typecheck --workspace apps/api` 通过。
- `docker compose config --quiet` 和 Bash 启动脚本语法检查通过。
- 使用临时数据库启动原始 API，健康检查、管理员登录、携带 Token 访问 `/api/me` 通过；无 Token 返回 401。
- 本机 Docker 构建在拉取基础镜像阶段被失效代理 `127.0.0.1:10809` 阻断，尚未完成镜像构建、Nginx 联通和容器重启持久化实测。需在 Docker 网络可用的环境或 Zeabur 完成首次部署验收。

## 个人仓库推送

仅在本目录建立独立 Git 仓库，提交源代码和部署配置。`.env`、本地数据库、`node_modules`、构建产物不进入仓库。GitHub remote 必须指向个人仓库，不能指向公司 GitLab。
