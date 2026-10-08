import { describe, expect, it } from "vitest";
import {
  assignRole,
  canTransition,
  createFollow,
  hasNewerVersion,
  transitionFollow,
} from "@/lib/opportunities/domain";
import type { FollowedOpportunity } from "@/lib/opportunities/types";

describe("关注状态流转", () => {
  it("沿允许路径流转并只追加历史", () => {
    let follow = createFollow({
      id: "f1",
      userId: "u1",
      unitId: "unit-1",
      announcementId: "ann-1",
      versionId: "ann-1-v1",
      at: "2026-10-04T12:00:00+08:00",
    });
    expect(follow.status).toBe("considering");
    expect(follow.statusHistory).toHaveLength(1);

    follow = transitionFollow(follow, "preparing", "2026-10-05T09:00:00+08:00");
    expect(follow.status).toBe("preparing");
    expect(follow.statusHistory).toHaveLength(2);

    follow = transitionFollow(follow, "registered", "2026-10-10T09:00:00+08:00");
    expect(follow.status).toBe("registered");
    expect(canTransition("registered", "closed")).toBe(true);
  });

  it("已结束是终态，不能回到在报状态", () => {
    let follow: FollowedOpportunity = createFollow({
      id: "f2",
      userId: "u1",
      unitId: "unit-2",
      announcementId: "ann-2",
      versionId: "ann-2-v1",
      at: "2026-10-04T12:00:00+08:00",
    });
    follow = transitionFollow(follow, "closed", "2026-12-01T00:00:00+08:00");
    expect(follow.status).toBe("closed");
    expect(() => transitionFollow(follow, "preparing", "2026-12-02T00:00:00+08:00")).toThrow();
  });

  it("放弃后允许重新考虑；非法跳变（considering→registered）抛错", () => {
    let follow = createFollow({
      id: "f3",
      userId: "u1",
      unitId: "unit-3",
      announcementId: "ann-3",
      versionId: "ann-3-v1",
      at: "2026-10-04T12:00:00+08:00",
    });
    expect(() => transitionFollow(follow, "registered", "2026-10-05T00:00:00+08:00")).toThrow();
    follow = transitionFollow(follow, "abandoned", "2026-10-05T00:00:00+08:00", "时间冲突");
    expect(follow.status).toBe("abandoned");
    follow = transitionFollow(follow, "considering", "2026-10-06T00:00:00+08:00");
    expect(follow.status).toBe("considering");
  });

  it("流转不修改原对象", () => {
    const follow = createFollow({
      id: "f4",
      userId: "u1",
      unitId: "unit-4",
      announcementId: "ann-4",
      versionId: "ann-4-v1",
      at: "2026-10-04T12:00:00+08:00",
    });
    transitionFollow(follow, "preparing", "2026-10-05T00:00:00+08:00");
    expect(follow.status).toBe("considering");
    expect(follow.statusHistory).toHaveLength(1);
  });
});

describe("备考目标角色", () => {
  it("同一时间只有一个主要目标：新 primary 使旧 primary 降为 backup", () => {
    let follows: FollowedOpportunity[] = [
      { ...createFollow({ id: "f1", userId: "u1", unitId: "u1", announcementId: "a1", versionId: "a1-v1", at: "t" }), role: "primary" },
      createFollow({ id: "f2", userId: "u1", unitId: "u2", announcementId: "a2", versionId: "a2-v1", at: "t" }),
    ];
    follows = assignRole(follows, "f2", "primary");
    expect(follows.find((f) => f.id === "f1")?.role).toBe("backup");
    expect(follows.find((f) => f.id === "f2")?.role).toBe("primary");
  });
});

describe("版本更新提示", () => {
  it("关注记录指向旧版本时检测到更新，但不覆盖 versionId", () => {
    const follow = createFollow({
      id: "f5",
      userId: "u1",
      unitId: "u5",
      announcementId: "a5",
      versionId: "a5-v1",
      at: "t",
    });
    expect(hasNewerVersion(follow, "a5-v2")).toBe(true);
    expect(hasNewerVersion(follow, "a5-v1")).toBe(false);
    expect(follow.versionId).toBe("a5-v1");
  });
});
