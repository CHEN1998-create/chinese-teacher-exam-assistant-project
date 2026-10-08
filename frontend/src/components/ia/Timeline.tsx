import { cn } from "@/lib/utils";
import type {
  ScheduleEvent,
  ScheduleGroup,
} from "@/lib/ia/schedule-view";
import type { ScheduleUrgency, UnitTrustDTO } from "@/lib/schedule/types";

/**
 * 日程时间线（IA 第 5 节）：按关注机会分组的纵向时间线，不默认展示月历。
 * 时间未定显示“待官方通知”；过去节点弱化；强度用文字标签表达，不只靠颜色。
 * 普通新增信息（info）视觉强度低于截止风险（must）。
 */

const URGENCY_META: Record<ScheduleUrgency, { text: string; className: string }> = {
  must: { text: "必须处理", className: "border-red-200 bg-red-50 text-red-700" },
  suggest: { text: "建议处理", className: "border-amber-200 bg-amber-50 text-amber-700" },
  info: { text: "普通信息", className: "border-slate-200 bg-slate-50 text-slate-500" },
};

function ChangeBadge({ event }: { event: ScheduleEvent }) {
  if (!event.changedFromPrevious) return null;
  const { field, oldValue, newValue, impact, nextStep } = event.changedFromPrevious;
  const label = field === "dateIso" ? "时间" : "内容";
  return (
    <div className="mt-1 w-full rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] text-blue-700">
      <p className="font-medium">
        {label}变更：{oldValue} → {newValue}
      </p>
      {impact && <p className="mt-0.5 text-blue-600">影响：{impact}</p>}
      {nextStep && <p className="mt-0.5 text-blue-600">下一步：{nextStep}</p>}
    </div>
  );
}

/** 可信状态降级徽标：ok 不展示，降级状态用文字+颜色表达 */
const TRUST_META: Record<
  Exclude<UnitTrustDTO["state"], "ok">,
  { className: string }
> = {
  withdrawn: { className: "border-red-200 bg-red-50 text-red-700" },
  source_unavailable: { className: "border-amber-200 bg-amber-50 text-amber-700" },
  pending_review: { className: "border-slate-200 bg-slate-50 text-slate-600" },
};

function TrustBadge({ trust }: { trust: UnitTrustDTO }) {
  if (trust.state === "ok") return null;
  return (
    <div
      className={cn(
        "mt-2 rounded-md border px-2 py-1.5 text-xs",
        TRUST_META[trust.state].className,
      )}
    >
      <p className="font-medium">{trust.label}</p>
      <p className="mt-0.5 opacity-90">{trust.detail}</p>
    </div>
  );
}

function EventRow({ event, isLast }: { event: ScheduleEvent; isLast: boolean }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!isLast && (
        <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-slate-200" />
      )}
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2",
          event.past
            ? "border-slate-300 bg-slate-100"
            : event.urgency === "must"
              ? "border-red-500 bg-white"
              : event.urgency === "suggest"
                ? "border-amber-500 bg-white"
                : "border-slate-400 bg-white",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("text-sm font-medium", event.past ? "text-slate-400" : "text-slate-900")}>
            {event.kindLabel}
          </p>
          {!event.past && !event.pending && (
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                URGENCY_META[event.urgency].className,
              )}
            >
              {URGENCY_META[event.urgency].text}
            </span>
          )}
          <ChangeBadge event={event} />
          {event.past && <span className="text-[11px] text-slate-400">已过去</span>}
        </div>
        <p className={cn("mt-0.5 text-sm", event.past ? "text-slate-400" : "text-slate-600")}>
          {event.dateText}
        </p>
        {event.action && (
          <div className="mt-1.5">
            {event.action.external ? (
              <a
                href={event.action.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-lg border border-blue-200 px-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                {event.action.label}
              </a>
            ) : (
              <a
                href={event.action.href}
                className="inline-flex h-9 items-center rounded-lg border border-blue-200 px-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                {event.action.label}
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function TimelineGroup({
  group,
  muted,
  onToggleMute,
}: {
  group: ScheduleGroup;
  muted?: boolean;
  onToggleMute?: (unitId: string, muted: boolean) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{group.regionText}</p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{group.title}</h3>
        </div>
        {onToggleMute && (
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={!!muted}
              onChange={(e) => onToggleMute(group.unitId, e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {muted ? "已关闭提醒" : "提醒开"}
          </label>
        )}
      </div>
      {muted && (
        <p className="mt-1 text-xs text-slate-400">
          该机会的站内通知已关闭，日程节点仍会展示。
        </p>
      )}
      {group.trust && <TrustBadge trust={group.trust} />}
      <ol className="mt-3">
        {group.events.map((event, index) => (
          <EventRow
            key={event.id}
            event={event}
            isLast={index === group.events.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

export function Timeline({
  groups,
  mutedUnitIds = [],
  onToggleMute,
}: {
  groups: ScheduleGroup[];
  mutedUnitIds?: string[];
  onToggleMute?: (unitId: string, muted: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <TimelineGroup
          key={group.unitId}
          group={group}
          muted={mutedUnitIds.includes(group.unitId)}
          onToggleMute={onToggleMute}
        />
      ))}
    </div>
  );
}
