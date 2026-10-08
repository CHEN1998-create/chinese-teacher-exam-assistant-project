import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { getAuthMode } from './auth/auth.service.js';
import { validateAuthRuntime } from './auth/runtime-security.js';

async function bootstrap() {
  const authMode = getAuthMode();
  const host = process.env.HOST ?? (authMode === 'demo' ? '127.0.0.1' : '0.0.0.0');
  validateAuthRuntime({
    nodeEnv: process.env.NODE_ENV,
    authMode,
    host,
    internalToken: process.env.INTERNAL_TOKEN,
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 解析 Cookie，供 SessionAuthGuard 读取 HttpOnly 会话令牌
  app.use(cookieParser());

  // 受邀部署中 Nginx 终止 TLS 并以 /api/* 反向代理到本服务。
  // 显式设置 trust proxy，Express 才会信任代理设置的 X-Forwarded-*，
  // 后续安全 Cookie（secure）与真实客户端 IP 判断才正确。
  // 默认关闭（本地直连开发）；部署在反向代理后时设 TRUST_PROXY=true。
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
  });

  const port = Number(process.env.PORT ?? 3000);
  // demo 开发环境仅允许回环；invited 容器可监听内网网络，但不可映射公网端口。
  await app.listen(port, host);
}
await bootstrap();
