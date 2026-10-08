import { cn } from "@/lib/utils";
import type { OpportunityMatchStatus } from "@/lib/matching/types";
import { gateStateMeta, type GateStateTone } from "@/lib/gate-states";

/**
 * 匹配状态标签：状态同时用「文字 + 符号 + 颜色」表达，绝不只靠颜色
 *（IA 第 1 节 / 验收“关键状态有文字”）。
 */
const STATUS_META: Record<
  OpportunityMatchStatus,
  { text: string; symbol: string; dotClass: string; textClass: string }
> = {
  preliminary_eligible: {
    text: "初步符合",
    symbol: "✓",
    dotClass: "bg-brand",
    textClass: "text-brand",
  },
  need_more_info: {
    text: "补充信息后判断",
    symbol: "?",
    dotClass: "bg-warn",
    textClass: "text-warn",
  },
  manual_review: {
    text: "建议人工确认",
    symbol: "!",
    dotClass: "bg-warn",
    textClass: "text-warn",
  },
  not_eligible: {
    text: "明确不符合",
    symbol: "×",
    dotClass: "bg-danger",
    textClass: "text-danger",
  },
};

export function MatchStatusTag({ status }: { status: OpportunityMatchStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        meta.textClass,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white", meta.dotClass)}
      >
        {meta.symbol}
      </span>
      {meta.text}
    </span>
  );
}

/**
 * 闸门异常态标签：不同异常（截止/时间未定/来源失效/撤回/待复核…）必须显示
 * 不同文字名称，不允许统一灰标「不在当前推荐」。文字 + 符号 + 语气色三通道。
 */
const TONE_META: Record<
  GateStateTone,
  { symbol: string; dotClass: string; textClass: string }
> = {
  neutral: {
    symbol: "−",
    dotClass: "bg-ink-muted",
    textClass: "text-ink-muted",
  },
  warning: {
    symbol: "!",
    dotClass: "bg-warn",
    textClass: "text-warn",
  },
  danger: {
    symbol: "!",
    dotClass: "bg-danger",
    textClass: "text-danger",
  },
};

export function GateTag({ code }: { code: string }) {
  const meta = gateStateMeta(code);
  const tone = TONE_META[meta.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        tone.textClass,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white",
          tone.dotClass,
        )}
      >
        {tone.symbol}
      </span>
      {meta.label}
    </span>
  );
}
