import { describe, it, expect } from "vitest";
import {
  DailyPlan,
  ExamTarget,
  MaterialDiagnosisSnapshot,
  PlanTask,
  TaskFeedback,
  WeeklyPlan,
} from "@/types";
import {
  applyReplan,
  buildRestoreVersion,
  describeNextStep,
  ReplanEngineInput,
} from "./replanEngine";

const START = "2026-03-02"; // 周一
const END = "2026-03-08";
const NOW = "2026-03-02T08:00:00.000Z";
const PLAN_CREATED = "2026-03-01T20:00:00.000Z";

function target(): ExamTarget {
  return {
    id: "et-1",
    userId: "u-1",
    name: "杭州市2026年初中语文统招",
    region: "浙江省杭州市",
    regionCode: "330100",
    subject: "chinese",
    stage: "preparation",
    status: "confirmed",
    targetStatus: "announcement",
    isCurrent: true,
    province: "浙江省",
    city: "杭州市",
    educationLevel: "middle",
    year: 2026,
    batch: "上半年统招",
    examType: "public_school",
    createdAt: PLAN_CREATED,
    updatedAt: PLAN_CREATED,
  };
}

let seq = 0;
function task(partial: Partial<PlanTask> = {}): PlanTask {
  seq += 1;
  return {
    id: `t-${seq}`,
    dailyPlanId: "d-1",
    title: "语文课程标准学习",
    module: "mod_kebiao",
    sourceType: "material",
    materialId: "m-1",
    estimatedTime: 60,
    completionCriteria: "整理要点笔记",
    arrangementReason: "薄弱模块优先",
    reviewAction: "复述要点",
    order: 1,
    status: "pending",
    priority: "medium",
    isCore: false,
    createdAt: PLAN_CREATED,
    updatedAt: PLAN_CREATED,
    ...partial,
  };
}

function day(date: string, tasks: PlanTask[], partial: Partial<DailyPlan> = {}): DailyPlan {
  const id = `d-${date}`;
  return {
    id,
    weeklyPlanId: "wp-v1",
    date,
    dayOfWeek: new Date(`${date}T00:00:00`).getDay(),
    tasks: tasks.map((t) => ({ ...t, dailyPlanId: id })),
    totalEstimatedTime: tasks.reduce((s, t) => s + t.estimatedTime, 0),
    isMinimumViable: tasks.length <= 1,
    availableMinutes: 120,
    createdAt: PLAN_CREATED,
    updatedAt: PLAN_CREATED,
    ...partial,
  };
}

function weekly(partial: Partial<WeeklyPlan> = {}): WeeklyPlan {
  return {
    id: "wp-v1",
    userId: "u-1",
    examTargetId: "et-1",
    weekNumber: 1,
    startDate: START,
    endDate: END,
    focus: "课标",
    status: "active",
    version: 1,
    generationReason: "初始计划",
    createdAt: PLAN_CREATED,
    updatedAt: PLAN_CREATED,
    ...partial,
  };
}

function feedback(t: PlanTask, date: string, patch: Partial<TaskFeedback> = {}): TaskFeedback {
  return {
    id: `fb-${t.id}`,
    taskId: t.id,
    userId: "u-1",
    weeklyPlanId: "wp-v1",
    weeklyVersion: 1,
    dailyPlanId: t.dailyPlanId,
    date,
    status: "partial",
    errorTypes: [],
    hasSecondPractice: false,
    createdAt: PLAN_CREATED,
    updatedAt: PLAN_CREATED,
    ...patch,
  };
}

function engineInput(p: Partial<ReplanEngineInput>): ReplanEngineInput {
  const days = [
    day(START, [task({ id: "t1" })]),
    day("2026-03-03", [task({ id: "t2" })]),
    day("2026-03-04", [task({ id: "t3" })]),
    day("2026-03-05", [task({ id: "t4" })]),
    day("2026-03-06", [task({ id: "t5" })]),
    day("2026-03-07", [task({ id: "t6" })]),
    day("2026-03-08", [task({ id: "t7" })]),
  ];
  return {
    target: target(),
    weeklyPlan: weekly(),
    dailyPlans: days,
    feedbacks: [],
    dailyAvailableMinutes: 120,
    diagnosis: null,
    evidenceItems: [],
    materials: [],
    resourceLinks: [],
    resources: [],
    today: START,
    nowIso: NOW,
    ...p,
  };
}

function pausedDiagnosis(): MaterialDiagnosisSnapshot {
  return {
    examTargetId: "et-1",
    signature: "sig",
    evidenceComplete: false,
    pendingEvidenceFields: [],
    materialDiagnoses: [
      {
        id: "md-1",
        materialId: "m-1",
        examTargetId: "et-1",
        recommendation: "pause",
        reason: "来源不明扫描件",
        items: [
          {
            module: "mod_kebiao",
            moduleLabel: "课标",
            recommendation: "pause",
            reason: "不适用",
            relatedChapterTitles: [],
          },
        ],
        suggestedChapterTitles: [],
        coversModules: [],
        missingModules: [],
        warnings: ["来源不明"],
        diagnosedAt: NOW,
      },
    ],
    missingModules: [],
    conflictGroups: [],
    weakModules: [],
    diagnosedAt: NOW,
  };
}

