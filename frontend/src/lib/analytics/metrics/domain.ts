/**
 * 指标计算引擎（纯函数规则层）—— 全后台唯一的指标口径来源。
 *
 * 输入：分析事件流 + 各业务存储的当前记录 + 时间范围；
 * 输出：用户价值指标、质量运营指标、实时存量、待办、异常列表。
 * UI 组件只做展示，不允许自行重算任何比率。
 *
 * 口径约定：
 * - 事件型指标随时间范围筛选；存量型指标（待审核数/失效率等）为实时值，不随范围变化；
 * - 比率分母为 0 时返回 null（展示“—”），不伪造 0%；
 * - 用户一律按账号 ID 去重。
 */
import {
  Correction,
  EvidenceItem,
  ExtractionJob,
  ResourceItem,
  RetractionRecord,
} from "@/types";
import { isHighImpact } from "@/lib/evidence/domain";
import {
  AnalyticsEvent,
  AnomalyItem,
  AnomalySeverity,
  MetricValue,
  MetricsRangeKey,
} from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 审核 SLA：高影响事实提交后 24 小时内处理 */
export const REVIEW_SLA_HOURS = 24;
/** 资源复核周期：180 天 */
export const RESOURCE_REVIEW_CYCLE_DAYS = 180;

export interface MetricsInput {
  events: AnalyticsEvent[];
  evidenceItems: EvidenceItem[];
  corrections: Correction[];
  retractions: RetractionRecord[];
  resources: ResourceItem[];
  jobs: ExtractionJob[];
  now?: number;
}

export interface PendingAction {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "danger" | "warning" | "info";
}

export interface FunnelStage {
  key: string;
  label: string;
  users: number;
  /** 相对首环节的转化率 */
  rateFromFirst: number | null;
}

export interface DayFeedbackRate {
  day: 1 | 4 | 7;
  eligible: number;
  submitted: number;
  rate: number | null;
}

export interface UserValueMetrics {
  targetCreators: number;
  readyCreators: number;
  firstFill: MetricValue;
  evidenceViewers: number;
  evidenceViewRate: MetricValue;
  planConfirmedUsers: number;
  planConfirmRate: MetricValue;
  dayRates: DayFeedbackRate[];
  coreDayPlans: number;
  avgCoreCompletedDays: number | null;
  interruptedUsers: number;
  restartedUsers: number;
  restartRate: MetricValue;
  resourceViewers: number;
  resourceAdders: number;
  resourceUsers: number;
  resourceAddRate: MetricValue;
  resourceUseRate: MetricValue;
  closedLoopUsers: number;
  closedLoopRate: MetricValue;
  /** P0：完成画像后 7 日内有有效推进动作的去重用户数与比率 */
  p0Progress7dUsers: number;
  p0Progress7dRate: MetricValue;
  funnel: FunnelStage[];
}

export interface QualityMetrics {
  reviewCount: number;
  reviewAvgMinutes: number | null;
  reviewEdited: number;
  aiEditRate: MetricValue;
  reviewTotalMinutes: number;
  reviewOwnerUsers: number;
  reviewMinutesPerUser: number | null;
  correctionCount: number;
  retractionCount: number;
  affectedUsers: number;
  planFailures: number;
  planFailRate: MetricValue;
  feedbackFailures: number;
  feedbackFailRate: MetricValue;
  criticalWriteFailures: number;
  liveEventCount: number;
  seedEventCount: number;
}

export interface StockMetrics {
  pendingTotal: number;
  pendingHighImpact: number;
  conflictCount: number;
  overdueHighImpact: number;
  openCorrections: number;
  pendingResources: number;
  deadResources: number;
  staleResources: number;
  resourceTotal: number;
  resourceDeadRate: MetricValue;
  failedJobs: number;
}

export interface ReviewBacklogBucket {
  label: string;
  count: number;
  highImpact: number;
}

export interface DashboardMetrics {
  rangeKey: MetricsRangeKey;
  fromIso: string | null;
  userValue: UserValueMetrics;
  quality: QualityMetrics;
  stock: StockMetrics;
  backlog: ReviewBacklogBucket[];
  pendingActions: PendingAction[];
  anomalies: AnomalyItem[];
}

// ==================== 工具 ====================

function ratio(numerator: number, denominator: number): MetricValue {
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null };
}

function unique(values: Iterable<string>): Set<string> {
  return new Set(values);
}

