"use client";

import { useSyncExternalStore } from "react";
import { materialService, readEvidenceReadiness } from "./materialService";
import { subscribeEvidence, getEvidenceStoreVersion } from "@/lib/evidence/events";
import { examTargetService } from "@/lib/services";
import { authService } from "@/lib/auth";

function subscribeAll(callback: () => void): () => void {
  const unsubMaterials = materialService.subscribe(callback);
  const unsubEvidence = subscribeEvidence(callback);
  const unsubTargets = examTargetService.subscribe(callback);
  const unsubAuth = authService.subscribe(callback);
  return () => {
    unsubMaterials();
    unsubEvidence();
    unsubTargets();
    unsubAuth();
  };
}

/**
 * 当前目标下资料模块的响应式读取：
 * 资料/基线/快照、考情证据、目标或会话任一变化都会重新读取。
 */
export function useMaterialsModule(targetId: string | null) {
  useSyncExternalStore(
    subscribeAll,
    () =>
      [
        "mat",
        materialService.getVersion(),
        "evi",
        getEvidenceStoreVersion(),
        "tgt",
        examTargetService.getVersion(),
        "sess",
        authService.getSession()?.userId ?? "",
        "target",
        targetId ?? "",
      ].join(":"),
    () => ""
  );

  if (!targetId) {
    return {
      materials: [],
      baseline: null,
      snapshot: null,
      signature: null,
      /** 尚未生成过快照（需要用户点击生成诊断） */
      hasSnapshot: false,
      /** 快照相对当前输入是否已过时 */
      stale: false,
      readiness: null,
    };
  }

  const materials = materialService.list(targetId);
  const baseline = materialService.getBaseline(targetId);
  const snapshot = materialService.getSnapshot(targetId);
  const signature = materialService.currentSignature(targetId);
  const readiness = readEvidenceReadiness(targetId);

  return {
    materials,
    baseline,
    snapshot,
    signature,
    hasSnapshot: Boolean(snapshot),
    stale: Boolean(snapshot && signature && snapshot.signature !== signature),
    readiness,
  };
}
