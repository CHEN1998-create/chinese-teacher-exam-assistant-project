import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { OpportunityRisk } from "@/lib/ia/opportunities-view";

/**
 * 第一层通用骨架：一句结论 + 覆盖范围说明 + 一个风险 + 一个高强调主行动。
 * 每个页面第一屏最多出现一个 Hero；不允许多个同等级按钮。
 */
export interface HeroAction {
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
}

interface HeroProps {
  /** 覆盖范围/更新时间等小字说明 */
  meta?: string;
  conclusion: string;
  risk?: OpportunityRisk | null;
  action?: HeroAction;
  children?: ReactNode;
}

function RiskLine({ risk }: { risk: OpportunityRisk }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
        risk.tone === "must"
          ? "bg-red-50 text-red-700"
          : "bg-slate-100 text-slate-600",
      )}
    >
      <svg
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v3.5m0 3.5h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
        />
      </svg>
      {/* 风险文字本身包含“截止/以官方审核为准”等语义，不只靠颜色 */}
      <span>{risk.text}</span>
    </p>
  );
}

const ACTION_CLASS =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 text-base font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export function Hero({ meta, conclusion, risk, action, children }: HeroProps) {
  return (
    <section
      aria-label="结论与下一步"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      {meta && <p className="text-xs text-slate-500">{meta}</p>}
      <h2 className="mt-1.5 text-xl font-semibold leading-snug text-slate-900">
        {conclusion}
      </h2>
      {risk && (
        <div className="mt-3">
          <RiskLine risk={risk} />
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
      {action && (
        <div className="mt-4">
          {action.href ? (
            action.external ? (
              <a
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                className={ACTION_CLASS}
              >
                {action.label}
              </a>
            ) : (
              <a href={action.href} className={ACTION_CLASS}>
                {action.label}
              </a>
            )
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className={ACTION_CLASS}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
