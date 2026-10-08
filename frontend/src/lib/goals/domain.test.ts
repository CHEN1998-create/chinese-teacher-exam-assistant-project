/**
 * 主要目标领域逻辑测试（模块 7）：
 * 门禁三态（无主要目标 / 考试内容未确认 / 就绪）、确认随版本失效、
 * 目标派生的稳定 id、更换主要目标的影响说明、备选目标不建计划。
 */
import { describe, expect, it } from "vitest";
import type { GoalDTO } from "@/lib/opportunities/api-types";
import {
  backupGoalsOf,
  deriveTargetFromGoal,
  derivedTargetIdOf,
  describePrimarySwitchImpact,
  evaluateStudyGate,
} from "./domain";

const NOW = "2026-10-05T10:00:00.000Z";

function makeGoal(overrides: Partial<GoalDTO> = {}): GoalDTO {
  return {
    unitId: "unit-hangzhou-01",
    unitName: "杭州市直属初中语文教师岗",
    unitCode: "HZ-01",
    region: { code: "330100", province: "浙江省", city: "杭州市" },
    stage: "middle",
    subject: "chinese",
    headcount: 2,
    announcement: {
      id: "ann-hangzhou",
      title: "杭州市教育局直属学校招聘公告",
      publisher: "杭州市教育局",
      officialUrl: "https://example.gov.cn/hangzhou",
    },
    version: {
      id: "ann-hangzhou-v1",
      versionNumber: 1,
      publishedAt: "2026-09-20",
      timeline: {
        registrationStart: "2026-10-01",
        registrationEnd: "2026-10-15",
        writtenExamDate: "2026-11-10",
      },
    },
    role: "primary",
    followStatus: "considering",
    followedAt: "2026-10-01T00:00:00.000Z",
    newerVersion: false,
    ...overrides,
  };
}

describe("deriveTargetFromGoal：桥接为计划管线目标", () => {
  it("稳定 id + 已确认状态 + 官方公告链接，学段映射为本地学段枚举", () => {
    const goal = makeGoal();
    const target = deriveTargetFromGoal(goal, "user-1", NOW);

    expect(target.id).toBe("tgt-unit-hangzhou-01");
    expect(derivedTargetIdOf(goal.unitId)).toBe(target.id);
    expect(target.status).toBe("confirmed");
    expect(target.targetStatus).toBe("announcement");
    expect(target.announcementUrl).toBe(goal.announcement.officialUrl);
    expect(target.educationLevel).toBe("middle");
    expect(target.province).toBe("浙江省");
    expect(target.city).toBe("杭州市");
    expect(target.name).toBe(goal.unitName);
    expect(target.userId).toBe("user-1");
  });

  it("非标准学段字符串不臆造本地枚举", () => {
    const target = deriveTargetFromGoal(makeGoal({ stage: "unknown" }), "user-1", NOW);
    expect(target.educationLevel).toBeUndefined();
  });
});

describe("evaluateStudyGate：门禁三态", () => {
  const goal = makeGoal();

  it("无主要目标：给出明确下一步，不产出任何目标", () => {
    const state = evaluateStudyGate([makeGoal({ role: "backup" })], null, null);
    expect(state.kind).toBe("no_primary");
    if (state.kind === "no_primary") {
      expect(state.nextStep).toContain("主要备考目标");
    }
  });

  it("主要目标已被放弃（不在活跃列表）：回到无主要目标态", () => {
    const state = evaluateStudyGate(
      [makeGoal({ unitId: "unit-other", role: "backup" })],
      "unit-hangzhou-01",
      null,
    );
    expect(state.kind).toBe("no_primary");
  });

  it("未确认考试内容：只给核对任务，不给计划目标", () => {
    const state = evaluateStudyGate([goal], goal.unitId, null);
    expect(state.kind).toBe("exam_unverified");
    if (state.kind === "exam_unverified") {
      expect(state.reason).toBe("no_confirmation");
      expect(state.verifyTask.estimatedMinutes).toBeGreaterThan(0);
      expect(state.verifyTask.url).toBe(goal.announcement.officialUrl);
      expect(state.verifyTask.whyFirst).toContain("不会生成");
      // 未就绪时绝不携带可生成计划的目标
      expect((state as { target?: unknown }).target).toBeUndefined();
    }
  });

  it("公告出新版本后旧确认自动失效，要求重新核对", () => {
    const state = evaluateStudyGate([goal], goal.unitId, {
      unitId: goal.unitId,
      versionId: "ann-hangzhou-v0",
      confirmedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(state.kind).toBe("exam_unverified");
    if (state.kind === "exam_unverified") {
      expect(state.reason).toBe("version_changed");
    }
  });

  it("已确认当前版本：就绪并携带桥接目标与就绪信息", () => {
    const state = evaluateStudyGate([goal], goal.unitId, {
      unitId: goal.unitId,
      versionId: goal.version.id,
      confirmedAt: NOW,
    });
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(state.target.id).toBe(derivedTargetIdOf(goal.unitId));
      expect(state.warnings).toEqual([]);
    }
  });

  it("就绪态的软警告：版本过时与待定时间如实提示，不阻塞", () => {
    const stale = makeGoal({
      newerVersion: true,
      version: {
        id: "ann-hangzhou-v1",
        versionNumber: 1,
        publishedAt: "2026-09-20",
        timeline: {
          registrationStart: "2026-10-01",
          registrationEnd: "2026-10-15",
          pendingItems: ["笔试时间"],
        },
      },
    });
    const state = evaluateStudyGate([stale], stale.unitId, {
      unitId: stale.unitId,
      versionId: stale.version.id,
      confirmedAt: NOW,
    });
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") {
      expect(state.warnings.some((w) => w.includes("新版本"))).toBe(true);
      expect(state.warnings.some((w) => w.includes("笔试时间"))).toBe(true);
    }
  });
});

describe("describePrimarySwitchImpact：更换主要目标前的影响说明", () => {
  it("已有主要目标时说明旧目标转为备选、记录保留为历史、需重新确认考试内容", () => {
    const impact = describePrimarySwitchImpact("杭州市直属初中语文教师岗", "宁波鄞州小学语文岗");
    expect(impact.title).toContain("更换");
    expect(impact.points.join("\n")).toContain("转为备选目标");
    expect(impact.points.join("\n")).toContain("保留为历史");
    expect(impact.points.join("\n")).toContain("重新确认考试内容");
    expect(impact.points.join("\n")).toContain("不会自动创建多套计划");
  });

  it("首次设置主要目标时说明需要确认考试内容后才会生成首个 7 天计划", () => {
    const impact = describePrimarySwitchImpact(null, "宁波鄞州小学语文岗");
    expect(impact.title).not.toContain("更换");
    expect(impact.points.join("\n")).toContain("首个 7 天计划");
    expect(impact.points.some((p) => p.includes("转为备选目标"))).toBe(false);
  });
});

describe("backupGoalsOf：备选目标只展示不建计划", () => {
  it("排除主要目标，其余按原顺序返回", () => {
    const goals = [
      makeGoal({ unitId: "unit-a", role: "primary" }),
      makeGoal({ unitId: "unit-b", role: "backup" }),
      makeGoal({ unitId: "unit-c", role: "backup" }),
    ];
    const backups = backupGoalsOf(goals, "unit-a");
    expect(backups.map((g) => g.unitId)).toEqual(["unit-b", "unit-c"]);
  });
});
