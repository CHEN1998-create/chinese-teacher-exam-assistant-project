import { describe, expect, it } from 'vitest';
import { validateAuthRuntime } from './runtime-security.js';

describe('认证运行环境门禁', () => {
  it('拒绝生产环境以可伪造身份头的 demo 模式启动', () => {
    expect(() => validateAuthRuntime({
      nodeEnv: 'production',
      authMode: 'demo',
      host: '127.0.0.1',
      internalToken: 'secret',
    })).toThrow(/AUTH_MODE=invited/);
  });

  it('拒绝 demo 后端监听公网网卡', () => {
    expect(() => validateAuthRuntime({
      nodeEnv: 'development',
      authMode: 'demo',
      host: '0.0.0.0',
      internalToken: undefined,
    })).toThrow(/loopback/);
  });

  it('允许受邀模式的生产内网容器', () => {
    expect(() => validateAuthRuntime({
      nodeEnv: 'production',
      authMode: 'invited',
      host: '0.0.0.0',
      internalToken: 'secret',
    })).not.toThrow();
  });
});
