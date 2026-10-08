/**
 * 动态计划重排：领域规则层（纯函数，无 React、无 localStorage、无网络）。
 *
 * 重排读取的数据：
 * - 当前执行中的周计划与其全部日计划（含任务）；
 * - 本周全部执行反馈（仅真实提交的 TaskFeedback）；
 * - 能力基线（当前每日可用时间）；
 * - 资料诊断快照（模块/资料适用性）与考情证据（计划生成后的更新）。
 *
 * 重排产出的数据（由 replanService 持久化）：
 * - 追加一个新的周计划版本（草稿）与对应 7 天日计划（已执行的日子原样保留）；
 * - 任务级调整记录（调整前后快照 + 动作 + 原因 + 引用 + 版本）；
 * - 不修改、不删除任何历史版本与历史反馈。
 *
 * 决策口径（确定性规则，同样输入得到同样输出）：
 * 1. 资料不适合（反馈错因或诊断暂停）→ 优先「替换」，不机械顺延；
 * 2. 同一错因本周出现 ≥2 次 → 相关模块任务「替换」为基础巩固（降低难度）；
 * 3. 部分完成 → 「缩减」时长完成剩余部分；未完成 → 进入容量分配；
 * 4. 容量分配按优先级（高→中→低）贪心放置：放不下先「缩减」（关键任务可减半），
 *    再「顺延」到下一个剩余日；顺延超过 2 次或到最后一天仍放不下 → 「放弃」；
 * 5. 已执行日不重排；每天第一项任务保底压缩到可用时间内（最低可完成）；
 * 6. 高影响考情在计划生成后更新 → 受影响任务标记 needsConfirmation（待重新确认）。
 */
import {
  DailyPlan,
  ErrorCategory,
  ERROR_TYPE_LABELS,
  ExamTarget,
  EvidenceItem,
  MaterialDiagnosisSnapshot,
  MaterialItem,
  PlanTask,
  ReplanRef,
  ReplanTrigger,
  REPLAN_TRIGGER_LABELS,
  ResourceItem,
  ResourcePlanLink,
  TaskAdjustment,
  TaskAdjustmentAction,
  TaskFeedback,
  WeeklyPlan,
} from "@/types";
import { chapterTitlesForModule, moduleLabel } from "@/lib/materials/domain";
import { checkRecommendable, scopeMatches } from "@/lib/resources/domain";

// ==================== 输入与输出 ====================

export interface ReplanEngineInput {
  /** 目标考试（资源适用范围校验用） */
  target: ExamTarget;
  /** 当前执行中的周计划 */
  weeklyPlan: WeeklyPlan;
  /** 该计划的全部日计划（含已执行日） */
  dailyPlans: DailyPlan[];
  /** 本周全部执行反馈（真实提交记录） */
  feedbacks: TaskFeedback[];
  /** 当前每日可用时间（分钟）——时间变化的基准 */
  dailyAvailableMinutes: number;
  diagnosis: MaterialDiagnosisSnapshot | null;
  evidenceItems: EvidenceItem[];
  materials: MaterialItem[];
  resourceLinks: ResourcePlanLink[];
  resources: ResourceItem[];
  /** 今天，YYYY-MM-DD（由 service 传入，保证确定性） */
  today: string;
  /** 规则判定时刻 ISO（由 service 传入，保证确定性与可测试性） */
  nowIso: string;
}

export interface ReplanOptions {
  /** 用户主动调整时填写的说明 */
  userReason?: string;
}

export interface ReplanResult {
  weekly: WeeklyPlan;
  daily: DailyPlan[];
  adjustments: TaskAdjustment[];
  /** 本次重排依据的触发信号（含 user_request） */
  triggers: ReplanTrigger[];
}

// ==================== 上下文（从输入推导的判定资料） ====================

const HIGH_IMPACT_FIELDS = new Set([
  "registration_time",
  "exam_time",
  "subjects",
  "score",
  "qualification",
]);

const EVIDENCE_FIELD_LABELS: Record<string, string> = {
  region: "地区/招聘单位",
  recruit_type: "招聘类型",
  year_batch: "年份/批次",
  education_level: "学段",
  exam_stage: "考试阶段",
  registration_time: "报名时间",
  exam_time: "考试时间",
  subjects: "考试科目",
  score: "分值",
  qualification: "资格条件",
  exam_scope: "考试范围",
};

interface ReplanContext {
  input: ReplanEngineInput;
  /** 每个任务的最新反馈（按 updatedAt） */
  latestFeedbackByTask: Map<string, TaskFeedback>;
  /** 任务 id → 所属日期 */
  taskDates: Map<string, string>;
  /** 错因 → 本周出现次数 */
  weekErrorCounts: Map<ErrorCategory, number>;
  /** 模块 → (错因 → 次数) */
  moduleErrorCounts: Map<string, Map<ErrorCategory, number>>;
  /** 本周出现 ≥2 次的错因 */
  repeatedErrorCategories: ErrorCategory[];
  /** 出现重复错因的模块 */
  repeatedErrorModules: Set<string>;
  /** 反馈指出「资料或任务不适合」的模块 */
  unsuitableModules: Set<string>;
  /** 诊断暂停的资料 id */
  pausedMaterialIds: Set<string>;
  /** 计划生成后更新的考情 */
  changedEvidence: EvidenceItem[];
  materialsById: Map<string, MaterialItem>;
  resourcesById: Map<string, ResourceItem>;
}

