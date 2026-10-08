"use client";

import { useSyncExternalStore } from "react";
import { ExamTarget, ResourceItem, ResourceMatch, ResourcePlanLink } from "@/types";
import { resourceService, ResourceQueues } from "./resourceService";
import { subscribeResources, getResourceStoreVersion } from "./events";
import { authService } from "@/lib/auth";

function subscribe(callback: () => void): () => void {
  const unsubResources = subscribeResources(callback);
  const unsubAuth = authService.subscribe(callback);
  return () => {
    unsubResources();
    unsubAuth();
  };
}

function versionSnapshot(targetId: string): string {
  return [getResourceStoreVersion(), authService.getSession()?.userId ?? "", targetId].join(":");
}

/** 缺口 → 最多 3 个匹配资源（含空数组，供页面展示空状态） */
export function useGapMatches(
  target: ExamTarget | null,
  modules: string[]
): { matchesByModule: Map<string, ResourceMatch[]> } {
  useSyncExternalStore(
    subscribe,
    () => versionSnapshot(target?.id ?? ""),
    () => ""
  );
  const matchesByModule = new Map<string, ResourceMatch[]>();
  if (target) {
    modules.forEach((key) => {
      matchesByModule.set(key, resourceService.matchGap(key, target));
    });
  }
  return { matchesByModule };
}

/** 当前用户在某目标下“加入计划”的资源待安排记录 */
export function useMyResourceLinks(targetId: string | null): ResourcePlanLink[] {
  useSyncExternalStore(
    subscribe,
    () => versionSnapshot(targetId ?? ""),
    () => ""
  );
  return targetId ? resourceService.listMyLinks(targetId) : [];
}

/** 公共资源页只读浏览列表 */
export function useBrowseableResources(): ResourceItem[] {
  useSyncExternalStore(subscribe, () => versionSnapshot("browse"), () => "");
  return resourceService.browseAll();
}

/** 后台：队列、计数与使用统计 */
export function useAdminResources(): {
  queues: ResourceQueues;
  stats: Record<string, { views: number; planLinks: number }>;
} {
  useSyncExternalStore(subscribe, () => versionSnapshot("admin"), () => "");
  return { queues: resourceService.adminQueues(), stats: resourceService.adminStats() };
}
