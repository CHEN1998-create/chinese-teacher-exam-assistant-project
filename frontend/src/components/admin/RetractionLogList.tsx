"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/utils";
import { USER_ROLE_LABELS } from "@/types";
import { useRetractionLogs } from "@/lib/governance/useGovernance";

/** 错误结论撤回留痕（只追加）：原因、操作人、时间与影响范围 */
export function RetractionLogList() {
  const logs = useRetractionLogs();

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={<span className="text-4xl">🗂️</span>}
        title="还没有结论撤回记录"
        description="在审核队列详情中使用「撤回错误结论」后，撤回原因、影响范围与通知情况会只追加记录在这里"
      />
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((record) => (
        <RetractionCard key={record.id} record={record} />
      ))}
    </div>
  );
}

function RetractionCard({ record }: { record: ReturnType<typeof useRetractionLogs>[number] }) {
  const [open, setOpen] = useState(false);
  const { impact } = record;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            撤回「{record.fieldLabel}」结论
            <Badge variant="danger" className="ml-2">
              已撤回
            </Badge>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {record.operatorName}（{USER_ROLE_LABELS[record.operatorRole]}）·{" "}
            {formatDateTime(record.createdAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs text-slate-400 hover:text-slate-600"
        >
          {open ? "收起详情" : "展开详情"}
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
        <Stat label="受影响目标" value={impact.targetIds.length} />
        <Stat label="受影响用户" value={impact.userIds.length} />
        <Stat label="执行中计划" value={impact.planIds.length} />
        <Stat label="待重新确认任务" value={impact.taskIds.length} />
      </dl>

      <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
        <p>
          <span className="text-slate-400">撤回原因：</span>
          {record.reason}
        </p>
        <p>
          <span className="text-slate-400">被撤回的结论值：</span>
          {record.withdrawnValue || "（空值）"}
        </p>
        <p>
          <span className="text-slate-400">给用户的变化说明：</span>
          {record.userNotice}
        </p>
        {record.nextSteps.length > 0 && (
          <div>
            <span className="text-slate-400">建议用户下一步：</span>
            <ul className="mt-1 list-disc pl-5">
              {record.nextSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-slate-400">
          撤回记录 id：{record.id} · 同值结论 {impact.evidenceItemIds.length} 条一并置为待确认 ·
          实际送达通知 {record.notifiedUserIds.length} 位用户（其余被其通知偏好抑制）
        </p>
      </div>

      {open && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-500">
          <IdList title="受影响目标 id" ids={impact.targetIds} />
          <IdList title="受影响用户 id" ids={impact.userIds} />
          <IdList title="执行中计划 id" ids={impact.planIds} />
          <IdList title="待重新确认任务 id" ids={impact.taskIds} />
          <IdList title="撤回的证据条目 id" ids={impact.evidenceItemIds} />
          <IdList title="已通知用户 id" ids={record.notifiedUserIds} />
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 py-2">
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

function IdList({ title, ids }: { title: string; ids: string[] }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="font-medium text-slate-600">{title}</p>
      {ids.length === 0 ? (
        <p className="mt-0.5 text-slate-400">无</p>
      ) : (
        <ul className="mt-0.5 list-disc pl-4 break-all">
          {ids.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
