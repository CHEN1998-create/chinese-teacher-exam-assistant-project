import { describe, expect, it } from "vitest";
import type { AnnouncementVersion, ApplicationUnit, RecruitmentAnnouncement, Requirement } from "@/lib/announcements/types";
import type { UserRecruitmentProfile } from "@/lib/profile/types";
import {
  buildCandidates,
  evaluateAnnouncement,
  evaluateOpportunity,
  evaluateRequirement,
  filterValidOpportunities,
  groupByMissingDimension,
  isValidOpportunity,
  sortCandidates,
} from "@/lib/matching/domain";
import {
  V61_NOW,
  V61_SCENARIO_IDS,
  V61_SEED_ANNOUNCEMENTS,
  V61_SEED_PROFILE,
} from "@/lib/seed/v61-opportunities";
import type { OpportunityCandidate } from "@/lib/matching/domain";

function findAnnouncement(id: string): RecruitmentAnnouncement {
  const found = V61_SEED_ANNOUNCEMENTS.find((a) => a.id === id);
  if (!found) throw new Error(`seed 中缺少公告 ${id}`);
  return found;
}

function candidateFor(id: string): OpportunityCandidate {
  const candidate = buildCandidates(V61_SEED_ANNOUNCEMENTS, V61_SEED_PROFILE, V61_NOW).find(
    (c) => c.announcement.id === id,
  );
  if (!candidate) throw new Error(`seed 中缺少公告 ${id} 的候选结果`);
  return candidate;
}

describe("v6.1 匹配四档结果（seed 六场景）", () => {
  it("杭州：关键条件全部 PASS → 初步符合", () => {
    const { match } = candidateFor(V61_SCENARIO_IDS.eligible);
    expect(match.overall).toBe("preliminary_eligible");
    expect(match.dimensions.every((d) => d.value === "PASS")).toBe(true);
    expect(match.gates.every((g) => g.passed)).toBe(true);
  });

  it("宁波鄞州：缺户籍信息 → 补充信息后判断（UNKNOWN 不是 FAIL）", () => {
    const { match } = candidateFor(V61_SCENARIO_IDS.needHukou);
    expect(match.overall).toBe("need_more_info");
    const hukou = match.dimensions.find((d) => d.dimension === "hukou");
    expect(hukou?.value).toBe("UNKNOWN");
  });

  it("苏州：专业目录表述歧义 → 建议人工确认", () => {
    const { match } = candidateFor(V61_SCENARIO_IDS.majorAmbiguous);
    expect(match.overall).toBe("manual_review");
    const major = match.dimensions.find((d) => d.dimension === "major");
    expect(major?.value).toBe("MANUAL_REVIEW");
    // 歧义专业不得被自动判成不符合
    expect(major?.value).not.toBe("FAIL");
  });

  it("南京：硕士门槛 → 明确不符合", () => {
    const { match } = candidateFor(V61_SCENARIO_IDS.educationFail);
    expect(match.overall).toBe("not_eligible");
    const education = match.dimensions.find((d) => d.dimension === "education");
    expect(education?.value).toBe("FAIL");
    expect(match.summary).toContain("学历");
  });
});

