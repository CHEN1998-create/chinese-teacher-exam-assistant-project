# 教招有据 · 受邀环境部署手册（单机 Docker Compose + Caddy）

更新日期：2026-10-06
适用形态：`frontend/DEPLOYMENT.md` 的**环境 B（受邀环境）**；公开演示环境（Vercel）与本手册无关。
前置状态：ICP 备案已通过；域名与境内轻量服务器为同一家云厂商；服务器上已有 PostgreSQL（平时经 SSH 隧道访问的 5432）。

> 拓扑选择说明：本手册让 `/api/*` 走 **Next.js 同源反代**（`BACKEND_URL` + `x-internal-token`），这是受邀链路 E2E 29/29 实测所经路径；DEPLOYMENT.md §13.1 的「Nginx 直连后端」保留为备选方案，两者不可混用。

## 0. 服务器目录结构

```text
/opt/kaobian/
├── backend/     # backend 仓库（Dockerfile 在此）
├── frontend/    # frontend 仓库（Dockerfile 在此）
└── deploy/      # 本目录：docker-compose.yml、Caddyfile、env 文件
```

大陆服务器直连 GitHub 拉取不稳定，推荐本地打包上传（排除依赖目录）：

```powershell
# 本机 PowerShell（deploy/ 下已有你的 SSH 私钥 aliyun_ed25519）
tar --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git `
  -czf backend.tgz -C E:\游戏\考编助手 backend
tar --exclude=node_modules --exclude=.next --exclude=.git `
  -czf frontend.tgz -C E:\游戏\考编助手 frontend
tar -czf deploy.tgz -C E:\游戏\考编助手 deploy
scp -i deploy\aliyun_ed25519 backend.tgz frontend.tgz deploy.tgz root@<服务器IP>:/opt/kaobian/
# 服务器上：cd /opt/kaobian && tar xzf backend.tgz && tar xzf frontend.tgz && tar xzf deploy.tgz
```

## 1. 云控制台（一次性）

| 项 | 操作 |
|---|---|
| DNS 解析 | 添加 **A 记录**：`@` → 服务器公网 IP（如用 www 子域同理） |
| 安全组/防火墙 | 放行 **80、443**；22 限制来源 IP |
| 安全收尾（部署完成后） | **关闭 8081、3000、5432 等对公网的放行**——此前后端若直接暴露过 8081，务必关掉，公网只留 80/443 |

## 2. 服务器初始化（一次性）

```bash
# Docker（阿里云轻量 Ubuntu；get.docker.com 不可达时改用阿里云镜像源）
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2G 内存机型必须加 swap，否则 next build 会 OOM
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

- `INTERNAL_TOKEN` 用 `deploy/internal-token.txt` 的值（三处一致：backend.env、frontend.env、该文件）。
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
