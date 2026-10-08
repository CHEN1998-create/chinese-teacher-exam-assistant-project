import { describe, expect, it } from "vitest";
import type { MatchResponse, UnitMatchDTO } from "./api-types";
import type { UserRecruitmentProfile } from "@/lib/profile/types";
import {
  buildListViewModel,
  formatEvaluatedAt,
  listCardNextStepLabel,
} from "./list-view";

function makeUnit(
  unitId: string,
  overall: UnitMatchDTO["overall"],
  extra: Partial<UnitMatchDTO> = {},
): UnitMatchDTO {
  return {
    unit: {
      id: unitId,
      code: unitId,
      name: unitId,
      region: { code: "330100", province: "浙江省", city: "杭州市" },
      stage: "middle",
      headcount: 1,
      organizationType: "government_unified",
      employmentNature: {
        code: "public_institution_staff",
        officialName: "事业编制工作人员",
      },
      allocation: { code: "direct_school", description: "" },
    },
    announcement: {
      id: `ann-${unitId}`,
      title: unitId,
      publisher: "教育局",
      organizationType: "government_unified",
      officialUrl: "https://example.gov.cn/a",
      dataset: "demo",
      reviewStatus: "human_reviewed",
      reviewedBy: null,
      reviewedAt: null,
    },
    version: {
      id: `ann-${unitId}-v1`,
      versionNumber: 1,
      sourceKind: "original",
      publishedAt: "2026-09-28T09:00:00+08:00",
      timeline: {
        registrationStart: "2026-10-01",
        registrationEnd: "2026-10-20",
      },
      officialSource: {
        id: "src",
        locator: { kind: "url", url: "https://example.gov.cn/a" },
        state: "official",
        checkedAt: "2026-10-04T12:00:00+08:00",
      },
    },
    gates: [
      { code: "subject_not_open", passed: true, reason: "" },
      { code: "registration_closed", passed: true, reason: "" },
      { code: "out_of_scope_nature", passed: true, reason: "" },
      { code: "announcement_withdrawn", passed: true, reason: "" },
      { code: "no_official_source", passed: true, reason: "" },
    ],
    dimensions: [],
    overall,
    summary: "",
    follow: null,
    ...extra,
  };
}

function makeResponse(
  units: Record<string, UnitMatchDTO>,
  primaryTargetUnitId: string | null = null,
): MatchResponse {
  return {
    meta: {
      ruleVersion: "kb-match-rules-1.1.0",
      majorAliasVersion: "kb-major-aliases-1.0.0",
      catalogVersion: "kb-opportunity-catalog-1.0.0",
      realCatalogVersion: "kb-real-catalog-1.0.0",
      evaluatedAt: "2026-10-05T10:00:00+08:00",
    },
    coverage: {
      version: "kb-monitoring-coverage-1.0.0",
      subject: "chinese",
      subjectLabel: "语文",
      status: "monitoring_no_open",
      regions: [],
      lastCheckedAt: "2026-10-06T11:30:00+08:00",
      openOpportunityCount: 0,
      nextWindowNote: "",
      scopeNote: "暂未收录不代表当地无招聘。",
    },
    primaryTargetUnitId,
    groups: {
      preliminary: [units.hangzhou!, units.hefei!].filter(Boolean),
      needInfo: units.yinzhou
        ? [
            {
              dimension: "hukou",
              count: 1,
              units: [units.yinzhou],
            },
          ]
        : [],
      manualReview: units.suzhou ? [units.suzhou] : [],
      notEligible: units.nanjing ? [units.nanjing] : [],
      closed: units.wenzhou ? [units.wenzhou] : [],
    },
    follows: [],
  };
}

