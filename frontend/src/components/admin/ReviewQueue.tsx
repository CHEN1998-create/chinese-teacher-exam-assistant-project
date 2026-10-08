"use client";

import { useState } from "react";
import { ReviewStatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatDateTime } from "@/lib/utils";
import { EVIDENCE_TYPE_LABELS, REVIEW_QUEUE_LABELS, ReviewQueueKey } from "@/types";
import { useReviewQueue } from "@/lib/admin/useAdminReviews";
import { AdminQueueEntry } from "@/lib/admin/domain";

const QUEUE_TABS: ReviewQueueKey[] = [
  "pending",
  "high_risk",
  "conflict",
  "expiring",
  "completed",
];

const EMPTY_HINTS: Record<ReviewQueueKey, { icon: string; title: string; desc: string }> = {
  pending: {
    icon: "📭",
    title: "没有待审核结论",
    desc: "用户提交公告并完成 AI 提取后，高影响字段会自动进入这里",
  },
  high_risk: {
    icon: "✅",
    title: "没有高风险待办",
    desc: "高影响字段冲突、临期报名/考试时间等会优先排在这里",
  },
  conflict: {
    icon: "🤝",
    title: "没有来源冲突",
    desc: "不同来源给出不一致结论时会在此提示，冲突不会被静默覆盖",
  },
  expiring: {
    icon: "📅",
    title: "没有临期事项",
    desc: "报名/考试时间在未来 45 天内的结论会在此提醒",
  },
  completed: {
    icon: "🗂️",
    title: "还没有已完成的审核",
    desc: "通过、驳回、标记待确认/冲突的结论都会留存在这里",
  },
};

interface ReviewQueueProps {
  /** 仅展示某一目标（考情管理页跳入时携带） */
  targetId?: string;
  selectedId: string | null;
  onSelect: (entry: AdminQueueEntry) => void;
}

/** 审核队列：五个视图标签（带计数）+ 结论卡片列表 */
export function ReviewQueue({ targetId, selectedId, onSelect }: ReviewQueueProps) {
  const [view, setView] = useState<ReviewQueueKey>("pending");
  const { entries, counts } = useReviewQueue(view, targetId);
  const hint = EMPTY_HINTS[view];

  return (
    <div>
      {/* 队列标签：文字 + 计数，不仅靠颜色 */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4 overflow-x-auto">
        {QUEUE_TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={cn(
              "px-3.5 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors",
              view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            {REVIEW_QUEUE_LABELS[key]}
            <span
              className={cn(
                "ml-1.5 inline-flex min-w-5 justify-center rounded-full px-1.5 text-xs",
                view === key ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
              )}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={<span className="text-4xl">{hint.icon}</span>} title={hint.title} description={hint.desc} />
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => (
            <QueueCard
              key={entry.item.id}
              entry={entry}
              selected={entry.item.id === selectedId}
              onClick={() => onSelect(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueCard({
  entry,
  selected,
  onClick,
}: {
  entry: AdminQueueEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const { item, target } = entry;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border bg-white p-3.5 transition-all",
        selected
          ? "border-blue-400 ring-2 ring-blue-100"
          : entry.conflict
            ? "border-red-200 hover:border-red-300"
            : entry.highImpact && entry.open
              ? "border-amber-200 hover:border-amber-300"
              : "border-slate-200 hover:border-slate-300"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{EVIDENCE_TYPE_LABELS[item.field]}</span>
            {entry.highImpact && (
              <span className="px-1.5 py-px rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                高影响
              </span>
            )}
            {entry.conflict && (
              <span className="px-1.5 py-px rounded bg-red-100 text-red-700 text-[10px] font-medium">
                来源冲突
              </span>
            )}
            {entry.expiring && (
              <span className="px-1.5 py-px rounded bg-cyan-100 text-cyan-700 text-[10px] font-medium">
                即将过期
              </span>
            )}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900 line-clamp-2 whitespace-pre-line">
            {item.value || "（结论值为空）"}
          </p>
        </div>
        <ReviewStatusBadge status={item.reviewStatus} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span className="truncate max-w-[220px]">目标：{target?.name ?? "未知目标"}</span>
        <span className="truncate max-w-[180px]">来源：{item.sourceName || "未知来源"}</span>
        <span>更新：{formatDateTime(item.updatedAt)}</span>
      </div>
    </button>
  );
}
