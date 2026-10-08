"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  EDUCATION_LEVEL_LABELS,
  SUBJECT_LABELS,
  TARGET_LIFECYCLE_LABELS,
} from "@/types";
import { useReviewTargetGroups } from "@/lib/admin/useAdminReviews";

/** 考情管理：全部用户目标的证据状态总览（只读聚合 + 跳转审核） */
export function AdminExamList() {
  const groups = useReviewTargetGroups();

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<span className="text-4xl">📭</span>}
        title="还没有可管理的目标考试"
        description="用户在用户端创建目标并提交公告后，考情会自动汇总到这里"
      />
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(({ target, totals, conflictCount, pendingHighImpactCount }) => (
        <Card key={target.id}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{target.name}</span>
                <Badge variant="muted">{TARGET_LIFECYCLE_LABELS[target.status]}</Badge>
                {pendingHighImpactCount > 0 && (
                  <Badge variant="warning">{pendingHighImpactCount} 个高影响待审核</Badge>
                )}
                {conflictCount > 0 && <Badge variant="danger">{conflictCount} 个来源冲突</Badge>}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {[
                  target.region,
                  target.educationLevel ? EDUCATION_LEVEL_LABELS[target.educationLevel] : null,
                  SUBJECT_LABELS[target.subject],
                  target.year ? `${target.year}年` : null,
                  target.batch,
                ]
                  .filter(Boolean)
                  .join(" · ") || "适用范围待确认"}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <Stat label="官方确认" value={totals.official} tone="text-emerald-700" />
                <Stat label="待审核" value={totals.pending_review} tone="text-amber-700" />
                <Stat label="AI已提取" value={totals.ai_extracted} tone="text-blue-700" />
                <Stat
                  label="历史/个人"
                  value={totals.historical + totals.personal}
                  tone="text-cyan-700"
                />
                <Stat label="待确认" value={totals.unconfirmed} tone="text-slate-600" />
              </div>
            </div>
            <div className="shrink-0">
              <Link href={`/admin/reviews?target=${target.id}`}>
                <Button size="sm" variant={pendingHighImpactCount > 0 ? "primary" : "outline"}>
                  去审核
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={tone}>
      <span className="font-semibold">{value}</span> {label}
    </span>
  );
}