describe("buildListViewModel：四类结果的列表叙事", () => {
  it("六场景分组正确：杭州/合肥初步符合、鄞州待补户籍、苏州人工确认、南京不符合、温州已截止", () => {
    const closedWenzhou = makeUnit("unit-wenzhou-01", "preliminary_eligible", {
      gates: [
        { code: "subject_not_open", passed: true, reason: "" },
        {
          code: "registration_closed",
          passed: false,
          reason: "报名已于 2026-09-20 截止",
        },
        { code: "out_of_scope_nature", passed: true, reason: "" },
        { code: "announcement_withdrawn", passed: true, reason: "" },
        { code: "no_official_source", passed: true, reason: "" },
      ],
    });
    const response = makeResponse({
      hangzhou: makeUnit("unit-hangzhou-01", "preliminary_eligible"),
      hefei: makeUnit("unit-hefei-01-v2", "preliminary_eligible"),
      yinzhou: makeUnit("unit-yinzhou-01", "need_more_info"),
      suzhou: makeUnit("unit-suzhou-01", "manual_review"),
      nanjing: makeUnit("unit-nanjing-01", "not_eligible"),
      wenzhou: closedWenzhou,
    });

    const view = buildListViewModel(response);
    expect(view.priority?.unit.id).toBe("unit-hangzhou-01");
    expect(view.otherPreliminary.map((u) => u.unit.id)).toEqual([
      "unit-hefei-01-v2",
    ]);
    expect(view.needInfoGroups[0]?.dimension).toBe("hukou");
    expect(view.needInfoGroups[0]?.units[0]?.unit.id).toBe(
      "unit-yinzhou-01",
    );
    expect(view.manualReview.map((u) => u.unit.id)).toEqual(["unit-suzhou-01"]);
    expect(view.notEligible.map((u) => u.unit.id)).toEqual(["unit-nanjing-01"]);
    expect(view.closed.map((u) => u.unit.id)).toEqual(["unit-wenzhou-01"]);
    expect(view.validCount).toBe(4);
    expect(view.excludedCount).toBe(2);
    expect(view.conclusion).toContain("2 个初步符合");
    expect(view.conclusion).toContain("1 个待补充信息");
    expect(view.conclusion).toContain("1 个建议人工确认");
  });

  it("主要备考目标是初步符合之一时，它成为第一屏优先机会", () => {
    const response = makeResponse(
      {
        hangzhou: makeUnit("unit-hangzhou-01", "preliminary_eligible"),
        hefei: makeUnit("unit-hefei-01-v2", "preliminary_eligible"),
      },
      "unit-hefei-01-v2",
    );
    const view = buildListViewModel(response);
    expect(view.priority?.unit.id).toBe("unit-hefei-01-v2");
    expect(view.otherPreliminary.map((u) => u.unit.id)).toEqual([
      "unit-hangzhou-01",
    ]);
  });

  it("无初步符合但有待补充时，结论引导补信息且没有优先卡", () => {
    const response = makeResponse({
      yinzhou: makeUnit("unit-yinzhou-01", "need_more_info"),
    });
    const view = buildListViewModel(response);
    expect(view.priority).toBeNull();
    expect(view.otherPreliminary).toHaveLength(0);
    expect(view.conclusion).toContain("补充 1 个机会");
  });

  it("已截止机会不计入有效机会数", () => {
    const response = makeResponse({
      wenzhou: makeUnit("unit-wenzhou-01", "preliminary_eligible", {
        gates: [
          { code: "subject_not_open", passed: true, reason: "" },
          {
            code: "registration_closed",
            passed: false,
            reason: "已截止",
          },
          { code: "out_of_scope_nature", passed: true, reason: "" },
          { code: "announcement_withdrawn", passed: true, reason: "" },
          { code: "no_official_source", passed: true, reason: "" },
        ],
      }),
    });
    const view = buildListViewModel(response);
    expect(view.validCount).toBe(0);
    expect(view.closed).toHaveLength(1);
  });

  it("评估时间格式化为月日时分", () => {
    const text = formatEvaluatedAt("2026-10-05T10:00:00+08:00");
    expect(text).toContain("10月5日");
    expect(text).toMatch(/\d{2}:\d{2}/);
  });

  it("真实监测记录被合规过滤：不进 closed、不进 realMonitored，不计有效机会（模块 7.5）", () => {
    const real = makeUnit("real-yz-2026-chinese-01", "preliminary_eligible", {
      announcement: {
        id: "real-yinzhou-2026-autumn",
        title: "鄞州区公开招聘事业编制教师公告",
        publisher: "宁波市鄞州区教育局",
        organizationType: "government_unified",
        officialUrl: "https://www.nbyz.gov.cn/x",
        dataset: "real",
        reviewStatus: "ai_reviewed_pending",
        reviewedBy: null,
        reviewedAt: null,
      },
      version: {
        id: "real-yinzhou-2026-autumn-v1",
        versionNumber: 1,
        sourceKind: "original",
        publishedAt: "2026-07-31T00:00:00+08:00",
        timeline: {
          pendingItems: ["具体报名时间另行通知"],
        },
        officialSource: {
          id: "src",
          locator: { kind: "url", url: "https://www.nbyz.gov.cn/x" },
          state: "ai_extracted",
          checkedAt: "2026-10-06T11:30:00+08:00",
        },
      },
      gates: [
        {
          code: "registration_unconfirmed",
          passed: false,
          reason: "官方尚未公布具体报名时间，以官方后续通知为准",
        },
        { code: "registration_closed", passed: true, reason: "" },
        { code: "out_of_scope_nature", passed: true, reason: "" },
        { code: "announcement_withdrawn", passed: true, reason: "" },
        {
          code: "evidence_not_reviewed",
          passed: false,
          reason: "高影响字段尚未经人工复核",
        },
      ],
    });
    const demoClosed = makeUnit(
      "unit-wenzhou-01",
      "preliminary_eligible",
      {
        gates: [
          { code: "subject_not_open", passed: true, reason: "" },
          { code: "registration_closed", passed: false, reason: "已截止" },
          { code: "out_of_scope_nature", passed: true, reason: "" },
          { code: "announcement_withdrawn", passed: true, reason: "" },
          { code: "no_official_source", passed: true, reason: "" },
        ],
      },
    );
    const response = makeResponse({} as never);
    response.groups.closed = [real, demoClosed];

    const view = buildListViewModel(response);
    // 模块 7.5：用户端不显示 AI 初核待人工复核记录（real）。
    // list-view 把 real 从 closed 拆出后丢弃，realMonitored 永远为空。
    expect(view.realMonitored).toEqual([]);
    expect(view.closed.map((u) => u.unit.id)).toEqual(["unit-wenzhou-01"]);
    expect(view.validCount).toBe(0);
    expect(view.coverage.openOpportunityCount).toBe(0);
  });
});

