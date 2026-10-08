import { PlanTask } from "@/types";
import { Card } from "./Card";
import { Badge, TaskStatusBadge } from "./Badge";
import { formatTime } from "@/lib/utils";
import {
  TASK_PRIORITY_LABELS,
  COMPLETION_STATUS_LABELS,
  ERROR_TYPE_LABELS,
  INCOMPLETE_REASON_LABELS,
} from "@/types";
import { moduleLabel } from "@/lib/materials/domain";

interface TaskCardProps {
  task: PlanTask;
  showFeedback?: boolean;
  onStart?: (taskId: string) => void;
  compact?: boolean;
  /** 展示安排原因与复盘动作（计划页用，今日页可关闭） */
  showPlanMeta?: boolean;
}

const PRIORITY_VARIANT: Record<string, "danger" | "primary" | "muted"> = {
  high: "danger",
  medium: "primary",
  low: "muted",
};

export function TaskCard({
  task,
  showFeedback = true,
  compact = false,
  showPlanMeta = false,
}: TaskCardProps) {
  return (
    <Card className={compact ? "p-3" : ""} padding={compact ? "sm" : "md"}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <TaskStatusBadge status={task.status} />
            {task.isCore && <Badge variant="primary">核心</Badge>}
            {task.needsConfirmation && <Badge variant="warning">待重新确认</Badge>}
            <Badge variant={PRIORITY_VARIANT[task.priority] ?? "muted"}>
              优先级{TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
            </Badge>
            <span className="text-xs text-slate-400">{moduleLabel(task.module)}</span>
          </div>
          <h4 className="font-medium text-slate-900 mt-1">{task.title}</h4>
          <p className="text-sm text-slate-600 mt-1">{task.completionCriteria}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm font-medium text-slate-900">
            {formatTime(task.estimatedTime)}
          </span>
        </div>
      </div>

      {showPlanMeta && (
        <div className="mt-3 space-y-2 text-sm">
          {task.arrangementReason && (
            <div className="flex gap-2">
              <span className="shrink-0 text-slate-400">安排原因：</span>
              <span className="text-slate-600">{task.arrangementReason}</span>
            </div>
          )}
          {task.reviewAction && (
            <div className="flex gap-2">
              <span className="shrink-0 text-slate-400">复盘动作：</span>
              <span className="text-slate-600">{task.reviewAction}</span>
            </div>
          )}
          {task.chapterTitle && (
            <div className="flex gap-2">
              <span className="shrink-0 text-slate-400">具体章节：</span>
              <span className="text-slate-600">{task.chapterTitle}</span>
            </div>
          )}
        </div>
      )}

      {showFeedback && task.feedback && (
        <div className="mt-3 p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <Badge
              variant={
                task.feedback.status === "completed"
                  ? "success"
                  : task.feedback.status === "partial"
                    ? "warning"
                    : "danger"
              }
            >
              {COMPLETION_STATUS_LABELS[task.feedback.status]}
            </Badge>
            <span className="text-slate-500">实际用时：</span>
            <span className="font-medium">
              {task.feedback.actualTime ? formatTime(task.feedback.actualTime) : "-"}
            </span>
            {task.feedback.hasSecondPractice && <Badge variant="info">已二次练习</Badge>}
          </div>
          {task.feedback.incompleteReason && (
            <div className="mt-2 text-sm text-slate-600">
              原因：{INCOMPLETE_REASON_LABELS[task.feedback.incompleteReason]}
            </div>
          )}
          {task.feedback.errorTypes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.feedback.errorTypes.map((type) => (
                <span
                  key={type}
                  className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded border border-amber-200"
                >
                  {ERROR_TYPE_LABELS[type]}
                </span>
              ))}
            </div>
          )}
          {task.feedback.notes && (
            <p className="mt-2 text-sm text-slate-600">{task.feedback.notes}</p>
          )}
        </div>
      )}
    </Card>
  );
}
