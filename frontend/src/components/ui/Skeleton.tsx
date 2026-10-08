import { cn } from "@/lib/utils";

/**
 * 骨架占位（模块 0A 第十节加载状态）：
 * - 形状接近真实内容，保持布局稳定；
 * - 默认无文字、aria-hidden；
 * - 尊重 prefers-reduced-motion（globals.css 中已统一收敛动画时长）。
 */
interface SkeletonProps {
  className?: string;
  /** 是否带可访问的"正在加载 X"文案（屏幕阅读器） */
  ariaLabel?: string;
}

export function Skeleton({ className, ariaLabel }: SkeletonProps) {
  return (
    <div
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "status" : undefined}
      className={cn(
        "animate-pulse rounded-md bg-brand-soft/60",
        className
      )}
    />
  );
}

/** 多行文本骨架 */
export function SkeletonText({
  lines = 3,
  className,
  ariaLabel,
}: {
  lines?: number;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-label={ariaLabel} role={ariaLabel ? "status" : undefined}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** 卡片骨架：用于列表项加载态 */
export function SkeletonCard({ ariaLabel }: { ariaLabel?: string }) {
  return (
    <div
      className="rounded-xl border border-line bg-surface p-4"
      aria-label={ariaLabel}
      role={ariaLabel ? "status" : undefined}
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <SkeletonText lines={2} />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
