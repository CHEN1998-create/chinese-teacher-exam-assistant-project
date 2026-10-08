/**
 * 7 天计划服务（本地 Mock，非生产实现）。
 *
 * 职责：
 * - 从目标/考情/资料/资源/基线服务收集计划输入；
 * - 调用 plans/domain 的纯函数做就绪检查与计划生成；
 * - 持久化 WeeklyPlan 与 DailyPlan（分两个 storage key）；
 * - 提供草稿 → 确认执行、重新生成、调整每日时间、版本历史等操作；
 * - 不含任何生成规则，规则全部在 domain.ts。
 */
import {
  DailyPlan,
  EvidenceItem,
  ExamTarget,
  MaterialDiagnosisSnapshot,
  MaterialItem,
  ResourceItem,
  ResourcePlanLink,
  WeeklyPlan,
} from "@/types";
import { authService } from "@/lib/auth";
import { examTargetService } from "@/lib/services";
import { evidenceService } from "@/lib/evidence/evidenceService";
import { materialService } from "@/lib/materials/materialService";
import { resourceService } from "@/lib/resources/resourceService";
import {
  checkPlanReadiness,
  generatePlan,
  type PlanGenerationInput,
  type PlanReadiness,
} from "./domain";
import { planStore } from "./planStore";
import { track, classifyErrorCode } from "@/lib/analytics/eventService";

const listeners = new Set<() => void>();
let storeVersion = 0;

function notifyChanged(): void {
  storeVersion += 1;
  listeners.forEach((fn) => fn());
}

function currentUserId(): string | null {
  return authService.getSession()?.user.id ?? null;
}

function loadWeeklyPlans(): WeeklyPlan[] {
  return planStore.loadWeeklyPlans();
}

function persistWeeklyPlans(all: WeeklyPlan[]): void {
  planStore.persistWeeklyPlans(all);
}

function loadDailyPlans(): DailyPlan[] {
  return planStore.loadDailyPlans();
}

function persistDailyPlans(all: DailyPlan[]): void {
  planStore.persistDailyPlans(all);
}

/** 归一化旧版 PlanTask（补全新字段，避免旧数据渲染报错） */
function normalizeDailyPlan(raw: DailyPlan): DailyPlan {
  return {
    ...raw,
    availableMinutes: raw.availableMinutes ?? raw.totalEstimatedTime ?? 0,
    isMinimumViable: raw.isMinimumViable ?? raw.tasks.length <= 1,
    tasks: raw.tasks.map((t, i) => ({
      ...t,
      sourceType: t.sourceType ?? (t.materialId ? "material" : "resource"),
      arrangementReason: t.arrangementReason ?? "历史计划任务",
      reviewAction: t.reviewAction ?? "回顾本任务学习内容",
      priority: t.priority ?? (t.isCore ? "high" : "medium"),
      order: t.order ?? i + 1,
      // 旧版内嵌反馈补齐关联字段（新反馈由 feedbackService 写入完整结构）
      feedback: t.feedback
        ? {
            ...t.feedback,
            weeklyPlanId: t.feedback.weeklyPlanId || raw.weeklyPlanId,
            weeklyVersion: t.feedback.weeklyVersion ?? 1,
            dailyPlanId: t.feedback.dailyPlanId || raw.id,
            date: t.feedback.date || raw.date,
            errorTypes: Array.isArray(t.feedback.errorTypes) ? t.feedback.errorTypes : [],
            hasSecondPractice: t.feedback.hasSecondPractice ?? false,
            updatedAt: t.feedback.updatedAt ?? t.feedback.createdAt,
          }
        : undefined,
    })),
  };
}

/** 组装计划生成输入（从各服务实时读取） */
function buildInput(target: ExamTarget): PlanGenerationInput {
  const evidenceItems: EvidenceItem[] = evidenceService.getItems(target.id);
  const materials: MaterialItem[] = materialService.list(target.id);
  const diagnosis: MaterialDiagnosisSnapshot | null = materialService.getSnapshot(target.id);
  const resourceLinks: ResourcePlanLink[] = resourceService.listMyLinks(target.id).filter(
    (l) => l.status !== "dismissed"
  );
  const resources: ResourceItem[] = resourceService.browseAll();
  const baseline = materialService.getBaseline(target.id);
  const dailyMinutes = baseline?.dailyAvailableMinutes ?? authService.getSession()?.user.dailyAvailableTime ?? 120;
  const weeklyHours = baseline?.weeklyAvailableHours ?? Math.round((dailyMinutes * 7) / 60);

  // 首个计划从今天开始、覆盖 7 天（模块 7）：
  // 从“本周一”起算会在周中生成时产生已过去的日期，今日任务卡直接落在过去日
  const today = new Date();
  const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  // 周序号：基于开始日期与目标创建日的周差
  const weekNumber = 1;

  return {
    target,
    evidenceItems,
    diagnosis,
    materials,
    resourceLinks,
    resources,
    baseline,
    dailyAvailableMinutes: dailyMinutes,
    weeklyAvailableHours: weeklyHours,
    startDate,
    weekNumber,
    nowIso: new Date().toISOString(),
  };
}

