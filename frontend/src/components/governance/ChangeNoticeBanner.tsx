"use client";

import { useNotifications } from "@/lib/governance/useGovernance";
import { notificationService } from "@/lib/governance/notificationService";
import { NotificationType } from "@/types";

/**
 * 重要变化横幅：在 /exam、/plan、/today 顶部展示未读的
 * 考情变化 / 计划重新确认通知，包含变化说明与下一步动作。
 * 用户点「我知道了」即标记已读（不强制跳转，不使用惩罚性文案）。
 */
export function ChangeNoticeBanner({ types }: { types: NotificationType[] }) {
  const { items } = useNotifications();
  const active = items
    .filter((n) => !n.readAt && types.includes(n.type))
    .slice(0, 2);

  if (active.length === 0) return null;

  return (
    <div className="space-y-2">
      {active.map((item) => (
        <div
          key={item.id}
          role="status"
          className="rounded-xl border border-warn/30 bg-warn-soft p-4"
        >
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none">{item.type === "exam_change" ? "📢" : "🔁"}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-warn">{item.body}</p>
              {item.nextSteps && item.nextSteps.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-warn">建议你接下来：</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-warn">
                    {item.nextSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => notificationService.markRead(item.id)}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-warn hover:bg-warn-soft"
            >
              我知道了
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
