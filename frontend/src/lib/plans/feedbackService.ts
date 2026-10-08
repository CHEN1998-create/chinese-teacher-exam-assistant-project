/**
 * 今日任务执行反馈服务（本地 Mock，非生产实现）。
 *
 * 职责：
 * - 持久化 TaskFeedback（独立 storage key，后续重排模块可直接读取）；
 * - 每条反馈关联：用户（userId）、计划版本（weeklyPlanId + weeklyVersion）、
 *   日计划（dailyPlanId）、日期（date）、任务（taskId）；
 * - 同一任务同一用户仅允许一条反馈：重复提交抛 DuplicateFeedbackError；
 * - 允许在合理范围内修改，保留 createdAt、刷新 updatedAt；
 * - 提交后同步 PlanTask.status 与内嵌 feedback 快照，但不删除/移动任务；
 * - 未完成只记录事实，不自动顺延到明天（正式重排由下一模块负责）。
 */
import {
  CompletionStatus,
  DailyPlan,
  PlanTask,
  TaskFeedback,
  TaskFeedbackInput,
  TaskStatus,
  WeeklyPlan,
} from "@/types";
import { authService } from "@/lib/auth";
import { track, classifyErrorCode } from "@/lib/analytics/eventService";
import { planStore } from "./planStore";

const listeners = new Set<() => void>();
let storeVersion = 0;

function notifyChanged(): void {
  storeVersion += 1;
  listeners.forEach((fn) => fn());
}

function currentUserId(): string | null {
  return authService.getSession()?.user.id ?? null;
}

function loadFeedbacks(): TaskFeedback[] {
  return planStore.loadFeedbacks().map(normalizeFeedback);
}

function persistFeedbacks(all: TaskFeedback[]): void {
  planStore.persistFeedbacks(all);
}

function loadDailyPlans(): DailyPlan[] {
  return planStore.loadDailyPlans();
}

function persistDailyPlans(all: DailyPlan[]): void {
  planStore.persistDailyPlans(all);
}

function loadWeeklyPlans(): WeeklyPlan[] {
  return planStore.loadWeeklyPlans();
}

/** 归一化旧版反馈（补全新增关联字段与 updatedAt） */
function normalizeFeedback(raw: TaskFeedback): TaskFeedback {
  return {
    ...raw,
    weeklyPlanId: raw.weeklyPlanId ?? "",
    weeklyVersion: raw.weeklyVersion ?? 1,
    dailyPlanId: raw.dailyPlanId ?? "",
    date: raw.date ?? "",
    errorTypes: Array.isArray(raw.errorTypes) ? raw.errorTypes : [],
    hasSecondPractice: raw.hasSecondPractice ?? false,
    updatedAt: raw.updatedAt ?? raw.createdAt,
  };
}

/** 重复提交错误：携带已存在的反馈，UI 可直接转入"修改"流程 */
export class DuplicateFeedbackError extends Error {
  existing: TaskFeedback;
  constructor(existing: TaskFeedback) {
    super("该任务已提交过反馈，请直接修改已有反馈");
    this.name = "DuplicateFeedbackError";
    this.existing = existing;
  }
}

/** 反馈完成状态 → 任务状态；未完成不改任务状态（只记录事实，不顺延） */
function toTaskStatus(status: CompletionStatus, current: TaskStatus): TaskStatus {
  if (status === "completed") return "completed";
  if (status === "partial") return "partial";
  return current === "completed" || current === "partial" ? current : "pending";
}

/** 定位任务及其所在日计划/周计划，并校验归属 */
function locateTask(
  taskId: string,
  userId: string
): { task: PlanTask; daily: DailyPlan; weekly: WeeklyPlan } {
  const allDaily = loadDailyPlans();
  const daily = allDaily.find((d) => d.tasks.some((t) => t.id === taskId));
  if (!daily) throw new Error("任务不存在或不属于任何一天的计划");

  const weekly = loadWeeklyPlans().find((p) => p.id === daily.weeklyPlanId);
  if (!weekly) throw new Error("任务所属计划不存在");
  if (weekly.userId !== userId) throw new Error("不能反馈他人计划中的任务");

  const task = daily.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("任务不存在");
  return { task, daily, weekly };
}

/** 把反馈同步进日计划任务快照（状态 + 内嵌反馈），任务本身不删除、不移动 */
function syncTaskFeedback(feedback: TaskFeedback): void {
  const allDaily = loadDailyPlans();
  const dailyIdx = allDaily.findIndex((d) => d.id === feedback.dailyPlanId);
  if (dailyIdx === -1) return;
  const daily = allDaily[dailyIdx];
  const taskIdx = daily.tasks.findIndex((t) => t.id === feedback.taskId);
  if (taskIdx === -1) return;

  const task = daily.tasks[taskIdx];
  daily.tasks[taskIdx] = {
    ...task,
    status: toTaskStatus(feedback.status, task.status),
    feedback,
    updatedAt: feedback.updatedAt,
  };
  persistDailyPlans(allDaily);
}