function propNum(e: AnalyticsEvent, key: string): number | undefined {
  const v = e.props?.[key];
  return typeof v === "number" ? v : undefined;
}

function propStr(e: AnalyticsEvent, key: string): string | undefined {
  const v = e.props?.[key];
  return typeof v === "string" ? v : undefined;
}

function rangeFrom(key: MetricsRangeKey, now: number): number | null {
  if (key === "7d") return now - 7 * DAY_MS;
  if (key === "30d") return now - 30 * DAY_MS;
  return null;
}

/** 账号 ID 轻度脱敏：保留首尾片段供后台关联，不展示昵称 */
function maskUserId(id: string): string {
  if (id.length <= 4) return "***";
  return `${id.slice(0, 2)}**${id.slice(-2)}`;
}

// ==================== 主入口 ====================

export function computeDashboard(
  input: MetricsInput,
  rangeKey: MetricsRangeKey
): DashboardMetrics {
  const now = input.now ?? Date.now();
  const fromMs = rangeFrom(rangeKey, now);
  const inRange = input.events.filter((e) => fromMs === null || new Date(e.at).getTime() >= fromMs);
  const byType = (type: AnalyticsEvent["type"]): AnalyticsEvent[] =>
    inRange.filter((e) => e.type === type);

  const userValue = computeUserValue(inRange, byType, now);
  const quality = computeQuality(inRange, byType, input, fromMs);
  const stock = computeStock(input, now);
  const backlog = computeBacklog(input.evidenceItems, now);
  const pendingActions = buildPendingActions(stock);
  const anomalies = buildAnomalies(input, inRange, now);

  return {
    rangeKey,
    fromIso: fromMs === null ? null : new Date(fromMs).toISOString(),
    userValue,
    quality,
    stock,
    backlog,
    pendingActions,
    anomalies,
  };
}

// ==================== 用户价值指标 ====================

