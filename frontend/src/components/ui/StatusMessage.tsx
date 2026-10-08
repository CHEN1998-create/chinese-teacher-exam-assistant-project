"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * 非阻塞状态消息（模块 0A 第十节成功与撤销）：
 * - 用于关注、保存、关闭提醒等可恢复操作的即时反馈；
 * - aria-live="polite" 让屏幕阅读器在不打断当前任务的情况下播报；
 * - 提供撤销操作（onUndo），过期后自动消失；
 * - 不使用模态框，不阻塞页面其他操作；
 * - 通过 onDismiss 由调用方决定完全清除时机。
 */
interface StatusMessageAction {
  label: string;
  onClick: () => void;
}

interface StatusMessageProps {
  /** 语义状态：成功/信息/提醒/失败 */
  tone?: "success" | "info" | "warn" | "danger";
  /** 文案 */
  message: string;
  /** 撤销操作（可选） */
  undo?: StatusMessageAction;
  /** 主操作（可选，例如"查看日程"） */
  action?: StatusMessageAction;
  /** 自动消失时长，默认 5s；0 = 不自动消失 */
  duration?: number;
  /** 主动关闭回调 */
  onDismiss?: () => void;
  className?: string;
}

const toneStyles: Record<NonNullable<StatusMessageProps["tone"]>, string> = {
  success: "bg-success-soft text-success border-success/30",
  info: "bg-brand-soft text-brand border-brand/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/30",
};

const toneIcon: Record<NonNullable<StatusMessageProps["tone"]>, string> = {
  success: "M5 13l4 4L19 7",
  info: "M13 16h-1v-4h1m0-4h.01M9 3h6m-3 13v.01",
  warn: "M12 9v2m0 4h.01M5 19h14a2 2 0 001.732-3L13.732 4a2 2 0 00-3.464 0L3.27 16A2 2 0 005 19z",
  danger: "M6 18L18 6M6 6l12 12",
};

export function StatusMessage({
  tone = "success",
  message,
  undo,
  action,
  duration = 5000,
  onDismiss,
  className,
}: StatusMessageProps) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || duration <= 0) return;
    timerRef.current = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  const handleAction = (fn: () => void) => {
    fn();
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm shadow-sm",
        toneStyles[tone],
        className
      )}
    >
      <svg
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={toneIcon[tone]} />
      </svg>
      <p className="flex-1 leading-relaxed">{message}</p>
      <div className="flex shrink-0 items-center gap-2">
        {action && (
          <button
            type="button"
            onClick={() => handleAction(action.onClick)}
            className="rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {action.label}
          </button>
        )}
        {undo && (
          <button
            type="button"
            onClick={() => handleAction(undo.onClick)}
            className="rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {undo.label}
          </button>
        )}
        <button
          type="button"
          aria-label="关闭提示"
          onClick={() => {
            setVisible(false);
            onDismiss?.();
          }}
          className="-mr-1 rounded p-1 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <svg
            aria-hidden="true"
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * 容器：用于堆叠多条状态消息（屏幕底部/页面顶部固定区）。
 * 多条消息按顺序铺开，不互相覆盖。
 */
export function StatusMessageRegion({
  children,
  className,
  anchor = "bottom",
}: {
  children: React.ReactNode;
  className?: string;
  anchor?: "bottom" | "top";
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-2",
        anchor === "bottom" ? "bottom-4" : "top-4",
        className
      )}
    >
      {children}
    </div>
  );
}
