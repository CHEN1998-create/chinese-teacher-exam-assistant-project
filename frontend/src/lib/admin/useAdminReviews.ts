"use client";

import { useSyncExternalStore } from "react";
import { ReviewQueueKey } from "@/types";
import { adminReviewService, ReviewDetail, ReviewTargetGroup } from "./adminReviewService";
import type { AdminQueueEntry } from "./domain";
import { authService } from "@/lib/auth";
import type { ReviewLog } from "@/types";

function subscribe(callback: () => void): () => void {
  const unsubStore = adminReviewService.subscribe(callback);
  const unsubAuth = authService.subscribe(callback);
  return () => {
    unsubStore();
    unsubAuth();
  };
}

function useStoreSnapshot(extra: string): string {
  return useSyncExternalStore(
    subscribe,
    () =>
      `${adminReviewService.getVersion()}:${authService.getSession()?.userId ?? ""}:${extra}`,
    () => ""
  );
}

/** 审核队列与五视图计数；无后台权限时返回空集合（路由层另有守卫） */
export function useReviewQueue(
  view: ReviewQueueKey,
  targetId?: string
): { entries: AdminQueueEntry[]; counts: Record<ReviewQueueKey, number> } {
  useStoreSnapshot(`${view}:${targetId ?? ""}`);
  try {
    return {
      entries: adminReviewService.getQueue(view, targetId),
      counts: adminReviewService.getQueueCounts(targetId),
    };
  } catch {
    return {
      entries: [],
      counts: { pending: 0, high_risk: 0, conflict: 0, expiring: 0, completed: 0 },
    };
  }
}

/** 审核详情（原始来源 / AI 值 / 当前发布值 / 历史版本） */
export function useReviewDetail(itemId: string | null): ReviewDetail | null {
  useStoreSnapshot(`detail:${itemId ?? ""}`);
  if (!itemId) return null;
  try {
    return adminReviewService.getDetail(itemId);
  } catch {
    return null;
  }
}

/** 考情管理：全部目标分组统计 */
export function useReviewTargetGroups(): ReviewTargetGroup[] {
  useStoreSnapshot("target-groups");
  try {
    return adminReviewService.getTargetGroups();
  } catch {
    return [];
  }
}

/** 最近审核记录（留痕审计） */
export function useRecentReviewLogs(limit = 20): ReviewLog[] {
  useStoreSnapshot(`recent-logs:${limit}`);
  try {
    return adminReviewService.getRecentLogs(limit);
  } catch {
    return [];
  }
}