describe("缺失信息永远不是不符合（回归）", () => {
  function requirementFor(dimension: Requirement["dimension"], criterion: Requirement["criterion"]): Requirement {
    return {
      id: `test-${dimension}`,
      dimension,
      description: "测试条件",
      hard: true,
      criterion,
      evidence: {
        id: `test-${dimension}-ev`,
        locator: { kind: "url", url: "https://example.gov.cn/test" },
        state: "official",
        checkedAt: V61_NOW,
      },
    };
  }

  it("未填出生日期：年龄条件只能 UNKNOWN，总结果不是明确不符合", () => {
    const req = requirementFor("age", { kind: "age", maxAgeYears: 30 });
    const result = evaluateRequirement(req, V61_SEED_PROFILE, V61_NOW);
    expect(result.value).toBe("UNKNOWN");

    const profile: UserRecruitmentProfile = { ...V61_SEED_PROFILE, birthDate: undefined };
    const announcement = findAnnouncement(V61_SCENARIO_IDS.eligible);
    const version: AnnouncementVersion = {
      ...announcement.versions[0],
      units: [
        {
          ...announcement.versions[0].units[0],
          requirements: [...announcement.versions[0].units[0].requirements, req],
        },
      ],
    };
    const match = evaluateOpportunity(
      { ...announcement, versions: [version] },
      version,
      version.units[0],
      profile,
      V61_NOW,
    );
    expect(match.overall).not.toBe("not_eligible");
    expect(match.overall).toBe("need_more_info");
  });

  it("未填社保/经历：对应条件均为 UNKNOWN", () => {
    // 画像未提供条件事实（区别于 seed 中明确填写的 socialSecurityMonths: 0）
    const profileWithoutFacts: UserRecruitmentProfile = {
      ...V61_SEED_PROFILE,
      socialSecurityMonths: undefined,
      workExperienceMonths: undefined,
    };

    const socialSecurity = evaluateRequirement(
      requirementFor("social_security", { kind: "social_security", requireNone: true }),
      profileWithoutFacts,
      V61_NOW,
    );
    expect(socialSecurity.value).toBe("UNKNOWN");

    const experience = evaluateRequirement(
      requirementFor("work_experience", { kind: "work_experience", minMonths: 12 }),
      profileWithoutFacts,
      V61_NOW,
    );
    expect(experience.value).toBe("UNKNOWN");
  });

  it("未填任何可接受地区：地区维度 UNKNOWN 而非 FAIL", () => {
    const profile: UserRecruitmentProfile = { ...V61_SEED_PROFILE, regions: [] };
    const results = evaluateAnnouncement(findAnnouncement(V61_SCENARIO_IDS.eligible), profile, V61_NOW);
    const region = results[0].dimensions.find((d) => d.dimension === "region");
    expect(region?.value).toBe("UNKNOWN");
    expect(results[0].overall).not.toBe("not_eligible");
  });

  it("未填教师资格情况（第 5 组暂不提供）：教师维度 UNKNOWN，不抛错也不判不符合", () => {
    const req = requirementFor("teacher_cert", {
      kind: "teacher_cert",
      subject: "chinese",
      stage: "middle",
      acceptInProgress: false,
    });
    const profileWithoutCert = {
      ...V61_SEED_PROFILE,
      teacherCert: undefined,
    } as unknown as UserRecruitmentProfile;
    const result = evaluateRequirement(req, profileWithoutCert, V61_NOW);
    expect(result.value).toBe("UNKNOWN");

    // 整体评估也不能因 teacherCert 缺省而抛 TypeError
    const match = evaluateOpportunity(
      findAnnouncement(V61_SCENARIO_IDS.eligible),
      findAnnouncement(V61_SCENARIO_IDS.eligible).versions[0],
      findAnnouncement(V61_SCENARIO_IDS.eligible).versions[0].units[0],
      profileWithoutCert,
      V61_NOW,
    );
    expect(match.overall).not.toBe("not_eligible");
  });
});

describe("有效推荐过滤", () => {
  it("已截止机会不进入有效推荐（温州），但匹配结果仍可查看", () => {
    const closed = candidateFor(V61_SCENARIO_IDS.closed);
    expect(closed.match.gates.find((g) => g.code === "registration_closed")?.passed).toBe(false);
    expect(isValidOpportunity(closed.match)).toBe(false);
    // 资格本身其实符合，被排除仅因为截止
    expect(closed.match.overall).toBe("preliminary_eligible");
  });

  it("明确不符合不进入有效推荐（南京）", () => {
    const failed = candidateFor(V61_SCENARIO_IDS.educationFail);
    expect(isValidOpportunity(failed.match)).toBe(false);
  });

  it("有效推荐只含：杭州、宁波、苏州、合肥当前版本", () => {
    const candidates = buildCandidates(V61_SEED_ANNOUNCEMENTS, V61_SEED_PROFILE, V61_NOW);
    const valid = filterValidOpportunities(candidates);
    const validIds = new Set(
      candidates.filter((c) => valid.some((v) => v.unitId === c.unit.id)).map((c) => c.announcement.id),
    );
    expect(validIds).toEqual(
      new Set([
        V61_SCENARIO_IDS.eligible,
        V61_SCENARIO_IDS.needHukou,
        V61_SCENARIO_IDS.majorAmbiguous,
        V61_SCENARIO_IDS.supplemented,
      ]),
    );
  });

  it("未填地区时不产生有效推荐（不铺全量）", () => {
    const profile: UserRecruitmentProfile = { ...V61_SEED_PROFILE, regions: [] };
    const candidates = buildCandidates(V61_SEED_ANNOUNCEMENTS, profile, V61_NOW);
    expect(filterValidOpportunities(candidates)).toHaveLength(0);
  });

  it("缺失维度分组：户籍组至少包含宁波机会", () => {
    const candidates = buildCandidates(V61_SEED_ANNOUNCEMENTS, V61_SEED_PROFILE, V61_NOW);
    const groups = groupByMissingDimension(candidates);
    const hukouGroup = groups.find((g) => g.dimension === "hukou");
    expect(hukouGroup).toBeDefined();
    expect(hukouGroup!.candidates.some((c) => c.announcement.id === V61_SCENARIO_IDS.needHukou)).toBe(true);
  });

  it("默认排序：确定程度优先，初步符合排在补充/人工确认之前", () => {
    const candidates = buildCandidates(V61_SEED_ANNOUNCEMENTS, V61_SEED_PROFILE, V61_NOW);
    const sorted = sortCandidates(
      candidates.filter((c) => isValidOpportunity(c.match)),
      V61_SEED_PROFILE,
    );
    const firstThree = sorted.slice(0, 3).map((c) => c.announcement.id);
    expect(firstThree).toContain(V61_SCENARIO_IDS.eligible);
    const eligibleIndex = firstThree.indexOf(V61_SCENARIO_IDS.eligible);
    const manualIndex = firstThree.indexOf(V61_SCENARIO_IDS.majorAmbiguous);
    if (manualIndex >= 0) expect(eligibleIndex).toBeLessThan(manualIndex);
  });
});

