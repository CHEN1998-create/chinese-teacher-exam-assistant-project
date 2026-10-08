/**
 * 重复反馈冲突的纯函数消解（模块 7 抽取自 QuickFeedbackPanel，便于独立测试）。
 *
 * 规则：
 * - 同一反馈重复进入（快速连点/跨渲染重复点击）：忽略，不再触发重排，防止计划版本增殖；
 * - 反馈结论确实改变（如 做了一部分 → 做完了）：修改已有反馈，而不是新建。
 */
import type { IncompleteReason, TaskFeedback, TaskFeedbackInput } from "@/types";

export type FeedbackConflictResult =
  | { action: "ignore" }
  | { action: "update"; feedbackId: string; input: TaskFeedbackInput };

export function resolveFeedbackConflict(
  existing: TaskFeedback,
  next: {
    status: TaskFeedback["status"];
    incompleteReason?: IncompleteReason;
    input: TaskFeedbackInput;
  },
): FeedbackConflictResult {
  const reason = next.status === "completed" ? undefined : next.incompleteReason;
  const sameStatus = existing.status === next.status;
  const sameReason = (existing.incompleteReason ?? undefined) === (reason ?? undefined);
  if (sameStatus && sameReason) {
    return { action: "ignore" };
  }
  return { action: "update", feedbackId: existing.id, input: next.input };
}
