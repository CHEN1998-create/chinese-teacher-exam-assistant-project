import type { Request } from 'express';
import { getAuthMode } from './auth.service.js';

/** 经认证后的请求：user 由 SessionAuthGuard（invited）或 UserGuard（demo）挂载 */
export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: string; email?: string; name?: string | null };
}

/**
 * 从客户端请求头解析身份（仅 demo 模式使用）。
 * invited 模式下绝不调用本函数：身份必须来自服务端会话 cookie。
 */
export function userFromHeaders(req: AuthenticatedRequest): {
  id: string;
  role: string;
} | null {
  const rawId = req.headers['x-user-id'];
  const rawRole = req.headers['x-user-role'];
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const role = Array.isArray(rawRole) ? rawRole[0] : rawRole;
  if (!id || !role) return null;
  return { id, role };
}

/**
 * 解析当前请求的认证用户。
 * - invited 模式：必须已由 SessionAuthGuard 通过会话 cookie 设置 request.user；
 *   若缺失说明未登录或会话无效。
 * - demo 模式：从 x-user-id / x-user-role 请求头读取（演示环境信任反代注入）。
 */
export function resolveAuthenticatedUser(req: AuthenticatedRequest): {
  id: string;
  role: string;
} | null {
  if (getAuthMode() === 'invited') {
    return req.user ?? null;
  }
  return userFromHeaders(req);
}
