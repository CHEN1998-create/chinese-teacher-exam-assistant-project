/**
 * 模块 4：五组画像「暂不确定 / 暂不提供」机制纯函数测试。
 * 不变量：跳过只放宽采集门禁，不伪造画像事实；引擎侧缺字段只能 UNKNOWN。
 */
import { describe, expect, it } from "vitest";
import {
  buildProfileLimitations,
  draftToProfile,
  isStepComplete,
  isStepSkipped,
  pruneSkippedSteps,
  stepHasContent,
  type GuestProfileDraft,
} from "./guestSession";

function partialDraft(overrides: Partial<GuestProfileDraft> = {}): GuestProfileDraft {
  return {
    regions: [],
    acceptedEmploymentNatures: [
      "public_institution_staff",
      "record_filing",
      "post_quota",
      "headcount_control",
      "other",
    ],
    ...overrides,
  };
}

describe("跳过门禁：isStepComplete / isStepSkipped", () => {
  it("未跳过且内容为空：任一步骤都不算完成", () => {
    const draft = partialDraft();
    for (let step = 1; step <= 5; step += 1) {
      expect(isStepComplete(draft, step)).toBe(false);
    }
  });

  it("步骤在 skippedSteps 中：该步放行可继续，其余空步骤仍拦截", () => {
    const draft = partialDraft({ skippedSteps: [3] });
    expect(isStepSkipped(draft, 3)).toBe(true);
    expect(isStepComplete(draft, 3)).toBe(true);
    expect(isStepComplete(draft, 1)).toBe(false);
    expect(isStepComplete(draft, 2)).toBe(false);
  });

  it("五组全部标为跳过：isDraftComplete 等价放行（draftToProfile 非 null）", () => {
    const draft = partialDraft({ skippedSteps: [1, 2, 3, 4, 5] });
    for (let step = 1; step <= 5; step += 1) {
      expect(isStepComplete(draft, step)).toBe(true);
    }
    // 未选意向学科 + 第 5 步跳过：按当前唯一开放的语文处理
    expect(draftToProfile(draft)).not.toBeNull();
  });
});

describe("pruneSkippedSteps：补填内容自动取消跳过", () => {
  it("已跳过的步骤一旦填入实质内容，跳过标记自动移除", () => {
    const draft = partialDraft({
      skippedSteps: [1, 3],
      regions: [{ code: "330000", province: "浙江省", level: "required" }],
      majorFullName: "汉语言文学",
    });
    const pruned = pruneSkippedSteps(draft);
    expect(pruned.skippedSteps ?? []).toEqual([]);
  });

  it("仍空缺的跳过标记保留；越界与重复步骤号被清理", () => {
    const draft = partialDraft({ skippedSteps: [2, 2, 9, 0] });
    const pruned = pruneSkippedSteps(draft);
    expect(pruned.skippedSteps).toEqual([2]);
  });

  it("没有可规整内容时返回原引用（避免无意义渲染）", () => {
    const draft = partialDraft({ skippedSteps: [1, 2] });
    expect(pruneSkippedSteps(draft)).toBe(draft);
  });
});

describe("stepHasContent：只认真实内容，不认跳过标记", () => {
  it("第 5 步选了证书状态才算有内容；只勾用工形式不算", () => {
    expect(
      stepHasContent(partialDraft({ teacherCert: { status: "obtained" } }), 5),
    ).toBe(true);
    expect(stepHasContent(partialDraft(), 5)).toBe(false);
  });
});

describe("buildProfileLimitations：以实际缺失为准", () => {
  it("完整画像没有限制项", () => {
    const draft = partialDraft({
      regions: [{ code: "330000", province: "浙江省", level: "required" }],
      educationLevel: "bachelor",
      degree: "bachelor",
      majorFullName: "汉语言文学",
      graduationDate: "2026-06-15",
      employmentStatus: "fresh_unemployed",
      teacherCert: { status: "obtained", subject: "chinese", stage: "middle" },
    });
    expect(buildProfileLimitations(draft)).toEqual([]);
  });

  it("跳过专业与教资：限制列表只含这两项且文案明确「不是不符合」", () => {
    const draft = partialDraft({
      skippedSteps: [3, 5],
      regions: [{ code: "330000", province: "浙江省", level: "required" }],
      educationLevel: "bachelor",
      degree: "bachelor",
      graduationDate: "2026-06-15",
      employmentStatus: "fresh_unemployed",
    });
    const limitations = buildProfileLimitations(draft);
    expect(limitations.map((l) => l.step)).toEqual([3, 5]);
    const major = limitations.find((l) => l.step === 3)!;
    expect(major.impact).toContain("补充信息后判断");
    expect(major.impact).toContain("不会被当作「专业不符」");
  });

  it("跳过标记还在但字段已补填：限制自动消失（与 prune 同一口径）", () => {
    const draft = partialDraft({
      skippedSteps: [3],
      majorFullName: "汉语言文学",
    });
    // buildProfileLimitations 只看实际字段
    expect(buildProfileLimitations(draft).some((l) => l.step === 3)).toBe(false);
  });
});

describe("draftToProfile：跳过不伪造事实", () => {
  it("跳过第 5 步且未选学科：按语文生成画像，teacherCert 留空", () => {
    const draft = partialDraft({
      regions: [{ code: "330000", province: "浙江省", level: "required" }],
      educationLevel: "bachelor",
      degree: "bachelor",
      majorFullName: "汉语言文学",
      graduationDate: "2026-06-15",
      employmentStatus: "fresh_unemployed",
      skippedSteps: [5],
    });
    const profile = draftToProfile(draft);
    expect(profile).not.toBeNull();
    expect(profile!.teacherCert).toBeUndefined();
    expect(profile!.majorFullName).toBe("汉语言文学");
  });

  it("主动选了非语文学科：画像完整时仍然分流为 null（不跑匹配）", () => {
    const draft = partialDraft({
      regions: [{ code: "330000", province: "浙江省", level: "required" }],
      educationLevel: "bachelor",
      degree: "bachelor",
      majorFullName: "数学与应用数学",
      graduationDate: "2026-06-15",
      employmentStatus: "fresh_unemployed",
      teacherCert: { status: "obtained", subject: "math", stage: "middle" },
      intendedSubject: "math",
    });
    expect(draftToProfile(draft)).toBeNull();
  });
});