function computeUserValue(
  inRange: AnalyticsEvent[],
  byType: (t: AnalyticsEvent["type"]) => AnalyticsEvent[],
  now: number
): UserValueMetrics {
  const targetEvents = byType("target_created");
  const targetCreators = unique(targetEvents.map((e) => e.userId));

  const readyCreators = unique(
    targetEvents.filter((e) => propNum(e, "ready") === 1).map((e) => e.userId)
  );

  const evidenceViewers = unique(byType("evidence_viewed").map((e) => e.userId));

  const initialConfirmEvents = byType("plan_confirmed").filter(
    (e) => propStr(e, "kind") !== "replan"
  );
  const planConfirmedUsers = unique(initialConfirmEvents.map((e) => e.userId));

  const feedbackEvents = byType("task_feedback_submitted");
  const feedbackUsers = unique(feedbackEvents.map((e) => e.userId));
  const reviewUsers = unique(byType("weekly_review_completed").map((e) => e.userId));

  // —— 第 1/4/7 天反馈完成率 ——
  const dayRates: DayFeedbackRate[] = ([1, 4, 7] as const).map((day) => {
    let eligible = 0;
    let submitted = 0;
    for (const plan of initialConfirmEvents) {
      const startDate = propStr(plan, "startDate");
      const planId = propStr(plan, "planId");
      if (!startDate || !planId) continue;
      const startMs = new Date(`${startDate}T00:00:00`).getTime();
      if (Number.isNaN(startMs)) continue;
      if (startMs + (day - 1) * DAY_MS > now) continue; // 计划还没走到第 N 天
      eligible += 1;
      const hasFeedback = feedbackEvents.some(
        (f) => propStr(f, "planId") === planId && propNum(f, "dayIndex") === day
      );
      if (hasFeedback) submitted += 1;
    }
    return { day, eligible, submitted, rate: eligible > 0 ? submitted / eligible : null };
  });

  // —— 7 天内完成核心任务的天数（按计划平均） ——
  const coreDaysByPlan = new Map<string, Set<string>>();
  for (const e of feedbackEvents) {
    const planId = propStr(e, "planId");
    const date = propStr(e, "date");
    if (!planId || !date) continue;
    if (propNum(e, "isCore") !== 1 || propStr(e, "status") !== "completed") continue;
    const set = coreDaysByPlan.get(planId) ?? new Set<string>();
    set.add(date);
    coreDaysByPlan.set(planId, set);
  }
  const plansWithFeedback = unique(feedbackEvents.map((e) => propStr(e, "planId") ?? "").filter(Boolean));
  const coreDayCounts = [...plansWithFeedback].map((p) => coreDaysByPlan.get(p)?.size ?? 0);
  const avgCoreCompletedDays =
    coreDayCounts.length > 0
      ? coreDayCounts.reduce((a, b) => a + b, 0) / coreDayCounts.length
      : null;

  // —— 中断后重新开始 ——
  const byUser = new Map<string, AnalyticsEvent[]>();
  for (const e of feedbackEvents) {
    const list = byUser.get(e.userId) ?? [];
    list.push(e);
    byUser.set(e.userId, list);
  }
  let interruptedUsers = 0;
  let restartedUsers = 0;
  for (const list of byUser.values()) {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
    const firstInterrupt = sorted.findIndex((e) => propStr(e, "status") === "not_completed");
    if (firstInterrupt === -1) continue;
    interruptedUsers += 1;
    const recovered = sorted
      .slice(firstInterrupt + 1)
      .some((e) => propStr(e, "status") === "completed" || propStr(e, "status") === "partial");
    if (recovered) restartedUsers += 1;
  }

  // —— 资源转化 ——
  const resourceViewers = unique(byType("resource_viewed").map((e) => e.userId));
  const resourceAdders = unique(byType("resource_added_to_plan").map((e) => e.userId));
  const resourceUsers = unique(byType("resource_used").map((e) => e.userId));

  // —— 完整闭环 ——
  const closedLoop = [...planConfirmedUsers].filter(
    (u) => feedbackUsers.has(u) && reviewUsers.has(u)
  );

  const n = targetCreators.size;

  // —— v6.1 P0 闭环漏斗（9 个去重用户阶段；口径见 METRIC_DICTIONARY.p0_funnel） ——
  const profileEvents = byType("profile_completed");
  const profileUserSet = unique(profileEvents.map((e) => e.userId));
  const revealedUserSet = unique(
    byType("opportunity_revealed")
      .filter((e) => (propNum(e, "validCount") ?? 0) >= 1)
      .map((e) => e.userId)
  );
  const basisUserSet = unique(byType("match_basis_viewed").map((e) => e.userId));
  const followUserSet = unique(byType("opportunity_followed").map((e) => e.userId));
  const supplementUserSet = unique(
    byType("qualification_supplemented").map((e) => e.userId)
  );
  const isRegistrationEvent = (e: AnalyticsEvent): boolean => {
    const to = propStr(e, "to");
    return to === "preparing" || to === "registered";
  };
  const registerUserSet = unique(
    byType("follow_status_changed").filter(isRegistrationEvent).map((e) => e.userId)
  );
  const primaryUserSet = unique(byType("primary_target_set").map((e) => e.userId));
  const taskStartUserSet = unique(byType("task_started").map((e) => e.userId));

  // 第 9 阶段：完成画像后 7×24h 内出现任意有效推进动作
  const profileAtByUser = new Map<string, number>();
  for (const e of profileEvents) {
    const t = new Date(e.at).getTime();
    if (Number.isNaN(t)) continue;
    const cur = profileAtByUser.get(e.userId);
    if (cur === undefined || t < cur) profileAtByUser.set(e.userId, t);
  }
  const progressEvents: AnalyticsEvent[] = [
    ...byType("task_started"),
    ...feedbackEvents,
    ...initialConfirmEvents,
    ...byType("follow_status_changed"),
    ...byType("primary_target_set"),
  ];
  const progress7dSet = new Set<string>();
  for (const e of progressEvents) {
    const start = profileAtByUser.get(e.userId);
    if (start === undefined) continue;
    if (e.type === "follow_status_changed" && !isRegistrationEvent(e)) continue;
    const t = new Date(e.at).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= start && t - start <= 7 * DAY_MS) progress7dSet.add(e.userId);
  }

  const pn = profileUserSet.size;
  const funnel: FunnelStage[] = [
    { key: "profile", label: "完成基础画像", users: pn, rateFromFirst: pn > 0 ? 1 : null },
    stage("opportunity", "获得有效机会", revealedUserSet.size, pn),
    stage("basis", "查看匹配依据", basisUserSet.size, pn),
    stage("follow", "关注机会", followUserSet.size, pn),
    stage("qualification", "补充资格信息", supplementUserSet.size, pn),
    stage("registration", "标记准备报名/已报名", registerUserSet.size, pn),
    stage("primary", "设为主要目标", primaryUserSet.size, pn),
    stage("task", "开始第一项学习任务", taskStartUserSet.size, pn),
    stage("progress7d", "7日内完成有效推进", progress7dSet.size, pn),
  ];

  return {
    targetCreators: n,
    readyCreators: readyCreators.size,
    firstFill: ratio(readyCreators.size, n),
    evidenceViewers: evidenceViewers.size,
    evidenceViewRate: ratio(evidenceViewers.size, n),
    planConfirmedUsers: planConfirmedUsers.size,
    planConfirmRate: ratio(planConfirmedUsers.size, n),
    dayRates,
    coreDayPlans: plansWithFeedback.size,
    avgCoreCompletedDays,
    interruptedUsers,
    restartedUsers,
    restartRate: ratio(restartedUsers, interruptedUsers),
    resourceViewers: resourceViewers.size,
    resourceAdders: resourceAdders.size,
    resourceUsers: resourceUsers.size,
    resourceAddRate: ratio(resourceAdders.size, resourceViewers.size),
    resourceUseRate: ratio(resourceUsers.size, resourceAdders.size),
    closedLoopUsers: closedLoop.length,
    closedLoopRate: ratio(closedLoop.length, n),
    p0Progress7dUsers: progress7dSet.size,
    p0Progress7dRate: ratio(progress7dSet.size, pn),
    funnel,
  };
}