describe("单元字段完整性", () => {
  it("seed 中所有单元均为语文学科，且证据锚点已官方核对", () => {
    const units: ApplicationUnit[] = V61_SEED_ANNOUNCEMENTS.flatMap((a) =>
      a.versions.flatMap((v) => v.units),
    );
    expect(units.length).toBe(8); // 6 个单版本场景 + 合肥 v1/v2
    expect(units.every((u) => u.subject === "chinese")).toBe(true);
    for (const announcement of V61_SEED_ANNOUNCEMENTS) {
      for (const v of announcement.versions) {
        expect(v.officialSource.state).toBe("official");
      }
    }
  });
});

describe("高风险回归（模块 9）：无官方来源不得进入主要推荐", () => {
  it("官方来源未经人工核对（ai_extracted/pending_review）时 no_official_source 闸门失败，即使资格全过也不是有效机会", () => {
    const base = candidateFor(V61_SCENARIO_IDS.eligible);
    const unverifiedVersion: AnnouncementVersion = {
      ...base.version,
      officialSource: {
        ...base.version.officialSource,
        state: "ai_extracted",
      },
    };
    const match = evaluateOpportunity(
      base.announcement,
      unverifiedVersion,
      base.unit,
      V61_SEED_PROFILE,
      V61_NOW,
    );
    const gate = match.gates.find((g) => g.code === "no_official_source");
    expect(gate?.passed).toBe(false);
    expect(isValidOpportunity(match)).toBe(false);
  });

  it("官方来源为 url 但没有 URL 时闸门同样失败", () => {
    const base = candidateFor(V61_SCENARIO_IDS.eligible);
    const noUrlVersion: AnnouncementVersion = {
      ...base.version,
      officialSource: {
        ...base.version.officialSource,
        state: "official",
        locator: { kind: "url" } as AnnouncementVersion["officialSource"]["locator"],
      },
    };
    const match = evaluateOpportunity(
      base.announcement,
      noUrlVersion,
      base.unit,
      V61_SEED_PROFILE,
      V61_NOW,
    );
    expect(match.gates.find((g) => g.code === "no_official_source")?.passed).toBe(false);
    expect(isValidOpportunity(match)).toBe(false);
  });
});

describe("模块 5：source_unavailable 闸门（官方来源巡检不可用）", () => {
  it("嘉兴 seed：报名窗口名义开放，但 sourceHealth.ok=false 时闸门失败并带上原因与巡检时间", () => {
    const base = candidateFor(V61_SCENARIO_IDS.sourceUnavailable);
    const match = evaluateOpportunity(
      base.announcement,
      base.version,
      base.unit,
      V61_SEED_PROFILE,
      V61_NOW,
    );
    const gate = match.gates.find((g) => g.code === "source_unavailable");
    expect(gate?.passed).toBe(false);
    expect(gate?.reason).toContain("404");
    expect(gate?.reason).toContain("2026-10-04");
    expect(isValidOpportunity(match)).toBe(false);
  });

  it("sourceHealth.ok=true（健康）时不阻断推荐", () => {
    const base = candidateFor(V61_SCENARIO_IDS.eligible);
    const healthy: typeof base.announcement = {
      ...base.announcement,
      sourceHealth: { ok: true, checkedAt: "2026-10-04T09:00:00+08:00" },
    };
    const match = evaluateOpportunity(
      healthy,
      base.version,
      base.unit,
      V61_SEED_PROFILE,
      V61_NOW,
    );
    expect(match.gates.find((g) => g.code === "source_unavailable")?.passed).toBe(true);
  });
});