describe("部分完成", () => {
  it("今天部分完成：缩减为剩余时长，不整项重做", () => {
    const base = engineInput({});
    const t1 = base.dailyPlans[0].tasks[0];
    base.feedbacks = [feedback(t1, START, { status: "partial" })];

    const result = applyReplan(base);
    const today = result.daily.find((d) => d.date === START)!;
    expect(today.tasks[0].estimatedTime).toBe(30); // 60/2

    const record = result.adjustments.find((a) => a.action === "reduce");
    expect(record).toBeTruthy();
    const summary = describeNextStep(result.adjustments, START);
    expect(summary?.nextStep).toContain("接着做");
  });

  it("回归：40分钟任务部分完成→20分钟，首项保底不得膨胀为30", () => {
    const days = [
      day(START, [task({ estimatedTime: 40 })]),
      day("2026-03-03", [task({ estimatedTime: 40 })]),
    ];
    const base = engineInput({ dailyPlans: days });
    base.feedbacks = [feedback(days[0].tasks[0], START, { status: "partial" })];

    const result = applyReplan(base);
    const today = result.daily.find((d) => d.date === START)!;
    expect(today.tasks[0].estimatedTime).toBe(20);
  });
});

describe("今天没做", () => {
  it("任务移出今天，顺延到后续日子", () => {
    const base = engineInput({});
    const t1 = base.dailyPlans[0].tasks[0];
    base.feedbacks = [feedback(t1, START, { status: "not_completed" })];

    const result = applyReplan(base);
    const today = result.daily.find((d) => d.date === START)!;
    expect(today.tasks).toHaveLength(0);

    const tomorrow = result.daily.find((d) => d.date === "2026-03-03")!;
    expect(tomorrow.tasks.some((t) => t.title === "语文课程标准学习")).toBe(true);

    const summary = describeNextStep(result.adjustments, START);
    expect(summary?.originalHandling).toContain("欠账不会堆到一天");
  });

  it("欠账不全部堆到同一天：可用时间不足时压缩/顺延，每天总时长不超限", () => {
    const base = engineInput({ dailyAvailableMinutes: 30 });
    const t1 = base.dailyPlans[0].tasks[0];
    base.feedbacks = [feedback(t1, START, { status: "not_completed" })];

    const result = applyReplan(base);
    for (const d of result.daily) {
      expect(d.totalEstimatedTime).toBeLessThanOrEqual(30);
    }
    // 顺延的任务与当天任务不能同时以全时长塞进同一天
    const tomorrow = result.daily.find((d) => d.date === "2026-03-03")!;
    expect(tomorrow.totalEstimatedTime).toBeLessThanOrEqual(30);
  });
});

describe("资料不适合且无替代来源", () => {
  it("兜底任务缺资料时标为不可执行，不编造题目", () => {
    const base = engineInput({
      diagnosis: pausedDiagnosis(),
      materials: [
        {
          id: "m-1",
          userId: "u-1",
          examTargetId: "et-1",
          name: "来源不明扫描资料",
          sourceType: "unknown_scan",
          applicableRegion: "浙江省",
          coversModules: ["mod_kebiao"],
          chapters: [],
          catalogConfirmed: false,
          progress: 0,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    const t1 = base.dailyPlans[0].tasks[0];
    base.feedbacks = [
      feedback(t1, START, { status: "partial", errorTypes: ["material_unsuitable"] }),
    ];

    const result = applyReplan(base);
    const today = result.daily.find((d) => d.date === START)!;
    const replaced = today.tasks[0];
    expect(replaced.executable).toBe(false);
    expect(replaced.blockedReason).toContain("资料");
    expect(replaced.completionCriteria).not.toContain("10 道");
  });
});

describe("恢复原安排", () => {
  it("以被替代的版本内容生成新版本，资料与考试信息保留", () => {
    // source v1：每天一项 40 分钟任务
    const sourceDaily = ["2026-03-02", "2026-03-03"].map((d) =>
      day(d, [task({ id: `src-${d}`, estimatedTime: 40 })], { weeklyPlanId: "wp-v1" })
    );
    const source = weekly({ id: "wp-v1", version: 1 });

    // current v2：任务时长被缩减
    const currentDaily = ["2026-03-02", "2026-03-03"].map((d) =>
      day(
        d,
        [task({ id: `cur-${d}`, estimatedTime: 20 })],
        { weeklyPlanId: "wp-v2" }
      )
    );
    const current = weekly({
      id: "wp-v2",
      version: 2,
      previousVersionId: "wp-v1",
    });

    const result = buildRestoreVersion({
      current,
      currentDaily,
      source,
      sourceDaily,
      today: START,
      nowIso: NOW,
      dailyAvailableMinutes: 120,
    });

    expect(result.weekly.version).toBe(3);
    expect(result.weekly.previousVersionId).toBe("wp-v2");
    const restoredDay = result.daily.find((d) => d.date === START)!;
    expect(restoredDay.tasks[0].estimatedTime).toBe(40);
    // 恢复记录保留（动作为 keep）
    expect(result.adjustments.some((a) => a.reason.includes("恢复原安排"))).toBe(true);
  });

  it("恢复时当前可用时间变小：任务总时长仍不超过可用时间", () => {
    const sourceDaily = [day(START, [task({ estimatedTime: 90 })], { weeklyPlanId: "wp-v1" })];
    const result = buildRestoreVersion({
      current: weekly({ id: "wp-v2", version: 2, previousVersionId: "wp-v1" }),
      currentDaily: [day(START, [task({ estimatedTime: 20 })], { weeklyPlanId: "wp-v2" })],
      source: weekly({ id: "wp-v1", version: 1 }),
      sourceDaily,
      today: START,
      nowIso: NOW,
      dailyAvailableMinutes: 60,
    });
    const d = result.daily.find((x) => x.date === START)!;
    expect(d.totalEstimatedTime).toBeLessThanOrEqual(60);
  });
});
