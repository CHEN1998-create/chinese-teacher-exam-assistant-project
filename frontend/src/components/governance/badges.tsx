import { Badge } from "@/components/ui/Badge";
import {
  CorrectionStatus,
  DataDeletionHandling,
  DataDeletionStatus,
  NotificationType,
  CORRECTION_STATUS_LABELS,
  DATA_DELETION_HANDLING_LABELS,
  DATA_DELETION_STATUS_LABELS,
  NOTIFICATION_TYPE_LABELS,
} from "@/types";

const CORRECTION_STATUS_VARIANTS: Record<
  CorrectionStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  submitted: "info",
  processing: "primary",
  need_info: "warning",
  accepted: "success",
  rejected: "muted",
};

export function CorrectionStatusBadge({ status }: { status: CorrectionStatus }) {
  return <Badge variant={CORRECTION_STATUS_VARIANTS[status]}>{CORRECTION_STATUS_LABELS[status]}</Badge>;
}

const DELETION_STATUS_VARIANTS: Record<
  DataDeletionStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  pending: "warning",
  processing: "primary",
  completed: "success",
  failed: "danger",
};

export function DeletionStatusBadge({ status }: { status: DataDeletionStatus }) {
  return <Badge variant={DELETION_STATUS_VARIANTS[status]}>{DATA_DELETION_STATUS_LABELS[status]}</Badge>;
}

const HANDLING_VARIANTS: Record<
  DataDeletionHandling,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  delete: "danger",
  retain_public: "info",
  retain_audit: "muted",
};

export function DataHandlingBadge({ handling }: { handling: DataDeletionHandling }) {
  return <Badge variant={HANDLING_VARIANTS[handling]}>{DATA_DELETION_HANDLING_LABELS[handling]}</Badge>;
}

/** 通知类型的展示图标与中文名称（中性表达，不含排名/惩罚语义） */
export const NOTIFICATION_TYPE_META: Record<NotificationType, { icon: string; label: string }> = {
  study_reminder: { icon: "⏰", label: NOTIFICATION_TYPE_LABELS.study_reminder },
  exam_change: { icon: "📢", label: NOTIFICATION_TYPE_LABELS.exam_change },
  correction_result: { icon: "📝", label: NOTIFICATION_TYPE_LABELS.correction_result },
  plan_reconfirm: { icon: "🔁", label: NOTIFICATION_TYPE_LABELS.plan_reconfirm },
};
