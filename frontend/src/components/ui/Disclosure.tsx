"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useId, useRef, useState } from "react";

/**
 * 按需展开（模块 0A 第七节：解释按需出现）：
 * - 标题按钮触发，aria-expanded / aria-controls 标准语义；
 * - 内容默认隐藏，展开后键盘 Tab 可进入；
 * - 支持 defaultOpen 控制初始展开（例如"为什么问这个？"默认闭合、
 *   "完整覆盖范围"默认展开可由调用方决定）；
 * - 不使用动画时长 > 250ms 的过渡，尊重 prefers-reduced-motion。
 */
interface DisclosureProps {
  /** 触发展开的按钮文案 */
  trigger: string;
  /** 展开后的内容 */
  children: React.ReactNode;
  /** 默认是否展开 */
  defaultOpen?: boolean;
  /** 受控展开状态 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 触发器视觉变体，默认为低强调 link 入口 */
  triggerVariant?: "link" | "ghost" | "outline";
  /** 包裹容器类名 */
  className?: string;
  /** 内容容器类名 */
  contentClassName?: string;
}

export const Disclosure = forwardRef<HTMLDivElement, DisclosureProps>(
  function Disclosure(
    {
      trigger,
      children,
      defaultOpen = false,
      open: openProp,
      onOpenChange,
      triggerVariant = "link",
      className,
      contentClassName,
    },
    ref
  ) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const isOpen = openProp !== undefined ? openProp : internalOpen;
    const contentId = useId();
    const triggerId = useId();
    const contentRef = useRef<HTMLDivElement | null>(null);

    const toggle = () => {
      const next = !isOpen;
      if (openProp === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    };

    const triggerClass: Record<NonNullable<DisclosureProps["triggerVariant"]>, string> = {
      link: "text-brand underline-offset-4 hover:underline",
      ghost: "text-ink hover:bg-brand-soft rounded-lg px-3 py-2",
      outline:
        "border border-line bg-surface text-ink hover:bg-canvas rounded-lg px-3 py-2",
    };

    return (
      <div ref={ref} className={cn("flex flex-col", className)}>
        <button
          id={triggerId}
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={toggle}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded",
            triggerClass[triggerVariant]
          )}
        >
          <svg
            aria-hidden="true"
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              isOpen && "rotate-90"
            )}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.293 5.293a1 1 0 011.414 0L13 9.414a1 1 0 010 1.414l-4.293 4.293a1 1 0 01-1.414-1.414L10.586 10 7.293 6.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
          {trigger}
        </button>
        <div
          id={contentId}
          ref={contentRef}
          role="region"
          aria-labelledby={triggerId}
          hidden={!isOpen}
          className={cn(
            "mt-2 text-sm leading-relaxed text-ink-muted",
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    );
  }
);
