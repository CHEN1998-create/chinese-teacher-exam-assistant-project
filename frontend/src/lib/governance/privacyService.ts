/**
 * 隐私与个人数据删除服务（本地 Mock，非生产实现）。
 *
 * 职责：
 * - 汇总当前用户的个人数据类别（用途/保存范围/数量），公共数据与私有数据分开呈现；
 * - 数据删除申请：待确认 → 处理中 → 完成 / 失败（失败可重试）；
 * - 删除时按类别分流：
 *   · 私有数据（目标、资料、计划、反馈、通知、提取原文等）按 userId 物理删除；
 *   · 公共数据（考情证据池、公共资源索引）保留；
 *   · 审计留痕（纠错、审核/撤回留痕、删除申请凭证）匿名化保留，不物理删除。
 *
 * 会话本身（kb_session）在用户点击“完成并退出”时由认证服务清除，
 * 因此完成页可以在退出前展示处理结果。
 */
import {
  AbilityBaseline,
  Correction,
  DailyPlan,
  DataDeletionRequest,
  DataDeletionScopeItem,
  ExamTarget,
  ExtractionJob,
  MaterialItem,
  MaterialDiagnosisSnapshot,
  NotificationItem,
  NotificationPreference,
  ResourceItem,
  ResourcePlanLink,
  ResourceViewRecord,
  RetractionRecord,
  ReviewLog,
  TaskAdjustment,
  TaskFeedback,
  WeeklyPlan,
  WeeklyReview,
  EvidenceItem,
} from "@/types";
import { loadFromStorage, saveToStorageStrict, removeFromStorage } from "@/lib/storage";
import { STORAGE_KEYS, mockEvidenceItems, mockExamTargets, mockResources } from "@/lib/mock-data";
import { authService } from "@/lib/auth";
import { DATA_CATEGORY_META } from "./domain";
import { emitGovernanceChanged } from "./events";
import { track, classifyErrorCode } from "@/lib/analytics/eventService";

function load<T>(key: string, fallback: T): T {
  return loadFromStorage<T>(key, fallback);
}

function loadRequests(): DataDeletionRequest[] {
  return load<DataDeletionRequest[]>(STORAGE_KEYS.DELETION_REQUESTS, []);
}

function persistRequests(all: DataDeletionRequest[]): void {
  saveToStorageStrict(STORAGE_KEYS.DELETION_REQUESTS, all);
  emitGovernanceChanged();
}

interface RawStores {
  targets: ExamTarget[];
  jobs: ExtractionJob[];
  materials: MaterialItem[];
  baselines: AbilityBaseline[];
  diagnoses: MaterialDiagnosisSnapshot[];
  plans: WeeklyPlan[];
  dailyPlans: DailyPlan[];
  feedbacks: TaskFeedback[];
  adjustments: TaskAdjustment[];
  weeklyReviews: WeeklyReview[];
  resourceViews: ResourceViewRecord[];
  resourceLinks: ResourcePlanLink[];
  notifications: NotificationItem[];
  prefs: NotificationPreference[];
  corrections: Correction[];
  evidence: EvidenceItem[];
  resources: ResourceItem[];
  reviewLogs: ReviewLog[];
  retractions: RetractionRecord[];
}

