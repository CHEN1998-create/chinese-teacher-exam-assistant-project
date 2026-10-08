/**
 * 资料与能力基线服务（本地 Mock，非生产实现）。
 *
 * 职责边界：
 * - 只负责私有资料 / 能力基线 / 诊断快照的存取与编排；
 * - 诊断结论全部由 domain.ts 纯函数计算，本文件不含判断规则；
 * - 私有资料（MaterialItem）与公共资源（PublicResource）存储、读取完全分开。
 */
import {
  AbilityBaseline,
  MaterialDiagnosisSnapshot,
  MaterialItem,
  UsageStatus,
} from "@/types";
import {
  SEEDED_DIAGNOSIS_TARGET_IDS,
  STORAGE_KEYS,
  mockAbilityBaselines,
  mockExamTargets,
  mockMaterials,
} from "@/lib/mock-data";
import { loadFromStorage, saveToStorageStrict } from "@/lib/storage";
import { authService } from "@/lib/auth";
import { evidenceService } from "@/lib/evidence/evidenceService";
import { normalizeTarget } from "@/lib/targets/domain";
import {
  assessEvidenceReadiness,
  buildDiagnosisSignature,
  createEmptyBaseline,
  deriveInventoryStatus,
  diagnoseAll,
  normalizeBaseline,
  normalizeMaterial,
} from "./domain";
import type { ExamTarget } from "@/types";
import { track, classifyErrorCode } from "@/lib/analytics/eventService";

export type MaterialItemInput = Omit<MaterialItem, "id" | "userId" | "createdAt" | "updatedAt">;

const listeners = new Set<() => void>();
let storeVersion = 0;

function notifyChanged(): void {
  storeVersion += 1;
  listeners.forEach((fn) => fn());
}

function currentUserId(): string | null {
  return authService.getSession()?.user.id ?? null;
}

function loadAllMaterials(): MaterialItem[] {
  return loadFromStorage<MaterialItem[]>(STORAGE_KEYS.MATERIALS, mockMaterials).map(normalizeMaterial);
}

function persistMaterials(all: MaterialItem[]): void {
  try {
    saveToStorageStrict(STORAGE_KEYS.MATERIALS, all);
  } catch (e) {
    track("critical_write_failed", "storage", {
      props: {
        module: "material",
        storageKey: STORAGE_KEYS.MATERIALS,
        reasonCode: classifyErrorCode(e),
      },
    });
    throw e;
  }
}

function loadAllBaselines(): AbilityBaseline[] {
  return loadFromStorage<AbilityBaseline[]>(STORAGE_KEYS.ABILITY_BASELINES, mockAbilityBaselines);
}

function persistBaselines(all: AbilityBaseline[]): void {
  saveToStorageStrict(STORAGE_KEYS.ABILITY_BASELINES, all);
}

function loadAllSnapshots(): MaterialDiagnosisSnapshot[] {
  return loadFromStorage<MaterialDiagnosisSnapshot[]>(STORAGE_KEYS.MATERIAL_DIAGNOSES, []);
}

function persistSnapshots(all: MaterialDiagnosisSnapshot[]): void {
  saveToStorageStrict(STORAGE_KEYS.MATERIAL_DIAGNOSES, all);
}

function findTarget(userId: string, targetId: string): ExamTarget | null {
  const targets = loadFromStorage(STORAGE_KEYS.EXAM_TARGETS, mockExamTargets).map(normalizeTarget);
  return targets.find((t) => t.id === targetId && t.userId === userId) ?? null;
}

/** 存储中是否从未写入过诊断快照（用于首次播种） */
function snapshotKeyAbsent(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEYS.MATERIAL_DIAGNOSES) === null;
}