function buildContext(input: ReplanEngineInput): ReplanContext {
  const latestFeedbackByTask = new Map<string, TaskFeedback>();
  for (const fb of input.feedbacks) {
    const prev = latestFeedbackByTask.get(fb.taskId);
    if (!prev || fb.updatedAt > prev.updatedAt) latestFeedbackByTask.set(fb.taskId, fb);
  }

  const taskDates = new Map<string, string>();
  for (const day of input.dailyPlans) {
    for (const task of day.tasks) taskDates.set(task.id, day.date);
  }

  const weekErrorCounts = new Map<ErrorCategory, number>();
  const moduleErrorCounts = new Map<string, Map<ErrorCategory, number>>();
  const unsuitableModules = new Set<string>();
  for (const day of input.dailyPlans) {
    for (const task of day.tasks) {
      const fb = latestFeedbackByTask.get(task.id);
      if (!fb) continue;
      for (const err of fb.errorTypes) {
        weekErrorCounts.set(err, (weekErrorCounts.get(err) ?? 0) + 1);
        const byModule = moduleErrorCounts.get(task.module) ?? new Map<ErrorCategory, number>();
        byModule.set(err, (byModule.get(err) ?? 0) + 1);
        moduleErrorCounts.set(task.module, byModule);
      }
      if (fb.errorTypes.includes("material_unsuitable")) unsuitableModules.add(task.module);
    }
  }
  const repeatedErrorCategories = [...weekErrorCounts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([k]) => k)
    .sort();
  const repeatedErrorModules = new Set<string>();
  for (const cat of repeatedErrorCategories) {
    for (const [mod, counts] of moduleErrorCounts) {
      if ((counts.get(cat) ?? 0) >= 2) repeatedErrorModules.add(mod);
    }
  }

  const pausedMaterialIds = new Set<string>(
    (input.diagnosis?.materialDiagnoses ?? [])
      .filter((md) => md.recommendation === "pause")
      .map((md) => md.materialId)
  );

  const changedEvidence = input.evidenceItems.filter(
    (e) => e.updatedAt > input.weeklyPlan.createdAt
  );

  return {
    input,
    latestFeedbackByTask,
    taskDates,
    weekErrorCounts,
    moduleErrorCounts,
    repeatedErrorCategories,
    repeatedErrorModules,
    unsuitableModules,
    pausedMaterialIds,
    changedEvidence,
    materialsById: new Map(input.materials.map((m) => [m.id, m])),
    resourcesById: new Map(input.resources.map((r) => [r.id, r])),
  };
}

// ==================== 工具 ====================

function dateDiffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function fmtDate(dateStr: string): string {
  return dateStr.slice(5); // MM-DD
}

