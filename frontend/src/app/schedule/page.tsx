"use client";

import Link from "next/link";
import { useSchedule } from "@/lib/schedule/useSchedule";
import { buildScheduleView } from "@/lib/ia/schedule-view";
import { Hero } from "@/components/ia/Hero";
import { Timeline } from "@/components/ia/Timeline";
import { LayerHeading } from "@/components/ia/Layer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingPage } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";

export default function SchedulePage() {
  const { state, reload, toggleMute } = useSchedule();

  if (state.status === "loading") return <LoadingPage />;

  if (state.status === "error") {
    return (
      <ErrorState
        title="日程暂时加载失败"
        description={state.error}
        onRetry={reload}
      />
    );
  }

  const view = buildScheduleView(state.data.events, state.data.unitTrust);

  // 空态 1：没有关注任何机会——不制造虚假紧迫感
  if (view.groups.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title="还没有不能错过的事"
          description="关注机会后，报名开始/截止、笔试等官方节点才会出现在这里。未关注的机会不会凭空产生提醒。"
          actionLabel="去看看机会"
          actionHref="/opportunities"
        />
      </div>
    );
  }

  // 首屏只突出一个当前最重要的动作：优先行动链 nextAction，其次最近时间线节点
  const nextAction = state.data.nextAction;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-2">
      {nextAction ? (
        <section className="rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
            当前最重要的一个动作
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">
            {nextAction.unitName}
          </h1>
          <p className="mt-1 text-base text-slate-700">{nextAction.label}</p>
          <Link
            href={nextAction.href}
            className={cn(
              "mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
            )}
          >
            {nextAction.label}
          </Link>
        </section>
      ) : view.next ? (
        <Hero
          meta="下一件不能错过的事"
          conclusion={`${view.next.groupTitle} · ${view.next.event.kindLabel}`}
          risk={{
            tone: view.next.event.urgency === "must" ? "must" : "info",
            text:
              view.next.event.urgency === "must"
                ? `必须处理：${view.next.event.dateText}，截止后通常无法补报名，请提前准备材料`
                : view.next.event.urgency === "suggest"
                  ? `建议处理：${view.next.event.dateText}，提前安排当天时间`
                  : `${view.next.event.dateText}`,
          }}
          action={
            view.next.event.action
              ? {
                  label: view.next.event.action.label,
                  href: view.next.event.action.href,
                  external: view.next.event.action.external,
                }
              : undefined
          }
        >
          <p className="text-sm text-slate-600">
            {view.next.regionText} · {view.next.event.dateText}
          </p>
        </Hero>
      ) : (
        // 空态 2：有关注但近期没有需要行动的节点（时间未定显示“待官方通知”）
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-lg font-semibold text-slate-900">近期没有需要处理的节点</p>
          <p className="mt-2 text-sm text-slate-500">
            时间未定的事项一律显示“待官方通知”，不会用推测日期提醒你。下面可以查看已关注机会的完整时间线。
          </p>
        </div>
      )}

      {/* 时间冲突提示：只提示，不替用户自动放弃 */}
      {view.conflicts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">时间冲突提醒</p>
          <ul className="mt-2 space-y-1.5">
            {view.conflicts.map((c) => (
              <li key={c.dateIso} className="text-sm text-amber-700">
                <span className="font-medium">{c.dateText}</span>：
                {c.items.map((i) => `${i.unitName}·${i.kindLabel}`).join("；")}
                。请自行取舍，系统不会替你放弃任何机会。
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 第二层：按关注机会分组的时间线；不默认展示月历 */}
      <section className="space-y-3">
        <LayerHeading title="关注机会时间线" count={view.groups.length} />
        <Timeline
          groups={view.groups}
          mutedUnitIds={state.data.mutedUnitIds}
          onToggleMute={toggleMute}
        />
      </section>
    </div>
  );
}
