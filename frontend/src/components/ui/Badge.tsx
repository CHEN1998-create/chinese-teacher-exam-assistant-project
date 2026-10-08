import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/demo/config";
import {
  ExtractionJobStatus,
  ReviewStatus,
  TaskStatus,
  MaterialStatus,
} from "@/types";
import {
  EXTRACTION_JOB_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  TASK_STATUS_LABELS,
  MATERIAL_STATUS_LABELS,
} from "@/types";

interface BadgeProps {
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info" | "muted";
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: "bg-brand-soft/60 text-ink",
  primary: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-brand-soft text-brand",
  muted: "bg-brand-soft/40 text-ink-muted",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// 考情结论审核状态标签（状态不仅靠颜色，文字直接写明）
export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const variantMap: Record<ReviewStatus, BadgeProps["variant"]> = {
    official: "success",
    ai_extracted: "primary",
    pending_review: "warning",
    historical: "info",
    personal: "muted",
    unconfirmed: "muted",
  };
  return (
    <Badge variant={variantMap[status]}>
      {isDemoMode && status === "official"
        ? `${REVIEW_STATUS_LABELS.official}·演示`
        : REVIEW_STATUS_LABELS[status]}
    </Badge>
  );
}

// 公告提取任务状态标签
export function ExtractionJobBadge({ status }: { status: ExtractionJobStatus }) {
  const variantMap: Record<ExtractionJobStatus, BadgeProps["variant"]> = {
    idle: "muted",
    processing: "primary",
    succeeded: "success",
    failed: "danger",
    pending_review: "warning",
  };
  return (
    <Badge variant={variantMap[status]}>
      {EXTRACTION_JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

// 任务状态标签
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const variantMap: Record<TaskStatus, BadgeProps["variant"]> = {
    pending: "muted",
    in_progress: "primary",
    completed: "success",
    partial: "warning",
    abandoned: "danger",
  };
  return (
    <Badge variant={variantMap[status]}>
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

// 资料状态标签
export function MaterialStatusBadge({ status }: { status: MaterialStatus }) {
  const variantMap: Record<MaterialStatus, BadgeProps["variant"]> = {
    in_use: "success",
    partial_use: "warning",
    paused: "muted",
    replaced: "danger",
  };
  return (
    <Badge variant={variantMap[status]}>
      {MATERIAL_STATUS_LABELS[status]}
    </Badge>
  );
}