function loadAllStores(): RawStores {
  return {
    targets: load<ExamTarget[]>(STORAGE_KEYS.EXAM_TARGETS, mockExamTargets),
    jobs: load<ExtractionJob[]>(STORAGE_KEYS.EXTRACTION_JOBS, []),
    materials: load<MaterialItem[]>(STORAGE_KEYS.MATERIALS, []),
    baselines: load<AbilityBaseline[]>(STORAGE_KEYS.ABILITY_BASELINES, []),
    diagnoses: load<MaterialDiagnosisSnapshot[]>(STORAGE_KEYS.MATERIAL_DIAGNOSES, []),
    plans: load<WeeklyPlan[]>(STORAGE_KEYS.PLANS, []),
    dailyPlans: load<DailyPlan[]>(STORAGE_KEYS.DAILY_PLANS, []),
    feedbacks: load<TaskFeedback[]>(STORAGE_KEYS.TASK_FEEDBACKS, []),
    adjustments: load<TaskAdjustment[]>(STORAGE_KEYS.PLAN_ADJUSTMENTS, []),
    weeklyReviews: load<WeeklyReview[]>(STORAGE_KEYS.WEEKLY_REVIEWS, []),
    resourceViews: load<ResourceViewRecord[]>(STORAGE_KEYS.RESOURCE_VIEWS, []),
    resourceLinks: load<ResourcePlanLink[]>(STORAGE_KEYS.RESOURCE_PLAN_LINKS, []),
    notifications: load<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []),
    prefs: load<NotificationPreference[]>(STORAGE_KEYS.NOTIFICATION_PREFS, []),
    corrections: load<Correction[]>(STORAGE_KEYS.CORRECTIONS, []),
    evidence: load<EvidenceItem[]>(STORAGE_KEYS.EVIDENCE_ITEMS, mockEvidenceItems),
    resources: load<ResourceItem[]>(STORAGE_KEYS.RESOURCES, mockResources),
    reviewLogs: load<ReviewLog[]>(STORAGE_KEYS.REVIEW_LOGS, []),
    retractions: load<RetractionRecord[]>(STORAGE_KEYS.RETRACTION_LOGS, []),
  };
}

/** 计算当前用户各数据类别的数量（删除范围快照 + 设置页数据清单共用） */
function computeScope(userId: string, stores: RawStores): DataDeletionScopeItem[] {
  const myTargets = stores.targets.filter((t) => t.userId === userId);
  const myTargetIds = new Set(myTargets.map((t) => t.id));
  const myPlanIds = new Set(
    stores.plans.filter((p) => p.userId === userId).map((p) => p.id)
  );

  const counts: Record<string, number> = {
    profile: 1, // 当前会话（退出登录时清除）
    targets: myTargets.length,
    evidence_submissions: stores.jobs.filter((j) => j.userId === userId).length,
    materials: stores.materials.filter((m) => m.userId === userId).length,
    baseline:
      stores.baselines.filter((b) => b.userId === userId).length +
      stores.diagnoses.filter((d) => myTargetIds.has(d.examTargetId)).length,
    plans:
      stores.plans.filter((p) => p.userId === userId).length +
      stores.dailyPlans.filter((d) => myPlanIds.has(d.weeklyPlanId)).length +
      stores.feedbacks.filter((f) => f.userId === userId).length +
      stores.adjustments.filter((a) => myPlanIds.has(a.weeklyPlanId)).length +
      stores.weeklyReviews.filter((w) => w.userId === userId).length,
    resource_records:
      stores.resourceViews.filter((r) => r.userId === userId).length +
      stores.resourceLinks.filter((r) => r.userId === userId).length,
    notifications:
      stores.notifications.filter((n) => n.userId === userId).length +
      (stores.prefs.some((p) => p.userId === userId) ? 1 : 0),
    shared_evidence: stores.evidence.length,
    public_resources: stores.resources.length,
    corrections: stores.corrections.filter((c) => c.userId === userId).length,
    audit_logs: stores.reviewLogs.length + stores.retractions.length,
    deletion_requests: loadRequests().filter(
      (r) => r.userId === userId && r.status !== "completed"
    ).length,
  };

  return DATA_CATEGORY_META.map((meta) => ({
    key: meta.key,
    label: meta.label,
    handling: meta.handling,
    count: counts[meta.key] ?? 0,
  }));
}

