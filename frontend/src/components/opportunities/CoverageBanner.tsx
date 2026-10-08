import type { CoverageDTO } from "@/lib/opportunities/api-types";

/** "YYYY-MM-DD..." → "M月D日"；无法解析时原样返回 */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 真实监测覆盖说明（模块 1）：
 * 说清「实际覆盖哪些地区、最近核对时间、当前是否有在报批次」，
 * 避免把「暂未收录」误读成「当地无招聘」。
 */
export function CoverageBanner({ coverage }: { coverage: CoverageDTO }) {
  const regionText = coverage.regions.map((r) => r.label).join("、");
  return (
    <section
      aria-label="官方监测覆盖说明"
      className="rounded-xl border border-success/30 bg-success-soft/60 p-4"
      data-testid="coverage-banner"
    >
      <h2 className="text-sm font-semibold text-success">
        官方监测 · {regionText}
      </h2>
      <p className="mt-2 text-sm text-success">
        当前监测到{" "}
        <span className="font-semibold">
          {coverage.openOpportunityCount} 个在报语文教师岗位
        </span>
        ；最近一次核对官方来源：{formatDay(coverage.lastCheckedAt)}。
      </p>
      <p className="mt-1 text-sm text-ink-muted">{coverage.nextWindowNote}</p>

      <ul className="mt-3 space-y-1 text-xs text-ink-muted">
        {coverage.regions.flatMap((region) =>
          region.sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
            >
              <span
                aria-hidden="true"
                className={
                  source.ok
                    ? "inline-block h-1.5 w-1.5 rounded-full bg-success"
                    : "inline-block h-1.5 w-1.5 rounded-full bg-danger"
                }
              />
              <span>
                {region.label} · {source.name}
              </span>
              <span>
                {source.ok ? "来源可访问" : `来源异常：${source.failReason ?? "未知原因"}`}
              </span>
              <span>核对于 {formatDay(source.lastCheckedAt)}</span>
            </li>
          )),
        )}
      </ul>

      <p className="mt-3 border-t border-success/30 pt-2 text-xs leading-relaxed text-ink-muted">
        {coverage.scopeNote}
        下方「真实监测记录」均为 AI 依据官方原文初核、
        <span className="font-medium">尚待人工复核</span>
        ，未复核前不进入推荐。覆盖版本 {coverage.version}。
      </p>
    </section>
  );
}
