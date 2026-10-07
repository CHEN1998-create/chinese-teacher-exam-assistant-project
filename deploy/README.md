# 教招有据 · 受邀环境部署手册（单机 Docker Compose + Caddy）

更新日期：2026-10-07
适用形态：`frontend/DEPLOYMENT.md` 的**环境 B（受邀环境）**；公开演示环境（Vercel）与本手册无关。
当前状态（2026-10-07）：公开 Vercel 演示站已更新并通过线上验收。阿里云服务器已核实 Docker、PostgreSQL 和 `kaobian-net`；部署前数据库备份已保存在服务器 `/opt/kaobian/backups/`，新源码在独立发布目录 `/opt/kaobian/releases/2026-10-07-invited-01/`，后端镜像已构建。**数据库迁移、新容器启动和公网受邀入口均未完成**；服务器在构建前端镜像时资源接近满载，经人工重启后已恢复，旧容器运行中。不要在这台 1.6 GiB 内存服务器上直接重试 Next.js 构建。下述命令是参考流程，不表示已全部执行。

> 拓扑选择说明：本手册让 `/api/*` 走 **Next.js 同源反代**（`BACKEND_URL` + `x-internal-token`），这是受邀链路 E2E 29/29 实测所经路径；DEPLOYMENT.md §13.1 的「Nginx 直连后端」保留为备选方案，两者不可混用。

## GitHub 镜像仓库（GHCR）发布与拉取部署（推荐）

前端、后端是**两个独立 Git 仓库**。各自的 `.github/workflows/docker-publish.yml` 在每次推送代码后自动构建，也支持在 GitHub Actions 页面手动运行。GitHub 托管机器构建 `linux/amd64` 镜像并推送到各自仓库关联的 GitHub Container Registry（GHCR）Package；上海轻量服务器只拉取镜像，不再在 1.6 GiB 内存机器上构建。镜像内前端固定为 **invited 受邀模式**，不是当前 Vercel 的公开 demo 模式。工作流只会构建各仓库已提交并推送到 GitHub 的内容，本地未提交改动不会进入镜像。**推送镜像不会自动部署或开放服务器。**

1. 两个 Workflow 使用 GitHub 自动提供的 `GITHUB_TOKEN`，权限限定为 `contents: read` 和 `packages: write`，**无需新增 Docker Hub 密钥或个人令牌**。若仓库或组织策略禁用了 Actions/Packages，先在 GitHub 设置中允许它们。
2. 分别检查并提交各仓库待发布的代码与 Workflow，推送到 GitHub。两条 Actions 成功后，在对应仓库页面的 **Packages**（或账号的 Packages）查看镜像：`ghcr.io/chen1998-create/chinese-teacher-exam-assistant` 和 `ghcr.io/chen1998-create/chinese-teacher-exam-assistant-backend`。每次推送都产生 `sha-<该仓库完整提交 SHA>` 标签；只有默认分支的推送会更新 `latest`。前、后端的 SHA **各不相同**；回滚优先使用各自的 `sha-...` 标签。如果同名 GHCR Package 之前由别的方式创建、未关联仓库，需先在 Package 设置中授予该仓库 Actions 写入权限。
3. 将本目录的 `docker-compose.ghcr.yml`、`docker-compose.internal.yml`、`Caddyfile` 和两个 `*.env.example` 放到服务器 `/opt/kaobian/deploy/`。真实 `backend.env`、`frontend.env` 与 `.env` 只保存在服务器，权限设为 `600`。服务器已有 `kaobian-net` 和 `kaobian-postgres`；本编排会**复用现有数据库**，不会创建新库。迁移前先确认备份可恢复，且不要与旧应用容器并行运行到耗尽内存。

服务器 `deploy/.env` 只放非密钥的镜像选择变量（示例值须替换）：

```dotenv
GHCR_OWNER=chen1998-create
BACKEND_IMAGE_TAG=sha-后端仓库的完整提交SHA
FRONTEND_IMAGE_TAG=sha-前端仓库的完整提交SHA
# 完成 ICP 备案、DNS 指向本机并准备公开入口后才设置：
# SITE_DOMAIN=已备案的域名
```