export const privacyService = {
  /** 当前用户数据类别清单（含用途/保存范围文案与实时数量） */
  getMyDataCategories() {
    const session = authService.getSession();
    if (!session) return [];
    const scope = computeScope(session.user.id, loadAllStores());
    return DATA_CATEGORY_META.map((meta) => {
      const item = scope.find((s) => s.key === meta.key);
      return { ...meta, count: item?.count ?? 0 };
    });
  },

  /** 当前用户的删除申请（倒序）；完成后的申请已匿名化，不再出现在列表中 */
  listMine(): DataDeletionRequest[] {
    const session = authService.getSession();
    if (!session) return [];
    return loadRequests()
      .filter((r) => r.userId === session.user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  /** 找到当前未结束的申请（待确认/处理中/失败），同一时间只允许一个 */
  getActiveRequest(): DataDeletionRequest | null {
    return (
      this.listMine().find((r) =>
        ["pending", "processing", "failed"].includes(r.status)
      ) ?? null
    );
  },

  /** 发起删除申请（状态：待确认），保存删除范围快照 */
  initiateDeletion(): DataDeletionRequest {
    const session = authService.getSession();
    if (!session) throw new Error("未登录或会话已过期，请重新登录");
    const existing = this.getActiveRequest();
    if (existing && existing.status === "processing") {
      throw new Error("已有删除申请正在处理中");
    }

    const now = new Date().toISOString();
    const request: DataDeletionRequest = {
      id: `del-${Date.now()}`,
      userId: session.user.id,
      userLabel: session.user.name,
      status: "pending",
      scope: computeScope(session.user.id, loadAllStores()),
      createdAt: now,
      updatedAt: now,
    };
    const all = loadRequests().filter(
      (r) => !(r.userId === session.user.id && ["pending", "failed"].includes(r.status))
    );
    all.push(request);
    try {
      persistRequests(all);
    } catch (e) {
      track("critical_write_failed", "storage", {
        props: {
          module: "privacy",
          storageKey: STORAGE_KEYS.DELETION_REQUESTS,
          reasonCode: classifyErrorCode(e),
        },
      });
      throw e;
    }
    // 只记录申请事实与类别数量，不记录具体数据内容
    track("data_delete_requested", "privacy", {
      props: { scopeCount: request.scope.length },
    });
    return request;
  },

  /** 取消待确认的申请（处理中不可取消） */
  cancelPending(id: string): void {
    const session = authService.getSession();
    if (!session) return;
    const all = loadRequests();
    const idx = all.findIndex((r) => r.id === id && r.userId === session.user.id);
    if (idx === -1 || all[idx].status !== "pending") return;
    all.splice(idx, 1);
    persistRequests(all);
  },

  /**
   * 确认并执行删除：
   * pending/failed → processing → completed/failed。
   * 任一类别的写入失败都会把申请置为 failed 并保留原因，已删除部分不回滚（可重试）。
   */
  async confirmDeletion(id: string): Promise<DataDeletionRequest> {
    const session = authService.getSession();
    if (!session) throw new Error("未登录或会话已过期，请重新登录");
    const requests = loadRequests();
    const idx = requests.findIndex((r) => r.id === id && r.userId === session.user.id);
    if (idx === -1) throw new Error("删除申请不存在");
    if (requests[idx].status === "processing") throw new Error("申请正在处理中");
    if (requests[idx].status === "completed") return requests[idx];

    const now = new Date().toISOString();
    requests[idx] = { ...requests[idx], status: "processing", confirmedAt: now, updatedAt: now };
    persistRequests(requests);

    // Mock：模拟后台处理延迟，真实环境由服务端任务执行
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      const result = this.executeDeletion(session.user.id, id);
      const all = loadRequests();
      const i = all.findIndex((r) => r.id === id);
      if (i !== -1) {
        all[i] = {
          ...all[i],
          status: "completed",
          processedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedCount: result.deletedCount,
          anonymizedCount: result.anonymizedCount,
          // 凭证匿名化：保留状态、范围与时间，不再能关联到具体个人
          userId: `anonymized:${id}`,
          userLabel: "已注销用户",
        };
        persistRequests(all);
      }
      return all[i];
    } catch (e) {
      const reason = e instanceof Error ? e.message : "删除处理失败，请重试";
      const all = loadRequests();
      const i = all.findIndex((r) => r.id === id);
      if (i !== -1) {
        all[i] = { ...all[i], status: "failed", failReason: reason, updatedAt: new Date().toISOString() };
        persistRequests(all);
      }
      return all[i];
    }
  },

  /**
   * 实际删除（内部）：按 userId 清理私有数据；公共数据保留；审计记录匿名化。
   */
  executeDeletion(userId: string, requestId: string): {
    deletedCount: number;
    anonymizedCount: number;
  } {
    const stores = loadAllStores();
    let deletedCount = 0;
    let anonymizedCount = 0;
    const write = (key: string, value: unknown) => {
      saveToStorageStrict(key, value);
    };

    const myTargetIds = new Set(
      stores.targets.filter((t) => t.userId === userId).map((t) => t.id)
    );
    const myPlanIds = new Set(
      stores.plans.filter((p) => p.userId === userId).map((p) => p.id)
    );

    // —— 私有数据：按用户/关联目标过滤删除 ——
    const removeByUser = <T extends { userId?: string }>(key: string, list: T[]): T[] => {
      const kept = list.filter((x) => x.userId !== userId);
      deletedCount += list.length - kept.length;
      write(key, kept);
      return kept;
    };

    const nextTargets = stores.targets.filter((t) => t.userId !== userId);
    deletedCount += stores.targets.length - nextTargets.length;
    write(STORAGE_KEYS.EXAM_TARGETS, nextTargets);

    removeByUser(STORAGE_KEYS.EXTRACTION_JOBS, stores.jobs);
    removeByUser(STORAGE_KEYS.MATERIALS, stores.materials);
    removeByUser(STORAGE_KEYS.ABILITY_BASELINES, stores.baselines);

    const nextDiagnoses = stores.diagnoses.filter((d) => !myTargetIds.has(d.examTargetId));
    deletedCount += stores.diagnoses.length - nextDiagnoses.length;
    write(STORAGE_KEYS.MATERIAL_DIAGNOSES, nextDiagnoses);

    const nextPlans = stores.plans.filter((p) => p.userId !== userId);
    deletedCount += stores.plans.length - nextPlans.length;
    write(STORAGE_KEYS.PLANS, nextPlans);

    const nextDaily = stores.dailyPlans.filter((d) => !myPlanIds.has(d.weeklyPlanId));
    deletedCount += stores.dailyPlans.length - nextDaily.length;
    write(STORAGE_KEYS.DAILY_PLANS, nextDaily);

    removeByUser(STORAGE_KEYS.TASK_FEEDBACKS, stores.feedbacks);

    const nextAdjustments = stores.adjustments.filter((a) => !myPlanIds.has(a.weeklyPlanId));
    deletedCount += stores.adjustments.length - nextAdjustments.length;
    write(STORAGE_KEYS.PLAN_ADJUSTMENTS, nextAdjustments);

    removeByUser(STORAGE_KEYS.WEEKLY_REVIEWS, stores.weeklyReviews);
    removeByUser(STORAGE_KEYS.RESOURCE_VIEWS, stores.resourceViews);
    removeByUser(STORAGE_KEYS.RESOURCE_PLAN_LINKS, stores.resourceLinks);
    removeByUser(STORAGE_KEYS.NOTIFICATIONS, stores.notifications);

    const nextPrefs = stores.prefs.filter((p) => p.userId !== userId);
    deletedCount += stores.prefs.length - nextPrefs.length;
    write(STORAGE_KEYS.NOTIFICATION_PREFS, nextPrefs);

    // 旧版本地设置（非分用户数据）一并清除
    removeFromStorage(STORAGE_KEYS.SETTINGS);
    removeFromStorage(STORAGE_KEYS.USER);

    // —— 审计留痕：纠错匿名化保留（内容用于审计，身份不可识别） ——
    const nextCorrections = stores.corrections.map((c) =>
      c.userId === userId
        ? { ...c, userId: `anonymized:${requestId}`, anonymized: true as const }
        : c
    );
    anonymizedCount += nextCorrections.filter((c) => c.anonymized).length;
    write(STORAGE_KEYS.CORRECTIONS, nextCorrections);

    // —— 公共数据：考情证据池、公共资源、审核/撤回留痕原样保留 ——
    // （EVIDENCE_ITEMS / RESOURCES / REVIEW_LOGS / RETRACTION_LOGS 不写入、不删除）

    // 删除申请凭证自身计入匿名化保留
    anonymizedCount += 1;

    emitGovernanceChanged();
    return { deletedCount, anonymizedCount };
  },
};
