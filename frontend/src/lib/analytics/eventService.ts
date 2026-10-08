/**
 * 统一分析事件服务（本地 Mock 实现，可整体替换为真实后端埋点 SDK）。
 *
 * 职责：
 * - 记录跨模块的用户动作事件与失败事件（track / trackView）；
 * - 事件存储与业务数据一样在 localStorage，但事件流是指标计算的唯一事实来源；
 * - 首次使用时播种一份跨用户、跨时间的演示事件（source="seed"），
 *   让后台概览在没有真实操作时也能展示正常指标；清除数据后事件一并清空并重播。
 *
 * 隐私边界：
 * - 只存账号 ID / 角色 / 模块 / 枚举维度，不存昵称、公告正文、反馈备注、纠错描述；
 * - 失败原因归类为短错误码（classifyErrorCode），不回传原始报错全文；
 * - track 自身永远不向调用方抛错（埋点不能阻断业务）。
 */
import { UserRole } from "@/types";
import { loadFromStorage, saveToStorage, removeFromStorage } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/mock-data";
import { authService, AUTH_MODE } from "@/lib/auth";
import { AnalyticsEvent, AnalyticsEventType, AnalyticsModule } from "./types";

// ==================== 订阅 ====================

const listeners = new Set<() => void>();
let storeVersion = 0;
let seeded = false;

function notifyChanged(): void {
  storeVersion += 1;
  listeners.forEach((fn) => fn());
}

export function subscribeAnalytics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAnalyticsVersion(): number {
  return storeVersion;
}

// ==================== 工具 ====================

/** 把任意异常归类为短错误码（不保留原文） */
export function classifyErrorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/quota|exceed|空间|限额/i.test(msg)) return "quota_exceeded";
  if (/storage|localStorage|持久化|保存/i.test(msg)) return "storage_unavailable";
  if (/network|网络|timeout|超时/i.test(msg)) return "network_error";
  if (/登录|会话|login|session/i.test(msg)) return "session_expired";
  return "unknown_error";
}

function nowIso(): string {
  return new Date().toISOString();
}

// ==================== 读取与播种 ====================

export function listEvents(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  const existing = loadFromStorage<AnalyticsEvent[] | null>(
    STORAGE_KEYS.ANALYTICS_EVENTS,
    null
  );
  if (existing === null && !seeded) {
    const seed = buildSeedEvents();
    saveToStorage(STORAGE_KEYS.ANALYTICS_EVENTS, seed);
    seeded = true;
    return seed;
  }
  seeded = true;
  return existing ?? [];
}

function persistEvents(events: AnalyticsEvent[]): void {
  saveToStorage(STORAGE_KEYS.ANALYTICS_EVENTS, events);
  notifyChanged();
}

// ==================== 演示辅助：空态 / 重播种子 ====================

/**
 * 演示辅助：清空全部分析事件（只动事件流，不触碰任何业务数据），
 * 用于在后台概览演示“空”状态；真实操作仍会继续写入 live 事件。
 */
export function clearAllEvents(): void {
  if (typeof window === "undefined") return;
  try {
    saveToStorage(STORAGE_KEYS.ANALYTICS_EVENTS, []);
    seeded = true;
    notifyChanged();
  } catch {
    // ignore
  }
}

/** 演示辅助：删除事件存储并恢复首次播种，重新生成 10 个模拟用户的种子事件 */
export function reseedEvents(): void {
  if (typeof window === "undefined") return;
  try {
    removeFromStorage(STORAGE_KEYS.ANALYTICS_EVENTS);
    seeded = false;
    listEvents();
    notifyChanged();
  } catch {
    // ignore
  }
}

// ==================== 服务端转发（v7.0 模块 7 受邀试用指标） ====================

const TRIAL_EVENTS_ENDPOINT = "/api/trial/events";

/**
 * 把事件异步转发到服务端 trial_events（受邀试用看板的唯一真实数据源）。
 *
 * - fire-and-forget：失败静默，绝不影响业务流程与本地 Mock；
 * - 仅受邀模式上报；公开演示数据始终留在本机，不触发无后端的请求；
 * - 身份由 HttpOnly 会话 cookie 自动携带，不发送客户端身份头；
 * - 服务端只接受白名单事件与标量维度，资格原文 / 证件字段会被拒绝；
 * - once-per-user 去重由服务端按 (userId, dedupKey) 唯一约束保证，
 *   重复点击 / 跨设备重报不会重复计数。
 */