未备案时，仅启动**内部测试入口**，前端只映射到服务器的 `127.0.0.1:3002`，通过 SSH 端口转发在自己的电脑访问；不要开放安全组 3002。本 Compose 的前后端镜像拉取地址使用南京大学缓存镜像站 `ghcr.nju.edu.cn`，GitHub Actions 发布地址仍是官方 `ghcr.io`。**镜像站方案仅用于可匿名拉取的公开 GHCR Package**；首次发布的 Package 默认是私有的，需由所有者明确决定是否改为公开（公开后任何人可下载镜像）。若保持私有，请把 Compose 中两处镜像地址改回 `ghcr.io`，只向官方 `ghcr.io` 使用具备 `read:packages` 权限的 GitHub Personal Access Token（classic）登录；**不要把 GitHub 令牌交给镜像站**，也不要将其写入命令历史、Compose 文件或本仓库。镜像站是否能从当前阿里云服务器稳定拉取尚未实测。

```bash
cd /opt/kaobian/deploy
docker compose -f docker-compose.ghcr.yml -f docker-compose.internal.yml config --quiet
docker compose -f docker-compose.ghcr.yml -f docker-compose.internal.yml pull
docker compose -f docker-compose.ghcr.yml -f docker-compose.internal.yml up -d
docker compose -f docker-compose.ghcr.yml -f docker-compose.internal.yml ps
```

备案和域名条件全部满足后，才可在**确认 80/443 无旧服务占用、DNS 正确、已备份并完成内部验收**的前提下启用公开 HTTPS 入口；这一步不是镜像发布 Workflow 的自动动作：

```bash
cd /opt/kaobian/deploy
docker compose -f docker-compose.ghcr.yml --profile public config --quiet
docker compose -f docker-compose.ghcr.yml --profile public up -d
```

公开入口默认关闭；缺少 `SITE_DOMAIN` 时 Caddy 会拒绝启动。运行镜像还需按下方第 3 节配置数据库连接、内部令牌和管理员初始化令牌。镜像发布成功**不等于**应用已上线或数据库迁移成功，仍要按第 5 节逐项验收。原有 `docker-compose.yml` 的本机源码构建方式保留作参考，不要在当前轻量服务器上重试 `docker compose build`。

## 0. 服务器目录结构

```text
/opt/kaobian/
├── backend/     # backend 仓库（Dockerfile 在此）
├── frontend/    # frontend 仓库（Dockerfile 在此）
└── deploy/      # 本目录：docker-compose.yml、Caddyfile、env 文件
```

大陆服务器直连 GitHub 拉取不稳定，可在确认部署后本地打包上传。镜像会在 Linux 内执行 `npm ci`（后端还会生成 Prisma Client），所以不能复制本机 Windows 的 `node_modules`；构建时服务器需要能访问 npm 依赖源。**不得把本地密钥、令牌或 `.env` 文件打包上传。**

```powershell
# 本机 PowerShell；SSH 凭据保留在本机，按实际授权的账号与路径使用
tar --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git --exclude='.env*' `
  -czf backend.tgz -C E:\游戏\考编助手 backend
tar --exclude=node_modules --exclude=.next --exclude=.git --exclude='.env*' `
  -czf frontend.tgz -C E:\游戏\考编助手 frontend
tar -czf deploy.tgz -C E:\游戏\考编助手 `
  deploy/docker-compose.yml deploy/Caddyfile deploy/backend.env.example `
  deploy/frontend.env.example deploy/README.md
scp -i <本机私钥路径> backend.tgz frontend.tgz deploy.tgz <已授权账号>@<服务器IP>:/opt/kaobian/
# 服务器上：cd /opt/kaobian && tar xzf backend.tgz && tar xzf frontend.tgz && tar xzf deploy.tgz
```

## 1. 云控制台（一次性）

| 项 | 操作 |
|---|---|
| DNS 解析 | 为已获准使用的备案域名添加 **A 记录**：`@` → 服务器公网 IP（如用 www 子域同理）；未完成前不开放受邀登录 |
| 安全组/防火墙 | 放行 **80、443**；22 限制来源 IP |
| 安全收尾（部署完成后） | **关闭 8081、3000、5432 等对公网的放行**——此前后端若直接暴露过 8081，务必关掉，公网只留 80/443 |

## 2. 服务器初始化（一次性）

