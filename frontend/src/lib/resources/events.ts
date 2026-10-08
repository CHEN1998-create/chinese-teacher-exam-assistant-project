/**
 * 公共资源存储共享事件：
 * 用户端与后台写同一份 localStorage（本地 Mock 架构），
 * 后台停用/修改资源后订阅方即时刷新，无需重载页面。
 */
const listeners = new Set<() => void>();
let storeVersion = 0;

export function subscribeResources(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitResourcesChanged(): void {
  storeVersion += 1;
  listeners.forEach((fn) => fn());
}

export function getResourceStoreVersion(): number {
  return storeVersion;
}
