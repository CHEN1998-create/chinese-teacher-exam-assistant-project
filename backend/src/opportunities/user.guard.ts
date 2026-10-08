import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { resolveAuthenticatedUser } from '../auth/identity.js';

/**
 * 普通登录用户守卫（模块 5 / 模块 8）。
 *
 * 身份来源由 resolveAuthenticatedUser 统一决定：
 * - invited 模式：服务端会话 cookie（由全局 SessionAuthGuard 预先校验并挂载 request.user）；
 * - demo 模式：x-user-id / x-user-role 请求头。
 * invited 模式下绝不信任客户端 x-user-id，避免越权读取他人数据。
 */
@Injectable()
export class UserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = resolveAuthenticatedUser(req);
    if (!user) {
      throw new UnauthorizedException('缺少用户身份信息，请先登录');
    }
    req.user = user;
    return true;
  }
}
