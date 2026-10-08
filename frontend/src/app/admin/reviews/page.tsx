"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { ReviewQueue } from "@/components/admin/ReviewQueue";
import { ReviewDetail } from "@/components/admin/ReviewDetail";
import { useRecentReviewLogs, useReviewTargetGroups } from "@/lib/admin/useAdminReviews";
import { EVIDENCE_TYPE_LABELS, REVIEW_ACTION_LABELS, USER_ROLE_LABELS } from "@/types";
import { formatDateTime } from "@/lib/utils";
import type { AdminQueueEntry } from "@/lib/admin/domain";

function ReviewsInner() {
  const searchParams = useSearchParams();
  const targetId = searchParams.get("target");
  const groups = useReviewTargetGroups();
  const targetName = targetId
    ? groups.find((g) => g.target.id === targetId)?.target.name ?? targetId
    : null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const logs = useRecentReviewLogs(15);

  const handleSelect = (entry: AdminQueueEntry) => setSelectedId(entry.item.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">考情审核队列</h1>
        <p className="text-sm text-slate-500 mt-1">
          核对 AI 提取的高影响字段与来源冲突，审核结果同步到用户端证据卡
        </p>
      </div>

      {/* Mock 边界提示 */}
      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
        <p className="text-xs leading-relaxed text-amber-800">
          ⚠️ 非生产实现：队列、权限与留痕均为浏览器本地 Mock。报名时间、考试日期、科目、分值、
          资格条件五类高影响字段必须人工审核；来源冲突不会被静默覆盖；每次操作都会记录审核人、
          时间、原因、修改前后内容与版本。
        </p>
      </div>

      {/* 目标筛选（由考情管理页跳入） */}
      {targetId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5">
          <p className="text-sm text-blue-800">
            仅显示目标「{targetName}」的考情结论
          </p>
          <Link href="/admin/reviews" className="text-xs font-medium text-blue-600 hover:underline">
            清除筛选，查看全部队列
          </Link>
        </div>
      )}

      {/* 主从布局：左队列 / 右详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-5 lg:sticky lg:top-4">
          <ReviewQueue targetId={targetId ?? undefined} selectedId={selectedId} onSelect={handleSelect} />
        </div>
        <div className="lg:col-span-7 min-w-0">
          <ReviewDetail
            key={selectedId ?? "none"}
            itemId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </div>
      </div>

      {/* 最近审核记录：所有操作留痕，管理员可审计 */}
      <Card>
        <p className="text-sm font-semibold text-slate-800 mb-2">最近审核记录（操作留痕）</p>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400">还没有审核操作记录。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((log) => (
              <li key={log.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-medium text-slate-800">{REVIEW_ACTION_LABELS[log.action]}</span>
                <span className="text-slate-500">{EVIDENCE_TYPE_LABELS[log.field]}</span>
                <span className="text-slate-400">
                  {log.reviewerName}（{USER_ROLE_LABELS[log.reviewerRole]}）
                </span>
                <span className="text-slate-400">{formatDateTime(log.reviewedAt)}</span>
                <span className="text-slate-500 truncate max-w-[420px]">原因：{log.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function AdminReviewsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">加载审核队列…</p>}>
      <ReviewsInner />
    </Suspense>
  );
}
