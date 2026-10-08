import type { AuthMode } from './auth.service.js';

/** 公开运行环境不能启用信任客户端身份头的演示鉴权。 */
export function validateAuthRuntime(config: {
  nodeEnv: string | undefined;
  authMode: AuthMode;
  host: string;
  internalToken: string | undefined;
}): void {
  if (config.authMode === 'demo') {
    if (config.nodeEnv === 'production') {
      throw new Error('Production backend requires AUTH_MODE=invited');
    }
    if (!['127.0.0.1', '::1', 'localhost'].includes(config.host)) {
      throw new Error('Demo backend must bind to a loopback host');
    }
  }
  if (config.nodeEnv === 'production' && !config.internalToken) {
    throw new Error('Production backend requires INTERNAL_TOKEN');
  }
}
