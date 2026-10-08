"use client";

import { useEffect, useState } from "react";

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免时区偏移） */
export function todayString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * 响应"今天"的日期变化：
 * 页面在跨午夜保持打开时（定时器/重新聚焦/重新可见）自动切到新的一天，
 * 不需要刷新页面。
 */
export function useTodayString(): string {
  const [today, setToday] = useState<string>(() => todayString());

  useEffect(() => {
    const check = (): void => {
      const next = todayString();
      setToday((prev) => (prev === next ? prev : next));
    };
    const timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return today;
}
