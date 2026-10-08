"use client";

import { useCallback, useEffect, useState } from "react";
import { scheduleApi } from "./api";
import type { NotificationDTO } from "./types";

/**
 * 站内日程通知（来自后端 NotificationRecord）。
 * 与本地治理通知（学习提醒/考情变化等）并列展示在通知中心。
 */
export function useScheduleNotifications() {
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(
    () => scheduleApi.getNotifications(),
    [],
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications]);

  // 初次加载：setState 只在异步回调中
  useEffect(() => {
    let cancelled = false;
    fetchNotifications()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchNotifications]);

  const markRead = useCallback(
    async (id: string) => {
      // 乐观更新
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
      try {
        await scheduleApi.markNotificationRead(id);
      } catch {
        await load();
      }
    },
    [load],
  );

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    try {
      await scheduleApi.markAllRead();
    } catch {
      await load();
    }
  }, [load]);

  const unreadCount = items.filter((n) => !n.readAt).length;

  return { items, loading, unreadCount, markRead, markAllRead, reload: load };
}
