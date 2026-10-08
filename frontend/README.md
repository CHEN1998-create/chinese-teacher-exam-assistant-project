# 教招有据（前端）

“教招有据”面向教师招聘意向用户，当前验证**可追溯的语文教师招聘机会、可解释资格预筛与报考推进**。现有 v6.1 代码另含备考计划能力，但该能力在 v7.0 验证目标中降为 P1，不是当前对外核心承诺。

> **学科开放范围**：产品长期面向各学科，**当前版本只开放语文学科**；语文是首个验证板块，不是产品长期边界。

> **品牌口径**：“教招有据”是产品名；“验证版”是阶段标签，仅用于试用说明与内部文档，不默认拼进 Logo；固定功能副标题为“教师招聘机会与资格预筛”；所有资格结论均为预筛，最终以官方公告和招聘单位审核为准。商标、域名与平台账号名称占用状态为**待核查**，对外发布前须完成近似查询，详见 [`../docs/教招有据-模块0-品牌清单与版本决策记录.md`](../docs/教招有据-模块0-品牌清单与版本决策记录.md)。

当前实现仍以根目录 [`PRD-全国教师公开招聘与备考助手-v6.1.md`](../PRD-全国教师公开招聘与备考助手-v6.1.md) 为历史基线；本轮验证目标见 [`PRD-全国教师公开招聘助手-v7.0-研究验证版.md`](../PRD-全国教师公开招聘助手-v7.0-研究验证版.md)。本 README 只描述前端部分**当前实现了什么、计划迁移到什么状态**，不复写 PRD。

## 文档地图

| 文档 | 负责回答 |
|---|---|
| [`PRD-全国教师公开招聘与备考助手-v6.1.md`](../PRD-全国教师公开招聘与备考助手-v6.1.md) | 当前实现的历史需求基线 |
| [`PRD-全国教师公开招聘助手-v7.0-研究验证版.md`](../PRD-全国教师公开招聘助手-v7.0-研究验证版.md) | 本轮验证的产品目标与验收标准 |
| [`docs/PRD-v6.1-技术可行性与开发方案.md`](../docs/PRD-v6.1-技术可行性与开发方案.md) | 技术选型、架构与分阶段开发方案 |
| [`docs/v6.1-migration-plan.md`](../docs/v6.1-migration-plan.md) | v5.2 → v6.1 的路由、领域对象、模块处置与阶段回退 |
| [`docs/v6.1-information-architecture.md`](../docs/v6.1-information-architecture.md) | “机会 / 日程 / 备考”信息架构与页面内容预算 |
| [`docs/v6.1-data-pipeline.md`](../docs/v6.1-data-pipeline.md) | 公告提交、提取、审核、发布与版本留痕流水线 |
| [`docs/china-network-accessibility.md`](../docs/china-network-accessibility.md) | 国内普通网络可访问基线、允许域名与验收方法 |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 公开演示环境（现状）与少量受邀用户环境（目标）部署说明 |

---

## 一、当前实现：v6.1 P0 闭环（2026-10-05 现状）

> 状态标识：✅ = 仓库中已实现并有自动化测试覆盖；🚧 = 代码已写但**尚未在真实环境验证**；❌ = 未实现，不得对外宣称完成。

仓库已按[迁移计划](../docs/v6.1-migration-plan.md)完成模块 0—9 的**代码侧**工作：用户主线“机会发现 → 可解释资格匹配 → 关注与报名日程 → 主要目标 → 备考”在演示模式下端到端跑通，NestJS + PostgreSQL 受邀模式的服务端代码与迁移也已就位。

两种运行模式，由 `NEXT_PUBLIC_AUTH_MODE` 切换：

- **demo（默认）**：内置演示账号仅在本机浏览器生效；画像、示例机会匹配、关注/推进、日程、计划与事件均留在 `localStorage`，无需后端。`/api/*` 在此模式下拒绝代理；虚构公告链接不可点击，示例日期随当天滚动。
- **invited**：`HttpAuthProvider` 经同源 `/api/*` 使用服务端预建账号与 HttpOnly 会话 cookie（身份不进浏览器），画像、关注、日程、计划等读写 NestJS + PostgreSQL；任何模式失败都不静默回退 Mock。

