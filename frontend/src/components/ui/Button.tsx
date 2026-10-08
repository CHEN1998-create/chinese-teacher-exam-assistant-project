import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";

/**
 * 按钮统一规范（v6.1 模块 0A 视觉系统 + 第六节操作规则）
 *
 * - variant：
 *   - primary：高强调实心主按钮，墨蓝品牌色；每屏只允许一个
 *   - secondary：次级实心，用于"次要但需要可见强调"的操作
 *   - outline：边框幽灵，用于"修改""返回修改"等次级操作
 *   - ghost：纯文字 hover 反色，用于工具条/卡片内的轻量操作
 *   - link：低强调文字入口，用于"先了解""暂时不确定""查看全部"等
 *   - danger：危险实心，仅出现在不可逆确认界面
 * - size：
 *   - md：默认桌面 44px
 *   - lg：移动主按钮 48px（首页/问答/详情主行动）
 *   - sm：表单内辅助
 *
 * 关键可访问性：
 * - 焦点环始终可见（focus-visible 双环）
 * - 禁用态：不出现"没有解释的禁用按钮"，由调用方配合错误提示
 * - loading：禁用 + spinner，aria-busy
 */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "link" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      disabled,
      iconStart,
      iconEnd,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:pointer-events-none";

    const variants = {
      primary:
        "bg-brand text-white hover:bg-brand-strong focus-visible:ring-brand",
      secondary:
        "bg-brand-soft text-brand hover:bg-brand-soft/70 focus-visible:ring-brand",
      outline:
        "border border-line bg-surface text-ink hover:bg-canvas focus-visible:ring-brand",
      ghost:
        "bg-transparent text-ink hover:bg-brand-soft focus-visible:ring-brand",
      link:
        "bg-transparent text-brand underline-offset-4 hover:underline focus-visible:ring-brand px-0 h-auto",
      danger:
        "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger",
    };

    const sizes = {
      sm: "h-8 px-3 text-sm",
      md: "h-11 px-4 text-sm",
      lg: "h-12 px-6 text-base",
    };

    const isLink = variant === "link";

    return (
      <button
        ref={ref}
        type={type}
        aria-busy={loading || undefined}
        className={cn(
          baseStyles,
          variants[variant],
          !isLink && sizes[size],
          fullWidth && "w-full",
          loading && "cursor: progress",
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            aria-hidden="true"
            className="h-4 w-4 animate-spin opacity-80"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {!loading && iconStart}
        {children}
        {!loading && iconEnd}
      </button>
    );
  }
);

Button.displayName = "Button";