describe("buildListViewModel：模块 5 异常态与地区分流", () => {
  function profileWith(regions: UserRecruitmentProfile["regions"]) {
    return { regions } as UserRecruitmentProfile;
  }

  it("仅地区维度 FAIL 的单元进入 regionOutOfScope，不留在明确不符合（缺信息不算不符合）", () => {
    const regionOnly = makeUnit("unit-guangzhou-01", "not_eligible", {
      dimensions: [
        {
          requirementId: "req-region",
          dimension: "region",
          value: "FAIL",
          reason: "岗位在广东，画像未选广东",
          hard: true,
        },
      ],
    });
    const hardFail = makeUnit("unit-nanjing-01", "not_eligible", {
      dimensions: [
        {
          requirementId: "req-edu",
          dimension: "education",
          value: "FAIL",
          reason: "要求硕士",
          hard: true,
        },
        {
          requirementId: "req-region",
          dimension: "region",
          value: "FAIL",
          reason: "地区也不匹配",
          hard: true,
        },
      ],
    });
    const response = makeResponse({} as never);
    response.groups.notEligible = [regionOnly, hardFail];

    const view = buildListViewModel(response);
    expect(view.regionOutOfScope.map((u) => u.unit.id)).toEqual([
      "unit-guangzhou-01",
    ]);
    expect(view.notEligible.map((u) => u.unit.id)).toEqual(["unit-nanjing-01"]);
  });

  it("暂未收录：画像省级地区无任何岗位/监测覆盖时给出提示，但不产生任何不符合结论", () => {
    const response = makeResponse({
      hangzhou: makeUnit("unit-hangzhou-01", "preliminary_eligible"),
    });
    const view = buildListViewModel(
      response,
      profileWith([
        { code: "330000", province: "浙江省", level: "required" },
        { code: "440000", province: "广东省", level: "consider" },
      ]),
    );
    expect(view.uncoveredRegions).toEqual([
      { code: "440000", label: "广东省" },
    ]);
  });

  it("四档全空且 closed 也为空时 emptyResult=true；有留档记录时不算空结果", () => {
    const empty = makeResponse({} as never);
    expect(buildListViewModel(empty).emptyResult).toBe(true);

    const withClosed = makeResponse({} as never);
    withClosed.groups.closed = [
      makeUnit("unit-wenzhou-01", "preliminary_eligible", {
        gates: [
          { code: "subject_not_open", passed: true, reason: "" },
          { code: "registration_closed", passed: false, reason: "已截止" },
          { code: "out_of_scope_nature", passed: true, reason: "" },
          { code: "announcement_withdrawn", passed: true, reason: "" },
          { code: "no_official_source", passed: true, reason: "" },
        ],
      }),
    ];
    expect(buildListViewModel(withClosed).emptyResult).toBe(false);
  });

  it("closedBuckets：截止进 expired 桶，来源失效进 source 桶", () => {
    const expired = makeUnit("unit-wenzhou-01", "preliminary_eligible", {
      gates: [
        { code: "subject_not_open", passed: true, reason: "" },
        { code: "registration_closed", passed: false, reason: "已截止" },
        { code: "out_of_scope_nature", passed: true, reason: "" },
        { code: "announcement_withdrawn", passed: true, reason: "" },
        { code: "no_official_source", passed: true, reason: "" },
      ],
    });
    const sourceLost = makeUnit("unit-jiaxing-01", "preliminary_eligible", {
      gates: [
        { code: "subject_not_open", passed: true, reason: "" },
        { code: "registration_closed", passed: true, reason: "" },
        { code: "out_of_scope_nature", passed: true, reason: "" },
        { code: "announcement_withdrawn", passed: true, reason: "" },
        {
          code: "source_unavailable",
          passed: false,
          reason: "官方来源最近巡检不可用（404）",
        },
        { code: "no_official_source", passed: true, reason: "" },
      ],
    });
    const response = makeResponse({} as never);
    response.groups.closed = [expired, sourceLost];
    const view = buildListViewModel(response);
    const keys = view.closedBuckets.map((b) => b.key);
    expect(keys).toContain("expired");
    expect(keys).toContain("source");
    expect(
      view.closedBuckets.find((b) => b.key === "source")?.units[0]?.unit.id,
    ).toBe("unit-jiaxing-01");
  });

  it("listCardNextStepLabel：四档与闸门态各给一个下一步文案", () => {
    expect(
      listCardNextStepLabel(makeUnit("u1", "preliminary_eligible")),
    ).toBe("查看依据并关注");
    expect(listCardNextStepLabel(makeUnit("u2", "need_more_info"))).toBe(
      "查看要补充的信息",
    );
    expect(listCardNextStepLabel(makeUnit("u3", "manual_review"))).toBe(
      "查看确认要点",
    );
    expect(listCardNextStepLabel(makeUnit("u4", "not_eligible"))).toBe(
      "查看不符合原因",
    );
    const closed = makeUnit("u5", "preliminary_eligible", {
      gates: [
        { code: "subject_not_open", passed: true, reason: "" },
        { code: "registration_closed", passed: false, reason: "已截止" },
        { code: "out_of_scope_nature", passed: true, reason: "" },
        { code: "announcement_withdrawn", passed: true, reason: "" },
        { code: "no_official_source", passed: true, reason: "" },
      ],
    });
    expect(listCardNextStepLabel(closed)).toContain("公告");
  });
});
