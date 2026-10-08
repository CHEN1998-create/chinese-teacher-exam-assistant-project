import { Button } from "./Button";
import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="mb-4 text-ink-muted/50">{icon}</div>}
      <h3 className="text-lg font-medium text-ink mb-2">{title}</h3>
      <p className="text-sm text-ink-muted mb-6 max-w-sm">{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <Button variant="primary">{actionLabel}</Button>
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
