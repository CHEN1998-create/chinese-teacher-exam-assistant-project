import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/**
 * 内部调用密钥守卫。
 * 仅允许携带正确 x-internal-token 的请求（Vercel 服务端反代），
 * 防止 8081 端口暴露后被公网直接扫描调用。
 * 未设置 INTERNAL_TOKEN 环境变量时放行，方便本地开发。
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_TOKEN;
    if (!expected) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const raw = request.headers['x-internal-token'];
    const provided = Array.isArray(raw) ? raw[0] ?? '' : raw ?? '';

    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length) {
      throw new UnauthorizedException('invalid internal token');
    }
    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      throw new UnauthorizedException('invalid internal token');
    }
    return true;
  }
}
