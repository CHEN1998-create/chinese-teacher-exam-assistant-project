import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@/lib/mock-data";
import type { GuestProfileSession } from "@/lib/guest/guestSession";
import {
  buildActiveProfile,
  normalizeSupplementFacts,
  supplementFactsService,
} from "./activeProfile";

function completeSession(
  draftOverrides: Partial<GuestProfileSession["draft"]> = {},
): GuestProfileSession {
  return {
    draft: {
      regions: [{ code: "330000", province: "浙江省", level: "required" }],
      educationLevel: "bachelor",
      degree: "bachelor",
      majorFullName: "汉语言文学（师范）",
      graduationDate: "2026-06-30",
      employmentStatus: "fresh_unemployed",
      teacherCert: { status: "obtained", subject: "chinese", stage: "middle" },
      acceptedEmploymentNatures: [
        "public_institution_staff",
        "record_filing",
        "post_quota",
        "headcount_control",
        "other",
      ],
      intendedSubject: "chinese",
      ...draftOverrides,
    },
    step: 5,
    createdAt: "2026-10-01T00:00:00+08:00",
    updatedAt: "2026-10-01T00:00:00+08:00",
    expiresAt: "2030-01-01T00:00:00+08:00",
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("buildActiveProfile", () => {
  it("没有访客草稿时 ready=false 且原因是 no_draft", () => {
    const result = buildActiveProfile();
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.reason).toBe("no_draft");
  });

  it("五组未完成时引导回 onboarding（incomplete）", () => {
    localStorage.setItem(
      STORAGE_KEYS.GUEST_PROFILE_V61,
      JSON.stringify(completeSession({ majorFullName: undefined })),
    );
    const result = buildActiveProfile();
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.reason).toBe("incomplete");
  });

  it("非开放学科草稿不参与匹配（subject_not_open）", () => {
    localStorage.setItem(
      STORAGE_KEYS.GUEST_PROFILE_V61,
      JSON.stringify(completeSession({ intendedSubject: "math" })),
    );
    const result = buildActiveProfile();
    expect(result.ready).toBe(false);
    if (!result.ready) expect(result.reason).toBe("subject_not_open");
  });

  it("完整草稿：条件画像字段缺省为 undefined（缺信息绝不判不符合）", () => {
    localStorage.setItem(
      STORAGE_KEYS.GUEST_PROFILE_V61,
      JSON.stringify(completeSession()),
    );
    const result = buildActiveProfile();
    if (!result.ready) throw new Error("应当 ready");
    expect(result.profile.educationLevel).toBe("bachelor");
    expect(result.profile.majorFullName).toBe("汉语言文学（师范）");
    expect(result.profile.birthDate).toBeUndefined();
    expect(result.profile.hukouRegionCode).toBeUndefined();
    expect(result.profile.socialSecurityMonths).toBeUndefined();
    expect(result.profile.workExperienceMonths).toBeUndefined();
  });

  it("补充户籍市级代码与出生日期后合并进画像（市级优先于省级）", () => {
    localStorage.setItem(
      STORAGE_KEYS.GUEST_PROFILE_V61,
      JSON.stringify(completeSession()),
    );
    supplementFactsService.save({
      birthDate: "1998-01-01",
      hukouProvinceCode: "330000",
      hukouCityCode: "330200",
    });
    const result = buildActiveProfile();
    if (!result.ready) throw new Error("应当 ready");
    expect(result.profile.hukouRegionCode).toBe("330200");
    expect(result.profile.birthDate).toBe("1998-01-01");
  });

  it("无市级户籍时使用省级代码", () => {
    localStorage.setItem(
      STORAGE_KEYS.GUEST_PROFILE_V61,
      JSON.stringify(completeSession()),
    );
    const result = buildActiveProfile({ hukouProvinceCode: "330000" });
    if (!result.ready) throw new Error("应当 ready");
    expect(result.profile.hukouRegionCode).toBe("330000");
  });
});

describe("normalizeSupplementFacts：脏数据不进匹配", () => {
  it("非法月数与空白日期被剔除；0 个月月数保留；空 extra 答案剔除", () => {
    const facts = normalizeSupplementFacts({
      birthDate: "   ",
      socialSecurityMonths: "abc",
      workExperienceMonths: 0,
      extraAnswers: { keep: "有效答复", drop: "   " },
    });
    expect(facts.birthDate).toBeUndefined();
    expect(facts.socialSecurityMonths).toBeUndefined();
    expect(facts.workExperienceMonths).toBe(0);
    expect(facts.extraAnswers).toEqual({ keep: "有效答复" });
  });

  it("数字字符串月数可被规整为数字", () => {
    const facts = normalizeSupplementFacts({ socialSecurityMonths: "12" });
    expect(facts.socialSecurityMonths).toBe(12);
  });
});
