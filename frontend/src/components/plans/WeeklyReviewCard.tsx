"use client";

import { WeeklyReview, TASK_ADJUSTMENT_ACTION_LABELS } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { formatTime } from "@/lib/utils";

/** 第 7 天周复盘展示（数据全部来自用户真实提交的执行反馈） */
export function WeeklyReviewCard({ review }: { review: WeeklyReview }) {
  const completionRate =
    review.totalTasks > 0 ? Math.round((review.completedTasks / review.totalTasks) * 100) : 0;

  return (
    <div className="mt-4 space-y-4">
      {/* 核心统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-emerald-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-emerald-700">
            {review.completedDays}/{review.daysWithTasks}
          </p>
          <p className="text-xs text-emerald-600">完成天数</p>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-blue-700">
            {review.completedTasks}/{review.totalTasks}
          </p>
          <p className="text-xs text-blue-600">任务完成（{completionRate}%）</p>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg text-center">
          <p className="text-lg font-bold text-purple-700 leading-8">
            {formatTime(review.plannedMinutes)} → {formatTime(review.actualMinutes)}
          </p>
          <p className="text-xs text-purple-600">预计 → 实际用时</p>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-slate-700">{review.adjustmentCount}</p>
          <p className="text-xs text-slate-600">调整次数</p>
        </div>
      </div>

      {/* 任务状态明细 */}
      <p className="text-sm text-slate-600">
        任务明细：完成 {review.completedTasks} · 部分完成 {review.partialTasks} · 未完成{" "}
        {review.notCompletedTasks}
        {review.noFeedbackTasks > 0 && ` · 未提交反馈 ${review.noFeedbackTasks}`}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 主要中断原因 */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">主要中断原因</h4>
          {review.interruptionReasons.length === 0 ? (
            <p className="text-sm text-slate-400">无（没有未完成记录）</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {review.interruptionReasons.map((s) => (
                <span
                  key={s.key}
                  className="px-2.5 py-1 bg-rose-50 text-rose-700 text-sm rounded border border-rose-200"
                >
                  {s.label} × {s.count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 高频错因 */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">高频错因</h4>
          {review.errorCategories.length === 0 ? (
            <p className="text-sm text-slate-400">无错因记录</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {review.errorCategories.map((s) => (
                <span
                  key={s.key}
                  className="px-2.5 py-1 bg-amber-50 text-amber-700 text-sm rounded border border-amber-200"
                >
                  {s.label} × {s.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 使用过的资料和资源 */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-2">使用过的资料和资源</h4>
        {review.usedSources.length === 0 ? (
          <p className="text-sm text-slate-400">本周没有已执行的任务</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {review.usedSources.map((s) => (
              <span
                key={s.id}
                className="px-2.5 py-1 bg-slate-50 text-slate-700 text-sm rounded border border-slate-200"
              >
                <Badge variant={s.type === "resource" ? "info" : "muted"}>
                  {s.type === "resource" ? "资源" : "资料"}
                </Badge>{" "}
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 调整效果 */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-2">
          哪些调整有效
          {review.adjustmentCount === 0 && (
            <span className="text-slate-400 font-normal">（本周没有调整过安排）</span>
          )}
        </h4>
        {review.adjustmentOutcomes.length > 0 && (
          <div className="space-y-2">
            {review.adjustmentOutcomes.map((o) => (
              <div key={o.adjustmentId} className="flex items-start gap-2 text-sm">
                <Badge variant={o.outcome === "effective" ? "success" : "muted"}>
                  {o.outcome === "effective" ? "有效" : "待观察"}
                </Badge>
                <span className="text-slate-400 shrink-0">
                  {TASK_ADJUSTMENT_ACTION_LABELS[o.action]}
                </span>
                <span className="text-slate-600">
                  {o.note}
                  <span className="text-slate-400"> — {o.reason}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 下一周建议 */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-2">下一周建议</h4>
        <ul className="space-y-1.5">
          {review.suggestions.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="text-blue-500 mt-0.5">→</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">{review.dataNote}</p>
    </div>
  );
}