已知服务器装有 Docker，先检查 `docker compose version`；只有缺少 Compose 插件时才安装。不要重复运行 Docker 安装命令。下方 swap 操作也须先检查内存和现有 swap。

```bash
# Docker（阿里云轻量 Ubuntu；get.docker.com 不可达时改用阿里云镜像源）
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 仅在确认实际容量与负载后配置 swap；swap 不能代替构建所需的物理内存，
# 本机 1.6 GiB 内存 + 2 GiB swap 曾在 Next.js 构建时失去响应，禁止直接重试。
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. 配置文件（deploy/ 目录内）

```bash
cd /opt/kaobian/deploy
cp backend.env.example backend.env    # 填 DATABASE_URL、INTERNAL_TOKEN、CORS_ORIGINS 等
cp frontend.env.example frontend.env  # INTERNAL_TOKEN 与 backend.env 一致
echo 'SITE_DOMAIN=你的备案域名' > .env
chmod 600 backend.env frontend.env .env
```

- `INTERNAL_TOKEN` 在获准部署时用 `openssl rand -hex 32` 新生成，分别填入 `backend.env` 和 `frontend.env`，两处必须一致；不要把令牌文件或真实 env 文件打包、提交到仓库。
- `DATABASE_URL` 指向服务器已有 PG：容器部署的 `kaobian-postgres` 直连容器名 `kaobian-postgres`（compose 已挂 kaobian-net）；宿主机直装则用 `host.docker.internal` 并给 migrate/backend 加 extra_hosts。

## 4. 构建与启动（迁移自动执行）

```bash
cd /opt/kaobian/deploy
docker compose build          # 首次构建较慢；后端含 8081 时代的旧进程请先停掉，避免端口/资源冲突
docker compose up -d          # migrate 任务自动幂等应用全部迁移（trial_events、correction_review…）
docker compose logs -f migrate backend   # 看到 "Nest application successfully started" 即成功
```

- 迁移在 `migrate` 一次性任务中执行（`npx prisma migrate deploy`），失败自动重试 20 次；SQL 级错误看 `docker compose logs migrate`，修复后重跑。
- Caddy 首次启动会自动申请 Let's Encrypt 证书并 80→443 跳转。

## 5. 上线验证清单（逐项留痕，更新模块 8 门槛表）

| # | 检查 | 通过标准 |
|---|---|---|
| 1 | `https://域名/api/health` | 200，数据库连接正常（非降级） |
| 2 | 首页 HTTPS | 证书有效、HTTP 自动跳 HTTPS、页脚含备案号 |
| 3 | 注册/登录 | 受邀账号登录，HttpOnly `sid` 会话，登出生效 |
| 4 | 纠错全链路（横切 #3） | 用户提交纠错 → 员工 `/admin/corrections` 处理 → 提交人收到站内通知 |
| 5 | 手机流量直连（横切 #2） | 关 WiFi 用 4G/5G 无代理访问核心路径 |
| 6 | 账号隔离 | A 用户访问不到 B 用户的机会/日程/计划数据 |
| 7 | 数据删除演练（横切 #5） | `data_delete_requested` 服务端处置流程可执行 |
| 8 | 事件看板 | `/admin/trial` 有服务端事件数据（seed 与 live 分群隔离） |

## 6. 日常更新

```bash
cd /opt/kaobian/deploy
# 上传新源码（或 git pull）后：
docker compose build && docker compose up -d   # 迁移随 migrate 任务自动应用
```

## 7. 数据库备份（上线当天就配）

```bash
# crontab -e，每日 03:00 备份并保留 14 天（按服务器实际 PG 账号调整 -U）
0 3 * * * pg_dump -U kaobian kaobian | gzip > /opt/backup/kaobian-$(date +\%F).sql.gz
30 3 * * 0 find /opt/backup -name 'kaobian-*.sql.gz' -mtime +14 -delete
```

## 8. 与发布门槛表的对应

- 关闭横切 #1（境内备案域名 + HTTPS + ECS）：完成第 1、4、5 步并留痕。
- 关闭横切 #4 与 P0-3（全部迁移已应用）：`docker compose logs migrate` 输出全部迁移已应用。
- 剩余人工项：纠错处理人指派、模块 2/4 真实用户验证记录、公安联网备案（上线 30 日内）。
