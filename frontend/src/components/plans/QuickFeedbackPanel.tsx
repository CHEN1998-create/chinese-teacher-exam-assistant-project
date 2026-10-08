"use client";

import { useState } from "react";
import { PlanTask, TaskFeedback, IncompleteReason, INCOMPLETE_REASON_LABELS } from "@/types";
import { feedbackService, DuplicateFeedbackError } from "@/lib/plans/feedbackService";
import { resolveFeedbackConflict } from "@/lib/plans/feedbackConflict";

interface QuickFeedbackPanelProps {
  task: PlanTask;
  /** 提交成功后回调，页面就地展示下一步 */
  onSubmitted: (status: TaskFeedback["status"]) => void;
  /** 唯一追加问题（明天能学多久）的回答：更新可用时间，影响后续安排 */
  onAvailableTimeChange?: (minutes: number) => void;
}

type Stage = "choose" | "reason" | "time_followup";

/**
 * 一分钟点选式快速反馈（v5.2）：
 * - 三个主操作：我做完了 / 做了一部分 / 今天没做；
 * - 「做完了」一次点击即提交；其余两种可选一个原因，也可「跳过原因，直接保存」；
 * - 只在原因是“时间不够”时补问唯一一个真正影响调整的问题（明天能学多久）；
 * - 保存失败时保留已选状态，可直接重试；重复提交由 service 层拦截兜底。
 */
export function QuickFeedbackPanel({ task, onSubmitted, onAvailableTimeChange }: QuickFeedbackPanelProps) {
  const [pendingStatus, setPendingStatus] = useState<"partial" | "not_completed" | null>(null);
  const [stage, setStage] = useState<Stage>("choose");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (
    status: TaskFeedback["status"],
    incompleteReason?: IncompleteReason
  ): void => {
    setSaving(true);
    setError(null);
    const input = {
      status,
      actualTime: status === "completed" ? task.estimatedTime : undefined,
      incompleteReason,
      errorTypes: [],
      hasSecondPractice: false,
    };
    try {
      const result = feedbackService.submit(task.id, input);
      onSubmitted(result.status);
    } catch (e) {
      if (e instanceof DuplicateFeedbackError) {
        // 纯函数消解：同一反馈重复提交忽略（防版本增殖）；结论确实改变才修改已有反馈
        const resolved = resolveFeedbackConflict(e.existing, { status, incompleteReason, input });
        if (resolved.action === "ignore") {
          return;
        }
        const updated = feedbackService.update(resolved.feedbackId, resolved.input);
        onSubmitted(updated.status);
      } else {
        // 保存失败：保留当前选择，可点重试
        setError(e instanceof Error ? `保存失败：${e.message}` : "保存失败，请重试");
      }
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPendingStatus(null);
    setStage("choose");
  };

  const pickReason = (reason: IncompleteReason) => {
    // 唯一追加问题：时间不够 → 问明天能学多久；其余原因直接保存
    if (reason === "time") {
      setStage("time_followup");
    } else {
      submit(pendingStatus!, reason);
    }
  };

  const reasonStep = (
    <div className="mt-3">
      <p className="text-xs text-ink-muted mb-2">可以选一个最接近的原因，也可以跳过（选完即保存）</p>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(INCOMPLETE_REASON_LABELS) as [IncompleteReason, string][]).map(
          ([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={saving}
              onClick={() => pickReason(key)}
              className="px-3 py-2 rounded-lg border border-line text-sm text-ink hover:border-blue-400 hover:bg-brand-soft transition-colors disabled:opacity-50"
            >
              {label}
            </button>
          )
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={reset}
          className="text-xs text-ink-muted hover:text-ink-muted"
        >
          返回重新选择
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => submit(pendingStatus!)}
          className="text-xs text-brand hover:underline disabled:opacity-50"
        >
          跳过原因，直接保存
        </button>
      </div>
    </div>
  );

  const timeFollowupStep = (
    <div className="mt-3">
      <p className="text-xs text-ink-muted mb-2">
        明天大约能学多久？（只问这一个，用来安排明天的任务总时长）
      </p>
      <div className="flex flex-wrap gap-2">
        {[30, 45, 60].map((m) => (
          <button
            key={m}
            type="button"
            disabled={saving}
            onClick={() => {
              onAvailableTimeChange?.(m);
              submit(pendingStatus!, "time");
            }}
            className="px-3 py-2 rounded-lg border border-line text-sm text-ink hover:border-blue-400 hover:bg-brand-soft transition-colors disabled:opacity-50"
          >
            {m} 分钟
          </button>
        ))}
        <button
          type="button"
          disabled={saving}
          onClick={() => submit(pendingStatus!, "time")}
          className="px-3 py-2 rounded-lg text-sm text-ink-muted hover:text-ink-muted disabled:opacity-50"
        >
          不确定
        </button>
      </div>
      <button
        type="button"
        onClick={() => setStage("reason")}
        className="mt-2 text-xs text-ink-muted hover:text-ink-muted"
      >
        返回
      </button>
    </div>
  );

  return (
    <div>
      {stage === "choose" && (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => submit("completed")}
            className="h-11 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            我做完了
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setPendingStatus("partial");
              setStage("reason");
            }}
            className="h-11 rounded-xl bg-warn text-white text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            做了一部分
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setPendingStatus("not_completed");
              setStage("reason");
            }}
            className="h-11 rounded-xl border border-line text-ink text-sm font-medium hover:bg-canvas transition-colors disabled:opacity-50"
          >
            今天没做
          </button>
        </div>
      )}

      {stage === "reason" && pendingStatus && reasonStep}
      {stage === "time_followup" && pendingStatus && timeFollowupStep}

      {error && (
        <div role="alert" className="mt-3 p-3 rounded-lg bg-danger-soft border border-danger/30">
          <p className="text-sm text-danger">{error}</p>
          <p className="text-xs text-danger mt-1">
            你的选择已保留，检查存储后
            <button
              type="button"
              className="underline ml-1"
              onClick={() =>
                pendingStatus ? submit(pendingStatus) : submit("completed")
              }
            >
              点击重试
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
