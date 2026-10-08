"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 第二层分区标题（无卡片底，仅靠间距与小字标签分层，避免 card 套 card） */
export function LayerHeading({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      {title}
      {count !== undefined && (
        <span className="text-xs font-normal text-slate-400">{count}</span>
      )}
    </h3>
  );
}

/**
 * 渐进展开容器：原生 details/summary，键盘可访问、无 JS 依赖。
 * 用于“明确不符合 / 已截止”等默认收起的二级分组。
 */
export function Disclosure({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-slate-200 bg-white [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 rounded-t-xl">
        <span className="flex items-center gap-2">
          {title}
          {count !== undefined && (
            <span className="text-xs font-normal text-slate-400">{count}</span>
          )}
        </span>
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className={cn("border-t border-slate-100 p-4 pt-3")}>{children}</div>
    </details>
  );
}