function truncateTitle(title: string): string {
  return title.length > 14 ? `${title.slice(0, 14)}…` : title;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function taskLabel(task: PlanTask): string {
  return `「${truncateTitle(task.title)}」${task.estimatedTime}分钟`;
}

/** 任务来源是否已被判为不适合（反馈错因 / 诊断暂停） */
function isUnsuitable(ctx: ReplanContext, task: PlanTask): boolean {
  if (task.materialId && ctx.pausedMaterialIds.has(task.materialId)) return true;
  if (ctx.unsuitableModules.has(task.module)) return true;
  const md = (ctx.input.diagnosis?.materialDiagnoses ?? []).find(
    (m) => m.materialId === task.materialId
  );
  const item = md?.items.find((i) => i.module === task.module);
  return item?.recommendation === "pause";
}

function dominantError(ctx: ReplanContext, moduleKey: string): ErrorCategory | null {
  const counts = ctx.moduleErrorCounts.get(moduleKey);
  if (!counts || counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ==================== 触发信号检测 ====================

export function detectTriggers(input: ReplanEngineInput): ReplanTrigger[] {
  const triggers: ReplanTrigger[] = [];
  const ctx = buildContext(input);
  const remaining = input.dailyPlans.filter((d) => d.date >= input.today);

  // 1) 可用时间变化
  const changedDays = remaining.filter((d) => d.availableMinutes !== input.dailyAvailableMinutes);
  if (changedDays.length > 0 && remaining.length > 0) {
    triggers.push({
      type: "time_change",
      detail: `当前每日可用时间为 ${input.dailyAvailableMinutes} 分钟，剩余 ${remaining.length} 天的计划按 ${changedDays[0].availableMinutes} 分钟生成，需要重新分配`,
      refs: [{ kind: "baseline", label: `准备情况：每日可用 ${input.dailyAvailableMinutes} 分钟` }],
    });
  }

  // 2) 任务未完成 / 部分完成（已执行日）
  const incomplete: { task: PlanTask; fb: TaskFeedback; date: string }[] = [];
  for (const day of input.dailyPlans) {
    if (day.date >= input.today) continue;
    for (const task of day.tasks) {
      const fb = ctx.latestFeedbackByTask.get(task.id);
      if (fb && fb.status !== "completed") incomplete.push({ task, fb, date: day.date });
    }
  }
  if (incomplete.length > 0) {
    const notCompleted = incomplete.filter((x) => x.fb.status === "not_completed").length;
    triggers.push({
      type: "task_incomplete",
      detail: `已执行天数中有 ${incomplete.length} 项任务未完成（未完成 ${notCompleted} 项、部分完成 ${incomplete.length - notCompleted} 项），将在保留/缩减/顺延/替换/放弃之间分配，不会全部堆到第二天`,
      refs: incomplete.slice(0, 5).map(({ task, fb, date }) => ({
        kind: "feedback" as const,
        id: fb.id,
        label: `${fmtDate(date)}${taskLabel(task)}${fb.status === "partial" ? "部分完成" : "未完成"}`,
      })),
    });
  }

  // 3) 连续相同错因
  for (const cat of ctx.repeatedErrorCategories) {
    const count = ctx.weekErrorCounts.get(cat) ?? 0;
    triggers.push({
      type: "repeated_error",
      detail: `「${ERROR_TYPE_LABELS[cat]}」本周已出现 ${count} 次，相关模块任务将降低难度或回到基础`,
      refs: [{ kind: "feedback", label: `本周 ${count} 条反馈包含该错因` }],
    });
  }

  // 4) 资料不适合
  const unsuitableFbs = input.feedbacks.filter((f) => f.errorTypes.includes("material_unsuitable"));
  const pausedAffectingRemaining = remaining
    .flatMap((d) => d.tasks)
    .filter((t) => (t.materialId && ctx.pausedMaterialIds.has(t.materialId)) || isUnsuitable(ctx, t));
  if (unsuitableFbs.length > 0 || pausedAffectingRemaining.length > 0) {
    const refs: ReplanRef[] = unsuitableFbs
      .slice(0, 3)
      .map((f) => ({
        kind: "feedback" as const,
        id: f.id,
        label: `${fmtDate(f.date || "")}反馈指出资料或任务不适合`,
      }));
    for (const t of pausedAffectingRemaining.slice(0, 2)) {
      refs.push({ kind: "diagnosis", id: t.materialId, label: `「${truncateTitle(t.title)}」所用资料在诊断中被暂停` });
    }
    triggers.push({
      type: "material_unsuitable",
      detail: `有反馈指出资料或任务不适合（${unsuitableFbs.length} 条），相关任务优先替换而非顺延`,
      refs,
    });
  }

  // 5) 第 4 天中期重排
  const dayIndex = dateDiffDays(input.weeklyPlan.startDate, input.today);
  if (dayIndex === 3 && remaining.length > 0) {
    triggers.push({
      type: "midweek_day4",
      detail: "今天是计划第 4 天，建议进行中期重排：根据前 3 天执行情况调整剩余 3 天安排",
      refs: [{ kind: "plan", id: input.weeklyPlan.id, label: `计划周期 ${input.weeklyPlan.startDate} 起` }],
    });
  }

  // 6) 考情变化（计划生成后更新的证据）
  if (ctx.changedEvidence.length > 0) {
    const labels = [...new Set(ctx.changedEvidence.map((e) => EVIDENCE_FIELD_LABELS[e.field] ?? e.field))];
    const hasHighImpact = ctx.changedEvidence.some((e) => HIGH_IMPACT_FIELDS.has(e.field));
    triggers.push({
      type: "evidence_change",
      detail: `计划生成后有 ${ctx.changedEvidence.length} 条考情更新（${labels.slice(0, 3).join("、")}${labels.length > 3 ? " 等" : ""}）${hasHighImpact ? "，包含高影响字段，相关任务将进入待重新确认状态" : ""}`,
      refs: ctx.changedEvidence.slice(0, 4).map((e) => ({
        kind: "evidence" as const,
        id: e.id,
        label: `「${EVIDENCE_FIELD_LABELS[e.field] ?? e.field}」于 ${fmtDate(e.updatedAt.slice(0, 10))} 更新`,
      })),
    });
  }

  return triggers;
}

// ==================== 替换来源 ====================

interface ReplacementCandidate {
  task: PlanTask;
  reason: string;
  refs: ReplanRef[];
}

/**
 * 基础巩固兜底任务：没有可指定的资料来源。
 * 按 PRD 要求不能编造“10 道题”之类的假资料入口，因此显式标为不可执行，
 * 并在 blockedReason 说明缺什么；用户补资料后任务才可执行。
 */
function buildConsolidation(
  ctx: ReplanContext,
  task: PlanTask,
  why: string
): ReplacementCandidate {
  const moduleName = moduleLabel(task.module);
  return {
    task: {
      ...task,
      sourceType: "material",
      materialId: undefined,
      materialChapterId: undefined,
      resourceId: undefined,
      chapterTitle: undefined,
      title: `「${moduleName}」基础巩固（缺资料，暂不可执行）`,
      estimatedTime: Math.min(task.estimatedTime, 30),
      completionCriteria: `先添加「${moduleName}」的基础练习资料（合规公共资源或你已有的资料），再完成基础练习并归因错题`,
      arrangementReason: why,
      reviewAction: `资料补齐后，整理「${moduleName}」基础错题并标记仍不理解的知识点`,
      status: "pending",
      feedback: undefined,
      executable: false,
      blockedReason: "还没有可用于基础巩固的资料：请添加合规公共资源，或确认你已有的资料",
    },
    reason: why,
    refs: [],
  };
}

/** 为不适合的任务找替换来源：其他适用资料 → 同模块其他资源 → 基础巩固兜底 */
function buildReplacement(ctx: ReplanContext, task: PlanTask): ReplacementCandidate {
  const moduleName = moduleLabel(task.module);
  const base = { ...task, status: "pending" as const, feedback: undefined, needsConfirmation: undefined };

  // 1) 其他资料中该模块的适用章节
  for (const md of ctx.input.diagnosis?.materialDiagnoses ?? []) {
    if (md.recommendation === "pause" || ctx.pausedMaterialIds.has(md.materialId)) continue;
    if (md.materialId === task.materialId) continue;
    const material = ctx.materialsById.get(md.materialId);
    if (!material) continue;
    for (const item of md.items) {
      if (item.module !== task.module || item.recommendation === "pause") continue;
      const chapter =
        item.relatedChapterTitles[0] ?? chapterTitlesForModule(material, task.module)[0];
      return {
        task: {
          ...base,
          sourceType: "material",
          materialId: material.id,
          materialChapterId: undefined,
          resourceId: undefined,
          chapterTitle: chapter,
          title: `${moduleName}：《${chapter ?? material.name}》`,
          estimatedTime: Math.min(task.estimatedTime, 60),
          completionCriteria: `完成《${material.name}》${chapter ? `「${chapter}」` : "相关章节"}的学习并整理要点`,
          arrangementReason: `原资料被反馈不适合，替换为《${material.name}》的适用章节`,
          reviewAction: task.reviewAction,
        },
        reason: `原${task.sourceType === "resource" ? "资源" : "资料"}被反馈不适合，优先替换为其他适用资料而非继续顺延`,
        refs: [{ kind: "diagnosis", id: material.id, label: `资料《${material.name}》诊断为适用` }],
      };
    }
  }

  // 2) 同模块的其他公共资源（仍须通过合规闸门、范围贴合）
  for (const link of ctx.input.resourceLinks) {
    if (link.status === "dismissed" || link.module !== task.module) continue;
    if (link.resourceId === task.resourceId) continue;
    const resource = ctx.resourcesById.get(link.resourceId);
    if (!resource) continue;
    if (!checkRecommendable(resource, ctx.input.nowIso).ok) continue;
    if (!scopeMatches(resource, ctx.input.target)) continue;
    const chapter = resource.suggestedChapters[0];
    return {
      task: {
        ...base,
        sourceType: "resource",
        materialId: undefined,
        resourceId: resource.id,
        chapterTitle: chapter,
        title: `${moduleName}：${resource.title}`,
        estimatedTime: Math.min(task.estimatedTime, resource.estimatedMinutes || 60, 120),
        completionCriteria: `学习资源「${resource.title}」${chapter ? `「${chapter}」` : ""}并记录关键结论`,
        arrangementReason: `原资料不适合，替换为公共资源「${resource.title}」`,
        reviewAction: task.reviewAction,
      },
      reason: "原资料不适合且无其他适用资料，替换为同模块公共资源",
      refs: [{ kind: "diagnosis", id: resource.id, label: `公共资源「${resource.title}」` }],
    };
  }

  // 3) 兜底：不依赖特定资料的基础巩固
  return buildConsolidation(ctx, task, "原资料不适合且没有其他适用来源，改为不依赖特定资料的基础巩固任务");
}

// ==================== 重排主流程 ====================

interface QueueItem {
  /** 待放置的任务内容 */
  task: PlanTask;
  /** 原任务快照（记录用） */
  before: PlanTask;
  /** 原任务日期 */
  fromDate: string;
  /** 预定动作：carried 为 postpone/replace；own 为 keep/reduce/replace */
  action: TaskAdjustmentAction;
  reason: string;
  refs: ReplanRef[];
  postponeCount: number;
  carried: boolean;
  needsConfirmation: boolean;
  /** 放置后是否需要生成新 id（顺延/替换的任务） */
  freshId: boolean;
}

/**
 * 确定性重排：
 * 生成新版本周计划（草稿）+ 7 天日计划 + 任务级调整记录。
 * 已执行日（date < today）原样保留；仅重新分配剩余日子。
 */
export function applyReplan(input: ReplanEngineInput, opts: ReplanOptions = {}): ReplanResult {
  const ctx = buildContext(input);
  const detected = detectTriggers(input);
  const triggers: ReplanTrigger[] = [
    ...detected,
    {
      type: "user_request",
      detail: opts.userReason?.trim() || "用户主动要求调整剩余计划",
      refs: [],
    },
  ];

  const old = input.weeklyPlan;
  const now = input.nowIso;
  const newWeeklyId = `wp-${old.examTargetId}-${Date.now()}`;
  const newVersion = old.version + 1;
  const adjustments: TaskAdjustment[] = [];

  const pushAdjustment = (
    a: Omit<TaskAdjustment, "id" | "weeklyPlanId" | "fromVersion" | "toVersion" | "createdAt">
  ): void => {
    adjustments.push({
      ...a,
      id: `ta-${newWeeklyId}-${adjustments.length + 1}`,
      weeklyPlanId: newWeeklyId,
      fromVersion: old.version,
      toVersion: newVersion,
      createdAt: now,
    });
  };

  const allDays = [...input.dailyPlans].sort((a, b) => a.date.localeCompare(b.date));
  const pastDays = allDays.filter((d) => d.date < input.today);
  const remainingDays = allDays.filter((d) => d.date >= input.today);
  if (remainingDays.length === 0) {
    throw new Error("计划周期已结束，无法重排；请查看第 7 天周复盘");
  }

  // ---------- 第 1 步：已执行日的未完成任务 → 待重新安排池 ----------
  let carry: QueueItem[] = [];
  for (const day of pastDays) {
    for (const task of day.tasks) {
      const fb = ctx.latestFeedbackByTask.get(task.id);
      if (!fb || fb.status === "completed") continue;
      const fbRef: ReplanRef = {
        kind: "feedback",
        id: fb.id,
        label: `${fmtDate(day.date)}${taskLabel(task)}${fb.status === "partial" ? "部分完成" : "未完成"}`,
      };
      if (
        fb.errorTypes.includes("material_unsuitable") ||
        isUnsuitable(ctx, task)
      ) {
        const rep = buildReplacement(ctx, task);
        carry.push({
          task: rep.task,
          before: task,
          fromDate: day.date,
          action: "replace",
          reason: rep.reason,
          refs: [...rep.refs, fbRef],
          postponeCount: 0,
          carried: true,
          needsConfirmation: false,
          freshId: true,
        });
      } else if (ctx.repeatedErrorModules.has(task.module)) {
        const cat = dominantError(ctx, task.module);
        const count = cat ? (ctx.moduleErrorCounts.get(task.module)?.get(cat) ?? 0) : 0;
        const rep = buildConsolidation(
          ctx,
          task,
          `「${cat ? ERROR_TYPE_LABELS[cat] : "同类错误"}」在本周反复出现（${count} 次），回到基础降低难度`
        );
        carry.push({
          task: rep.task,
          before: task,
          fromDate: day.date,
          action: "replace",
          reason: rep.reason,
          refs: [fbRef],
          postponeCount: 0,
          carried: true,
          needsConfirmation: false,
          freshId: true,
        });
      } else {
        const est =
          fb.status === "partial" ? Math.max(20, Math.round(task.estimatedTime / 2)) : task.estimatedTime;
        carry.push({
          task: { ...task, estimatedTime: est, status: "pending", feedback: undefined },
          before: task,
          fromDate: day.date,
          action: "postpone",
          reason:
            fb.status === "partial"
              ? "部分完成：压缩时长完成剩余部分（不整项重做）"
              : "未完成：顺延重做（容量不足时将缩减或放弃，不会全部堆到同一天）",
          refs: [fbRef],
          postponeCount: 0,
          carried: true,
          needsConfirmation: false,
          freshId: true,
        });
      }
    }
  }

  // ---------- 第 2 步：逐个剩余日做容量分配 ----------
  const newDaily: DailyPlan[] = [];
  const evidenceHighImpactChanged = ctx.changedEvidence.some((e) => HIGH_IMPACT_FIELDS.has(e.field));
  const evidenceRefs: ReplanRef[] = ctx.changedEvidence.slice(0, 4).map((e) => ({
    kind: "evidence",
    id: e.id,
    label: `「${EVIDENCE_FIELD_LABELS[e.field] ?? e.field}」考情已更新`,
  }));

  for (let i = 0; i < remainingDays.length; i++) {
    const day = remainingDays[i];
    const newDpId = `dp-${newWeeklyId}-${day.date}`;
    const available = input.dailyAvailableMinutes;

    // 已完成任务原样保留，不计入今日剩余容量
    const completedKept: PlanTask[] = [];
    let completedEst = 0;
    const queue: QueueItem[] = [];
    // 今天声明“没做”的任务：不占今天，直接进入后续日子的待安排池
    const movedOutToday: QueueItem[] = [];

    for (const task of day.tasks) {
      const fb = ctx.latestFeedbackByTask.get(task.id);
      if (fb && fb.status === "completed") {
        completedKept.push(task);
        completedEst += task.estimatedTime;
        continue;
      }
      const fbRef: ReplanRef | null = fb
        ? {
            kind: "feedback",
            id: fb.id,
            label: `${fmtDate(day.date)}${taskLabel(task)}${fb.status === "partial" ? "部分完成" : "未完成"}`,
          }
        : null;
      let item: QueueItem = {
        task: { ...task, feedback: undefined },
        before: task,
        fromDate: day.date,
        action: "keep",
        reason: "",
        refs: [],
        postponeCount: 0,
        carried: false,
        needsConfirmation: false,
        freshId: false,
      };

      if (isUnsuitable(ctx, task)) {
        const rep = buildReplacement(ctx, task);
        item = {
          ...item,
          task: rep.task,
          action: "replace",
          reason: rep.reason,
          refs: [...rep.refs, ...(fbRef ? [fbRef] : [])],
          freshId: true,
        };
      } else if (ctx.repeatedErrorModules.has(task.module)) {
        const cat = dominantError(ctx, task.module);
        const count = cat ? (ctx.moduleErrorCounts.get(task.module)?.get(cat) ?? 0) : 0;
        const rep = buildConsolidation(
          ctx,
          task,
          `「${cat ? ERROR_TYPE_LABELS[cat] : "同类错误"}」在本周反复出现（${count} 次），回到基础降低难度`
        );
        item = {
          ...item,
          task: rep.task,
          action: "replace",
          reason: rep.reason,
          refs: [...(fbRef ? [fbRef] : [])],
          freshId: true,
        };
      } else if (fb && fb.status === "partial") {
        item = {
          ...item,
          task: {
            ...task,
            estimatedTime: Math.max(20, Math.round(task.estimatedTime / 2)),
            status: "pending",
            feedback: undefined,
          },
          action: "reduce",
          reason: "部分完成：压缩时长完成剩余部分（不整项重做）",
          refs: fbRef ? [fbRef] : [],
        };
      } else if (fb && fb.status === "not_completed") {
        if (i === 0) {
          // 今天没做：任务移出今天，交给后面的日子；容量不足时缩减/放弃，不堆欠账
          item = {
            ...item,
            action: "postpone",
            reason: "今天没做：改到后面的日子（容量不足时缩减或放弃，欠账不会堆到一天）",
            refs: fbRef ? [fbRef] : [],
            carried: true,
            freshId: true,
          };
          movedOutToday.push(item);
        } else {
          item = {
            ...item,
            action: "keep",
            reason: "未完成：当天重新安排（容量不足时将顺延或放弃）",
            refs: fbRef ? [fbRef] : [],
          };
        }
      }

      if (evidenceHighImpactChanged) {
        item.needsConfirmation = true;
        item.refs = [...item.refs, ...evidenceRefs];
      }
      // 今天声明没做的任务不进今天的队列
      if (!(i === 0 && fb?.status === "not_completed")) {
        queue.push(item);
      }
    }

    // 排队：优先级高 → 低；同优先级顺延/替换来的优先（先还欠账）；再按原顺序
    const merged = [...carry, ...queue];
    merged.sort((a, b) => {
      const pr = PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority];
      if (pr !== 0) return pr;
      if (a.carried !== b.carried) return a.carried ? -1 : 1;
      return a.task.order - b.task.order;
    });

    // 贪心放置：第一项保底压缩（最低可完成）；高优先级可减半一次
    let remainingTime = Math.max(0, available - completedEst);
    const assigned: { item: QueueItem; est: number; clamped: boolean }[] = [];
    const overflow: QueueItem[] = [];
    for (const qi of merged) {
      const est = qi.task.estimatedTime;
      if (assigned.length === 0 && completedKept.length === 0) {
        // 首项保底只允许“向下压缩到 ≤30 分钟”，绝不能把小任务向上膨胀
        // （否则部分完成后已减半的任务会被重新拉长，调整失效）
        if (est <= remainingTime) {
          if (remainingTime >= 20) {
            assigned.push({ item: qi, est, clamped: false });
            remainingTime -= est;
            continue;
          }
        } else {
          const est2 = Math.min(30, remainingTime);
          if (est2 >= 20 && est2 <= remainingTime) {
            assigned.push({ item: qi, est: est2, clamped: true });
            remainingTime -= est2;
            continue;
          }
        }
      }
      if (est <= remainingTime) {
        assigned.push({ item: qi, est, clamped: false });
        remainingTime -= est;
      } else if (qi.task.priority === "high") {
        const est2 = Math.max(20, Math.floor(est / 2));
        if (est2 <= remainingTime && remainingTime >= 20) {
          assigned.push({ item: qi, est: est2, clamped: true });
          remainingTime -= est2;
        } else {
          overflow.push(qi);
        }
      } else {
        overflow.push(qi);
      }
    }

    // 溢出（含今天移出的“没做”任务）：顺延到下一个剩余日 / 多次顺延或最后一天 → 放弃
    const overflowAll = i === 0 ? [...overflow, ...movedOutToday] : overflow;
    const nextCarry: QueueItem[] = [];
    for (const qi of overflowAll) {
      if (qi.postponeCount >= 2) {
        pushAdjustment({
          taskId: qi.before.id,
          date: qi.fromDate,
          toDate: day.date,
          action: "abandon",
          reason: "已顺延多次仍无法安排，放弃以避免欠账持续堆积",
          refs: qi.refs,
          before: qi.before,
          after: null,
        });
      } else if (i < remainingDays.length - 1) {
        nextCarry.push({
          ...qi,
          postponeCount: qi.postponeCount + 1,
          action: qi.action === "replace" ? "replace" : "postpone",
          carried: true,
          freshId: true,
        });
      } else {
        pushAdjustment({
          taskId: qi.before.id,
          date: qi.fromDate,
          toDate: day.date,
          action: "abandon",
          reason: "本周剩余天数内没有可用容量，放弃该任务（未完成的记录已保留在反馈中）",
          refs: qi.refs,
          before: qi.before,
          after: null,
        });
      }
    }
    carry = nextCarry;

    // 放置并生成调整记录
    const placedTasks: PlanTask[] = [];
    const dayCounters = { keep: 0, reduce: 0, postpone: 0, replace: 0, abandon: 0 };
    const orderSeed = completedKept.length;

    for (const a of completedKept) {
      placedTasks.push({ ...a });
    }
    assigned.forEach(({ item, est, clamped }, idx) => {
      const order = orderSeed + idx + 1;
      const placed: PlanTask = {
        ...item.task,
        id: item.freshId ? `pt-${newDpId}-${order}` : item.task.id,
        dailyPlanId: newDpId,
        estimatedTime: est,
        order,
        needsConfirmation: item.needsConfirmation || undefined,
        status: item.task.status ?? "pending",
      };
      placedTasks.push(placed);

      const isCarried = item.carried;
      if (isCarried) {
        dayCounters[item.action === "replace" ? "replace" : "postpone"] += 1;
        pushAdjustment({
          taskId: item.before.id,
          date: item.fromDate,
          toDate: day.date,
          action: item.action === "replace" ? "replace" : "postpone",
          reason:
            item.action === "replace"
              ? item.reason
              : clamped
                ? `${item.reason}；容量有限，时长已压缩至 ${est} 分钟`
                : item.reason,
          refs: item.refs,
          before: item.before,
          after: placed,
        });
      } else if (item.action === "replace") {
        dayCounters.replace += 1;
        pushAdjustment({
          taskId: item.before.id,
          date: item.fromDate,
          toDate: day.date,
          action: "replace",
          reason: item.reason,
          refs: item.refs,
          before: item.before,
          after: placed,
        });
      } else if (item.action === "reduce" || clamped) {
        dayCounters.reduce += 1;
        pushAdjustment({
          taskId: item.before.id,
          date: item.fromDate,
          toDate: day.date,
          action: "reduce",
          reason:
            item.reason ||
            `当天剩余容量不足，时长从 ${item.before.estimatedTime} 分钟压缩至 ${est} 分钟以保留任务`,
          refs: item.refs,
          before: item.before,
          after: placed,
        });
      } else if (item.needsConfirmation) {
        dayCounters.keep += 1;
        pushAdjustment({
          taskId: item.before.id,
          date: item.fromDate,
          toDate: day.date,
          action: "keep",
          reason: "保留原安排；但高影响考情在计划生成后发生变化，任务待重新确认",
          refs: item.refs,
          before: item.before,
          after: placed,
        });
      }
    });
    for (const a of adjustments) {
      if (a.toDate === day.date && a.action === "abandon") dayCounters.abandon += 1;
    }

    const renumbered = placedTasks.map((t, idx) => ({ ...t, order: idx + 1 }));
    const total = renumbered.reduce((s, t) => s + t.estimatedTime, 0);
    const noteParts: string[] = [];
    if (dayCounters.reduce > 0) noteParts.push(`缩减 ${dayCounters.reduce}`);
    if (dayCounters.postpone > 0) noteParts.push(`顺延入 ${dayCounters.postpone}`);
    if (dayCounters.replace > 0) noteParts.push(`替换 ${dayCounters.replace}`);
    if (dayCounters.abandon > 0) noteParts.push(`放弃 ${dayCounters.abandon}`);

    newDaily.push({
      id: newDpId,
      weeklyPlanId: newWeeklyId,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      tasks: renumbered,
      totalEstimatedTime: total,
      isMinimumViable: renumbered.length <= 1 || total > available,
      availableMinutes: available,
      adjustmentNote: noteParts.length > 0 ? `重排 v${newVersion}：${noteParts.join("、")}` : undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ---------- 第 3 步：已执行日原样复制进新版本（历史不覆盖） ----------
  for (const day of pastDays) {
    const newDpId = `dp-${newWeeklyId}-${day.date}`;
    const tasks = day.tasks.map((t) => ({
      ...t,
      dailyPlanId: newDpId,
      feedback: t.feedback
        ? { ...t.feedback, taskId: t.id, dailyPlanId: newDpId, weeklyPlanId: newWeeklyId }
        : undefined,
    }));
    newDaily.push({
      ...day,
      id: newDpId,
      weeklyPlanId: newWeeklyId,
      tasks,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ---------- 第 4 步：新版本周计划 ----------
  newDaily.sort((a, b) => a.date.localeCompare(b.date));
  const counts = adjustments.reduce<Record<string, number>>((acc, a) => {
    acc[a.action] = (acc[a.action] ?? 0) + 1;
    return acc;
  }, {});
  const countText = [
    counts.replace ? `替换 ${counts.replace}` : "",
    counts.reduce ? `缩减 ${counts.reduce}` : "",
    counts.postpone ? `顺延 ${counts.postpone}` : "",
    counts.abandon ? `放弃 ${counts.abandon}` : "",
    counts.keep ? `保留待确认 ${counts.keep}` : "",
  ]
    .filter(Boolean)
    .join("、");

  const weekly: WeeklyPlan = {
    id: newWeeklyId,
    userId: old.userId,
    examTargetId: old.examTargetId,
    weekNumber: old.weekNumber,
    startDate: old.startDate,
    endDate: old.endDate,
    focus: old.focus,
    status: "draft",
    version: newVersion,
    previousVersionId: old.id,
    generationReason: `第 ${newVersion} 版：根据执行反馈重排剩余计划。触发：${triggers
      .map((t) => REPLAN_TRIGGER_LABELS[t.type])
      .join("、")}；共调整 ${adjustments.length} 项${countText ? `（${countText}）` : ""}；剩余任务按每日可用 ${input.dailyAvailableMinutes} 分钟重新分配，每天仍不超过 3 项核心任务，未完成欠账不会全部堆到第二天。`,
    createdAt: now,
    updatedAt: now,
  };

  return { weekly, daily: newDaily, adjustments, triggers };
}

// ==================== 恢复原安排 ====================

export interface RestoreVersionInput {
  /** 当前版本（将被新版本替代） */
  current: WeeklyPlan;
  currentDaily: DailyPlan[];
  /** 要恢复到的版本 */
  source: WeeklyPlan;
  sourceDaily: DailyPlan[];
  today: string;
  nowIso: string;
  /** 当前每日可用时间，恢复版按它压缩，保证总时长不超可用时间 */
  dailyAvailableMinutes: number;
}

/**
 * 按用户要求恢复原安排：以 source 版本为内容生成一个新版本（历史仍只追加）。
 * - 已执行日原样取 source；
 * - 剩余日取 source 任务并重置为待执行，按当前可用时间压缩，放不下的任务记录放弃；
 * - 资料与考试信息全部保留。
 */
export function buildRestoreVersion(input: RestoreVersionInput): ReplanResult {
  const { current, source, today, nowIso, dailyAvailableMinutes } = input;
  const newWeeklyId = `wp-${source.examTargetId}-${Date.now()}`;
  const newVersion = current.version + 1;
  const adjustments: TaskAdjustment[] = [];

  const pushAdjustment = (
    a: Omit<TaskAdjustment, "id" | "weeklyPlanId" | "fromVersion" | "toVersion" | "createdAt">
  ): void => {
    adjustments.push({
      ...a,
      id: `ta-${newWeeklyId}-${adjustments.length + 1}`,
      weeklyPlanId: newWeeklyId,
      fromVersion: current.version,
      toVersion: newVersion,
      createdAt: nowIso,
    });
  };

  const sourceDays = [...input.sourceDaily].sort((a, b) => a.date.localeCompare(b.date));
  const currentByDate = new Map(
    [...input.currentDaily].sort((a, b) => a.date.localeCompare(b.date)).map((d) => [d.date, d])
  );
  const newDaily: DailyPlan[] = [];

  for (const day of sourceDays) {
    const newDpId = `dp-${newWeeklyId}-${day.date}`;

    if (day.date < today) {
      // 已执行日：原样保留（反馈引用的周计划 id 指向新版本）
      const tasks = day.tasks.map((t) => ({
        ...t,
        dailyPlanId: newDpId,
        feedback: t.feedback
          ? { ...t.feedback, taskId: t.id, dailyPlanId: newDpId, weeklyPlanId: newWeeklyId }
          : undefined,
      }));
      newDaily.push({
        ...day,
        id: newDpId,
        weeklyPlanId: newWeeklyId,
        tasks,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      continue;
    }

    // 剩余日：source 任务重置，按优先级在可用时间内压缩
    const currentDay = currentByDate.get(day.date);
    const candidates = [...day.tasks]
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order);
    let remainingTime = dailyAvailableMinutes;
    const restored: PlanTask[] = [];
    const dropped: PlanTask[] = [];

    for (const t of candidates) {
      const est = Math.min(t.estimatedTime, remainingTime);
      if (est >= 20) {
        restored.push({
          ...t,
          dailyPlanId: newDpId,
          estimatedTime: est,
          order: restored.length + 1,
          status: "pending",
          feedback: undefined,
          needsConfirmation: undefined,
        });
        remainingTime -= est;
      } else {
        dropped.push(t);
      }
    }

    // 恢复记录：与当前版本同日同位任务对照，动作为 keep
    restored.forEach((after) => {
      const before = currentDay?.tasks.find((x) => x.order === after.order);
      pushAdjustment({
        taskId: before?.id ?? after.id,
        date: day.date,
        toDate: day.date,
        action: "keep",
        reason: "按你的要求恢复原安排：资料与考试信息保留，任务回到调整前内容",
        refs: [{ kind: "plan", id: source.id, label: `恢复至 v${source.version}` }],
        before: before ?? null,
        after,
      });
    });
    dropped.forEach((t) => {
      pushAdjustment({
        taskId: t.id,
        date: day.date,
        toDate: day.date,
        action: "abandon",
        reason: "恢复原安排时当前可用时间不足，该任务本周不再安排（记录已保留）",
        refs: [],
        before: t,
        after: null,
      });
    });

    const total = restored.reduce((s, t) => s + t.estimatedTime, 0);
    newDaily.push({
      id: newDpId,
      weeklyPlanId: newWeeklyId,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      tasks: restored,
      totalEstimatedTime: total,
      isMinimumViable: restored.length <= 1,
      availableMinutes: dailyAvailableMinutes,
      adjustmentNote: `已恢复 v${source.version} 的安排`,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  const triggers: ReplanTrigger[] = [
    {
      type: "user_request",
      detail: `按你的要求恢复原安排（v${source.version}）`,
      refs: [{ kind: "plan", id: source.id, label: `恢复至 v${source.version}` }],
    },
  ];

  const weekly: WeeklyPlan = {
    id: newWeeklyId,
    userId: source.userId,
    examTargetId: source.examTargetId,
    weekNumber: source.weekNumber,
    startDate: source.startDate,
    endDate: source.endDate,
    focus: source.focus,
    status: "draft",
    version: newVersion,
    previousVersionId: current.id,
    generationReason: `第 ${newVersion} 版：按你的要求恢复 v${source.version} 的安排；资料与考试信息保留，剩余任务按每日可用 ${dailyAvailableMinutes} 分钟压缩。`,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return { weekly, daily: newDaily, adjustments, triggers };
}

// ==================== 用户语言的下一步说明 ====================

export interface NextStepSummary {
  nextStep: string;
  originalHandling: string;
}

/**
 * 从调整记录生成“下一步做什么、原任务怎么处理”的用户语言说明（供 /today 就地展示）。
 * 取今天产生的第一条实质调整。
 */
export function describeNextStep(
  adjustments: TaskAdjustment[],
  today: string
): NextStepSummary | null {
  const adj = adjustments
    .filter((a) => a.toDate >= today && a.action !== "keep")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!adj) return null;

  switch (adj.action) {
    case "reduce":
      return {
        nextStep: `今天接着做：剩余部分已压缩为 ${adj.after?.estimatedTime ?? 0} 分钟`,
        originalHandling: "原任务不整项重做，只完成剩余部分",
      };
    case "postpone":
      return {
        nextStep: `已改到 ${adj.toDate} 继续（约 ${adj.after?.estimatedTime ?? 0} 分钟）`,
        originalHandling: "今天不再做这项；容量不够时会再缩减，欠账不会堆到一天",
      };
    case "replace":
      return {
        nextStep: `下一步改用「${adj.after?.title ?? "新任务"}」`,
        originalHandling: "原任务的记录已保留，不再使用原资料",
      };
    case "abandon":
      return {
        nextStep: "这项任务本周不再安排",
        originalHandling: "记录已保留，欠账不会继续堆积",
      };
    default:
      return null;
  }
}

// ==================== 考情变化说明 ====================

export interface EvidenceChangeNotice {
  title: string;
  body: string;
  affectedToday: boolean;
  nextSteps: string[];
  severity: "high" | "medium";
}

/**
 * 生成考情变化的用户可见说明：哪条信息变了、状态是什么、今天安排是否受影响。
 * 仅描述 updatedAt 晚于计划生成时间的证据；未核对的信息明确标注状态，不称官方结论。
 */
export function describeEvidenceChange(args: {
  evidenceItems: EvidenceItem[];
  weeklyCreatedAt: string;
  today: string;
  todayTaskCount: number;
}): EvidenceChangeNotice | null {
  const changed = args.evidenceItems
    .filter((e) => e.updatedAt > args.weeklyCreatedAt && e.value.trim())
    // 每个字段只取最新一条
    .reduce<Map<string, EvidenceItem>>((map, e) => {
      const prev = map.get(e.field);
      if (!prev || e.updatedAt > prev.updatedAt) map.set(e.field, e);
      return map;
    }, new Map());

  if (changed.size === 0) return null;

  const lines = [...changed.values()].map(
    (e) =>
      `${EVIDENCE_FIELD_LABELS[e.field] ?? e.field}：${e.value}（${
        e.reviewStatus === "official" ? "已核对" : "待核对"
      }）`
  );
  const hasHighImpact = [...changed.keys()].some((f) => HIGH_IMPACT_FIELDS.has(f));
  const affectedToday = hasHighImpact && args.todayTaskCount > 0;

  return {
    title: affectedToday ? "考情有更新，今天的安排可能受影响" : "考情有更新",
    body: `以下考情在计划生成后发生变化：\n${lines.join("；")}。`,
    affectedToday,
    severity: hasHighImpact ? "high" : "medium",
    nextSteps: affectedToday
      ? ["在「今天」查看调整后的任务，再继续学习", "未核对的信息不会被当作官方结论"]
      : ["在「我的考试」核对更新内容，核对后再调整安排"],
  };
}
