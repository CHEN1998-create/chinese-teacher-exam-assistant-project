"use client";

import { useSyncExternalStore } from "react";
import { planService } from "./planService";
import { feedbackService } from "./feedbackService";
import { replanService } from "./replanService";
import { examTargetService } from "@/lib/services";
import { authService } from "@/lib/auth";
import { materialService } from "@/lib/materials/materialService";
import { subscribeResources, getResourceStoreVersion } from "@/lib/resources/events";

/**
 * 计划模块的响应式读取：
 * 计划数据、反馈、重排（草稿/调整记录/复盘）、目标、资料、资源、会话任一变化都会重新读取。
 */
export function usePlans(targetId: string | null) {
  useSyncExternalStore(
    (cb) => {
      const unsubPlan = planService.subscribe(cb);
      const unsubFeedback = feedbackService.subscribe(cb);
      const unsubReplan = replanService.subscribe(cb);
      const unsubTarget = examTargetService.subscribe(cb);
      const unsubMaterial = materialService.subscribe(cb);
      const unsubResource = subscribeResources(cb);
      const unsubAuth = authService.subscribe(cb);
      return () => {
        unsubPlan();
        unsubFeedback();
        unsubReplan();
        unsubTarget();
        unsubMaterial();
        unsubResource();
        unsubAuth();
      };
    },
    () =>
      [
        "plan",
        planService.getVersion(),
        "fb",
        feedbackService.getVersion(),
        "replan",
        replanService.getVersion(),
        "tgt",
        examTargetService.getVersion(),
        "mat",
        materialService.getVersion(),
        "res",
        getResourceStoreVersion(),
        "sess",
        authService.getSession()?.userId ?? "",
        "target",
        targetId ?? "",
      ].join(":"),
    () => ""
  );

  if (!targetId) {
    return { currentPlan: null, dailyPlans: [], versions: [] };
  }

  const currentPlan = planService.getCurrentPlan(targetId);
  const dailyPlans = currentPlan ? planService.getDailyPlans(currentPlan.id) : [];
  const versions = planService.listVersions(targetId);
  return { currentPlan, dailyPlans, versions };
}
