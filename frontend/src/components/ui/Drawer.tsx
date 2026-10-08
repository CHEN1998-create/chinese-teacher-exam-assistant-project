"use client";

import { cn } from "@/lib/utils";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * 抽屉/底部面板（模块 0A 第七节：完整证据进入详情 / 完整说明按需展开）：
 * - 桌面端：右侧滑入面板（max-w-md）；
 * - 移动端：底部 BottomSheet（max-h-[80vh]，顶部抓手）；
 * - 焦点管理：打开时焦点进入容器，关闭后回到触发元素（由调用方通过
 *   返回的 cleanup 或本组件内部追踪 lastActiveElement 实现）；
 * - 键盘：ESC 关闭、Tab 在容器内圈定；
 * - 不使用模态遮罩完全阻断背后滚动？保留遮罩点击关闭、避免误操作。
 */
interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** 底部固定操作区，如"确认""撤销"等 */
  footer?: React.ReactNode;
  /** 宽度/高度可调，默认 md */
  size?: "sm" | "md" | "lg";
  /** 关闭按钮 aria-label */
  closeLabel?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "关闭",
}: DrawerProps) {
  const containerId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  // 打开时记录当前焦点、关闭时还回
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    lastActiveRef.current = previous;
    // 焦点进入面板首个可聚焦元素
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable ?? panel).focus();
    }, 0);

    // 监听 ESC 与 Tab 圈定
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    // 锁定背景滚动
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // 焦点还回
      lastActiveRef.current?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const sizes = {
    sm: "md:max-w-sm",
    md: "md:max-w-md",
    lg: "md:max-w-lg",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? `${containerId}-title` : undefined}
      aria-describedby={description ? `${containerId}-desc` : undefined}
    >
      {/* 遮罩 */}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
        tabIndex={-1}
      />
      {/* 面板 */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-xl md:max-h-[90vh] md:rounded-t-none md:border-l md:rounded-l-2xl",
          sizes[size]
        )}
      >
        {/* 移动端顶部抓手 */}
        <div className="flex justify-center pt-2 md:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3 md:px-5 md:pt-4">
            <div className="min-w-0">
              {title && (
                <h2
                  id={`${containerId}-title`}
                  className="text-base font-semibold text-ink"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={`${containerId}-desc`}
                  className="mt-1 text-sm text-ink-muted"
                >
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label={closeLabel}
              onClick={() => onOpenChange(false)}
              className="-mr-1 rounded p-1.5 text-ink-muted hover:bg-brand-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5">
          {children}
        </div>
        {footer && (
          <div className="border-t border-line px-4 py-3 md:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