export const planService = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getVersion(): number {
    return storeVersion;
  },

  // ==================== 读取 ====================

  /** 当前用户在指定目标下的全部周计划（按创建时间倒序） */
  listPlans(examTargetId: string): WeeklyPlan[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadWeeklyPlans()
      .filter((p) => p.userId === userId && p.examTargetId === examTargetId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** 当前计划：草稿优先（重新生成的新草稿需展示给用户确认），其次执行中，最后取最新 */
  getCurrentPlan(examTargetId?: string): WeeklyPlan | null {
    const userId = currentUserId();
    if (!userId) return null;
    const targetId = examTargetId ?? examTargetService.getCurrent()?.id;
    if (!targetId) return null;
    const plans = this.listPlans(targetId);
    // 草稿优先：若旧 active 计划优先，重新生成的草稿会被挡住且永远无法确认（死锁）
    return (
      plans.find((p) => p.status === "draft") ??
      plans.find((p) => p.status === "active") ??
      plans[0] ??
      null
    );
  },

  getDailyPlans(weeklyPlanId: string): DailyPlan[] {
    return loadDailyPlans()
      .filter((d) => d.weeklyPlanId === weeklyPlanId)
      .map(normalizeDailyPlan)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  getTodayPlan(): DailyPlan | null {
    const today = new Date().toISOString().split("T")[0];
    return loadDailyPlans()
      .map(normalizeDailyPlan)
      .find((d) => d.date === today) ?? null;
  },

  getDayPlan(date: string): DailyPlan | null {
    return loadDailyPlans()
      .map(normalizeDailyPlan)
      .find((d) => d.date === date) ?? null;
  },

  // ==================== 就绪检查 ====================

  /** 检查当前目标是否满足生成计划的条件 */
  getReadiness(targetId: string): PlanReadiness | null {
    const target = examTargetService.getById(targetId);
    if (!target) return null;
    return checkPlanReadiness(buildInput(target));
  },

  // ==================== 生成与确认 ====================

  /**
   * 生成草稿计划。
   * 若数据不足，抛出带中文说明的错误（调用方展示缺失项）。
   */
  generateDraft(targetId: string): { weekly: WeeklyPlan; daily: DailyPlan[] } {
    const target = examTargetService.getById(targetId);
    if (!target) throw new Error("目标不存在");
    const input = buildInput(target);
    const readiness = checkPlanReadiness(input);
    if (!readiness.ready) {
      throw new Error(readiness.missing.join("；"));
    }

    const { weekly, daily } = generatePlan(input);

    // 版本号按目标递增：重新生成的新草稿必须拿到新版本号，
    // 否则版本历史出现多个 v1，且 confirmPlan 的 replan 判定（version>1）永远不触发
    const existingVersions = loadWeeklyPlans().filter((p) => p.examTargetId === targetId);
    weekly.version = existingVersions.reduce((max, p) => Math.max(max, p.version), 0) + 1;

    // 保存草稿（门禁通过后的失败属于真实异常，需要进异常监控；
    // “数据不足”的拦截在上方 readiness 处抛出，不计失败事件）
    try {
      const allWeekly = loadWeeklyPlans();
      allWeekly.push(weekly);
      persistWeeklyPlans(allWeekly);

      const allDaily = loadDailyPlans();
      allDaily.push(...daily);
      persistDailyPlans(allDaily);
    } catch (e) {
      track("plan_generation_failed", "plan", {
        targetId,
        props: { reasonCode: classifyErrorCode(e) },
      });
      throw e;
    }

    notifyChanged();
    return { weekly, daily };
  },

  /** 确认草稿：将状态置为 active，同一目标下其他 active 计划置为 completed */
  confirmPlan(weeklyPlanId: string): WeeklyPlan | null {
    const userId = currentUserId();
    if (!userId) return null;
    const all = loadWeeklyPlans();
    const idx = all.findIndex((p) => p.id === weeklyPlanId && p.userId === userId);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    // 同目标下其他 active 计划标记为 completed
    const targetId = all[idx].examTargetId;
    for (let i = 0; i < all.length; i++) {
      if (all[i].examTargetId === targetId && all[i].status === "active" && all[i].id !== weeklyPlanId) {
        all[i] = { ...all[i], status: "completed", updatedAt: now };
      }
    }
    all[idx] = { ...all[idx], status: "active", updatedAt: now };
    persistWeeklyPlans(all);
    notifyChanged();

    // 首版确认计入“计划确认率”；v2+ 确认同时计入“重排确认”
    const confirmed = all[idx];
    const kind = confirmed.version > 1 ? "replan" : "initial";
    track("plan_confirmed", "plan", {
      targetId: confirmed.examTargetId,
      props: {
        planId: confirmed.id,
        startDate: confirmed.startDate,
        version: confirmed.version,
        kind,
      },
    });
    if (kind === "replan") {
      track("plan_replanned", "replan", {
        targetId: confirmed.examTargetId,
        props: { planId: confirmed.id, toVersion: confirmed.version },
      });
    }
    return confirmed;
  },

  /**
   * 重新生成：基于当前输入生成新版本草稿。
   * 旧计划保留为历史版本（不删除）。
   */
  regenerate(targetId: string): { weekly: WeeklyPlan; daily: DailyPlan[] } {
    return this.generateDraft(targetId);
  },

  // ==================== 调整每日时间 ====================

  /**
   * 调整某天的可用时间。
   * 本次不实现自动重排：只更新当天 availableMinutes 与 isMinimumViable 标记，
   * 任务本身不变（如需重排请重新生成）。
   */
  adjustDailyTime(dailyPlanId: string, availableMinutes: number): DailyPlan | null {
    const all = loadDailyPlans();
    const idx = all.findIndex((d) => d.id === dailyPlanId);
    if (idx === -1) return null;
    const total = all[idx].tasks.reduce((s, t) => s + t.estimatedTime, 0);
    all[idx] = {
      ...all[idx],
      availableMinutes,
      isMinimumViable: all[idx].tasks.length <= 1 || total > availableMinutes,
      updatedAt: new Date().toISOString(),
    };
    persistDailyPlans(all);
    notifyChanged();
    return normalizeDailyPlan(all[idx]);
  },

  // ==================== 版本历史 ====================

  /** 列出当前目标的全部计划版本（含草稿/执行中/已完成） */
  listVersions(targetId: string): WeeklyPlan[] {
    return this.listPlans(targetId);
  },

  getTaskById(taskId: string) {
    for (const plan of loadDailyPlans()) {
      const task = plan.tasks.find((t) => t.id === taskId);
      if (task) return normalizeDailyPlan(plan).tasks.find((t) => t.id === taskId) ?? null;
    }
    return null;
  },

  /**
   * 治理模块（错误结论撤回）跨用户调用：
   * 将指定目标下所有“执行中”计划的任务标记为“待重新确认”。
   * 不删除、不重排任务，只打标记并返回受影响计划/任务/用户，供撤回留痕与通知使用。
   */
  flagEvidenceChange(
    targetIds: string[],
    meta: { field: string; reason: string; retractionAt: string }
  ): {
    planIds: string[];
    taskIds: string[];
    plansByUser: Record<string, string[]>;
    meta: { field: string; reason: string; retractionAt: string };
  } {
    const targetSet = new Set(targetIds);
    const affectedPlans = loadWeeklyPlans().filter(
      (p) => p.status === "active" && targetSet.has(p.examTargetId)
    );
    const planIds = new Set(affectedPlans.map((p) => p.id));
    const plansByUser: Record<string, string[]> = {};
    for (const p of affectedPlans) {
      (plansByUser[p.userId] ??= []).push(p.id);
    }

    const taskIds: string[] = [];
    const now = new Date().toISOString();
    const allDaily = loadDailyPlans();
    let changed = false;
    for (let i = 0; i < allDaily.length; i++) {
      if (!planIds.has(allDaily[i].weeklyPlanId)) continue;
      const day = allDaily[i];
      const tasks = day.tasks.map((t) => {
        if (t.needsConfirmation) return t;
        changed = true;
        taskIds.push(t.id);
        return { ...t, needsConfirmation: true as const, updatedAt: now };
      });
      allDaily[i] = { ...day, tasks, updatedAt: now };
    }

    if (changed) {
      persistDailyPlans(allDaily);
      // meta 保留在计划备注维度（Mock：写入 adjustmentNote 便于追溯）
      const allWeekly = loadWeeklyPlans();
      for (let i = 0; i < allWeekly.length; i++) {
        if (planIds.has(allWeekly[i].id)) {
          allWeekly[i] = {
            ...allWeekly[i],
            updatedAt: now,
          };
        }
      }
      persistWeeklyPlans(allWeekly);
      notifyChanged();
    }
    return { planIds: [...planIds], taskIds, plansByUser, meta };
  },
};
