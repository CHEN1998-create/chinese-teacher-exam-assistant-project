"use client";

import { Badge } from "@/components/ui/Badge";
import {
  EVENT_DICTIONARY,
  METRIC_DICTIONARY,
  MetricCategory,
} from "@/lib/analytics/dictionary";

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  user_value: "用户价值",
  quality_ops: "质量运营",
  stock: "实时存量",
  trial: "受邀试用",
};

const CATEGORY_VARIANT: Record<MetricCategory, "primary" | "warning" | "info"> = {
  user_value: "primary",
  quality_ops: "warning",
  stock: "info",
  trial: "info",
};

/**
 * 指标字典 / 事件字典（产品内可见的统一口径说明）。
 * 使用原生 details/summary 实现折叠，无需额外状态。
 */
export function AnalyticsDictionaries() {
  return (
    <div className="space-y-3">
      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-900">
          <span>📐 指标字典（{METRIC_DICTIONARY.length} 项 · 统一口径）</span>
          <span className="text-xs text-slate-400 group-open:hidden">展开</span>
          <span className="text-xs text-slate-400 hidden group-open:inline">收起</span>
        </summary>
        <div className="px-4 pb-4 space-y-2">
          {METRIC_DICTIONARY.map((metric) => (
            <div key={metric.key} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{metric.label}</span>
                <Badge variant={CATEGORY_VARIANT[metric.category]}>
                  {CATEGORY_LABELS[metric.category]}
                </Badge>
                {metric.timeFiltered ? (
                  <Badge variant="muted">随时间范围</Badge>
                ) : (
                  <Badge variant="info">实时存量</Badge>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-5">口径：{metric.formula}</p>
              <p className="mt-0.5 text-xs text-slate-400">来源：{metric.dataSource}</p>
            </div>
          ))}
        </div>
      </details>

      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-900">
          <span>🛰️ 事件字典（{EVENT_DICTIONARY.length} 类 · 不保存用户正文）</span>
          <span className="text-xs text-slate-400 group-open:hidden">展开</span>
          <span className="text-xs text-slate-400 hidden group-open:inline">收起</span>
        </summary>
        <div className="px-4 pb-4 space-y-2">
          {EVENT_DICTIONARY.map((evt) => (
            <div key={evt.type} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs font-medium text-slate-800 bg-slate-100 rounded px-1.5 py-0.5">
                  {evt.type}
                </code>
                <span className="text-sm text-slate-700">{evt.label}</span>
                {evt.core ? (
                  <Badge variant="primary">核心事件</Badge>
                ) : (
                  <Badge variant="muted">扩展事件</Badge>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-5">触发：{evt.trigger}</p>
              <p className="mt-0.5 text-xs text-slate-400">记录维度：{evt.properties}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
