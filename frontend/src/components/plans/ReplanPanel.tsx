"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { planService, replanService } from "@/lib/services";
import { usePlans } from "@/lib/plans/usePlans";
import {
  PlanTask,
  ReplanTrigger,
  TaskAdjustment,
  TaskAdjustmentAction,
  WeeklyPlan,
  REPLAN_TRIGGER_LABELS,
  TASK_ADJUSTMENT_ACTION_LABELS,
} from "@/types";
import { formatDateWithWeekday, formatTime } from "@/lib/utils";

const ACTION_VARIANT: Record<TaskAdjustmentAction, "success" | "warning" | "info" | "primary" | "danger"> = {
  keep: "info",
  reduce: "warning",
  postpone: "primary",
  replace: "success",
  abandon: "danger",
};

function TaskBrief({ task }: { task: PlanTask | null }) {
  if (!task) {
    return <span className="text-sm text-ink-muted">已移出计划（不安排）</span>;
  }
  return (
    <span className="text-sm text-ink">
      {task.title}
      <span className="text-ink-muted"> · {formatTime(task.estimatedTime)}</span>
      {task.chapterTitle && <span className="text-ink-muted"> · {task.chapterTitle}</span>}
    </span>
  );
}

/** 单条调整的前后对比卡片 */
function AdjustmentRow({ adjustment }: { adjustment: TaskAdjustment }) {
  const a = adjustment;
  const moved = a.toDate !== a.date;
  return (
    <div className="p-3 rounded-lg border border-line bg-surface space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={ACTION_VARIANT[a.action]}>{TASK_ADJUSTMENT_ACTION_LABELS[a.action]}</Badge>
        <span className="text-xs text-ink-muted">
          {formatDateWithWeekday(a.date)}
          {moved && <span className="text-brand"> → 顺延至 {formatDateWithWeekday(a.toDate)}</span>}
          {a.after?.needsConfirmation && (
            <Badge variant="warning">待重新确认</Badge>
          )}
        </span>
      </div>

      <div className="grid gap-1.5 md:grid-cols-2">
        <div className="p-2 rounded bg-canvas">
          <p className="text-xs text-ink-muted mb-0.5">调整前</p>
          <TaskBrief task={a.before} />
        </div>
        <div className={`p-2 rounded ${a.after ? "bg-brand-soft" : "bg-rose-50"}`}>
          <p className="text-xs text-ink-muted mb-0.5">调整后</p>
          <TaskBrief task={a.after} />
        </div>
      </div>

      <p className="text-sm text-ink-muted">
        <span className="text-ink-muted">调整原因：</span>
        {a.reason}
      </p>
      {a.refs.length > 0 && (
        <p className="text-xs text-ink-muted">依据：{a.refs.map((r) => r.label).join("；")}</p>
      )}
    </div>
  );
}

interface ReplanPanelProps {
  targetId: string;
  activePlan: WeeklyPlan;
}

/**
 * 动态计划重排面板：
 * - 检测并展示重排触发信号（时间变化/未完成/重复错因/资料不适合/第4天/考情变化）；
 * - 生成重排草稿（新版本）并展示每项调整的前后对比；
 * - 确认后新版本生效（旧版本保留为历史）；也可放弃草稿。
 */
