import { describe, expect, it } from "vitest";
import { getRollingDemoAnnouncements } from "./demoTimeline";
import { safeOfficialLink } from "@/lib/links/official";

describe("演示数据的时间与来源", () => {
  it("示例日期随查看日期移动，过期场景仍保持过期", () => {
    const announcements = getRollingDemoAnnouncements(new Date("2026-10-07T04:00:00Z"));
    const hangzhou = announcements.find((item) => item.id === "ann-hangzhou")!;
    const wenzhou = announcements.find((item) => item.id === "ann-wenzhou")!;
    expect(hangzhou.versions[0].timeline.registrationEnd).toBe("2026-10-23");
    expect(wenzhou.versions[0].timeline.registrationEnd).toBe("2026-09-23");
  });

  it("虚构示例域名不可作为官方来源或报名入口点击", () => {
    expect(safeOfficialLink("https://www.hangzhou.example.gov.cn/edu/apply")).toBeNull();
    expect(safeOfficialLink("https://www.example-open.edu.cn/not-real")).toBeNull();
    expect(safeOfficialLink("https://www.hangzhou.gov.cn/")).toBe("https://www.hangzhou.gov.cn/");
  });
});
