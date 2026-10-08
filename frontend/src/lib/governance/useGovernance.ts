"use client";

import { useSyncExternalStore } from "react";
import {
  Correction,
  DataDeletionRequest,
  NotificationItem,
  NotificationPreference,
  RetractionRecord,
} from "@/types";
import { authService } from "@/lib/auth";
import { subscribeEvidence, getEvidenceStoreVersion } from "@/lib/evidence/events";
import { getGovernanceStoreVersion, subscribeGovernance } from "./events";
import { correctionService, AdminCorrectionView } from "./correctionService";
import { notificationService } from "./notificationService";
import { privacyService } from "./privacyService";
import { correctionQueueCounts } from "./domain";
import { loadFromStorage } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/mock-data";
import type { CorrectionQueueKey } from "./domain";
import { normalizeCorrection } from "./domain";

function subscribe(callback: () => void): () => void {
  const unsubGov = subscribeGovernance(callback);
  const unsubAuth = authService.subscribe(callback);
  // 后台队列展示证据当前状态，证据变化也要刷新
  const unsubEvidence = subscribeEvidence(callback);
  return () => {
    unsubGov();
    unsubAuth();
    unsubEvidence();
  };
}

function useGovernanceSnapshot(extra = ""): string {
  return useSyncExternalStore(
    subscribe,
    () =>
      `${getGovernanceStoreVersion()}:${getEvidenceStoreVersion()}:${
        authService.getSession()?.userId ?? ""
      }:${extra}`,
    () => ""
  );
}

// ==================== 用户端 ====================

/** 通知偏好（未登录返回 null） */
export function useNotificationPreference(): NotificationPreference | null {
  useGovernanceSnapshot("notification-pref");
  try {
    return notificationService.getPreference();
  } catch {
    return null;
  }
}

/** 我的通知列表与未读数（读取时同样套用偏好闸门） */
export function useNotifications(): {
  items: NotificationItem[];
  unreadCount: number;
} {
  useGovernanceSnapshot("notifications");
  try {
    return {
      items: notificationService.listMine(false),
      unreadCount: notificationService.unreadCount(),
    };
  } catch {
    return { items: [], unreadCount: 0 };
  }
}

/** 数据类别清单（设置页：用途/保存范围/实时数量） */
export function useDataCategories() {
  useGovernanceSnapshot("data-categories");
  try {
    return privacyService.getMyDataCategories();
  } catch {
    return [];
  }
}

/** 未结束的删除申请（待确认/处理中/失败）；无则 null */
export function useActiveDeletionRequest(): DataDeletionRequest | null {
  useGovernanceSnapshot("active-deletion");
  try {
    return privacyService.getActiveRequest();
  } catch {
    return null;
  }
}

// ==================== 后台 ====================

/** 后台纠错队列与各视图计数；无权限时返回空集合（路由层另有 RequireRole 守卫） */
export function useAdminCorrections(queue: CorrectionQueueKey): {
  views: AdminCorrectionView[];
  counts: ReturnType<typeof correctionQueueCounts>;
} {
  useGovernanceSnapshot(`admin-corrections:${queue}`);
  try {
    const views = correctionService.listQueue(queue);
    const all = loadFromStorage<Correction[]>(STORAGE_KEYS.CORRECTIONS, []).map(
      normalizeCorrection
    );
    return { views, counts: correctionQueueCounts(all) };
  } catch {
    return {
      views: [],
      counts: {
        open: 0,
        submitted: 0,
        processing: 0,
        need_info: 0,
        accepted: 0,
        rejected: 0,
        all: 0,
      },
    };
  }
}

/** 后台撤回留痕列表（倒序） */
export function useRetractionLogs(): RetractionRecord[] {
  useGovernanceSnapshot("retraction-logs");
  try {
    return correctionService.listRetractions();
  } catch {
    return [];
  }
}