> **验收状态（2026-10-05 模块 9 收口）**：登录后 P0 闭环 E2E 23/23（demo 会话）与 invited 受邀链路 E2E 29/29（服务端登录、HttpOnly 会话、画像迁移、账号隔离、登出失效；脚本 [`../.qa-harness/m9-invited-flow.mjs`](../.qa-harness/m9-invited-flow.mjs)）均在真实 NestJS + PostgreSQL 上通过；断跨源运行时回归用户侧 7/7、管理侧（非 demo 构建）2/2；无代理中国移动家庭宽带与手机蜂窝真实网络冒烟通过（[`../.qa-harness/m9-cn-smoke.mjs`](../.qa-harness/m9-cn-smoke.mjs)）。**仍待办**：公开受邀地址（境内部署 + ICP 备案 + HTTPS）未落地，上线后须按 [`docs/china-network-accessibility.md`](../docs/china-network-accessibility.md) 第 6.3 节补测。

> **2026-10-07 线上复测**：[公开 Vercel 演示地址](https://frontend-exam-test.vercel.app) 已更新，demo P0 闭环 25/25、断跨源 7/7、安全冒烟 2/2 通过；阿里云受邀地址尚未开放。2026-10-05 的 demo + 后端联调记录仅为历史记录，不再作为当前架构使用。

### 能力现状

| 能力 | 状态 |
|---|---|
| 五组渐进式基础画像（地区/学历学位/专业/毕业就业/教资+用工形式）、访客 7 天恢复、返回修改重算 | ✅ demo 全程本机；invited 登录后幂等迁移到服务端 |
| 访客初步机会预览（/preview），唯一主行动，关注时才要求登录 | ✅ |
| 全国教师公开招聘机会发现、报考单元、四值资格匹配（PASS/FAIL/UNKNOWN/MANUAL_REVIEW）与四档总结果 | ✅ demo 由前端纯函数对虚构示例计算；invited 由后端 matching 引擎计算；缺失信息永不判不符合 |
| 机会详情三层（结论与下一步 / 逐项资格核对 / 官方依据与版本）、关注与报名推进（考虑中/准备报名/已报名/放弃/结束） | ✅ |
| 主要/备选目标、设主目标二次确认、主要目标同步到备考 | ✅ |
| 报名与考试时间线、站内提醒（业务唯一键去重、时间待定显示“待官方通知”） | ✅ demo 本机示例日程（不发送提醒）；invited 走后端 schedule 模块 |
| 备考页：考情核对门禁 → 资料/基线/诊断 → 7 天计划 → 今日一项任务 → 点选反馈 → 动态重排/周复盘 | ✅ 复用 v5.2 PlanEngine/ReplanEngine 纯函数，门禁改为“主要目标 + 考情已核对” |
| 公告流水线：提交来源 → 快照留档（SHA-256）→ 确定性解析提取 → 候选待审核 → 人工审核 → 不可变版本发布 | ✅ 后端模块；当前解析器为确定性规则（❌ 未接真实 AI/OCR）；快照存服务端本地卷 `.data/snapshots`（❌ 未接对象存储）；提交方式为 URL + 粘贴正文（❌ 无二进制附件上传） |
| 运营后台：指标看板（含 P0 漏斗）、考情审核、公告流水线、资源管理、纠错队列 | ✅ demo 本地数据；invited 走服务端角色校验；公开演示环境 `/admin` 整体关闭 |
| 用户纠错、结论撤回留痕、通知偏好、数据删除申请 | ✅ demo；invited 服务端接口部分覆盖（❌ 真实删除流程未全链路验证） |
| 分析指标：27 事件（含 8 个 P0 漏斗事件）、seed/live 分流、访客暂存迁移、P0 9 阶段漏斗与 7 日有效推进率 | ✅ 模块 9 口径，见下文“分析与指标” |
| 运行时网络基线：CSP 同源、外部依赖扫描与守卫、断跨源核心操作回归 | ✅ 代码侧 + 真实网络实测：2026-10-05 中国移动家庭宽带与手机蜂窝无代理冒烟通过（[`docs/china-network-accessibility.md`](../docs/china-network-accessibility.md) 第 6.3 节）；备案域名公开访问待部署后补测 |
| 单元/领域测试 | ✅ Vitest，26 个测试文件、207 个用例全部通过（2026-10-07 本机复测），含网络基线守卫与模块 9 高风险回归 |
| 真实短信/微信/邮件/Web Push、自动全国爬虫、对象存储、真实 AI/OCR | ❌ 本轮明确不做/未接入 |

### 技术栈

- Next.js 16.3.8（App Router）+ React 19.2.8 + TypeScript 5（strict）+ Tailwind CSS 4
- demo 数据：localStorage（`kb_*` 键），服务层 + `useSyncExternalStore` 订阅；invited 数据：NestJS 同源 API
- 测试：Vitest 3 + jsdom；浏览器端到端脚本：Playwright（`.qa-harness/`，独立 `package.json`）
- 后端：NestJS 12 + Prisma 6 + PostgreSQL（17 个模型、5 个迁移），详见 [`backend/README.md`](../backend/README.md)
- 浏览器只调用同源 `/api/*`（[`src/app/api/[...path]/route.ts`](./src/app/api/%5B...path%5D/route.ts) 服务端反代，注入 `x-internal-token`）；CSP `default-src/connect-src 'self'`，配置在 [`next.config.ts`](./next.config.ts)

### 快速开始

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000（demo 模式）
```

质量检查：

```bash
npm test                 # Vitest 全量：207 用例（2026-10-07 本机复测）
npm run check:external   # 扫描源码与构建产物的运行时外部依赖（postbuild 自动执行）
npx tsc --noEmit         # 类型检查
npm run lint             # ESLint
npm run build            # 生产构建（构建后自动外部依赖扫描）
```

浏览器端到端脚本（demo 只需启动 frontend；invited 需 backend + PostgreSQL）：

```bash
cd .qa-harness
npm install
node m9-p0-flow.mjs                # demo P0 闭环：访客画像→登录→关注→日程→主目标→开始任务（2026-10-07 本机 25/25）
node m9-blocked-runtime.mjs        # 阻断全部跨源请求后，用户侧核心页面核心操作仍可用（7/7）
node m9-blocked-runtime.mjs admin  # 管理侧：需非 demo 构建的 frontend（demo 构建按设计关闭 /admin）；2/2
node m9-invited-flow.mjs      # 受邀链路：backend 以 AUTH_MODE=invited + PG，frontend 以 NEXT_PUBLIC_AUTH_MODE=invited，库内种子账号见脚本头注释（29/29）
QA_FORCE_DIRECT=1 node m9-cn-smoke.mjs  # 无代理真实网络冒烟：出口归属 + 政府站直连 + 零跨源核心链路（5/5）
```

后端联调（invited 模式）：

```bash
cd backend
npm install
# 准备 PostgreSQL 并配置 DATABASE_URL（见 backend/.env.example）
npx prisma migrate deploy
npm run start:dev
# 前端以 NEXT_PUBLIC_AUTH_MODE=invited 启动；健康检查 GET /api/health
```

### 演示账号

演示登录为**本地明文比对内置账号，不是真实身份认证**（仅 demo 模式）。密码均为 `demo1234`，登录页有一键填充；会话 7 天有效，刷新自动恢复。invited 模式的账号由管理员在服务端预建，密码哈希存储，会话为 HttpOnly cookie。

| 账号 | 角色 | 权限 |
|---|---|---|
| `student@demo.app` | 备考用户 | 用户端全部功能，禁入后台 |
| `exam@demo.app` | 考情审核员 | 可审核全部考情字段 |
| `resource@demo.app` | 资源审核员 | 资源管理可写，考情仅低影响字段 |
| `admin@demo.app` | 管理员 | 全部权限 |

### 当前路由（v6.1）

| 路由 | 说明 |
|---|---|
| `/` | 价值首页；登录用户默认进机会页 |
| `/onboarding` | 五组基础画像（一次一组，访客可用，答案可返回修改） |
| `/preview` | 访客初步匹配机会页：初步符合 + 按缺失条件分组；唯一主行动（关注时登录）；不生成备考计划 |
| `/login` | demo 演示登录 / invited 服务端登录；支持 `?next=`；访客画像与暂存事件登录后迁移 |
| `/opportunities` | 机会列表：优先机会、其他初步符合、补问/人工确认/不符合二级分组 |
| `/opportunities/[unitId]` | 机会详情三层：结论与下一步、逐项资格核对、官方依据与版本；关注/推进/设主目标/补充资格 |
| `/schedule` | 关注机会报名与考试时间线、下一件不能错过的事 |
| `/study` | 备考：主要目标门禁、考情核对门禁、7 天计划、今日一项任务、反馈与重排 |
| `/materials` | 我的资料、能力基线与诊断（备考二级页面，头像/上下文入口） |
| `/settings` | 账号资料、通知偏好、隐私与数据（头像菜单进入） |
| `/admin`、`/admin/reviews`、`/admin/pipeline`、`/admin/exams`、`/admin/resources`、`/admin/feedback` | 运营后台（仅工作人员角色；演示环境整体关闭） |

已删除的 v5.2 旧路由 `/exam`、`/today`、`/plan` 由 [`src/middleware.ts`](./src/middleware.ts) 307 跳转到 `/opportunities`、`/study`（保留查询参数）；映射表与 [`src/lib/ia/nav.ts`](./src/lib/ia/nav.ts) 的 `LEGACY_ROUTE_REDIRECTS` 锁定一致，`src/middleware.test.ts` 覆盖。

### 主要领域模块

- `src/lib/guest/`：访客会话（7 天 TTL）、五组画像与机会预览引擎、登录幂等迁移
- `src/lib/profile/`：画像聚合（访客草稿 + 账户画像）
- `src/lib/opportunities/`、`src/lib/matching/`：报考单元、四值匹配规则、列表/详情视图、关注操作
- `src/lib/schedule/`：时间线与提醒视图
- `src/lib/goals/`：主要/备选目标
- `src/lib/announcements/`：公告与报考单元 seed、版本视图（新领域只读分域 seed：`src/lib/seed/`）
- `src/lib/plans/`：PlanEngine / ReplanEngine、反馈服务（v5.2 保留，门禁后移到主要目标之后）
- `src/lib/materials/`、`src/lib/resources/`：资料诊断与资源缺口匹配规则层
- `src/lib/governance/`：纠错、撤回留痕、通知偏好、隐私删除
- `src/lib/analytics/`：27 事件字典与指标纯函数；seed/live 分流；详见下节
- `src/lib/auth/`：`AuthService` 接口 + `DemoAuthProvider` / `HttpAuthProvider`，`instance.ts` 按 `NEXT_PUBLIC_AUTH_MODE` 切换

### 分析与指标（模块 9 口径）

- **P0 漏斗 9 阶段**（指标 id `p0_funnel`）：基础画像完成 → 获得至少一个有效机会 → 查看匹配依据 → 关注机会 → 补充资格信息 → 标记准备报名/已报名 → 设为主要目标 → 开始第一项学习任务 → 7 日内有效推进。
- **8 个漏斗事件**：`profile_completed`、`opportunity_revealed`、`match_basis_viewed`、`opportunity_followed`、`qualification_supplemented`、`follow_status_changed`、`primary_target_set`、`task_started`；第 9 阶段是派生指标（`meaningful_progress_7d`：画像完成 7×24h 内出现开始任务/反馈/确认计划/报名推进/设主目标 的去重用户占比），不新增事件。
- **seed/live 分离**：每个事件带 `source: "seed" | "live"`；seed 演示事件只由 `eventService` 的 seed 构建器产生。访客未登录时触发的事件进入 `kb_guest_analytics_pending` 暂存队列，登录成功后归属为该账号的 live 事件（保留原始时间），随后清空队列；`trackOncePerUser` 在“暂存 + 已落库”范围内去重。
- 埋点只记事实与维度数量（如补充了几个资格维度），不记录资格答案原文。

### 关键架构约定（继续生效）

- 认证逻辑、用户状态、UI 三层分离；页面一律经 `useCurrentUser()` 取用户，路由保护用 `RequireAuth` / 角色判断。
- 领域规则集中在各模块 `domain.ts` 纯函数，页面只做展示与交互。
- 未填信息永不判“不符合”；已截止不显示“正在报名”；无官方来源不进主要推荐；AI 未审核结论永不标记“已从官方公告核对”；公告新版本只追加不覆盖旧版本；同一提醒不重复生成。
- 正式（非 demo）状态不得静默回退到 Mock；演示数据必须明确标识。

---

## 二、v6.1 产品主线（已实现部分与边界）

产品主线：

```text
机会发现 → 可解释资格匹配 → 关注与报名日程 → 主要目标 → 备考
```

用户端主导航只保留三个入口（实现与设计一致）：

| 导航 | 回答的问题 | 主要内容 |
|---|---|---|
| 机会（`/opportunities`） | 现在有哪些值得我关注？ | 匹配结果、需补充的机会、机会详情 |
| 日程（`/schedule`） | 接下来不能错过什么？ | 报名、审核、缴费、准考证、考试、结果节点 |
| 备考（`/study`） | 今天先做什么？ | 主要目标、考情核对、今日任务、反馈与调整 |

账号、画像、通知偏好、隐私与资料放在“设置/头像菜单”与上下文页面，不占用主导航。首次使用为五组基础画像（地区、学历学位、专业、毕业与就业状态、教师资格 + 用工形式），**未登录可看初步匹配结果，关注/保存/提醒时才要求登录**。年龄/户籍/社保/经历不进基础画像，仅在机会需要时按需补问。

资格匹配支持四种结果：**初步符合 / 补充信息后判断 / 建议人工确认 / 明确不符合**；缺失信息永远不能被判定为不符合。公告事实、机器提取候选、人工审核结论分开存储与呈现，机器候选不进主推荐。

**仍未实现 / 不在本轮**：真实 AI/OCR 提取与附件二进制上传、对象存储、真实推送渠道、自动全国采集、多学科（当前仅语文）、多目标时间分配（PRD P1）、真实删除流程的服务端全链路。路由、领域对象的新旧对应与各模块处置见 [`docs/v6.1-migration-plan.md`](../docs/v6.1-migration-plan.md)。

---

## 三、公开演示环境

**https://frontend-two-beryl-fywu4p42k8.vercel.app**

- 环境标识 `NEXT_PUBLIC_APP_ENV=demo`、`NEXT_PUBLIC_DEMO_MODE=true`；
- 所有输入仅保存在访客本机浏览器，不上传服务器；页面顶部有固定提示横幅；
- `/admin` 在演示环境整体关闭；`robots` 为 `noindex,nofollow`；
- 该部署位于 Vercel，**仅用于功能展示，不是少量受邀用户的试用环境**；受邀用户环境必须在中国大陆普通网络可直接访问，见 [DEPLOYMENT.md](./DEPLOYMENT.md) 与[国内网络可访问性文档](../docs/china-network-accessibility.md)。

---

*本 README 于 2026-10-05（v6.1 模块 9 收口 + 验收）按当前代码重写并更新验收状态：登录后 P0 闭环 E2E 23/23（demo 会话）、invited 受邀链路 E2E 29/29（服务端登录/HttpOnly 会话/画像迁移/账号隔离）、断跨源回归 7/7 + 2/2、中国移动家庭宽带与手机蜂窝无代理冒烟均通过；公开受邀地址（境内部署 + ICP + HTTPS）仍待办，未实现能力继续标注 ❌/🚧，不得移入“已实现”。*
