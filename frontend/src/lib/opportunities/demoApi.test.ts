import { beforeEach, describe, expect, it } from "vitest";
import { authService } from "@/lib/auth";
import { V61_SEED_PROFILE } from "@/lib/seed/v61-opportunities";
import { demoOpportunitiesApi } from "./demoApi";
import { demoScheduleApi } from "@/lib/schedule/demoApi";
import { clearAllStorage } from "@/lib/storage";

describe("公开演示的本地机会闭环", () => {
  beforeEach(async () => {
    localStorage.clear();
    await authService.login({ account: "student@demo.app", password: "demo1234" });
  });

  it("匹配、关注、推进和设目标无需后端，刷新后仍能读取", async () => {
    const matched = await demoOpportunitiesApi.match(V61_SEED_PROFILE);
    const unit = matched.groups.preliminary[0]?.unit;
    expect(unit).toBeDefined();
    expect(matched.coverage.openOpportunityCount).toBe(0);

    const followed = await demoOpportunitiesApi.follow(unit!.id);
    expect(followed.status).toBe("considering");
    const preparing = await demoOpportunitiesApi.transition(unit!.id, "preparing", {
      version: followed.version,
    });
    expect(preparing.status).toBe("preparing");
    await demoOpportunitiesApi.setRole(unit!.id, "primary");

    expect((await demoOpportunitiesApi.listFollows())[0]?.status).toBe("preparing");
    expect((await demoOpportunitiesApi.getGoals()).primaryTargetUnitId).toBe(unit!.id);
    expect((await demoOpportunitiesApi.unitDetail(unit!.id, V61_SEED_PROFILE)).unit.follow?.role)
      .toBe("primary");
  });

  it("关注后能在演示日程中看到对应示例节点", async () => {
    await demoOpportunitiesApi.follow("unit-hangzhou-01");
    const schedule = await demoScheduleApi.getSchedule();
    expect(schedule.events.some((event) => event.unitId === "unit-hangzhou-01")).toBe(true);
    await demoOpportunitiesApi.setRemindersMuted("unit-hangzhou-01", true);
    expect((await demoScheduleApi.getSchedule()).mutedUnitIds).toContain("unit-hangzhou-01");
  });

  it("重置演示数据会清除新机会存储", async () => {
    await demoOpportunitiesApi.follow("unit-hangzhou-01");
    expect(Object.keys(localStorage).some((key) => key.startsWith("kb_demo_opportunities_v1_"))).toBe(true);
    clearAllStorage();
    expect(Object.keys(localStorage).some((key) => key.startsWith("kb_demo_opportunities_v1_"))).toBe(false);
  });
});