function forwardToServer(event: {
  type: AnalyticsEventType;
  module: AnalyticsModule;
  targetId?: string;
  props?: Record<string, string | number | boolean>;
  at: string;
}): void {
  if (typeof window === "undefined" || AUTH_MODE !== "invited") return;
  const session = authService.getSession();
  if (!session) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    void fetch(TRIAL_EVENTS_ENDPOINT, {
      method: "POST",
      headers,
      keepalive: true,
      body: JSON.stringify({
        type: event.type,
        module: event.module,
        unitId: event.targetId ?? null,
        props: event.props ?? null,
        at: event.at,
      }),
    }).catch(() => undefined);
  } catch {
    // 转发失败静默：监控不能反过来影响主流程
  }
}

// ==================== 写入 ====================

export interface TrackOptions {
  targetId?: string;
  props?: Record<string, string | number | boolean>;
}

/** 登录前暂存的访客事件（缺少账号归属，登录后一次性补齐） */
type PendingEvent = Omit<AnalyticsEvent, "userId" | "userRole" | "source">;

function loadPending(): PendingEvent[] {
  return loadFromStorage<PendingEvent[]>(STORAGE_KEYS.GUEST_ANALYTICS_PENDING, []);
}

/**
 * 把访客暂存事件归属到刚登录的真实账号（幂等：无会话/无暂存时不做任何事）。
 * 保留事件原始发生时间 at，使“画像完成→7 日内推进”的时间窗口口径不被登录时刻扭曲。
 */
function flushPendingEvents(): void {
  if (typeof window === "undefined") return;
  const session = authService.getSession();
  if (!session) return;
  const pending = loadPending();
  if (pending.length === 0) return;
  const events: AnalyticsEvent[] = pending.map((e) => ({
    ...e,
    userId: session.user.id,
    userRole: session.user.role as UserRole,
    source: "live",
  }));
  const all = listEvents();
  all.push(...events);
  persistEvents(all);
  saveToStorage(STORAGE_KEYS.GUEST_ANALYTICS_PENDING, []);
  // 登录后把访客暂存事件补报到服务端；保留原始发生时间 at，
  // 保证「画像完成 → 7 日内推进」的观察窗口不被登录时刻扭曲
  for (const e of pending) forwardToServer(e);
}

// 会话从无到有（登录/刷新恢复）时自动迁移访客事件；只注册一次
if (typeof window !== "undefined") {
  authService.subscribe(flushPendingEvents);
}

/**
 * 记录一条真实操作事件。
 * 未登录时进入访客暂存队列，登录成功后归属到真实账号（不丢弃画像阶段的动作）；
 * 任何存储异常都被吞掉，绝不影响业务流程。
 */
export function track(
  type: AnalyticsEventType,
  module: AnalyticsModule,
  options: TrackOptions = {}
): void {
  if (typeof window === "undefined") return;
  try {
    const base = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      at: nowIso(),
      module,
      targetId: options.targetId,
      props: options.props,
    };
    const session = authService.getSession();
    if (!session) {
      const pending = loadPending();
      pending.push(base);
      saveToStorage(STORAGE_KEYS.GUEST_ANALYTICS_PENDING, pending);
      return;
    }
    const event: AnalyticsEvent = {
      ...base,
      userId: session.user.id,
      userRole: session.user.role as UserRole,
      source: "live",
    };
    const all = listEvents();
    all.push(event);
    persistEvents(all);
    // v7.0 模块 7：同步转发到服务端 trial_events（受邀试用真实指标）
    forwardToServer(base);
  } catch {
    // 埋点失败静默：不能让监控反过来影响主流程
  }
}

/**
 * 同一账号对某事件只记录一次（如基础画像完成、开始第一项学习任务）。
 * 同时检查已落库事件与访客暂存队列，保证“访客完成一次、登录后不重复计”。
 */
export function trackOncePerUser(
  type: AnalyticsEventType,
  module: AnalyticsModule,
  options: TrackOptions = {}
): void {
  if (typeof window === "undefined") return;
  try {
    const session = authService.getSession();
    if (session) {
      const already = listEvents().some(
        (e) => e.type === type && e.userId === session.user.id
      );
      if (already) return;
    } else {
      const pendingAlready = loadPending().some((e) => e.type === type);
      if (pendingAlready) return;
    }
    track(type, module, options);
  } catch {
    // 去重检查失败不阻断埋点
  }
}

