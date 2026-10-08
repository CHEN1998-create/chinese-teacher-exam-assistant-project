# 教招有据（后端）

“教招有据”的服务端。当前代码以根目录 [`PRD-全国教师公开招聘与备考助手-v6.1.md`](../PRD-全国教师公开招聘与备考助手-v6.1.md)（历史基线，文件名保留不改）为需求来源：当前只开放语文学科，已实现主线为**机会发现 → 可解释资格匹配 → 关注与报名日程 → 主要目标 → 备考**。v7.0 验证目标见 [`PRD-全国教师公开招聘助手-v7.0-研究验证版.md`](../PRD-全国教师公开招聘助手-v7.0-研究验证版.md)：官方招聘事件与公告变化、四档资格预筛、报考推进、可信度为 P0，备考计划降为 P1（代码保留但不作为当前对外核心承诺）；v6.1/v7.0 差异、品牌口径与指标口径见 [`docs/教招有据-模块0-品牌清单与版本决策记录.md`](../docs/教招有据-模块0-品牌清单与版本决策记录.md)。

> **当前状态（2026-10-05，v6.1 模块 1—9 代码已落地）：** 认证/会话、画像、公告流水线、匹配、关注、日程、计划等模块与 Prisma 模型/迁移均已提交并具备单元测试；**invited 模式已在真实 PostgreSQL 环境完成端到端联调**（Playwright 受邀全链路 29/29、demo 回归 23/23，2026-10-05）；真实 AI/OCR、对象存储（当前快照写服务端本地卷）、附件二进制上传未接入。本节其余内容描述的是代码现状，未验证项不宣称可用。

## 技术栈

- NestJS 12（ESM，`"type": "module"`）
- Prisma 6 + PostgreSQL（17 个模型，5 个迁移）
- Vitest（单测；含公告门禁/版本、匹配、关注、日程幂等等领域回归）
- Docker（多阶段构建，`node:24-alpine`）

## 当前实现

### HTTP 与基础设施

| 文件 | 内容 |
|---|---|
| `src/main.ts` | 应用启动；按 `CORS_ORIGINS`（逗号分隔）开启 CORS；`TRUST_PROXY` 支持反代场景；监听 `PORT`（默认 3000）/`HOST`（裸进程可绑 `127.0.0.1`） |
| `src/health.controller.ts` | `GET /health`：执行 `SELECT 1`，返回 `{ status, db, time }`；数据库不可用时返回 `degraded`，进程不崩溃 |
| `src/internal-token.guard.ts` | 全局守卫：校验 `x-internal-token` 与 `INTERNAL_TOKEN`（`timingSafeEqual`）；未设置时放行，仅限本地开发 |
| `src/prisma.service.ts` / `prisma.module.ts` | PrismaClient 封装 |
| `prisma/schema.prisma` | 17 个模型：User/Credential/Session/UserProfile/FollowedOpportunity/OpportunityCorrection/Source/SourceSnapshot/ExtractionRun/EvidenceAnchor/ReviewRecord/PublishedAnnouncementVersion/TimelineEvent/NotificationRecord/WeeklyPlan/DailyPlan/TaskFeedback |
| `prisma/migrations/` | init、announcements_pipeline、invited_auth、followed_opportunities、timeline_notifications |

### 业务模块（`src/<module>/`）

| 模块 | 主要能力 | 现状边界 |
|---|---|---|
| `auth/` | 预建账号 + 密码哈希凭据（`Credential`）、HttpOnly 会话（登录/登出/`GET session`）、管理员账号管理接口；`SessionGuard`/`AdminGuard` 服务端鉴权 | 无注册/找回密码/验证码（受邀首版不需要） |
| `announcements/` | 提交来源（URL + 正文 JSON）→ 本地卷快照（SHA-256，`.data/snapshots`，内容哈希幂等）→ 确定性解析器生成候选 → 自动校验 → 人工审核（高影响字段无锚点不过审、只追加留痕）→ 发布不可变版本（新版本不覆盖旧版本、差异查询） | 解析器为确定性规则，**未接 AI/OCR**；无二进制附件上传与对象存储 |
| `matching/` | 按画像即时计算四值（PASS/FAIL/UNKNOWN/MANUAL_REVIEW）与总结果，结论关联公告版本 | 仅语文学科 |
| `opportunities/` | 机会列表/详情视图、关注状态机（considering/preparing/registered/abandoned/closed）、主要/备选目标、纠错提交 | 服务端用户守卫按会话隔离 |
| `profile/` | 账户画像读写（五组基础画像 + 按需补充资格） | — |
| `schedule/` | 从已发布版本派生时间线事件与站内通知；业务唯一键保证同一提醒不重复；时间未定不生成提醒 | 仅站内记录，不接短信/微信/邮件/Web Push |
| `plans/` | 7 天计划、逐日任务与反馈的持久化接口 | 计划生成规则仍在前端纯函数引擎，服务端负责存储 |