function stage(key: string, label: string, users: number, first: number): FunnelStage {
  return { key, label, users, rateFromFirst: first > 0 ? users / first : null };
}

// ==================== 质量与运营指标 ====================

function computeQuality(
  inRange: AnalyticsEvent[],
  byType: (t: AnalyticsEvent["type"]) => AnalyticsEvent[],
  input: MetricsInput,
  fromMs: number | null
): QualityMetrics {
  const reviewEvents = byType("review_completed");
  const durations = reviewEvents
    .map((e) => propNum(e, "durationMinutes"))
    .filter((v): v is number => typeof v === "number");
  const reviewTotalMinutes = durations.reduce((a, b) => a + b, 0);
  const reviewOwners = unique(
    reviewEvents.map((e) => propStr(e, "ownerId") ?? "").filter(Boolean)
  );

  const actionCounts = {
    approve: 0,
    approve_with_edit: 0,
    reject: 0,
  };
  reviewEvents.forEach((e) => {
    const action = propStr(e, "action");
    if (action === "approve" || action === "approve_with_edit" || action === "reject") {
      actionCounts[action] += 1;
    }
  });
  const reviewActionTotal =
    actionCounts.approve + actionCounts.approve_with_edit + actionCounts.reject;

  // 撤回（业务存储，按创建时间过滤）
  const retractions =
    fromMs === null
      ? input.retractions
      : input.retractions.filter((r) => new Date(r.createdAt).getTime() >= fromMs);
  const affected = unique(
    retractions.flatMap((r) => r.impact?.userIds ?? [])
  );

  const planFailures = byType("plan_generation_failed").length;
  const initialConfirms = byType("plan_confirmed").filter(
    (e) => propStr(e, "kind") !== "replan"
  ).length;
  const feedbackFailures = byType("feedback_submit_failed").length;
  const feedbackSuccess = byType("task_feedback_submitted").length;

  return {
    reviewCount: reviewEvents.length,
    reviewAvgMinutes: durations.length > 0 ? Math.round(reviewTotalMinutes / durations.length) : null,
    reviewEdited: actionCounts.approve_with_edit,
    aiEditRate: ratio(actionCounts.approve_with_edit, reviewActionTotal),
    reviewTotalMinutes,
    reviewOwnerUsers: reviewOwners.size,
    reviewMinutesPerUser: reviewOwners.size > 0 ? Math.round(reviewTotalMinutes / reviewOwners.size) : null,
    correctionCount: byType("correction_submitted").length,
    retractionCount: retractions.length,
    affectedUsers: affected.size,
    planFailures,
    planFailRate: ratio(planFailures, initialConfirms + planFailures),
    feedbackFailures,
    feedbackFailRate: ratio(feedbackFailures, feedbackSuccess + feedbackFailures),
    criticalWriteFailures: byType("critical_write_failed").length,
    liveEventCount: inRange.filter((e) => e.source === "live").length,
    seedEventCount: inRange.filter((e) => e.source === "seed").length,
  };
}

// ==================== 存量指标 ====================

