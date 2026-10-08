/**
 * 重复反馈冲突消解测试（模块 7，逻辑抽取自 QuickFeedbackPanel）：
 * 同一反馈重复提交不增殖计划版本；结论确实改变才修改已有反馈。
 */
import { describe, expect, it } from "vitest";
import type { TaskFeedback } from "@/types";
import { resolveFeedbackConflict } from "./feedbackConflict";

function makeFeedback(overrides: Partial<TaskFeedback> = {}): TaskFeedback {
  return {
    id: "fb-1",
    taskId: "task-1",
    userId: "user-1",
    weeklyPlanId: "wp-1",
    weeklyVersion: 1,
    dailyPlanId: "dp-1",
    date: "2026-10-05",
    status: "partial",
    actualTime: 20,
    incompleteReason: "time",
    errorTypes: [],
    hasSecondPractice: false,
    createdAt: "2026-10-05T08:00:00.000Z",
    updatedAt: "2026-10-05T08:00:00.000Z",
    ...overrides,
  };
}

describe("resolveFeedbackConflict", () => {
  it("同状态同原因重复提交：忽略，不触发重排（防版本增殖）", () => {
    const existing = makeFeedback({ status: "partial", incompleteReason: "time" });
    const result = resolveFeedbackConflict(existing, {
      status: "partial",
      incompleteReason: "time",
      input: { status: "partial", incompleteReason: "time", errorTypes: [], hasSecondPractice: false },
    });
    expect(result).toEqual({ action: "ignore" });
  });

  it("completed 反馈重复提交（无原因）：同样忽略", () => {
    const existing = makeFeedback({ status: "completed", incompleteReason: undefined });
    const result = resolveFeedbackConflict(existing, {
      status: "completed",
      incompleteReason: undefined,
      input: { status: "completed", errorTypes: [], hasSecondPractice: false },
    });
    expect(result).toEqual({ action: "ignore" });
  });

  it("结论改变（部分完成 → 做完了）：修改已有反馈而非新建", () => {
    const existing = makeFeedback({ id: "fb-1", status: "partial" });
    const input = { status: "completed" as const, errorTypes: [], hasSecondPractice: false };
    const result = resolveFeedbackConflict(existing, { status: "completed", input });
    expect(result).toEqual({ action: "update", feedbackId: "fb-1", input });
  });

  it("同状态但原因改变：也走修改", () => {
    const existing = makeFeedback({ status: "not_completed", incompleteReason: "time" });
    const input = {
      status: "not_completed" as const,
      incompleteReason: "difficulty" as const,
      errorTypes: [],
      hasSecondPractice: false,
    };
    const result = resolveFeedbackConflict(existing, {
      status: "not_completed",
      incompleteReason: "difficulty",
      input,
    });
    expect(result).toEqual({ action: "update", feedbackId: "fb-1", input });
  });
});
