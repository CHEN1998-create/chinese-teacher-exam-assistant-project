import { DemoAuthProvider } from "./DemoAuthProvider";
import { HttpAuthProvider } from "./HttpAuthProvider";
import type { AuthService } from "./types";

/**
 * 当前认证模式：
 * - demo（默认）：本地演示账号 + localStorage 会话，不调用后端；
 * - invited：受邀用户账号 + 服务端 HttpOnly 会话 cookie，不保存任何令牌到前端。
 *
 * 通过 NEXT_PUBLIC_AUTH_MODE 环境变量切换；
 * 两种模式的数据完全隔离（demo 走 localStorage，invited 走服务端）。
 */
export const AUTH_MODE: "demo" | "invited" =
  process.env.NEXT_PUBLIC_AUTH_MODE === "invited" ? "invited" : "demo";

/**
 * 当前生效的认证服务单例。
 * 页面与组件通过 useCurrentUser 使用，无需关心底层实现。
 */
export const authService: AuthService =
  AUTH_MODE === "invited" ? new HttpAuthProvider() : new DemoAuthProvider();
