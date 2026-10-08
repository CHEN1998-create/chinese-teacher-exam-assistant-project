import { describe, expect, it } from "vitest";
import {
  appendVersion,
  currentVersion,
  isRegistrationOpen,
  linkSupplement,
  withdrawAnnouncement,
} from "@/lib/announcements/domain";
import type { NewVersionDraft } from "@/lib/announcements/domain";
import type {
  AnnouncementVersion,
  ApplicationUnit,
  RecruitmentAnnouncement,
} from "@/lib/announcements/types";
import { V61_NOW, V61_SCENARIO_IDS, V61_SEED_ANNOUNCEMENTS } from "@/lib/seed/v61-opportunities";

function findAnnouncement(id: string): RecruitmentAnnouncement {
  const found = V61_SEED_ANNOUNCEMENTS.find((a) => a.id === id);
  if (!found) throw new Error(`seed 中缺少公告 ${id}`);
  return found;
}

describe("公告版本只追加模型", () => {
  it("补充公告产生 v2：v1 仍在链上、内容不被覆盖，仅被标记 superseded", () => {
    const hefei = findAnnouncement(V61_SCENARIO_IDS.supplemented);
    const [v1, v2] = hefei.versions;

    expect(hefei.versions).toHaveLength(2);
    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
    expect(v2.sourceKind).toBe("supplement");
    expect(v2.changeNote ?? "").toContain("报名截止时间延至");

    // 旧版本业务内容原样保留
    expect(v1.units[0].headcount).toBe(5);
    expect(v1.timeline.registrationEnd).toBe("2026-10-12");
    expect(v1.supersededAt).toBeDefined();
    expect(v2.supersededAt).toBeUndefined();

    // 当前版本是 v2，新时间线与扩招生效
    expect(currentVersion(hefei).id).toBe(v2.id);
    expect(currentVersion(hefei).units[0].headcount).toBe(8);
    expect(currentVersion(hefei).timeline.registrationEnd).toBe("2026-11-15");

    // v1 仍可查看：开放判断基于各自版本快照时间线，v1 已被取代不影响 v2 在报
    expect(isRegistrationOpen(v2, V61_NOW)).toBe(true);
    expect(v1.timeline.registrationEnd).not.toBe(v2.timeline.registrationEnd);
    // v1 快照里保留的是它自己的报名窗口，不被 v2 覆盖
    expect(v1.timeline.registrationStart).toBe("2026-09-25");
  });

  it("appendVersion 不修改入参，旧版本对象本身不被写入 supersededAt", () => {
    const hangzhou = findAnnouncement(V61_SCENARIO_IDS.eligible);
    const originalV1 = hangzhou.versions[0];
    const oldUnits: ApplicationUnit[] = originalV1.units;

    const extendedUnits: ApplicationUnit[] = [
      { ...oldUnits[0], id: "unit-hangzhou-01-v2", versionId: "ann-hangzhou-v2", headcount: 16 },
    ];
    const draft: NewVersionDraft = {
      sourceKind: "supplement",
      publishedAt: "2026-10-06T09:00:00+08:00",
      officialSource: {
        ...originalV1.officialSource,
        id: "ann-hangzhou-v2-src",
        excerpt: "补充公告：扩招",
      },
      timeline: {
        ...originalV1.timeline,
        registrationEnd: "2026-10-30",
      },
      units: extendedUnits,
      changeNote: "补充公告：扩招至 16 人，报名延期",
      fingerprint: "fp-changed",
    };

    const result = appendVersion(hangzhou, draft, V61_NOW);

    expect(result.deduplicated).toBe(false);
    expect(result.version.versionNumber).toBe(2);
    expect(result.announcement.versions).toHaveLength(2);

    // 入参完全未变（旧 v1 引用上没有 supersededAt，人数仍是 12）
    expect(hangzhou.versions).toHaveLength(1);
    expect(originalV1.supersededAt).toBeUndefined();
    expect(originalV1.units[0].headcount).toBe(12);
    expect(originalV1.timeline.registrationEnd).toBe("2026-10-20");

    // 新链中的 v1 是带 supersededAt 的副本，业务字段不变
    const v1Copy = result.announcement.versions[0];
    expect(v1Copy.id).toBe(originalV1.id);
    expect(v1Copy.supersededAt).toBe(V61_NOW);
    expect(v1Copy.units[0].headcount).toBe(12);
    expect(v1Copy.timeline.registrationEnd).toBe("2026-10-20");

    // 新单元 versionId 指向 v2
    expect(result.version.units[0].versionId).toBe("ann-hangzhou-v2");
  });

  it("相同指纹不增殖新版本（去重）", () => {
    const hangzhou = findAnnouncement(V61_SCENARIO_IDS.eligible);
    const v1: AnnouncementVersion = hangzhou.versions[0];

    const first = appendVersion(
      hangzhou,
      {
        sourceKind: "supplement",
        publishedAt: "2026-10-06T09:00:00+08:00",
        officialSource: { ...v1.officialSource, id: "new-src-1" },
        timeline: { ...v1.timeline, registrationEnd: "2026-10-30" },
        units: v1.units,
        changeNote: "延期",
        fingerprint: "fp-A",
      },
      V61_NOW,
    );
    expect(first.deduplicated).toBe(false);

    // 同一指纹再次追加 → 返回上一版本，不新增
    const second = appendVersion(
      first.announcement,
      {
        sourceKind: "supplement",
        publishedAt: "2026-10-07T09:00:00+08:00",
        officialSource: { ...v1.officialSource, id: "new-src-2" },
        timeline: { ...v1.timeline, registrationEnd: "2026-10-30" },
        units: first.version.units,
        changeNote: "延期",
        fingerprint: "fp-A",
      },
      V61_NOW,
    );
    expect(second.deduplicated).toBe(true);
    expect(second.version.id).toBe(first.version.id);
    expect(second.announcement.versions).toHaveLength(2);
  });

  it("撤回是公告级事件，不删除任何版本", () => {
    const hefei = findAnnouncement(V61_SCENARIO_IDS.supplemented);
    const withdrawn = withdrawAnnouncement(hefei);
    expect(withdrawn.lifecycle).toBe("withdrawn");
    expect(withdrawn.versions).toHaveLength(2);
    // 幂等
    expect(withdrawAnnouncement(withdrawn)).toBe(withdrawn);
  });

  it("补充公告关联不能指向自身", () => {
    const hefei = findAnnouncement(V61_SCENARIO_IDS.supplemented);
    expect(() => linkSupplement(hefei, hefei.id)).toThrow();
    const linked = linkSupplement(hefei, "ann-original-x");
    expect(linked.supplementOfAnnouncementId).toBe("ann-original-x");
  });
});
