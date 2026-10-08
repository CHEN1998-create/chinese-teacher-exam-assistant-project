"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CorrectionQueuePanel } from "@/components/admin/CorrectionQueuePanel";
import { RetractionLogList } from "@/components/admin/RetractionLogList";

const TABS = [
  { id: "corrections", label: "纠错队列" },
  { id: "retractions", label: "结论撤回留痕" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * 纠错与治理后台（/admin/feedback）：
 * - 用户纠错队列：采纳 / 驳回 / 要求补充，处理结果通过站内通知告知用户；
 * - 错误结论撤回留痕：撤回原因、操作人、时间与影响范围（只追加，不物理删除）。
 */
export default function AdminFeedbackPage() {
  const [tab, setTab] = useState<TabId>("corrections");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">纠错与治理</h1>
        <p className="mt-1 text-sm text-slate-500">
          处理用户提交的考情纠错；撤回错误结论时会识别受影响目标、计划与用户并发送变化说明。
          所有处理动作均有留痕，普通用户只能看到自己的纠错。
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              tab === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "corrections" ? <CorrectionQueuePanel /> : <RetractionLogList />}
    </div>
  );
}
