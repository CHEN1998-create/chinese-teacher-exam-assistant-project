import { STORAGE_KEYS } from "./mock-data";

export function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/**
 * 严格写入：存储不可用或超限时抛出错误，
 * 供需要向用户展示“保存失败”状态的业务使用。
 */
export function saveToStorageStrict<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(value);
  localStorage.setItem(key, serialized);
}

export function removeFromStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearAllStorage(): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    removeFromStorage(key);
  });
  if (typeof window !== "undefined") {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("kb_demo_opportunities_v1_")) removeFromStorage(key);
    }
  }
}
