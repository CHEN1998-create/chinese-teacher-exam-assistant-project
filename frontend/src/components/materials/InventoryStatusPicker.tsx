"use client";

import { UsageStatus, USAGE_STATUS_LABELS } from "@/types";
import { cn } from "@/lib/utils";

interface InventoryStatusPickerProps {
  value: UsageStatus;
  onSelect: (status: UsageStatus) => void;
}

const OPTIONS: {
  status: UsageStatus;
  icon: string;
  desc: string;
}[] = [
  {
    status: "none",
    icon: "📭",
    desc: "还没买资料或刚开始准备，想先知道最少需要哪些资料",
  },
  {
    status: "single",
    icon: "📘",
    desc: "手头已有一套主要资料，想确认是否适用、怎么用",
  },
  {
    status: "multiple",
    icon: "📚",
    desc: "攒了两三套资料，内容有重叠或冲突，不知道如何取舍",
  },
];

/** 资料状态三选一入口 */
export function InventoryStatusPicker({ value, onSelect }: InventoryStatusPickerProps) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink mb-2">你现在的资料情况是？</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          const active = value === opt.status;
          return (
            <button
              key={opt.status}
              type="button"
              onClick={() => onSelect(opt.status)}
              className={cn(
                "text-left rounded-xl border p-3.5 transition-colors",
                active
                  ? "border-brand bg-brand-soft/60 ring-1 ring-brand"
                  : "border-line bg-surface hover:border-line hover:bg-canvas"
              )}
            >
              <p className="text-2xl">{opt.icon}</p>
              <p className={cn("mt-2 text-sm font-medium", active ? "text-brand" : "text-ink")}>
                {USAGE_STATUS_LABELS[opt.status]}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{opt.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