/** 提交后简短下一步提示；正式重排由下一模块负责 */
export function nextStepHint(status: CompletionStatus): string {
  if (status === "completed") {
    return "已记录完成，保持节奏，明天继续按计划执行。";
  }
  if (status === "partial") {
    return "已记录部分完成。未完成部分不必补做，先保证最低可完成任务，后续重排会参考这条反馈。";
  }
  return "已如实记录未完成，任务不会自动移到明天；下一版计划会结合原因与错因调整安排。";
}

export const feedbackService = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getVersion(): number {
    return storeVersion;
  },

  // ==================== 读取（后续重排模块的数据源） ====================

  /** 当前用户的全部反馈，按提交时间倒序 */
  listMine(): TaskFeedback[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadFeedbacks()
      .filter((f) => f.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  /** 某任务的反馈（一项任务至多一条） */
  getByTask(taskId: string): TaskFeedback | null {
    const userId = currentUserId();
    if (!userId) return null;
    return loadFeedbacks().find((f) => f.userId === userId && f.taskId === taskId) ?? null;
  },

  /** 某天的全部反馈 */
  listByDailyPlan(dailyPlanId: string): TaskFeedback[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadFeedbacks()
      .filter((f) => f.userId === userId && f.dailyPlanId === dailyPlanId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /** 某周计划版本的全部反馈（重排模块按版本聚合用） */
  listByWeeklyPlan(weeklyPlanId: string): TaskFeedback[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadFeedbacks().filter((f) => f.userId === userId && f.weeklyPlanId === weeklyPlanId);
  },

  /** 某日期的全部反馈（跨午夜/日期变化场景） */
  listByDate(date: string): TaskFeedback[] {
    const userId = currentUserId();
    if (!userId) return [];
    return loadFeedbacks().filter((f) => f.userId === userId && f.date === date);
  },

  // ==================== 提交与修改 ====================

  /**
   * 提交任务反馈（一项任务仅一条，重复提交抛 DuplicateFeedbackError）。
   * 存储失败时错误向上抛出，由页面展示"保存失败"并保留表单。
   */
  submit(taskId: string, input: TaskFeedbackInput): TaskFeedback {
    const userId = currentUserId();
    if (!userId) throw new Error("请先登录后再提交反馈");

    const { daily, weekly, task } = locateTask(taskId, userId);

    const existing = loadFeedbacks().find((f) => f.userId === userId && f.taskId === taskId);
    if (existing) throw new DuplicateFeedbackError(normalizeFeedback(existing));

    const now = new Date().toISOString();
    const feedback: TaskFeedback = normalizeFeedback({
      id: `tf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      taskId,
      userId,
      weeklyPlanId: weekly.id,
      weeklyVersion: weekly.version,
      dailyPlanId: daily.id,
      date: daily.date,
      status: input.status,
      actualTime: input.actualTime,
      incompleteReason: input.status === "completed" ? undefined : input.incompleteReason,
      errorTypes: input.errorTypes,
      hasSecondPractice: input.hasSecondPractice,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    const all = loadFeedbacks();
    all.push(feedback);
    try {
      persistFeedbacks(all);
      syncTaskFeedback(feedback);
    } catch (e) {
      track("feedback_submit_failed", "feedback", {
        targetId: weekly.examTargetId,
        props: { reasonCode: classifyErrorCode(e) },
      });
      throw e;
    }
    notifyChanged();

    const dayMs = 24 * 60 * 60 * 1000;
    const dayIndex = Math.max(
      1,
      Math.round(
        (new Date(`${daily.date}T00:00:00`).getTime() -
          new Date(`${weekly.startDate}T00:00:00`).getTime()) /
          dayMs
      ) + 1
    );
    track("task_feedback_submitted", "feedback", {
      targetId: weekly.examTargetId,
      props: {
        planId: weekly.id,
        date: daily.date,
        dayIndex,
        status: feedback.status,
        isCore: task.isCore ? 1 : 0,
      },
    });
    return feedback;
  },

  /**
   * 修改已提交的反馈：保留 createdAt，更新 updatedAt 与全部字段。
   */
  update(feedbackId: string, input: TaskFeedbackInput): TaskFeedback {
    const userId = currentUserId();
    if (!userId) throw new Error("请先登录后再修改反馈");

    const all = loadFeedbacks();
    const idx = all.findIndex((f) => f.id === feedbackId && f.userId === userId);
    if (idx === -1) throw new Error("反馈不存在或不属于当前用户");

    const now = new Date().toISOString();
    const updated: TaskFeedback = {
      ...all[idx],
      status: input.status,
      actualTime: input.actualTime,
      incompleteReason: input.status === "completed" ? undefined : input.incompleteReason,
      errorTypes: input.errorTypes,
      hasSecondPractice: input.hasSecondPractice,
      notes: input.notes?.trim() || undefined,
      updatedAt: now,
    };
    all[idx] = updated;
    persistFeedbacks(all);
    syncTaskFeedback(updated);
    notifyChanged();
    return updated;
  },
};
