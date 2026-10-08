import { cn } from "@/lib/utils";

/**
 * 品牌标记（模块 0A 5.3 品牌图形）：
 * - 用户端正式品牌位置不再使用 📝 等 Emoji；
 * - 使用文字 + 本地自包含 SVG/CSS 标记，不新增远程图片或图标依赖；
 * - 标记为墨蓝实心方块叠加白色"考"字风格图标，避免任何外部资源。
 */
interface BrandMarkProps {
  className?: string;
  /** 是否带文字"教招有据" */
  withText?: boolean;
  /** 文字大小 */
  size?: "sm" | "md" | "lg";
}

export function BrandMark({
  className,
  withText = true,
  size = "md",
}: BrandMarkProps) {
  const markSizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };
  const textSizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandGlyph className={markSizes[size]} aria-hidden="true" />
      {withText && (
        <span className={cn("font-semibold text-ink", textSizes[size])}>
          教招有据
        </span>
      )}
    </span>
  );
}

/** 自包含 SVG 标记：墨蓝圆角方块 + 白色"考"字风格勾画 */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill="var(--color-brand)" />
      {/* 简洁的"考"字意象：上方勾画 + 下方圆点，整体可读、无外部依赖 */}
      <path
        d="M9 11.5h14M16 8.5v6"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M11 18.5c0 2.5 2.2 4.5 5 4.5s5-2 5-4.5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="24.5" r="1.6" fill="#fff" />
    </svg>
  );
}
