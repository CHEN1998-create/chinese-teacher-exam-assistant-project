/**
 * 动态计划重排与第 7 天周复盘服务（本地 Mock，非生产实现）。
 *
 * 读取（不修改）：
 * - 周计划与日计划（planService，含历史版本）；
 * - 执行反馈（feedbackService，仅真实提交的记录）；
 * - 能力基线 / 资料诊断（materialService）、考情证据（evidenceService）、公共资源（resourceService）。
 *
 * 写入（只追加，不覆盖历史）：
 * - 重排生成新的周计划版本（草稿）与对应日计划，确认后旧版本标记 completed；
 * - 任务级调整记录 → kb_plan_adjustments；
 * - 周复盘 → kb_weekly_reviews。
 * - 反馈记录本身不会被重排修改。
 *
 * 重排规则全部在 replanEngine.ts（纯函数），本文件只做组装、持久化与查询。
 */
import {
  DailyPlan,
  ErrorCategory,
  ERROR_TYPE_LABELS,
  INCOMPLETE_REASON_LABELS,
  ReplanTrigger,
  TaskAdjustment,
  TaskFeedback,
  WeeklyPlan,
  WeeklyReview,
  WeeklyReviewAdjustmentOutcome,
  WeeklyReviewStat,
} from "@/types";
import { authService } from "@/lib/auth";
import { examTargetService } from "@/lib/services";
import { evidenceService } from "@/lib/evidence/evidenceService";
import { materialService } from "@/lib/materials/materialService";
import { resourceService } from "@/lib/resources/resourceService";
import { planService } from "./planService";
import { feedbackService } from "./feedbackService";
import { planStore } from "./planStore";
import { todayString } from "./useToday";
import {
  applyReplan,
  buildRestoreVersion,
  describeEvidenceChange,
  describeNextStep,
  detectTriggers,
  type ReplanEngineInput,
} from "./replanEngine";
import { notificationService } from "@/lib/governance/notificationService";
import { track } from "@/lib/analytics/eventService";

const listeners = new Set<() => void>();
let storeVersion = 0;

function notifyChanged(): void {
  storeVersion += 1;
  listeners.forEach((fn) => fn());
}

function currentUserId(): string | null {
  return authService.getSession()?.user.id ?? null;
}

function loadAdjustments(): TaskAdjustment[] {
  return planStore.loadAdjustments();
}

function persistAdjustments(all: TaskAdjustment[]): void {
  planStore.persistAdjustments(all);
}

function loadReviews(): WeeklyReview[] {
  return planStore.loadReviews();
}

function persistReviews(all: WeeklyReview[]): void {
  planStore.persistReviews(all);
}

/** 组装重排引擎输入（从各服务实时读取） */
function buildEngineInput(plan: WeeklyPlan): ReplanEngineInput {
  const target = examTargetService.getById(plan.examTargetId);
  if (!target) throw new Error("目标不存在");
  const baseline = materialService.getBaseline(target.id);
  const dailyMinutes =
    baseline?.dailyAvailableMinutes ?? authService.getSession()?.user.dailyAvailableTime ?? 120;
  // 反馈跨版本收集：重排会生成新版本 id，但已执行日任务在版本间保留原 taskId，
  // 因此本周版本族（同目标 + 同起止日期）的全部反馈都要参与重排，否则引擎会丢失历史执行情况
  const familyIds = planService
    .listPlans(target.id)
    .filter((p) => p.startDate === plan.startDate && p.endDate === plan.endDate)
    .map((p) => p.id);
  const feedbacks = familyIds.flatMap((id) => feedbackService.listByWeeklyPlan(id));
  return {
    target,
    weeklyPlan: plan,
    dailyPlans: planService.getDailyPlans(plan.id),
    feedbacks,
    dailyAvailableMinutes: dailyMinutes,
    diagnosis: materialService.getSnapshot(target.id),
    evidenceItems: evidenceService.getItems(target.id),
    materials: materialService.list(target.id),
    resourceLinks: resourceService.listMyLinks(target.id).filter((l) => l.status !== "dismissed"),
    resources: resourceService.browseAll(),
    today: todayString(),
    nowIso: new Date().toISOString(),
  };
}

