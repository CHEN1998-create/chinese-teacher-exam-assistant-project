import { cn } from "@/lib/utils";
import Link from "next/link";
import { ComponentProps, ReactNode } from "react";

/**
 * 内部链接按钮（v6.1 模块 0A 第六节）：
 * - 语义上是"按钮视觉的内部跳转"，使用 Next.js Link 保证路由不刷新；
 * - variant 与 Button 对齐：primary / secondary / outline / ghost / link；
 * - link 变体为低强调文字入口，用于"先了解""暂时不确定""查看全部"等。
 */
interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "link";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<NonNullable<LinkButtonProps["variant"]>, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong focus-visible:ring-brand",
  secondary:
    "bg-brand-soft text-brand hover:bg-brand-soft/70 focus-visible:ring-brand",
  outline:
    "border border-line bg-surface text-ink hover:bg-canvas focus-visible:ring-brand",
  ghost: "bg-transparent text-ink hover:bg-brand-soft focus-visible:ring-brand",
  link: "bg-transparent text-brand underline-offset-4 hover:underline focus-visible:ring-brand px-0 h-auto",
};

const sizeStyles: Record<NonNullable<LinkButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function LinkButton({
  variant = "link",
  size = "md",
  fullWidth = false,
  iconStart,
  iconEnd,
  className,
  children,
  ...props
}: LinkButtonProps) {
  const isLink = variant === "link";
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        variantStyles[variant],
        !isLink && sizeStyles[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {iconStart}
      {children}
      {iconEnd}
    </Link>
  );
}