export function ReplanPanel({ targetId, activePlan }: ReplanPanelProps) {
  const { versions } = usePlans(targetId);
  const [open, setOpen] = useState(false);
  const [triggers, setTriggers] = useState<ReplanTrigger[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showActiveAdjustments, setShowActiveAdjustments] = useState(false);

  const draft: WeeklyPlan | null =
    versions.find((v) => v.status === "draft" && v.previousVersionId === activePlan.id) ?? null;
  const draftAdjustments = draft ? replanService.listAdjustments(draft.id) : [];
  const activeAdjustments = replanService.listAdjustments(activePlan.id);

  const handleAnalyze = (): void => {
    setError(null);
    try {
      setTriggers(replanService.analyze(targetId));
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    }
  };

  const handleCreateDraft = (): void => {
    setBusy(true);
    setError(null);
    try {
      replanService.createReplanDraft(targetId);
      setOpen(false);
      setTriggers(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成重排草稿失败");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = (): void => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      planService.confirmPlan(draft.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认失败");
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = (): void => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      replanService.discardReplanDraft(draft.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "放弃草稿失败");
    } finally {
      setBusy(false);
    }
  };

  // 有重排草稿：展示调整对比 + 确认/放弃
  if (draft) {
    return (
      <Card>
        <CardHeader
          title={`调整草稿 v${draft.version}（基于 v${activePlan.version}）`}
          description={draft.generationReason}
          action={<Badge variant="warning">待确认</Badge>}
        />
        {error && <div className="mb-3 p-2.5 bg-rose-50 text-rose-700 rounded-lg text-sm">{error}</div>}
        <div className="space-y-2 mt-3">
          {draftAdjustments.length === 0 ? (
            <p className="text-sm text-ink-muted">本次调整没有需要调整的任务。</p>
          ) : (
            draftAdjustments.map((a) => <AdjustmentRow key={a.id} adjustment={a} />)
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="primary" onClick={handleConfirm} disabled={busy}>
            确认调整，开始执行
          </Button>
          <Button variant="outline" onClick={handleDiscard} disabled={busy}>
            放弃草稿
          </Button>
        </div>
        <p className="text-xs text-ink-muted mt-2">
          确认后 v{activePlan.version} 保留为历史版本，可在版本历史中对比；今日任务模块将读取新版本。
        </p>
      </Card>
    );
  }

  // 无草稿：触发信号分析入口
  return (
    <Card>
      <CardHeader
        title="调整后面的安排"
        description="根据真实执行结果调整剩余任务：在保留、缩减、顺延、替换、放弃之间作出可解释选择"
      />
      {error && <div className="mb-3 p-2.5 bg-rose-50 text-rose-700 rounded-lg text-sm">{error}</div>}

      {!open && (
        <div className="flex flex-wrap gap-2 mt-2">
          <Button variant="outline" onClick={handleAnalyze}>
            检测调整信号
          </Button>
          {activeAdjustments.length > 0 && (
            <Button variant="ghost" onClick={() => setShowActiveAdjustments(!showActiveAdjustments)}>
              {showActiveAdjustments ? "收起本版本调整记录" : `查看本版本调整记录（${activeAdjustments.length}）`}
            </Button>
          )}
        </div>
      )}

      {open && triggers && (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-ink">
            检测到 {triggers.length} 项触发信号：
          </p>
          {triggers.length === 0 ? (
            <p className="text-sm text-ink-muted">
              未检测到自动触发信号（时间变化、未完成任务、重复错因、资料不适合、考情变化）；
              你仍可以主动生成调整草稿。
            </p>
          ) : (
            triggers.map((t, i) => (
              <div key={i} className="p-3 rounded-lg bg-warn-soft border border-warn/30">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="warning">{REPLAN_TRIGGER_LABELS[t.type]}</Badge>
                </div>
                <p className="text-sm text-warn">{t.detail}</p>
                {t.refs.length > 0 && (
                  <p className="text-xs text-warn mt-1">
                    依据：{t.refs.map((r) => r.label).join("；")}
                  </p>
                )}
              </div>
            ))
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" onClick={handleCreateDraft} disabled={busy}>
              {busy ? "生成中…" : "生成调整草稿（新版本）"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            调整规则：剩余任务总时长不超过可用时间；未完成欠账不会全部堆到第二天；时间不足时优先保留关键模块与最低任务；资料不适合优先替换；重复错因降低难度；生成结果先作为草稿，确认后生效。
          </p>
        </div>
      )}

      {showActiveAdjustments && activeAdjustments.length > 0 && (
        <div className="space-y-2 mt-3">
          {activeAdjustments.map((a) => (
            <AdjustmentRow key={a.id} adjustment={a} />
          ))}
        </div>
      )}
    </Card>
  );
}
