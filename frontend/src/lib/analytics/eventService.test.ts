/**
 * 分析事件写入测试：seed/live 分离、访客暂存与登录归属、去重。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@/lib/mock-data";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import { authService } from "@/lib/auth";
import type { AnalyticsEvent } from "./types";
import {
  listEvents,
  reseedEvents,
  track,
  trackOncePerUser,
  trackView,
} from "./eventService";

const pending = () =>
  loadFromStorage<Array<Omit<AnalyticsEvent, "userId" | "userRole" | "source">>>(
    STORAGE_KEYS.GUEST_ANALYTICS_PENDING,
    [],
  );

async function loginStudent(): Promise<void> {
  await authService.login({
    account: "student@demo.app",
    password: "demo1234",
  });
}

describe("分析事件：seed/live 分离与访客迁移", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // 以“清空后的事件流”为起点，避免与其他测试的播种状态串扰
    saveToStorage(STORAGE_KEYS.ANALYTICS_EVENTS, []);
  });

  it("未登录事件进入访客暂存队列，登录后归属为真实账号的 live 事件", async () => {
    track("opportunity_followed", "opportunity", { targetId: "unit-1" });
    expect(pending()).toHaveLength(1);
    expect(listEvents().filter((e) => e.type === "opportunity_followed")).toHaveLength(0);

    await loginStudent();

    expect(pending()).toHaveLength(0);
    const mine = listEvents().filter((e) => e.type === "opportunity_followed");
    expect(mine).toHaveLength(1);
    expect(mine[0].source).toBe("live");
    expect(mine[0].userId).toBe("u-001");
  });

  it("种子事件一律 source=seed，真实事件一律 source=live，二者不混淆", () => {
    reseedEvents();
    const seeded = listEvents();
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every((e) => e.source === "seed")).toBe(true);
    // 访客事件还未归属，不能污染 seed 统计
    track("profile_completed", "profile", { props: { stepCount: 5 } });
    expect(listEvents().every((e) => e.source === "seed")).toBe(true);
  });

  it("trackOncePerUser：同一用户画像完成只记一次（访客阶段+登录后不重复）", async () => {
    trackOncePerUser("profile_completed", "profile");
    trackOncePerUser("profile_completed", "profile");
    expect(pending().filter((e) => e.type === "profile_completed")).toHaveLength(1);

    await loginStudent();
    trackOncePerUser("profile_completed", "profile");
    const mine = listEvents().filter((e) => e.type === "profile_completed");
    expect(mine).toHaveLength(1);
    expect(mine[0].userId).toBe("u-001");
  });

  it("trackView：同一会话内同一对象只记一次", () => {
    trackView("unit-9", "match_basis_viewed", "opportunity", { targetId: "unit-9" });
    trackView("unit-9", "match_basis_viewed", "opportunity", { targetId: "unit-9" });
    expect(pending().filter((e) => e.type === "match_basis_viewed")).toHaveLength(1);
  });
});
