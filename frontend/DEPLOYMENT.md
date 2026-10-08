# 部署说明

本项目存在两种部署形态，**必须严格区分**：

| 形态 | 环境标识 | 数据去向 | 网络定位 | 当前状态 |
|---|---|---|---|---|
| **A. 公开演示环境** | `APP_ENV=demo`（`NEXT_PUBLIC_AUTH_MODE=demo`，默认） | 所有演示业务数据仅保存在当前浏览器 | Vercel（境外平台，仅用于功能展示） | 2026-10-07 已更新 [公开演示地址](https://frontend-exam-test.vercel.app)；线上 P0 25/25、断跨源 7/7、安全冒烟 2/2 通过 |
| **B. 少量受邀用户环境** | `APP_ENV=invited`（`NEXT_PUBLIC_AUTH_MODE=invited`） | 境内服务器上的 PostgreSQL（公告快照当前落本地卷，对象存储未接入） | 中国大陆云服务，普通家庭/手机网络直连 | 🚧 前后端代码、迁移与受邀链路 E2E（服务端登录/HttpOnly 会话/画像迁移/账号隔离，29/29）均已验证；环境未落地。网络链路层已实测（2026-10-05）：中国移动家庭宽带与手机蜂窝无代理直连下本地同源全栈全部通过（[`../docs/china-network-accessibility.md`](../docs/china-network-accessibility.md) 第 6.3 节）；备案域名公开访问待部署后补测 |

> 公开演示环境**不是**受邀试用环境，不得用演示环境承接真实用户试用；受邀环境不得静默回退到 localStorage Mock。两种形态的产品口径见 [`../PRD-全国教师公开招聘与备考助手-v6.1.md`](../PRD-全国教师公开招聘与备考助手-v6.1.md)，网络可访问基线见 [`../docs/china-network-accessibility.md`](../docs/china-network-accessibility.md)。

> 2026-10-07 部署记录：公开演示登录后的机会匹配、关注、日程与分析事件已改为浏览器本地路径；Vercel 已更新并完成线上 E2E。阿里云受邀环境仅完成部署前数据库备份、独立发布目录上传和后端镜像构建；**尚未迁移数据库、启动新容器或开放受邀地址**。

---

# 环境 A：公开演示环境（当前现状）

> 本项目当前部署形态为**公开演示环境（APP_ENV=demo）**，不是正式生产环境。
> 所有数据仅保存在访客本机浏览器（localStorage），没有真实后端、数据库、认证、文件存储和 AI 服务。

## 1. 部署环境说明

| 项目 | 说明 |
|---|---|
| 环境标识 | `NEXT_PUBLIC_APP_ENV=demo`、`NEXT_PUBLIC_DEMO_MODE=true` |
| 数据去向 | 仅写入访客浏览器 localStorage，不上传任何服务器 |
| 管理后台 | `/admin` 全部子路由在演示环境关闭，显示关闭说明 |
| 搜索可见性 | `noindex,nofollow`（meta + `X-Robots-Tag` 双保险） |
| 传输加密 | 平台自动提供 HTTPS |
| 演示地址 | https://frontend-two-beryl-fywu4p42k8.vercel.app |

> **网络提示**：该演示站部署在 Vercel，属于境外平台，中国大陆普通网络的访问速度与可达性没有保障，也不作为受邀试用的依赖；保留它仅用于功能展示与评审。

## 2. 当前技术栈

- Next.js 16.3.8（App Router，Turbopack 构建）
- React 19.2.8
- TypeScript 5（strict）
- Tailwind CSS 4
- 无浏览器侧服务端运行时依赖：公开演示的核心流程不请求 `/api/*`；该路由在 demo 模式一律拒绝代理，即使误配后端地址也不会透传演示身份

## 3. 本地启动

```bash
npm install
npm run dev
```

打开 http://localhost:3000。

## 4. 生产构建

```bash
# 以演示环境变量构建
$env:NEXT_PUBLIC_APP_ENV="demo"        # PowerShell
$env:NEXT_PUBLIC_DEMO_MODE="true"
npm run build

# 本地预览生产产物
npm run start
```

macOS / Linux：

```bash
NEXT_PUBLIC_APP_ENV=demo NEXT_PUBLIC_DEMO_MODE=true npm run build
npm run start
```

## 5. 部署平台：Vercel

选择 Vercel 的原因：Next.js 由 Vercel 维护，对 Next.js 16 兼容性最好；Hobby 免费计划满足演示需求，自动 HTTPS、每次推送自动生成预览部署。

### 首次部署（CLI）

```bash
npx vercel login            # 邮箱接收确认链接
npx vercel link             # 关联/创建项目（仅首次）
npx vercel env add NEXT_PUBLIC_APP_ENV production   # 输入 demo
npx vercel env add NEXT_PUBLIC_DEMO_MODE production # 输入 true
npx vercel --prod
```

### 重新部署

```bash
npx vercel --prod
```

### 通过 Git 自动部署

在 Vercel 导入 GitHub 仓库后，推送到主分支自动触发生产部署；其余分支/PR 自动生成预览部署。

## 6. 环境变量

| 变量名 | 取值 | 范围 | 用途 |
|---|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | `demo` / `invited` / `production` | 浏览器（会被内联） | 运行环境标识 |
| `NEXT_PUBLIC_AUTH_MODE` | `demo`（默认）/ `invited` | 浏览器（会被内联） | 认证/数据通道切换：demo 用本地演示账号 + localStorage；invited 用服务端会话 + `/api/*`。须与后端 `AUTH_MODE` 一致 |
| `NEXT_PUBLIC_DEMO_MODE` | `true` / 未设置 | 浏览器（会被内联） | 演示模式总开关；invited 不得设置 |
| `BACKEND_URL` | 内网后端地址 | 仅服务端 | 仅 invited 模式配置；demo 模式不需要且不会代理 |
| `INTERNAL_TOKEN` | 强随机字符串 | 仅服务端 | 仅 invited 模式配置；反代注入的内部密钥，不进入浏览器 |

仅 `NEXT_PUBLIC_*` 变量会进入浏览器；服务端变量在部署平台设置中配置，不提交仓库，变量样例见 `.env.example`。

> 2026-10-05 的 demo + 后端联调路径已停用：它会透传浏览器可伪造的身份头，不可用于公开链接。现仅 invited 模式允许 `/api/*` 代理；代理丢弃全部 `x-user-*` 头，身份仅由后端 HttpOnly 会话确定。后端在生产环境拒绝 `AUTH_MODE=demo` 启动。

## 7. 演示模式行为

- 所有页面顶部固定显示黄色横幅，提醒“数据仅用于功能展示，请勿填写真实个人信息；输入仅保存在本机浏览器”。
- 登录页明确声明：内置演示账号、不是真实身份认证、演示数据不代表正式服务数据。
- 种子考情的状态标签显示为“官方确认·演示”，来源带“示例来源”标记。
- `/settings` 提供“重置演示数据”：清空本浏览器全部数据并恢复默认种子。

## 8. Mock / 占位能力清单

| 能力 | 当前实现 | 用户可见提示 |
|---|---|---|
| 登录认证 | 本地明文比对内置演示账号，会话存 localStorage | 登录页声明 + 横幅 |
| 公告内容 | 演示环境不提供提交/提取入口（`/admin` 关闭）；v6.1 公告流水线在 invited 模式经后端确定性解析器处理（非 AI），真实 AI/OCR 未接入 | 字段与候选均带状态标识 |
| 文件上传 | 未实现：v5.2 占位上传组件已随旧页面删除；当前后端仅接受 URL + 粘贴正文，无二进制附件入口 | 不适用（无入口） |
| 资料诊断 / 计划生成 / 重排 | 本地确定性规则引擎 | 演示数据标记 |
| 通知（短信/邮件/推送） | 本地模拟，不发送任何真实消息 | 通知面板标注 |
| 数据删除 | 只清理浏览器本地数据 | 隐私面板明确说明 |

## 9. 管理端限制

公开演示环境中 `/admin` 及其全部子路由（reviews / pipeline / exams / feedback / resources）统一显示“管理后台未在公开演示环境开放”，不渲染任何管理功能，任何写操作（审核、驳回、停用、撤回）均无法触发。

> **正式管理后台上线前提**：服务端认证（成熟认证方案）+ 服务端/数据库行级权限校验 + 操作审计，客户端隐藏按钮不构成安全边界。

## 10. 回滚

- Vercel Dashboard → Deployments → 选择历史部署 → Promote to Production（即时回滚，无需重新构建）。
- CLI：`npx vercel ls` 查看部署，`npx vercel promote <deployment-url>` 切换。
- 演示数据仅存在访客浏览器，无服务端数据需要回滚。

---

# 环境 B：少量受邀用户环境（v6.1 目标形态，尚未落地）

> 适用对象：5—30 名受邀测试用户，连续试用至少 7 日。以下是**轻量部署方案与前置条件，不是生产级承诺**：不做高可用、多地域容灾、自动扩缩容；具体落地在迁移计划的模块 0A（网络基线）与模块 8（受邀账号与持久化）中执行。

## 11. 设计约束

1. 受邀用户必须能在中国大陆普通家庭宽带和手机网络（无 VPN/代理）直接打开页面并调用 API。
2. 不以 Vercel 或其他境外平台作为必要运行依赖；字体、图标、脚本、样式、关键图片随应用部署或来自明确允许的境内地址。
3. 浏览器只调用同源 `/api/*`；后端再访问数据库、文件存储和 AI/OCR 等第三方服务，密钥不进入前端。
4. AI/OCR 仅通过后端适配器接入在境内可稳定访问的服务；供应商不可用时回退为人工录入/审核，核心页面不得白屏。
5. 不引入 Kubernetes、微服务、Redis/BullMQ 等本轮不需要的基础设施（产品边界见[迁移计划](../docs/v6.1-migration-plan.md)）。

## 12. 前置事项（完成前只允许内部演示）

| 事项 | 说明 |
|---|---|
| 域名 | 已实名认证的境内域名；备案期间不对公众开放 |
| ICP 备案 | 按云服务商与通信管理局要求完成非经营性 ICP 备案，首页底部展示备案编号；是否涉及教育类前置审批或经营性许可，需向属地主管部门核验，本文不提供绕过方案 |
| HTTPS 证书 | 备案域名签发可用证书，由反向代理统一终止 TLS；HTTP 跳转 HTTPS |
| 云资源 | 同一境内地域的云服务器、数据库与对象存储；安全组只放行 80/443（管理与数据库端口不对公网开放） |
| 合规文件 | 隐私政策、用户协议、产品测试版说明、报考信息免责声明、AI 辅助说明在开放试用前就位 |

## 13. 轻量部署拓扑（单域名、单机起步）

> **2026-10-07 状态说明**：根仓库 `deploy/README.md` 提供 Docker Compose + Caddy 方案，采用 Next 同源 `/api` 反代（`BACKEND_URL` + `INTERNAL_TOKEN`）；**本轮尚未在阿里云执行部署或迁移**。下述 Nginx 直连后端方案（§13.1）保留为备选，两者不可混用。

```text
受邀用户浏览器（家庭宽带 / 4G·5G）
        │  HTTPS，只请求同源
        ▼
https://你的产品域名/
        ├── /            → 同一台境内 ECS：Nginx + Next.js（next start / Docker）
        └── /api/*       → Nginx 反向代理 → 同机或内网 NestJS（PORT，不对公网暴露）
                                  │
                                  ├── PostgreSQL（同机 Docker 卷或同地域 RDS）
                                  └── 对象存储（私有 Bucket）/ AI·OCR 境内 API（服务端调用）
```

- **一台境内云服务器（2 vCPU / 4 GB 量级即可起步）**运行 Nginx、Next.js 与 NestJS 容器；5—30 人规模不需要集群。
- **PostgreSQL**：首版可用同机 Docker（数据卷定期备份）；具备条件时直接使用同地域云托管 PostgreSQL（自动备份更省心）。开发、测试、试用使用不同数据库，不混用。
- **文件存储**：使用同地域云对象存储私有 Bucket 保存公告原件与附件，开启版本控制，服务端签发短时 URL；上传校验类型与大小，不把大文件入库。极小规模临时联调可用服务器挂载卷过渡，但不得作为试用环境的长期方案。
- **后端端口**：NestJS 只监听内网/回环地址（裸进程部署设 `HOST=127.0.0.1`；容器部署用内网网络且不映射公网端口），公网仅经 Nginx 的 `/api/*` 可达；沿用现有 `x-internal-token` 内部密钥守卫，Nginx 注入该头，外部直连返回 401。后端位于反代之后时设 `TRUST_PROXY=true`，以正确识别 TLS 与真实客户端 IP。
- **CSP**：默认同源，仅按实测逐个加入确需的境内域名；不使用 `https:` 通配。允许域名清单与检查方法见 [`../docs/china-network-accessibility.md`](../docs/china-network-accessibility.md)。

### 13.1 Nginx 参考配置（单域名、单机）

> 示意配置，上线前按实际路径、证书位置与日志轮转调整；`server_name` 必须是已备案域名。

```nginx
server {
    listen 80;
    server_name 你的产品域名 www.你的产品域名;
    # 备案完成前仅本机/内网访问，可在此额外加 allow/deny
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name 你的产品域名;

    ssl_certificate     /etc/nginx/certs/你的产品域名.pem;
    ssl_certificate_key /etc/nginx/certs/你的产品域名.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 仅放行 80/443；本服务与 Next/Nest 都在同机
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        # 内部密钥在代理层注入，浏览器无法设置（同名头被覆盖）
        proxy_set_header x-internal-token "替换为强随机值";
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

要点：云安全组只放行 22（限来源 IP）、80、443；3000/3001/5432 不对公网开放；`x-internal-token` 在 Nginx 写入而不是写进前端代码或镜像层；证书过期前续期，续期后 `nginx -s reload`。

## 14. 受邀环境环境变量

| 变量名 | 侧 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | 浏览器（内联） | 受邀环境取 `invited` |
| `NEXT_PUBLIC_AUTH_MODE` | 浏览器（内联） | 受邀环境取 `invited`（与后端 `AUTH_MODE` 一致） |
| `NEXT_PUBLIC_DEMO_MODE` | 浏览器 | 受邀环境**不得**设置为 true |
| `BACKEND_URL` | 仅服务端 | Next.js 反代目标，填内网/同机地址（如 `http://127.0.0.1:3001`） |
| `INTERNAL_TOKEN` | 仅服务端（Nginx 与 NestJS 两侧一致） | 反代内部密钥，强随机值（`openssl rand -hex 32`） |
| `PORT` | 后端 | NestJS 监听端口，按拓扑规划（示例 3001） |
| `HOST` | 后端 | 裸进程同机部署设 `127.0.0.1`；容器内网部署保持默认 `0.0.0.0` 且不映射公网 |
| `TRUST_PROXY` | 后端 | 位于 Nginx 之后设 `true` |
| `CORS_ORIGINS` | 后端 | 允许来源填备案产品域名；浏览器实际走同源，CORS 为纵深防御 |
| `AUTH_MODE` | 后端 | 受邀环境取 `invited`（只认真实会话 cookie）；与前端 `NEXT_PUBLIC_AUTH_MODE` 一致 |
| `ADMIN_BOOTSTRAP_TOKEN` | 后端 | 首个管理员账号初始化引导令牌，初始化完成后撤销/更换 |
| `DATABASE_URL` | 后端 | PostgreSQL 连接串（内网地址） |
| `OSS_*`（或同等存储变量） | 后端 | **未接入**：对象存储落地前公告快照写本地卷（见 backend/README） |
| `AI_*` / `OCR_*` | 后端 | **未接入**：境内 AI/OCR 供应商落地后再增加；浏览器不可见 |

受邀环境的真实登录、会话与数据持久化代码（模块 8）已完成：后端预建账号 + 密码哈希 + HttpOnly `sid` 会话，前端 `HttpAuthProvider` 经 `/api/auth/*` 登录与会话恢复，访客画像与暂存分析事件登录后幂等迁移。历史本地 PostgreSQL 受邀链路曾通过 29/29；**本轮未重跑受邀全链路，也未在阿里云环境验证**。invited 环境不得伪装成真实服务，也不得静默回退到 Mock。

## 15. 受邀环境的发布与回滚

- 发布门禁（在构建机执行，任一失败不发布）：`npm test`（2026-10-07 前端 207 用例）→ `npx tsc --noEmit` → `npm run lint` → `npm run build`（postbuild 自动运行网络依赖扫描，发现 Google Fonts/境外 CDN/客户端密钥即失败，可用 `npm run check:external` 手动复跑）→ 后端 `npm run lint && npm run build && npm test`。Playwright 回归（`.qa-harness/m9-p0-flow.mjs`、`m9-blocked-runtime.mjs`）在有运行栈时执行并留存结果。
- 发布：构建并推送 Next.js 与 NestJS 镜像（或上传构建产物）→ 备份数据库 → 执行可重复执行的 Prisma 迁移 → 滚动重启 → 冒烟（经域名访问 `/api/health`、登录、核心页面）。
- 回滚：Nginx 切回上一版本镜像；数据库迁移必须提供回滚方案，重要迁移前先创建恢复点；公告版本数据只追加不原地覆盖，应用回滚不影响已发布版本留档。
- 每次发布后在无代理的家庭网络与手机网络做一次核心路径冒烟，结果记录为“已验证/待验证”，不得把未实测写成“国内可用”；记录格式见 [`../docs/china-network-accessibility.md`](../docs/china-network-accessibility.md) 第 6.3 节。

---

## 16. 从演示走向真实能力的替换顺序

按依赖顺序，与[迁移计划](../docs/v6.1-migration-plan.md)的模块编号对应：

1. **国内网络基线（模块 0A，2026-10-04 代码侧已完成）**：已移除 `next/font/google`，字体改用跨平台系统字体栈，收紧 CSP（去掉 `img-src https:` 通配），交付 `scripts/check-external-deps.mjs` 扫描与 Vitest 守卫，后端支持 `HOST`/`TRUST_PROXY`。模块 9 增补运行时断跨源 Playwright 回归。剩余未完成项是域名、ICP 备案与境内 ECS 落地后的真实网络冒烟（状态：待验证）。
2. **领域模型与公告流水线（模块 1、2，代码已完成）**：后端 17 个模型/5 个迁移、公告版本、证据锚点、审核记录、确定性解析器均已落地；原件目前写本地卷，对象存储未接，真实 AI/OCR 未接。
3. **真实认证（模块 8，代码已完成）**：`src/lib/auth/HttpAuthProvider.ts` 已实现现有 `AuthService` 接口，`instance.ts` 按 `NEXT_PUBLIC_AUTH_MODE` 切换；受邀模式使用服务端 HttpOnly 会话。**真实数据库全链路联调待验收**。
4. **画像 / 匹配 / 关注 / 日程（模块 4–6，已完成）**：demo 走 localStorage 纯函数，invited 走同源 `/api/*`；后端 matching/opportunities/schedule 模块与测试已就位。
5. **资料诊断 / 资源匹配 / 计划与反馈 / 重排（模块 7，已完成）**：计划/重排规则仍在前端纯函数引擎；后端 `plans/` 提供持久化接口，规则服务端化不在本轮。
6. **通知 / 数据删除 / 指标监控（模块 6、9）**：站内事件真实生成（唯一键去重）；模块 9 已上线 P0 漏斗事件与指标口径（含访客暂存迁移、seed/live 分流）；真实删除服务端全流程未验证；短信、微信不在本轮。

每步替换时移除页面中的直接 Mock 引用，并覆盖加载/成功/空态/失败/权限不足五种状态；非 demo 环境不得静默回退到 Mock。
