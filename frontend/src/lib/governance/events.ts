/**
 * 治理模块共享变更事件。
 *
 * 纠错 / 通知 / 通知偏好 / 删除申请 / 撤回留痕共用同一个监听器集合，
 * 任意一个治理存储变化后自增版本号，用户端与后台通过 useSyncExternalStore 自动刷新。
 * 撤回同时改写证据与计划时，还会额外触发各自模块的既有事件（见 correctionService）。
 */
const governanceListeners = new Set<() => void>();
let governanceStoreVersion = 0;

export function subscribeGovernance(listener: () => void): () => void {
  governanceListeners.add(listener);
  return () => {
    governanceListeners.delete(listener);
  };
}

export function emitGovernanceChanged(): void {
  governanceStoreVersion += 1;
  governanceListeners.forEach((fn) => fn());
}

export function getGovernanceStoreVersion(): number {
  return governanceStoreVersion;
}