/** 持久化一次重排结果（周计划 + 日计划 + 调整记录，只追加） */
function persistReplanResult(result: {
  weekly: WeeklyPlan;
  daily: DailyPlan[];
  adjustments: TaskAdjustment[];
}): void {
  const allWeekly = planStore.loadWeeklyPlans();
  allWeekly.push(result.weekly);
  planStore.persistWeeklyPlans(allWeekly);

  const allDaily = planStore.loadDailyPlans();
  allDaily.push(...result.daily);
  planStore.persistDailyPlans(allDaily);

  const allAdjustments = loadAdjustments();
  allAdjustments.push(...result.adjustments);
  persistAdjustments(allAdjustments);
}

/** 找到某计划的重排草稿（基于该计划生成的未确认新版本） */
function findReplanDraft(activePlanId: string): WeeklyPlan | null {
  return (
    planStore.loadWeeklyPlans().find(
      (p) => p.status === "draft" && p.previousVersionId === activePlanId
    ) ?? null
  );
}

function eachDate(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export const replanService = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getVersion(): number {
    return storeVersion;
  },

  // ==================== 重排分析 ====================

  /** 检测当前执行中计划的重排信号（纯读取，不做任何修改） */
  analyze(targetId: string): ReplanTrigger[] {
    const plan = planService.getCurrentPlan(targetId);
    if (!plan || plan.status !== "active") return [];
    return detectTriggers(buildEngineInput(plan));
  },

  /**
   * 生成重排草稿（新版本）：
   * - 基于 active 计划 + 全部真实反馈，由 ReplanEngine 确定性决策；
   * - 同一计划已有重排草稿时先丢弃再生成；
   * - 历史版本、日计划、反馈均不被修改。
   */
  createReplanDraft(
    targetId: string,
    userReason?: string
  ): { weekly: WeeklyPlan; daily: DailyPlan[]; adjustments: TaskAdjustment[] } {
    const active = planService.getCurrentPlan(targetId);
    if (!active || active.status !== "active") {
      throw new Error("当前没有执行中的计划，无法重排");
    }
    const existingDraft = findReplanDraft(active.id);
    if (existingDraft) this.discardReplanDraft(existingDraft.id);

    const result = applyReplan(buildEngineInput(active), { userReason });

    const allWeekly = planStore.loadWeeklyPlans();
    allWeekly.push(result.weekly);
    planStore.persistWeeklyPlans(allWeekly);

    const allDaily = planStore.loadDailyPlans();
    allDaily.push(...result.daily);
    planStore.persistDailyPlans(allDaily);

    const allAdjustments = loadAdjustments();
    allAdjustments.push(...result.adjustments);
    persistAdjustments(allAdjustments);

    notifyChanged();
    return result;
  },

  /** 丢弃重排草稿：仅删除草稿版本自身的数据（历史不受影响） */
  discardReplanDraft(weeklyPlanId: string): boolean {
    const allWeekly = planStore.loadWeeklyPlans();
    const idx = allWeekly.findIndex((p) => p.id === weeklyPlanId && p.status === "draft");
    if (idx === -1) return false;
    allWeekly.splice(idx, 1);
    planStore.persistWeeklyPlans(allWeekly);

    const allDaily = planStore.loadDailyPlans();
    planStore.persistDailyPlans(
      allDaily.filter((d) => d.weeklyPlanId !== weeklyPlanId)
    );

    persistAdjustments(loadAdjustments().filter((a) => a.weeklyPlanId !== weeklyPlanId));
    notifyChanged();
    return true;
  },

  /**
   * 反馈驱动的即时调整（/today 调用）：
   * - 基于刚提交的反馈运行重排规则，直接生成并确认新版本（不让用户去计划页
   *   理解“检测信号—草稿—确认”等内部步骤）；
   * - 返回用户语言的“下一步做什么、原任务怎么处理”；
   * - 没有实质调整（如只是“做完了”）时返回 null，不产生空版本。
   */
  applyFeedbackAdjustment(targetId: string): {
    summary: ReturnType<typeof describeNextStep>;
    version: number;
  } | null {
    const active = planService.getCurrentPlan(targetId);
    if (!active || active.status !== "active") {
      throw new Error("当前没有执行中的计划，无法调整");
    }
    const result = applyReplan(buildEngineInput(active));
    if (result.adjustments.length === 0) return null;

    persistReplanResult(result);
    planService.confirmPlan(result.weekly.id);
    notifyChanged();
    return {
      summary: describeNextStep(result.adjustments, todayString()),
      version: result.weekly.version,
    };
  },

  /**
   * 恢复原安排：当前活动版本有上一版本时，以上一版本内容生成新版本并确认。
   * 历史只追加；资料与考试信息保留，恢复版任务按当前可用时间压缩。
   */
  restoreOriginal(targetId: string): { restoredFromVersion: number } {
    const engineInput = buildEngineInput(
      planService.getCurrentPlan(targetId) ??
        (() => {
          throw new Error("当前没有执行中的计划");
        })()
    );
    const active = engineInput.weeklyPlan;
    const sourceId = active.previousVersionId;
    if (!sourceId) {
      throw new Error("当前是最初版本，没有可恢复的安排");
    }
    const source = planService.listPlans(targetId).find((p) => p.id === sourceId);
    if (!source) {
      throw new Error("找不到要恢复的版本");
    }

    const result = buildRestoreVersion({
      current: active,
      currentDaily: engineInput.dailyPlans,
      source,
      sourceDaily: planService.getDailyPlans(source.id),
      today: todayString(),
      nowIso: new Date().toISOString(),
      dailyAvailableMinutes: engineInput.dailyAvailableMinutes,
    });

    persistReplanResult(result);
    planService.confirmPlan(result.weekly.id);
    notifyChanged();
    return { restoredFromVersion: source.version };
  },

  /**
   * 考情变化通知：检查计划生成后更新的证据，写入一条 exam_change 通知，
   * 明确“哪条变了、今天安排是否受影响”。没有变化返回 null。
   * （证据写入完成后由 evidenceService 触发；人工也可在页面操作后调用。）
   */
  ensureEvidenceChangeNotification(targetId: string) {
    const active = planService.getCurrentPlan(targetId);
    if (!active || active.status !== "active") return null;
    const today = todayString();
    const todayPlan = planService.getDailyPlans(active.id).find((d) => d.date === today);

    const notice = describeEvidenceChange({
      evidenceItems: evidenceService.getItems(targetId),
      weeklyCreatedAt: active.createdAt,
      today,
      todayTaskCount: todayPlan?.tasks.length ?? 0,
    });
    if (!notice) return null;

    return notificationService.push({
      type: "exam_change",
      title: notice.title,
      body: `${notice.body}\n影响：${notice.affectedToday ? "今天的安排可能受影响" : "不影响今天已安排的任务"}`,
      severity: notice.severity === "high" ? "important" : "info",
      nextSteps: notice.nextSteps,
      related: { examTargetId: targetId },
    });
  },

  /** 某计划版本的全部任务级调整记录 */
  listAdjustments(weeklyPlanId: string): TaskAdjustment[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadAdjustments()
      .filter((a) => a.weeklyPlanId === weeklyPlanId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  },

  /** 某目标下全部调整记录（周复盘用） */
  listAdjustmentsByTarget(targetId: string): TaskAdjustment[] {
    const userId = currentUserId();
    if (!userId) return [];
    const planIds = new Set(
      planStore.loadWeeklyPlans()
        .filter((p) => p.userId === userId && p.examTargetId === targetId)
        .map((p) => p.id)
    );
    return loadAdjustments()
      .filter((a) => planIds.has(a.weeklyPlanId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  // ==================== 第 7 天周复盘 ====================

  /** 是否可生成本周期复盘：计划结束日当天或之后（或计划已完结） */
  canGenerateReview(targetId: string): { eligible: boolean; reason: string } {
    const plan = planService.getCurrentPlan(targetId);
    if (!plan) return { eligible: false, reason: "当前没有计划" };
    if (plan.status === "completed") return { eligible: true, reason: "" };
    const today = todayString();
    if (today < plan.endDate) {
      return { eligible: false, reason: `周复盘在第 7 天（${plan.endDate}）之后可生成` };
    }
    return { eligible: true, reason: "" };
  },

  /**
   * 生成第 7 天周复盘。
   * 只使用真实提交的反馈聚合，不编造结果；未提交反馈的任务单独计数。
   */
  generateReview(targetId: string): WeeklyReview {
    const plan = planService.getCurrentPlan(targetId);
    if (!plan) throw new Error("当前没有计划，无法生成周复盘");
    const check = this.canGenerateReview(targetId);
    if (!check.eligible) throw new Error(check.reason);

    const userId = currentUserId();
    if (!userId) throw new Error("请先登录");

    const versions = planService
      .listPlans(targetId)
      .filter((v) => v.startDate === plan.startDate && v.endDate === plan.endDate);
    const versionById = new Map(versions.map((v) => [v.id, v]));

    // 每个日期实际执行用的日计划：取「创建时间不晚于当天」的最新版本
    const dates = eachDate(plan.startDate, plan.endDate);
    const perDate: { date: string; day: DailyPlan | null }[] = dates.map((date) => {
      const sorted = [...versions].sort((a, b) => b.version - a.version);
      for (const v of sorted) {
        if (v.createdAt.slice(0, 10) > date) continue;
        const day = planService.getDailyPlans(v.id).find((d) => d.date === date);
        if (day) return { date, day };
      }
      return { date, day: null };
    });

    // 本周期真实反馈（按日期收集，去重，取每个任务的最新一条）
    const feedbacks: TaskFeedback[] = [];
    const seen = new Set<string>();
    const latestByTask = new Map<string, TaskFeedback>();
    for (const date of dates) {
      for (const fb of feedbackService.listByDate(date)) {
        if (!seen.has(fb.id)) {
          seen.add(fb.id);
          feedbacks.push(fb);
        }
        const prev = latestByTask.get(fb.taskId);
        if (!prev || fb.updatedAt > prev.updatedAt) latestByTask.set(fb.taskId, fb);
      }
    }

    let totalTasks = 0;
    let completedTasks = 0;
    let partialTasks = 0;
    let notCompletedTasks = 0;
    let noFeedbackTasks = 0;
    let completedDays = 0;
    let daysWithTasks = 0;
    let plannedMinutes = 0;

    for (const { day } of perDate) {
      if (!day || day.tasks.length === 0) continue;
      daysWithTasks += 1;
      let allCompleted = true;
      for (const task of day.tasks) {
        totalTasks += 1;
        plannedMinutes += task.estimatedTime;
        const fb = latestByTask.get(task.id);
        if (!fb) {
          noFeedbackTasks += 1;
          allCompleted = false;
        } else if (fb.status === "completed") {
          completedTasks += 1;
        } else if (fb.status === "partial") {
          partialTasks += 1;
          allCompleted = false;
        } else {
          notCompletedTasks += 1;
          allCompleted = false;
        }
      }
      if (allCompleted) completedDays += 1;
    }

    const actualMinutes = feedbacks.reduce((s, f) => s + (f.actualTime ?? 0), 0);

    const countBy = <K extends string>(
      entries: (K | undefined)[],
      labelOf: (k: K) => string
    ): WeeklyReviewStat[] => {
      const counts = new Map<K, number>();
      for (const k of entries) {
        if (!k) continue;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([key, count]) => ({ key, label: labelOf(key), count }))
        .sort((a, b) => b.count - a.count);
    };

    const interruptionReasons = countBy(
      feedbacks
        .filter((f) => f.status !== "completed")
        .map((f) => f.incompleteReason),
      (k) => INCOMPLETE_REASON_LABELS[k]
    );
    const errorCategories = countBy(
      feedbacks.flatMap((f) => f.errorTypes),
      (k) => ERROR_TYPE_LABELS[k as ErrorCategory]
    );

    // 实际执行过（有反馈）的资料与资源
    const usedSourceMap = new Map<string, { id: string; name: string; type: "material" | "resource" }>();
    for (const { day } of perDate) {
      if (!day) continue;
      for (const task of day.tasks) {
        const fb = latestByTask.get(task.id);
        if (!fb) continue;
        const name = task.title;
        const id = task.materialId ?? task.resourceId ?? `task-${task.id}`;
        const type: "material" | "resource" = task.sourceType === "resource" ? "resource" : "material";
        if (!usedSourceMap.has(id)) usedSourceMap.set(id, { id, name, type });
      }
    }

    // 调整效果：调整后任务是否最终被完成（无反馈时诚实标记待观察）
    const periodAdjustments = this.listAdjustmentsByTarget(targetId).filter(
      (a) =>
        versionById.has(a.weeklyPlanId) &&
        a.date >= plan.startDate &&
        a.date <= plan.endDate &&
        a.action !== "keep"
    );
    const adjustmentOutcomes: WeeklyReviewAdjustmentOutcome[] = periodAdjustments.map((a) => {
      const afterId = a.after?.id;
      const fb = afterId ? latestByTask.get(afterId) : undefined;
      if (a.action === "abandon") {
        return { adjustmentId: a.id, action: a.action, reason: a.reason, outcome: "pending", note: "任务已放弃，无后续反馈可评估" };
      }
      if (fb?.status === "completed") {
        return { adjustmentId: a.id, action: a.action, reason: a.reason, outcome: "effective", note: "调整后的任务已完成" };
      }
      if (fb) {
        return { adjustmentId: a.id, action: a.action, reason: a.reason, outcome: "pending", note: "调整后的任务已执行但未完全完成" };
      }
      return { adjustmentId: a.id, action: a.action, reason: a.reason, outcome: "pending", note: "调整后的任务还没有执行反馈" };
    });

    // 下一周建议（确定性规则，仅基于上面的真实统计）
    const suggestions: string[] = [];
    if (totalTasks > 0 && notCompletedTasks / totalTasks > 0.4) {
      suggestions.push("未完成任务超过四成：建议下周下调每日任务量或缩短单项时长");
    }
    const topError = errorCategories[0];
    if (topError?.key === "knowledge_gap") {
      suggestions.push("「知识点不会」出现最多：建议下周增加基础巩固类任务");
    } else if (topError?.key === "structure_unclear") {
      suggestions.push("「答题结构不清」较多：建议下周增加真题范文与结构拆解类任务");
    } else if (topError?.key === "time_management") {
      suggestions.push("「时间不够」出现较多：建议上调单项预估时长或减少并行任务");
    }
    if (errorCategories.some((e) => e.key === "material_unsuitable")) {
      suggestions.push("存在资料不匹配反馈：建议先在「资料与资源」更新诊断，再生成下周计划");
    }
    if (plannedMinutes > 0 && actualMinutes > plannedMinutes * 1.2) {
      suggestions.push("实际用时明显高于预计：建议为同类任务预留缓冲时间");
    }
    if (noFeedbackTasks > 0) {
      suggestions.push(`有 ${noFeedbackTasks} 项任务未提交反馈：补交后复盘与重排会更准确`);
    }
    if (suggestions.length === 0) {
      suggestions.push("执行节奏良好，可按当前强度继续推进");
    }

    const now = new Date().toISOString();
    const review: WeeklyReview = {
      id: `wr-${plan.id}`,
      userId,
      examTargetId: plan.examTargetId,
      weeklyPlanId: plan.id,
      version: plan.version,
      startDate: plan.startDate,
      endDate: plan.endDate,
      generatedAt: now,
      daysWithTasks,
      completedDays,
      totalTasks,
      completedTasks,
      partialTasks,
      notCompletedTasks,
      noFeedbackTasks,
      plannedMinutes,
      actualMinutes,
      interruptionReasons,
      errorCategories,
      usedSources: [...usedSourceMap.values()],
      adjustmentCount: periodAdjustments.length,
      adjustmentOutcomes,
      suggestions: suggestions.slice(0, 4),
      dataNote: `本复盘仅统计真实提交的 ${feedbacks.length} 条执行反馈；未提交反馈的 ${noFeedbackTasks} 项任务不计入完成数据。`,
    };

    const all = loadReviews();
    const idx = all.findIndex((r) => r.id === review.id);
    if (idx === -1) all.push(review);
    else all[idx] = review;
    persistReviews(all);
    notifyChanged();
    if (idx === -1) {
      track("weekly_review_completed", "replan", {
        targetId: review.examTargetId,
        props: { planId: review.weeklyPlanId },
      });
    }
    return review;
  },

  /** 最近一次周复盘 */
  getLatestReview(targetId: string): WeeklyReview | null {
    const userId = currentUserId();
    if (!userId) return null;
    return (
      loadReviews()
        .filter((r) => r.userId === userId && r.examTargetId === targetId)
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? null
    );
  },
};