export const materialService = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getVersion(): number {
    return storeVersion;
  },

  // ==================== 私有资料 ====================

  /** 当前用户在指定目标下的全部私有资料 */
  list(targetId: string): MaterialItem[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadAllMaterials()
      .filter((m) => m.userId === userId && m.examTargetId === targetId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  getById(id: string): MaterialItem | null {
    const userId = currentUserId();
    if (!userId) return null;
    return loadAllMaterials().find((m) => m.id === id && m.userId === userId) ?? null;
  },

  create(input: MaterialItemInput): MaterialItem {
    const userId = currentUserId();
    if (!userId) throw new Error("请先登录");
    const now = new Date().toISOString();
    const id = `um-${Date.now()}`;
    const material = normalizeMaterial({
      ...input,
      id,
      userId,
      chapters: input.chapters.map((c, i) => ({
        ...c,
        id: c.id || `ch-${id}-${i}`,
        materialId: id,
        order: i + 1,
      })),
      createdAt: now,
      updatedAt: now,
    });
    const all = loadAllMaterials();
    all.push(material);
    persistMaterials(all);
    this.syncInventoryStatus(input.examTargetId);
    notifyChanged();
    track("material_added", "material", {
      targetId: material.examTargetId,
      props: { sourceType: material.sourceType },
    });
    return material;
  },

  update(id: string, patch: Partial<MaterialItemInput>): MaterialItem | null {
    const userId = currentUserId();
    if (!userId) return null;
    const all = loadAllMaterials();
    const index = all.findIndex((m) => m.id === id && m.userId === userId);
    if (index === -1) return null;
    const chapters = patch.chapters
      ? patch.chapters.map((c, i) => ({ ...c, id: c.id || `ch-${id}-${i}`, materialId: id, order: i + 1 }))
      : all[index].chapters;
    all[index] = normalizeMaterial({
      ...all[index],
      ...patch,
      chapters,
      updatedAt: new Date().toISOString(),
    });
    persistMaterials(all);
    notifyChanged();
    return all[index];
  },

  remove(id: string): void {
    const userId = currentUserId();
    if (!userId) return;
    const all = loadAllMaterials();
    const target = all.find((m) => m.id === id && m.userId === userId);
    if (!target) return;
    persistMaterials(all.filter((m) => m.id !== id));
    this.syncInventoryStatus(target.examTargetId);
    notifyChanged();
  },

  // ==================== 能力基线 ====================

  getBaseline(targetId: string): AbilityBaseline | null {
    const userId = currentUserId();
    if (!userId) return null;
    const stored = loadAllBaselines().find((b) => b.userId === userId && b.examTargetId === targetId);
    if (stored) return normalizeBaseline(stored, createEmptyBaseline(userId, targetId));
    // 未填过：用会话中的每日时间生成空白基线（不落库，保存时才持久化）
    const daily = authService.getSession()?.user.dailyAvailableTime ?? 120;
    return createEmptyBaseline(userId, targetId, daily);
  },

  saveBaseline(baseline: AbilityBaseline): AbilityBaseline {
    const userId = currentUserId();
    if (!userId) throw new Error("请先登录");
    const all = loadAllBaselines();
    const index = all.findIndex((b) => b.id === baseline.id);
    const saved: AbilityBaseline = { ...baseline, userId, updatedAt: new Date().toISOString() };
    if (index === -1) all.push(saved);
    else all[index] = saved;
    persistBaselines(all);
    notifyChanged();
    return saved;
  },

  setInventoryStatus(targetId: string, status: UsageStatus): AbilityBaseline {
    const baseline = this.getBaseline(targetId) ?? createEmptyBaseline(currentUserId() ?? "anonymous", targetId);
    return this.saveBaseline({ ...baseline, inventoryStatus: status });
  },

  /** 资料数量变化后同步入口状态（none/single/multiple） */
  syncInventoryStatus(targetId: string): void {
    const baseline = this.getBaseline(targetId);
    if (!baseline) return;
    const next = deriveInventoryStatus(this.list(targetId).length);
    if (baseline.inventoryStatus !== next) {
      const all = loadAllBaselines();
      const index = all.findIndex((b) => b.id === baseline.id);
      const updated = { ...baseline, inventoryStatus: next, updatedAt: new Date().toISOString() };
      if (index === -1) all.push(updated);
      else all[index] = updated;
      persistBaselines(all);
    }
  },

  // ==================== 诊断快照 ====================

  /** 首次使用时用规则层为演示目标生成初始快照（只跑一次） */
  ensureSeedSnapshots(): void {
    const userId = currentUserId();
    if (!userId || !snapshotKeyAbsent()) return;
    const snapshots: MaterialDiagnosisSnapshot[] = [];
    for (const targetId of SEEDED_DIAGNOSIS_TARGET_IDS) {
      const target = findTarget(userId, targetId);
      if (!target) continue;
      const materials = loadAllMaterials().filter((m) => m.userId === userId && m.examTargetId === targetId);
      const baseline =
        loadAllBaselines().find((b) => b.userId === userId && b.examTargetId === targetId) ?? null;
      const items = evidenceService.getItems(targetId);
      const result = diagnoseAll(materials, baseline, target, items);
      snapshots.push({
        examTargetId: targetId,
        signature: buildDiagnosisSignature({ target, items, materials, baseline }),
        evidenceComplete: result.readiness.complete,
        pendingEvidenceFields: result.readiness.pendingFields,
        materialDiagnoses: result.diagnoses,
        missingModules: result.missingModules,
        conflictGroups: result.conflictGroups,
        weakModules: result.weakModules,
        diagnosedAt: new Date().toISOString(),
      });
    }
    persistSnapshots(snapshots);
  },

  getSnapshot(targetId: string): MaterialDiagnosisSnapshot | null {
    this.ensureSeedSnapshots();
    return loadAllSnapshots().find((s) => s.examTargetId === targetId) ?? null;
  },

  /** 当前输入的实时签名（与快照签名不同即表示诊断可能已过时） */
  currentSignature(targetId: string): string | null {
    const userId = currentUserId();
    if (!userId) return null;
    const target = findTarget(userId, targetId);
    if (!target) return null;
    const materials = this.list(targetId);
    const baseline =
      loadAllBaselines().find((b) => b.userId === userId && b.examTargetId === targetId) ?? null;
    const items = evidenceService.getItems(targetId);
    return buildDiagnosisSignature({ target, items, materials, baseline });
  },

  /** 用规则层重新计算并落库诊断快照 */
  recompute(targetId: string): MaterialDiagnosisSnapshot {
    const userId = currentUserId();
    if (!userId) throw new Error("请先登录");
    const target = findTarget(userId, targetId);
    if (!target) throw new Error("目标不存在或不属于当前账号");
    const materials = this.list(targetId);
    const baseline =
      loadAllBaselines().find((b) => b.userId === userId && b.examTargetId === targetId) ?? null;
    const items = evidenceService.getItems(targetId);
    const result = diagnoseAll(materials, baseline, target, items);
    const snapshot: MaterialDiagnosisSnapshot = {
      examTargetId: targetId,
      signature: buildDiagnosisSignature({ target, items, materials, baseline }),
      evidenceComplete: result.readiness.complete,
      pendingEvidenceFields: result.readiness.pendingFields,
      materialDiagnoses: result.diagnoses,
      missingModules: result.missingModules,
      conflictGroups: result.conflictGroups,
      weakModules: result.weakModules,
      diagnosedAt: new Date().toISOString(),
    };
    const all = loadAllSnapshots().filter((s) => s.examTargetId !== targetId);
    all.push(snapshot);
    persistSnapshots(all);
    notifyChanged();
    return snapshot;
  },
};

/** 供页面展示考情就绪情况（不依赖快照） */
export function readEvidenceReadiness(targetId: string) {
  return assessEvidenceReadiness(evidenceService.getItems(targetId));
}
