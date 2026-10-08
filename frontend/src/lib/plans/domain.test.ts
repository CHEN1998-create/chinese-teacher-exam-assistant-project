import { describe, it, expect } from "vitest";
import {
  AbilityBaseline,
  ExamTarget,
  MaterialDiagnosisSnapshot,
  MaterialItem,
  ResourceItem,
  ResourcePlanLink,
} from "@/types";
import {
  checkPlanReadiness,
  generatePlan,
  PlanGenerationInput,
} from "./domain";

const NOW = "2026-03-02T09:00:00.000Z";
const START = "2026-03-02"; // 周一

function examTarget(partial: Partial<ExamTarget> = {}): ExamTarget {
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
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function material(partial: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id: "m-1",
    userId: "u-1",
    examTargetId: "et-1",
    name: "2026浙江省教师招聘考试专用教材（语文）",
    sourceType: "published",
    applicableRegion: "浙江省",
    year: 2026,
    applicableLevel: "middle",
    coversModules: ["mod_kebiao", "mod_zhenti"],
    chapters: [
      { id: "ch-1", materialId: "m-1", title: "语文课程标准", order: 1, isCompleted: false },
      { id: "ch-2", materialId: "m-1", title: "现代文阅读", order: 2, isCompleted: false },
    ],
    catalogConfirmed: true,
    progress: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function diagnosis(
  relatedChapterTitles: string[],
  module = "mod_kebiao"
): MaterialDiagnosisSnapshot {
  return {
    examTargetId: "et-1",
    signature: "sig-1",
    evidenceComplete: false,
    pendingEvidenceFields: [],
    materialDiagnoses: [
      {
        id: "md-1",
        materialId: "m-1",
        examTargetId: "et-1",
        recommendation: "continue",
        reason: "资料适用",
        items: [
          {
            module,
            moduleLabel: "课标",
            recommendation: "continue",
            reason: "适用",
            relatedChapterTitles,
          },
        ],
        suggestedChapterTitles: relatedChapterTitles,
        coversModules: [module],
        missingModules: [],
        warnings: [],
        diagnosedAt: NOW,
      },
    ],
    missingModules: [],
    conflictGroups: [],
    weakModules: [],
    diagnosedAt: NOW,
  };
}

function resource(partial: Partial<ResourceItem> = {}): ResourceItem {
  return {
    id: "r-1",
    title: "浙江省笔试说明（含样题）",
    resourceType: "official",
    sourceName: "浙江省教育考试院",
    sourceUrl: "https://www.example.gov.cn/zhejiang/bishuo.html",
    rightsStatus: "official",
    applicableRegions: ["浙江省"],
    applicableLevels: ["middle"],
    applicableTypes: ["public_school"],
    modules: ["mod_zhenti"],
    recommendReason: "官方笔试说明",
    suggestedChapters: ["笔试样题"],
    estimatedMinutes: 90,
    lastReviewedAt: NOW,
    linkAlive: true,
    status: "active",
    year: 2026,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function resourceLink(partial: Partial<ResourcePlanLink> = {}): ResourcePlanLink {
  return {
    id: "rl-1",
    userId: "u-1",
    resourceId: "r-1",
    examTargetId: "et-1",
    module: "mod_zhenti",
    status: "arranged",
    estimatedMinutes: 90,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function baseline(minutes: number): AbilityBaseline {
  return {
    id: "ab-1",
    userId: "u-1",
    examTargetId: "et-1",
    inventoryStatus: "single",
    chineseAssessments: [],
    generalAssessments: [],
    recentScores: [],
    weakModules: [],
    dailyAvailableMinutes: minutes,
    weeklyAvailableHours: Math.round((minutes * 7) / 60),
    updatedAt: NOW,
  };
}

function input(partial: Partial<PlanGenerationInput> = {}): PlanGenerationInput {
  return {
    target: examTarget(),
    evidenceItems: [],
    diagnosis: diagnosis(["语文课程标准"]),
    materials: [material()],
    resourceLinks: [],
    resources: [],
    baseline: baseline(120),
    dailyAvailableMinutes: 120,
    weeklyAvailableHours: 14,
    startDate: START,
    weekNumber: 1,
    nowIso: NOW,
    ...partial,
  };
}

describe("checkPlanReadiness", () => {
  it("目标未确认：不生成", () => {
    const r = checkPlanReadiness(input({ target: examTarget({ status: "draft" }) }));
    expect(r.ready).toBe(false);
    expect(r.missing.join()).toContain("尚未确认");
  });

  it("没有可用学习内容：不生成", () => {
    const r = checkPlanReadiness(
      input({ diagnosis: null, resourceLinks: [] })
    );
    expect(r.ready).toBe(false);
    expect(r.missing.join()).toContain("学习内容");
  });

  it("每日可用时间为 0：不生成", () => {
    const r = checkPlanReadiness(input({ dailyAvailableMinutes: 0 }));
    expect(r.ready).toBe(false);
    expect(r.missing.join()).toContain("可用时间");
  });

  it("资源链接的来源链接失效：不能作为可用内容", () => {
    const r = checkPlanReadiness(
      input({
        diagnosis: null,
        resourceLinks: [resourceLink()],
        resources: [resource({ linkAlive: false })],
      })
    );
    expect(r.ready).toBe(false);
  });

  it("内容与时间齐备：可生成（科目未核对仅警告，不阻塞）", () => {
    const r = checkPlanReadiness(input());
    expect(r.ready).toBe(true);
  });
});

describe("generatePlan 时间与资料规则", () => {
  it("每天任务总时长不超过可用时间", () => {
    // 可用 60 分钟，但资源/资料来源时长远大于 60
    const { daily } = generatePlan(
      input({
        dailyAvailableMinutes: 60,
        baseline: baseline(60),
        resourceLinks: [resourceLink()],
        resources: [resource()],
      })
    );
    for (const day of daily) {
      expect(day.totalEstimatedTime).toBeLessThanOrEqual(60);
      expect(day.availableMinutes).toBe(60);
    }
  });

  it("每天不超过 3 项任务", () => {
    const { daily } = generatePlan(input());
    for (const day of daily) {
      expect(day.tasks.length).toBeLessThanOrEqual(3);
    }
  });

  it("生成的学习任务都有可执行入口并显式标 executable", () => {
    const { daily } = generatePlan(input());
    const tasks = daily.flatMap((d) => d.tasks);
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(t.executable).toBe(true);
    }
  });

  it("章节未知时不编造章节名：让用户对照目录定位", () => {
    // 诊断无相关章节，材料目录中也没有课标关键词命中
    const { daily } = generatePlan(
      input({
        diagnosis: diagnosis([]),
        materials: [material({ chapters: [] })],
      })
    );
    const first = daily[0].tasks[0];
    expect(first.title).not.toContain("章节学习");
    expect(first.completionCriteria).toContain("目录");
    expect(first.completionCriteria).toContain("以你手上的书为准");
  });

  it("来源未标适用学段的资源不排入任务", () => {
    const { daily } = generatePlan(
      input({
        diagnosis: null,
        resourceLinks: [resourceLink()],
        resources: [resource({ applicableLevels: [] })],
      })
    );
    // 被闸门拦截后只能有复盘保底，不应引用该资源
    const tasks = daily.flatMap((d) => d.tasks);
    expect(tasks.every((t) => t.resourceId !== "r-1")).toBe(true);
  });
});

describe("generatePlan 复盘保底与首项膨胀（回归）", () => {
  it("复盘任务必须挂本周已有资料入口：优先可打开的公共资源", () => {
    const { daily } = generatePlan(
      input({
        diagnosis: null,
        resourceLinks: [resourceLink()],
        resources: [resource()],
      })
    );
    const reviewTasks = daily.slice(1).flatMap((d) => d.tasks);
    expect(reviewTasks.length).toBeGreaterThan(0);
    for (const t of reviewTasks) {
      expect(t.resourceId ?? t.materialId).toBeTruthy();
      expect(t.executable).toBe(true);
    }
  });

  it("没有资源时复盘指向用户已确认的自有资料", () => {
    const { daily } = generatePlan(input());
    const reviewTasks = daily.slice(1).flatMap((d) => d.tasks);
    expect(reviewTasks.length).toBeGreaterThan(0);
    for (const t of reviewTasks) {
      expect(t.materialId).toBe("m-1");
      expect(t.executable).toBe(true);
    }
  });

  it("复盘任务时长不超过当天可用时间（原来 30 分钟下限在 25 分钟可用时溢出）", () => {
    const { daily } = generatePlan(
      input({
        dailyAvailableMinutes: 25,
        baseline: baseline(25),
        diagnosis: null,
        resourceLinks: [resourceLink({ estimatedMinutes: 25 })],
        resources: [resource({ estimatedMinutes: 25 })],
      })
    );
    for (const day of daily) {
      expect(day.totalEstimatedTime).toBeLessThanOrEqual(25);
    }
  });

  it("回归：20 分钟小任务不得被首项保底膨胀为 30 分钟", () => {
    const { daily } = generatePlan(
      input({
        dailyAvailableMinutes: 60,
        baseline: baseline(60),
        diagnosis: null,
        resourceLinks: [resourceLink({ estimatedMinutes: 20 })],
        resources: [resource({ estimatedMinutes: 20 })],
      })
    );
    expect(daily[0].tasks[0].estimatedTime).toBe(20);
  });
});
