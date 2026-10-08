"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Correction,
  EvidenceItem,
  ExtractionJob,
  ResourceItem,
  RetractionRecord,
} from "@/types";
import { loadFromStorage } from "@/lib/storage";
import {
  STORAGE_KEYS,
  mockCorrections,
  mockEvidenceItems,
  mockResources,
} from "@/lib/mock-data";
import { subscribeEvidence } from "@/lib/evidence/events";
import { subscribeGovernance } from "@/lib/governance/events";
import { subscribeResources } from "@/lib/resources/events";
import { listEvents, subscribeAnalytics } from "./eventService";
import { normalizeCorrection } from "@/lib/governance/domain";
import { computeDashboard, MetricsInput } from "./metrics/domain";
import { MetricsRangeKey } from "./types";

function subscribeAll(listener: () => void): () => void {
  const unsubs = [
    subscribeAnalytics(listener),
    subscribeEvidence(listener),
    subscribeGovernance(listener),
    subscribeResources(listener),
  ];
  return () => unsubs.forEach((u) => u());
}

/**
 * 后台概览数据 Hook：
 * 汇总分析事件流与各业务存储的当前快照，交给统一指标引擎计算。
 * 任意业务存储变化（含真实操作产生新事件）都会自动刷新。
 */
export function useDashboardMetrics(rangeKey: MetricsRangeKey) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    return subscribeAll(() => setTick((t) => t + 1));
  }, []);

  return useMemo(() => {
    void tick;
    if (typeof window === "undefined") return null;

    const input: MetricsInput = {
      events: listEvents(),
      evidenceItems: loadFromStorage<EvidenceItem[]>(
        STORAGE_KEYS.EVIDENCE_ITEMS,
        mockEvidenceItems
      ),
      corrections: loadFromStorage<Correction[]>(
        STORAGE_KEYS.CORRECTIONS,
        mockCorrections
      ).map(normalizeCorrection),
      retractions: loadFromStorage<RetractionRecord[]>(STORAGE_KEYS.RETRACTION_LOGS, []),
      resources: loadFromStorage<ResourceItem[]>(STORAGE_KEYS.RESOURCES, mockResources),
      jobs: loadFromStorage<ExtractionJob[]>(STORAGE_KEYS.EXTRACTION_JOBS, []),
    };
    return computeDashboard(input, rangeKey);
  }, [rangeKey, tick]);
}