/**
 * 记录“查看类”事件：同一会话（sessionStorage）内同一去重键只记一次，
 * 避免切换标签页/重渲染造成指标虚高。
 */
export function trackView(
  dedupKey: string,
  type: AnalyticsEventType,
  module: AnalyticsModule,
  options: TrackOptions = {}
): void {
  if (typeof window === "undefined") return;
  try {
    const key = `kb_av_${type}_${dedupKey}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    track(type, module, options);
  } catch {
    // ignore
  }
}

// ==================== 演示种子 ====================
//
// 模拟 10 个用户在最近 20 天内的不同旅程阶段（全部 source="seed"），
// 使 7 天 / 30 天 / 全部 三个时间范围呈现可验证的差异，并覆盖正常、空、异常状态。
// 种子事件不对应真实业务记录，后台页面会明确标注“演示种子”。

function isoDaysAgo(daysAgo: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function dateDaysAgo(daysAgo: number): string {
  return isoDaysAgo(daysAgo).slice(0, 10);
}

interface SeedSpec {
  user: string;
  /** target_created 距今天数 */
  targetDay: number;
  /** 首次填写是否达到可生成计划门禁 */
  ready: boolean;
  viewDay?: number;
  materialDay?: number;
  diagnosisDay?: number;
  // —— v6.1 P0 闭环种子（模块 9） ——
  /** 关注机会距今天数 */
  followDay?: number;
  /** 补充资格信息距今天数 */
  supplementDay?: number;
  /** 报名意向推进到的状态 */
  intention?: "preparing" | "registered";
  /** 设为主要目标距今天数 */
  primaryDay?: number;
  /** 开始第一项学习任务距今天数 */
  taskStartDay?: number;
  /** 计划：确认天数 / 起始日期距今天数（day1 对应 startDayAgo） */
  confirmDay?: number;
  startDayAgo?: number;
  /** 每日核心任务反馈：[第几天(1-7), 状态] */
  feedback?: [number, "completed" | "partial" | "not_completed"][];
  replanDay?: number;
  reviewDay?: number;
  resource?: { views: number[]; addDay?: number; usedDay?: number };
  correctionDay?: number;
  deleteDay?: number;
  sourceOpenDays?: number[];
}

const SEED_USERS: SeedSpec[] = [
  // 5 个确认计划的用户：3 个走完全闭环，1 个进行到第 5 天，1 个首日中断未回归
  {
    user: "u-m01", targetDay: 18, ready: true, viewDay: 18, materialDay: 18, diagnosisDay: 18,
    followDay: 18, supplementDay: 18, intention: "registered",
    primaryDay: 18, taskStartDay: 16,
    confirmDay: 17, startDayAgo: 16,
    feedback: [
      [1, "completed"], [2, "completed"], [3, "not_completed"], [4, "completed"],
      [5, "completed"], [6, "completed"], [7, "partial"],
    ],
    replanDay: 13, reviewDay: 10, correctionDay: 12,
    resource: { views: [18, 15], addDay: 15, usedDay: 14 },
    sourceOpenDays: [16],
  },
  {
    user: "u-m02", targetDay: 13, ready: true, viewDay: 13, materialDay: 13, diagnosisDay: 13,
    followDay: 13, supplementDay: 13, intention: "preparing",
    primaryDay: 13, taskStartDay: 11,
    confirmDay: 12, startDayAgo: 11,
    feedback: [
      [1, "completed"], [2, "not_completed"], [3, "completed"], [4, "completed"],
      [5, "completed"], [6, "partial"], [7, "completed"],
    ],
    replanDay: 10, reviewDay: 5,
    resource: { views: [12, 9], addDay: 9, usedDay: 7 },
  },
  {
    user: "u-m03", targetDay: 10, ready: true, viewDay: 10, materialDay: 10, diagnosisDay: 10,
    followDay: 10, supplementDay: 10, intention: "preparing",
    primaryDay: 10, taskStartDay: 8,
    confirmDay: 9, startDayAgo: 8,
    feedback: [
      [1, "completed"], [2, "completed"], [3, "completed"], [4, "completed"],
      [5, "partial"], [6, "not_completed"], [7, "not_completed"],
    ],
    reviewDay: 2, sourceOpenDays: [8],
  },
  {
    user: "u-m04", targetDay: 7, ready: true, viewDay: 7,
    followDay: 7, primaryDay: 7, taskStartDay: 5,
    confirmDay: 6, startDayAgo: 5,
    feedback: [
      [1, "completed"], [2, "not_completed"], [3, "completed"], [5, "completed"],
    ],
  },
  {
    // 首日中断：仅完成关注，未补充资格、未设主目标
    user: "u-m05", targetDay: 4, ready: true, viewDay: 4, followDay: 4,
  },
  // 补问了资格信息但未继续推进
  {
    user: "u-m06", targetDay: 13, ready: true, viewDay: 13, materialDay: 12, diagnosisDay: 12,
    followDay: 13, supplementDay: 12,
    correctionDay: 4,
  },
  // 看过匹配依据后流失
  { user: "u-m07", targetDay: 9, ready: true, viewDay: 9 },
  // 仅创建草稿（信息不足，未达门禁，未完成画像）
  { user: "u-m08", targetDay: 1, ready: false },
  // 走完 P0 前半段后申请注销账号
  {
    user: "u-m09", targetDay: 15, ready: true, followDay: 15, supplementDay: 15,
    intention: "registered", primaryDay: 15, deleteDay: 6,
  },
  // 只浏览资源未加入计划
  { user: "u-m10", targetDay: 8, ready: true, viewDay: 7, resource: { views: [7] } },
];

function buildSeedEvents(): AnalyticsEvent[] {
  const events: AnalyticsEvent[] = [];
  let seq = 0;
  const push = (
    user: string,
    day: number,
    type: AnalyticsEventType,
    module: AnalyticsModule,
    props?: Record<string, string | number | boolean>,
    targetId?: string,
    hour?: number
  ): void => {
    seq += 1;
    events.push({
      id: `evt-seed-${String(seq).padStart(3, "0")}`,
      type,
      at: isoDaysAgo(day, hour ?? 9),
      userId: user,
      userRole: "user",
      module,
      targetId,
      source: "seed",
      props,
    });
  };

  for (const s of SEED_USERS) {
    const targetId = `et-seed-${s.user}`;
    push(s.user, s.targetDay, "target_created", "target", {
      ready: s.ready ? 1 : 0,
      status: s.ready ? "confirmed" : "draft",
    }, targetId);
    // —— v6.1 P0 闭环事件（画像完成才有后续；草稿用户是漏斗第一层流失） ——
    if (s.ready) {
      push(s.user, s.targetDay, "profile_completed", "profile", {
        stepCount: 5,
      }, undefined, 8);
      push(s.user, s.targetDay, "opportunity_revealed", "opportunity", {
        validCount: 2,
      }, targetId, 8);
      push(s.user, s.viewDay ?? s.targetDay, "match_basis_viewed", "opportunity", {
        fieldCount: 6,
      }, targetId, 10);
    }
    if (s.followDay !== undefined) {
      push(s.user, s.followDay, "opportunity_followed", "opportunity", {
        from: "preliminary",
      }, targetId, 11);
    }
    if (s.supplementDay !== undefined) {
      push(s.user, s.supplementDay, "qualification_supplemented", "profile", {
        dimension: "hukou",
        fieldCount: 1,
      }, targetId, 12);
    }
    if (s.intention) {
      push(s.user, s.followDay ?? s.targetDay, "follow_status_changed", "opportunity", {
        from: "following",
        to: s.intention,
      }, targetId, 13);
    }
    if (s.primaryDay !== undefined) {
      push(s.user, s.primaryDay, "primary_target_set", "opportunity", {}, targetId, 14);
    }
    if (s.taskStartDay !== undefined) {
      push(s.user, s.taskStartDay, "task_started", "plan", {
        planId: `wp-seed-${s.user}`,
        taskIndex: 1,
      }, targetId, 19);
    }
    if (s.viewDay !== undefined) push(s.user, s.viewDay, "evidence_viewed", "evidence", {}, targetId);
    if (s.materialDay !== undefined) push(s.user, s.materialDay, "material_added", "material", { sourceType: "published" }, targetId);
    if (s.diagnosisDay !== undefined) push(s.user, s.diagnosisDay, "diagnosis_viewed", "material", {}, targetId);
    (s.sourceOpenDays ?? []).forEach((d) =>
      push(s.user, d, "source_opened", "evidence", { field: "exam_time" }, targetId)
    );
    if (s.correctionDay !== undefined) {
      push(s.user, s.correctionDay, "correction_submitted", "correction", { targetType: "evidence" }, targetId);
    }
    if (s.resource) {
      s.resource.views.forEach((d) =>
        push(s.user, d, "resource_viewed", "resource", { resourceId: "pr-005" })
      );
      if (s.resource.addDay !== undefined) {
        push(s.user, s.resource.addDay, "resource_added_to_plan", "resource", {
          resourceId: "pr-005", module: "mod_zhenti",
        }, targetId);
      }
      if (s.resource.usedDay !== undefined) {
        push(s.user, s.resource.usedDay, "resource_used", "resource", {
          resourceId: "pr-005", stage: "used",
        }, targetId);
      }
    }
    if (s.confirmDay !== undefined && s.startDayAgo !== undefined) {
      const planId = `wp-seed-${s.user}`;
      push(s.user, s.confirmDay, "plan_confirmed", "plan", {
        planId,
        startDate: dateDaysAgo(s.startDayAgo),
        version: 1,
        kind: "initial",
      }, targetId, 20);
      (s.feedback ?? []).forEach(([dayIndex, status]) => {
        push(
          s.user,
          s.startDayAgo! - (dayIndex - 1),
          "task_feedback_submitted",
          "feedback",
          {
            planId,
            date: dateDaysAgo(s.startDayAgo! - (dayIndex - 1)),
            dayIndex,
            status,
            isCore: 1,
          },
          targetId,
          21
        );
      });
      if (s.replanDay !== undefined) {
        push(s.user, s.replanDay, "plan_replanned", "replan", {
          planId, fromVersion: 1, toVersion: 2,
        }, targetId);
      }
      if (s.reviewDay !== undefined) {
        push(s.user, s.reviewDay, "weekly_review_completed", "replan", { planId }, targetId, 21);
      }
    }
    if (s.deleteDay !== undefined) {
      push(s.user, s.deleteDay, "data_delete_requested", "privacy", { scopeCount: 13 }, targetId);
    }
  }

  // —— 质量与运营：人工审核完成（8 条，含 2 条修改后通过） ——
  const reviewSeed: [number, string, string, number, number, number][] = [
    // [距今天数, 证据归属用户, 动作, 处理时长(分钟), 是否高影响, 是否修正]
    [17, "u-m01", "approve", 42, 1, 0],
    [17, "u-m01", "approve", 95, 1, 0],
    [16, "u-m01", "approve_with_edit", 380, 1, 1],
    [12, "u-m02", "approve", 60, 1, 0],
    [11, "u-m02", "approve_with_edit", 260, 0, 1],
    [9, "u-m03", "approve", 150, 1, 0],
    [4, "u-m03", "reject", 75, 0, 0],
    [1, "u-001", "approve", 210, 1, 0],
  ];
  reviewSeed.forEach(([day, owner, action, duration, high, edited], i) => {
    seq += 1;
    events.push({
      id: `evt-seed-rev-${i + 1}`,
      type: "review_completed",
      at: isoDaysAgo(day, 15),
      userId: "u-002",
      userRole: "exam_reviewer",
      module: "review",
      targetId: `et-seed-${owner === "u-001" ? "u-m01" : owner}`,
      source: "seed",
      props: { action, durationMinutes: duration, highImpact: high, edited, ownerId: owner },
    });
  });

  // —— 异常监控种子（6 条） ——
  const failures: [number, string, AnalyticsEventType, AnalyticsModule, Record<string, string | number | boolean>][] = [
    [3, "u-m05", "extraction_failed", "evidence", { jobId: "job-seed-f1", reasonCode: "interrupted" }],
    [1, "u-m07", "extraction_failed", "evidence", { jobId: "job-seed-f2", reasonCode: "extract_error" }],
    [2, "u-m06", "plan_generation_failed", "plan", { reasonCode: "storage_unavailable" }],
    [5, "u-m04", "feedback_submit_failed", "feedback", { reasonCode: "storage_unavailable" }],
    [13, "u-m01", "feedback_submit_failed", "feedback", { reasonCode: "network_error" }],
    [6, "u-m02", "critical_write_failed", "storage", { module: "target", storageKey: "kb_exam_targets", reasonCode: "quota_exceeded" }],
  ];
  failures.forEach(([day, user, type, module, props], i) => {
    seq += 1;
    events.push({
      id: `evt-seed-fail-${i + 1}`,
      type,
      at: isoDaysAgo(day, 11),
      userId: user,
      userRole: "user",
      module,
      source: "seed",
      props,
    });
  });

  return events.sort((a, b) => a.at.localeCompare(b.at));
}
