import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { resolveAuthenticatedUser } from './identity.js';

/** 后台操作允许的角色（服务端强制校验，前端隐藏按钮不构成权限控制） */
export const STAFF_ROLES = ['admin', 'exam_reviewer', 'resource_reviewer'];
/** 审核高影响字段允许的角色 */
export const REVIEW_ROLES = ['admin', 'exam_reviewer'];

/**
 * 管理员/后台权限守卫（模块 8）。
 *
 * 身份来源由 resolveAuthenticatedUser 统一决定：
 * - invited 模式：服务端会话 cookie 中的 role；
 * - demo 模式：x-user-role 请求头。
 * 绝不在 invited 模式下信任客户端传入的 x-user-role。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = resolveAuthenticatedUser(req);
    if (!user) throw new UnauthorizedException('缺少用户身份信息，请先登录');
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException('当前账号没有后台操作权限');
    }
    req.user = user;
    return true;
  }
}

@Injectable()
export class ReviewGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = resolveAuthenticatedUser(req);
    if (!user) throw new UnauthorizedException('缺少用户身份信息，请先登录');
    if (!REVIEW_ROLES.includes(user.role)) {
      throw new ForbiddenException('当前账号没有审核权限');
    }
    req.user = user;
    return true;
  }
}
