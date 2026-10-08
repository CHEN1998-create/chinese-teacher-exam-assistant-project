/**
 * 高风险回归（模块 9）：已截止机会在任何展示层都不得呈现为“正在报名”。
 */
import { describe, expect, it } from "vitest";
import { deadlineText } from "./labels";
import { nextAction, type NextAction } from "@/lib/opportunities/detail-view";
import type { GateDTO, UnitMatchDTO } from "@/lib/opportunities/api-types";

const NOW = "2026-10-05T12:00:00+08:00";

describe("已截止不得显示正在报名（回归）", () => {
  it("deadlineText：截止日之后 closed=true，文案含“已截止”，不含“还剩/正在报名”", () => {
    const t = deadlineText("2026-09-30", NOW);
    expect(t.closed).toBe(true);
    expect(t.text).toContain("已截止");
    expect(t.text).not.toContain("还剩");
    expect(t.text).not.toContain("正在报名");
  });

  it("deadlineText：报名中文案明确为“截止，还剩 N 天/今天截止”，closed=false", () => {
    const open = deadlineText("2026-10-20", NOW);
    expect(open.closed).toBe(false);
    expect(open.text).toContain("还剩");
    const today = deadlineText("2026-10-05", NOW);
    expect(today.closed).toBe(false);
    expect(today.text).toContain("今天截止");
  });

  it("deadlineText：官方未公布报名时间时不得臆造日期，文案为待官方通知、daysLeft=null", () => {
    const t = deadlineText(undefined, NOW);
    expect(t.unconfirmed).toBe(true);
    expect(t.closed).toBe(false);
    expect(t.daysLeft).toBeNull();
    expect(t.text).toContain("待官方通知");
    expect(t.text).not.toContain("还剩");
    expect(t.text).not.toMatch(/\d{1,2}月\d{1,2}日/);
  });

  it("nextAction：只要有失败闸门（含已截止），唯一主行动是查看官方公告，不出现报名/准备行动", () => {
    const closedGate: GateDTO = {
      code: "registration_closed",
      passed: false,
      reason: "报名已于 2026-09-30 截止",
    };
    const unit = {
      gates: [closedGate],
      overall: "preliminary_eligible",
      follow: { status: "preparing" },
      unit: { registerUrl: "https://register.example.gov.cn/apply" },
      announcement: { officialUrl: "https://gov.example.cn/a/2026-001" },
    } as unknown as UnitMatchDTO;

    const action: NextAction = nextAction(unit);
    expect(action.kind).toBe("official");
    expect(action.label).toContain("已截止");
    expect(["register", "prepare", "waiting"]).not.toContain(action.kind);
  });
});
