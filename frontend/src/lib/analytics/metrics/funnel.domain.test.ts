/**
 * v6.1 P0 闭环漏斗口径测试（指标口径唯一来源：metrics/domain.ts）。
 */
import { describe, expect, it } from "vitest";
import type { AnalyticsEvent, AnalyticsEventType, AnalyticsModule } from "../types";
import { computeDashboard, type MetricsInput } from "./domain";
import { EVENT_DICTIONARY, METRIC_DICTIONARY } from "../dictionary";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-05T12:00:00.000Z").getTime();

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

function ev(
  user: string,
  type: AnalyticsEventType,
  at: string,
  props: Record<string, string | number | boolean> = {},
  module: AnalyticsModule = "opportunity",
  source: AnalyticsEvent["source"] = "live",
): AnalyticsEvent {
  return {
    id: `e-${user}-${type}-${at}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    at,
    userId: user,
    userRole: "user",
    module,
    targetId: "unit-1",
    source,
    props,
  };
}

function dashboard(events: AnalyticsEvent[]) {
  const input: MetricsInput = {
    events,
    evidenceItems: [],
    corrections: [],
    retractions: [],
    resources: [],
    jobs: [],
    now: NOW,
  };
  return computeDashboard(input, "30d").userValue;
}

const P0_EVENT_TYPES: AnalyticsEventType[] = [
  "profile_completed",
  "opportunity_revealed",
  "match_basis_viewed",
  "opportunity_followed",
  "qualification_supplemented",
  "follow_status_changed",
  "primary_target_set",
  "task_started",
];

describe("v6.1 P0 闭环漏斗", () => {
  it("9 个漏斗阶段与 8 类新事件全部在字典登记", () => {
    for (const t of P0_EVENT_TYPES) {
      expect(EVENT_DICTIONARY.some((d) => d.type === t)).toBe(true);
    }
    expect(METRIC_DICTIONARY.some((m) => m.key === "p0_funnel")).toBe(true);
    expect(METRIC_DICTIONARY.some((m) => m.key === "meaningful_progress_7d")).toBe(true);
  });

  it("走完全链路的用户出现在全部 9 个阶段", () => {
    const t0 = isoDaysAgo(3);
    const events: AnalyticsEvent[] = [
      ev("u1", "profile_completed", t0, { stepCount: 5 }, "profile"),
      ev("u1", "opportunity_revealed", t0, { validCount: 2 }),
      ev("u1", "match_basis_viewed", t0, { fieldCount: 6 }),
      ev("u1", "opportunity_followed", t0, { from: "preliminary" }),
      ev("u1", "qualification_supplemented", t0, { fieldCount: 1 }, "profile"),
      ev("u1", "follow_status_changed", t0, { from: "following", to: "preparing" }),
      ev("u1", "primary_target_set", t0, {}),
      ev("u1", "task_started", t0, { taskIndex: 1 }, "plan"),
      ev("u1", "task_feedback_submitted", t0, { isCore: 1, status: "completed" }, "feedback"),
    ];
    const { funnel } = dashboard(events);
    expect(funnel).toHaveLength(9);
    expect(funnel.map((s) => s.users)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(funnel.every((s) => s.rateFromFirst === 1)).toBe(true);
  });

  it("validCount=0 不计入“获得有效机会”", () => {
    const t0 = isoDaysAgo(2);
    const { funnel } = dashboard([
      ev("u2", "profile_completed", t0, {}, "profile"),
      ev("u2", "opportunity_revealed", t0, { validCount: 0 }),
    ]);
    expect(funnel[0].users).toBe(1);
    expect(funnel[1].users).toBe(0);
    expect(funnel[1].rateFromFirst).toBe(0);
  });

  it("报名状态仅 preparing/registered 计入第 6 阶段（abandoned/closed 不计）", () => {
    const t0 = isoDaysAgo(1);
    const { funnel } = dashboard([
      ev("u3", "profile_completed", t0, {}, "profile"),
      ev("u3", "opportunity_revealed", t0, { validCount: 1 }),
      ev("u3", "follow_status_changed", t0, { from: "following", to: "abandoned" }),
    ]);
    expect(funnel.find((s) => s.key === "registration")?.users).toBe(0);
  });

  it("第 9 阶段：画像完成后 7 日内的推进动作计入，第 8 日不计入", () => {
    const events: AnalyticsEvent[] = [
      // ua：画像 8 天前、反馈 2 天前（间隔 6 天）→ 计入
      ev("ua", "profile_completed", isoDaysAgo(8), { stepCount: 5 }, "profile"),
      ev("ua", "task_feedback_submitted", isoDaysAgo(2), { status: "completed" }, "feedback"),
      // ub：恰好 7 天边界（含第 7 日）→ 计入
      ev("ub", "profile_completed", isoDaysAgo(7), { stepCount: 5 }, "profile"),
      ev("ub", "task_started", isoDaysAgo(0), { taskIndex: 1 }, "plan"),
      // uc：画像后第 8 天才开始 → 不计入
      ev("uc", "profile_completed", isoDaysAgo(10), { stepCount: 5 }, "profile"),
      ev("uc", "task_started", isoDaysAgo(2), { taskIndex: 1 }, "plan"),
      // 推进早于画像（脏数据）→ 不计入
      ev("ud", "profile_completed", isoDaysAgo(2), { stepCount: 5 }, "profile"),
      ev("ud", "plan_confirmed", isoDaysAgo(5), { kind: "initial" }, "plan"),
    ];
    const uv = dashboard(events);
    const stage9 = uv.funnel.find((s) => s.key === "progress7d");
    expect(stage9?.users).toBe(2);
    expect(uv.p0Progress7dUsers).toBe(2);
    // 分母=完成画像的 4 个用户
    expect(uv.p0Progress7dRate).toEqual({ numerator: 2, denominator: 4, rate: 0.5 });
  });

  it("标记 preparing/registered、设主目标、确认计划均算 7 日内推进", () => {
    const t = isoDaysAgo(1);
    const events: AnalyticsEvent[] = [
      ev("p1", "profile_completed", t, {}, "profile"),
      ev("p1", "follow_status_changed", t, { to: "registered" }),
      ev("p2", "profile_completed", t, {}, "profile"),
      ev("p2", "primary_target_set", t, {}),
      ev("p3", "profile_completed", t, {}, "profile"),
      ev("p3", "plan_confirmed", t, { kind: "initial" }, "plan"),
    ];
    const uv = dashboard(events);
    expect(uv.p0Progress7dUsers).toBe(3);
  });

  it("分母为 0 时比率为 null（不伪造 0%）", () => {
    const { funnel, p0Progress7dRate } = dashboard([]);
    expect(funnel[0].users).toBe(0);
    expect(funnel[0].rateFromFirst).toBeNull();
    expect(p0Progress7dRate.rate).toBeNull();
  });
});
