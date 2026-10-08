import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** 是否保留用户已输入的内容（模块 0A 第十节：错误说明输入是否保存） */
  inputPreserved?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "内容暂时没有加载出来",
  description = "请稍后重试，或返回后重新打开。",
  inputPreserved,
  onRetry,
  retryLabel = "重新加载",
}: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-12 h-12 rounded-full bg-danger-soft flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-danger"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-ink mb-2">{title}</h3>
      <p className="text-sm text-ink-muted mb-2 max-w-sm">{description}</p>
      {inputPreserved && (
        <p className="text-xs text-ink-muted mb-4 max-w-sm">
          你刚填的内容已保留在当前页面，不会丢失。
        </p>
      )}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