前端通过 Next.js 服务端同源反代（`/api/*`）调用本服务，由反代注入 `x-internal-token`；浏览器不直接访问后端端口。demo 模式（纯 localStorage Mock）不依赖本服务。

## 本地开发

```bash
cd backend
npm install

# 准备 PostgreSQL，然后配置环境变量（见 .env.example）
# DATABASE_URL=postgresql://kaobian:CHANGE_ME@localhost:5432/kaobian
npx prisma migrate dev      # 应用迁移（首次）

npm run start:dev           #  watch 模式
curl http://localhost:3000/health
```

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | PostgreSQL 连接串；模板见 `.env.example`（该文件含本地 SSH 隧道示例） |
| `PORT` | 否 | 监听端口，默认 3000；现网部署可按安全组规划使用其他端口 |
| `HOST` | 否 | 监听地址，默认 `0.0.0.0`（兼容容器）；Nginx 同机裸进程部署设 `127.0.0.1`，使后端不对公网暴露 |
| `TRUST_PROXY` | 反代部署时必填 | 设为 `true` 时信任一层反向代理的 `X-Forwarded-*`（Nginx 终止 TLS 场景） |
| `CORS_ORIGINS` | 否 | 允许跨域来源，逗号分隔；默认 `http://localhost:3000`；受邀环境填备案产品域名 |
| `INTERNAL_TOKEN` | 部署时必填 | 内部反代密钥；未设置时守卫放行，**仅限本地开发**，受邀/正式环境必须设置强随机值 |
| `AUTH_MODE` | 受邀环境必填 | `demo` 只允许非生产且监听 loopback 的本地开发；生产必须为 `invited`，只认真实会话 cookie，忽略浏览器身份头；与前端 `NEXT_PUBLIC_AUTH_MODE` 一致 |
| `ADMIN_BOOTSTRAP_TOKEN` | 首次初始化必填 | 创建首个管理员账号的引导令牌；只在初始化时使用，完成后应撤销/更换 |

真实密钥只能通过部署平台环境变量或 Secret 管理注入，不提交仓库、不写入日志、不进入前端。

## 测试与构建

```bash
npm test          # 单元/领域测试（公告门禁与版本、匹配引擎、关注状态机、日程事件与幂等、健康检查）
npm run test:e2e  # e2e（vitest.config.e2e.ts；当前主要覆盖应用启动与基础路由）
npm run lint      # oxlint --type-aware
npm run build     # nest build
```

领域测试覆盖的高风险不变量：高影响字段无证据锚点不能过审、发布版本只追加不被新版本覆盖、UNKNOWN 不自动转 FAIL、已截止机会退出、关注状态机合法迁移、同一时间线事件/提醒按业务唯一键只生成一条。

Docker 构建：`docker build -t kaobian-backend .`，产物以 `node dist/main.js` 启动，暴露端口以 `PORT` 为准。`.data/snapshots` 目录在容器中应挂载持久卷（受邀环境正式方案是替换为境内私有对象存储）。

## 尚未实现的后端能力（边界）

下列内容在 PRD/数据流水线文档中描述为目标，当前代码**未实现**，不得按已具备对外宣称：

1. **真实 AI/OCR 适配器**：`announcements/parser.ts` 为确定性解析器；Provider 接口、供应商接入、密钥管理未发生。
2. **对象存储与二进制附件**：无 multipart 上传；原始快照写服务端本地卷 `.data/snapshots`（含 SHA-256 与幂等），只适合开发与极小规模，不是试用环境长期方案。
3. **真实通知渠道**：短信、微信、邮件、Web Push 均未接入；`NotificationRecord` 只是站内记录。
4. **计划生成的服务端化**：7 天计划/重排规则仍运行在前端纯函数引擎，后端 `plans/` 只做持久化。
5. **数据删除的服务端全流程**：隐私删除申请的用户端流程在 demo 完成，服务端处置链路未全量验证。

受邀验证阶段保持**模块化单体**，不拆微服务；明确不做：自动全国爬虫、Redis/BullMQ、Kafka、Elasticsearch、向量数据库、Kubernetes、自动代报名、AI 直接判定资格或预测录取概率。