function computeStock(input: MetricsInput, now: number): StockMetrics {
  const pendingItems = input.evidenceItems.filter((i) => i.reviewStatus === "pending_review");
  const pendingHighImpact = pendingItems.filter((i) => isHighImpact(i.field)).length;
  const overdueHighImpact = pendingItems.filter(
    (i) => isHighImpact(i.field) && now - new Date(i.updatedAt).getTime() > REVIEW_SLA_HOURS * 60 * 60 * 1000
  ).length;

  const openCorrections = input.corrections.filter(
    (c) => !c.anonymized && (c.status === "submitted" || c.status === "need_info")
  ).length;

  const activeLike = input.resources.filter((r) => r.status !== "inactive");
  const deadResources = activeLike.filter(
    (r) =>
      r.linkAlive === false ||
      r.status === "expired" ||
      (!!r.expiresAt && new Date(r.expiresAt).getTime() < now)
  ).length;
  const staleResources = activeLike
    .filter((r) => r.linkAlive && r.status !== "expired")
    .filter(
      (r) =>
        now - new Date(r.lastReviewedAt).getTime() >
        RESOURCE_REVIEW_CYCLE_DAYS * DAY_MS
    ).length;

  const failedJobs = input.jobs.filter((j) => j.status === "failed").length;

  return {
    pendingTotal: pendingItems.length,
    pendingHighImpact,
    conflictCount: input.evidenceItems.filter((i) => i.reviewStatus === "pending_review" && i.reviewerFlaggedConflict).length,
    overdueHighImpact,
    openCorrections,
    pendingResources: input.resources.filter((r) => r.status === "pending_review").length,
    deadResources,
    staleResources,
    resourceTotal: activeLike.length,
    resourceDeadRate: ratio(deadResources, activeLike.length),
    failedJobs,
  };
}

function computeBacklog(items: EvidenceItem[], now: number): ReviewBacklogBucket[] {
  const pending = items.filter((i) => i.reviewStatus === "pending_review");
  const buckets: ReviewBacklogBucket[] = [
    { label: "24 小时内", count: 0, highImpact: 0 },
    { label: "24–48 小时", count: 0, highImpact: 0 },
    { label: "超过 48 小时", count: 0, highImpact: 0 },
  ];
  for (const item of pending) {
    const ageHours = (now - new Date(item.updatedAt).getTime()) / (60 * 60 * 1000);
    const idx = ageHours < 24 ? 0 : ageHours < 48 ? 1 : 2;
    buckets[idx].count += 1;
    if (isHighImpact(item.field)) buckets[idx].highImpact += 1;
  }
  return buckets;
}

function buildPendingActions(stock: StockMetrics): PendingAction[] {
  const actions: PendingAction[] = [];
  if (stock.pendingHighImpact > 0) {
    actions.push({
      key: "pending_high",
      label: "高影响事实待审核",
      count: stock.pendingHighImpact,
      href: "/admin/reviews?queue=high_risk",
      tone: "danger",
    });
  }
  if (stock.overdueHighImpact > 0) {
    actions.push({
      key: "review_overdue",
      label: `审核超时（>${REVIEW_SLA_HOURS}h）`,
      count: stock.overdueHighImpact,
      href: "/admin/reviews?queue=pending",
      tone: "danger",
    });
  }
  if (stock.openCorrections > 0) {
    actions.push({
      key: "corrections",
      label: "待处理用户纠错",
      count: stock.openCorrections,
      href: "/admin/feedback",
      tone: "warning",
    });
  }
  if (stock.failedJobs > 0) {
    actions.push({
      key: "failed_jobs",
      label: "AI 提取失败待重试",
      count: stock.failedJobs,
      href: "/admin/exams",
      tone: "warning",
    });
  }
  if (stock.deadResources > 0) {
    actions.push({
      key: "dead_resources",
      label: "失效/坏链资源",
      count: stock.deadResources,
      href: "/admin/resources?queue=expired",
      tone: "danger",
    });
  }
  if (stock.pendingResources > 0) {
    actions.push({
      key: "pending_resources",
      label: "资源待复核",
      count: stock.pendingResources,
      href: "/admin/resources?queue=pending_review",
      tone: "warning",
    });
  }
  return actions;
}

// ==================== 异常监控 ====================

const ANOMALY_TITLES: Record<string, string> = {
  extraction_failed: "AI 公告提取任务失败",
  plan_generation_failed: "计划生成失败",
  feedback_submit_failed: "任务反馈保存失败",
  critical_write_failed: "关键数据写入失败",
  review_overdue: "高影响考情审核超时",
  resource_dead: "资源链接失效或过期",
};

