# 教招有据

教师公开招聘机会发现、资格匹配、报名跟进与备考的验证期产品。当前先开放语文学科。

本仓库统一管理前端、后端、数据库迁移、部署配置和产品文档：

| 目录 | 内容 |
| --- | --- |
| [`frontend/`](./frontend/) | Next.js 页面、同源 API 代理与前端测试 |
| [`backend/`](./backend/) | NestJS API、Prisma 模型与迁移、后端测试 |
| [`deploy/`](./deploy/) | Docker Compose、Caddy 与环境变量模板 |
| [`docs/`](./docs/) | 产品与验收文档 |

## 本地开发

前、后端依赖仍分别安装；不要把真实环境变量提交到仓库。

```bash
cd frontend && npm ci && npm run dev
cd backend && npm ci && npm run start:dev
```

后端连接 PostgreSQL 所需的配置见 [`backend/.env.example`](./backend/.env.example)。前端公开演示模式见 [`frontend/.env.example`](./frontend/.env.example)。

## Docker 部署

推送本仓库后，[GitHub Actions](./.github/workflows/docker-publish.yml) 会分别构建前、后端 `linux/amd64` 镜像并发布到本仓库关联的 GHCR Packages。镜像中的前端为受邀模式，**不是** Vercel 的浏览器本地演示模式。部署步骤、数据库依赖与公网入口条件见 [`deploy/README.md`](./deploy/README.md)。

旧前端和后端 GitHub 仓库保留作历史参考；新改动请提交到本仓库。