function buildAnomalies(
  input: MetricsInput,
  inRange: AnalyticsEvent[],
  now: number
): AnomalyItem[] {
  const anomalies: AnomalyItem[] = [];

  // 1) AI 提取失败：业务存储中的真实失败任务（含中断）
  const seenJobIds = new Set<string>();
  for (const job of input.jobs.filter((j) => j.status === "failed")) {
    seenJobIds.add(job.id);
    anomalies.push({
      id: `job-${job.id}`,
      kind: "extraction_failed",
      severity: "medium",
      module: "evidence",
      at: job.finishedAt ?? job.updatedAt,
      title: ANOMALY_TITLES.extraction_failed,
      detail: `任务 ${job.id.slice(0, 10)} · 来源类型 ${job.sourceType} · 用户 ${maskUserId(job.userId)} · 可在用户端重试`,
      href: "/admin/exams",
      source: "live",
    });
  }
  // 种子/直接事件形式的提取失败（避免与真实任务重复）
  inRange
    .filter((e) => e.type === "extraction_failed")
    .forEach((e) => {
      const jobId = propStr(e, "jobId");
      if (jobId && seenJobIds.has(jobId)) return;
      anomalies.push({
        id: e.id,
        kind: "extraction_failed",
        severity: "medium",
        module: "evidence",
        at: e.at,
        title: ANOMALY_TITLES.extraction_failed,
        detail: `任务 ${(jobId ?? e.id).slice(0, 12)} · 错误码 ${propStr(e, "reasonCode") ?? "unknown"} · 用户 ${maskUserId(e.userId)}`,
        href: "/admin/exams",
        source: e.source,
      });
    });

  // 2) 审核超时：每条高影响待审核条目一个异常（最多 5 条）
  input.evidenceItems
    .filter(
      (i) =>
        i.reviewStatus === "pending_review" &&
        isHighImpact(i.field) &&
        now - new Date(i.updatedAt).getTime() > REVIEW_SLA_HOURS * 60 * 60 * 1000
    )
    .slice(0, 5)
    .forEach((i) => {
      const ageHours = Math.round((now - new Date(i.updatedAt).getTime()) / (60 * 60 * 1000));
      const severity: AnomalySeverity = ageHours > 48 ? "high" : "medium";
      anomalies.push({
        id: `overdue-${i.id}`,
        kind: "review_overdue",
        severity,
        module: "review",
        at: i.updatedAt,
        title: ANOMALY_TITLES.review_overdue,
        detail: `字段 ${i.field} · 目标 ${i.examTargetId.slice(0, 10)} · 已等待 ${ageHours} 小时`,
        href: "/admin/reviews?queue=pending",
        source: "live",
      });
    });

  // 3) 资源失效/坏链（最多 5 条；超期未复核单独低severity，最多 3 条）
  input.resources
    .filter(
      (r) =>
        r.status !== "inactive" &&
        (r.linkAlive === false ||
          r.status === "expired" ||
          (!!r.expiresAt && new Date(r.expiresAt).getTime() < now))
    )
    .slice(0, 5)
    .forEach((r) => {
      anomalies.push({
        id: `dead-${r.id}`,
        kind: "resource_dead",
        severity: "high",
        module: "resource",
        at: r.linkCheckedAt ?? r.updatedAt,
        title: ANOMALY_TITLES.resource_dead,
        detail: `${r.title}（${r.id}）· ${r.linkAlive ? "已过失效时间" : "链接不可访问"}`,
        href: "/admin/resources?queue=expired",
        source: "live",
      });
    });

  // 4) 失败事件（计划/反馈/关键写入）
  const failureTypes: AnalyticsEvent["type"][] = [
    "plan_generation_failed",
    "feedback_submit_failed",
    "critical_write_failed",
  ];
  inRange
    .filter((e) => failureTypes.includes(e.type))
    .forEach((e) => {
      anomalies.push({
        id: e.id,
        kind: e.type,
        severity: e.type === "critical_write_failed" ? "high" : "medium",
        module: e.module,
        at: e.at,
        title: ANOMALY_TITLES[e.type] ?? e.type,
        detail: `模块 ${e.module} · 错误码 ${propStr(e, "reasonCode") ?? "unknown"} · 用户 ${maskUserId(e.userId)}`,
        href: e.module === "plan" ? "/study" : undefined,
        source: e.source,
      });
    });

  return anomalies.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
}
