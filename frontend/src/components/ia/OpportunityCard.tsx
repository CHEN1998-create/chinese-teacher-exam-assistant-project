"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { DimensionView, OpportunityRow } from "@/lib/ia/opportunities-view";
import { guestCardNextStep } from "@/lib/ia/opportunities-view";
import {
  isGuestFollowing,
  upsertGuestFollow,
  removeGuestFollow,
} from "@/lib/guest/guestFollows";
import { GateTag, MatchStatusTag } from "./MatchStatusTag";
import { safeOfficialLink } from "@/lib/links/official";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";

/** 外部链接主行动样式（与 Button primary 对齐，因为 Button 不渲染为 <a>） */
const PRIMARY_LINK_CLASS =
  "inline-flex h-8 items-center justify-center rounded-lg bg-brand px-3 text-sm font-medium text-white transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand";

/**
 * 访客机会卡（模块 5 信息层级：首层五要素 + 一个下一步）：
 * 地区+报考单元 · 用工性质/学段 · 招聘人数 · 匹配状态 · 报名截止 ·
 * 一条关键依据或风险 · 一个下一步（查看判断依据 / 去官网报名 / 登录后关注）。
 * 长证据（逐项条件、官方来源）按需展开。
 * 整张卡不再是一个大按钮：主行动由 guestCardNextStep 唯一决定，
 * 展开/收起只是次级文本操作。
 *
 * 颜色全部走语义 Token（bg-surface / text-ink / bg-brand-soft 等），
 * 不再用散落的 blue-* / slate-* / red-* 等原始色阶（模块 0A 设计系统）。
 */

const DIMENSION_VALUE_META: Record<
  DimensionView["value"],
  { text: string; symbol: string; className: string }
> = {
  PASS: { text: "已满足", symbol: "✓", className: "text-success" },
  UNKNOWN: { text: "信息不足，补充后判断", symbol: "?", className: "text-warn" },
  MANUAL_REVIEW: { text: "存在歧义，建议向招聘单位确认", symbol: "!", className: "text-warn" },
  FAIL: { text: "不满足", symbol: "×", className: "text-danger" },
};

interface OpportunityCardProps {
  row: OpportunityRow;
  expanded: boolean;
  onToggle: () => void;
  priority?: boolean;
  /**
   * 展示在「岗位地区不在你选择的范围」分区：这些单元 overall 仍是 not_eligible，
   * 但语义上只是地区偏好不重叠，不能显示红色「明确不符合」标签。
   */
  regionOutOfScope?: boolean;
}

export function OpportunityCard({ row, expanded, onToggle, priority = false, regionOutOfScope = false }: OpportunityCardProps) {
  const panelId = useId();
  const closed = row.gateCode !== null;
  const step = guestCardNextStep(row);
  const officialLink = safeOfficialLink(row.officialUrl);
  const [guestFollowed, setGuestFollowed] = useState(() =>
    isGuestFollowing(row.unitId),
  );

  const toggleGuestFollow = () => {
    if (guestFollowed) {
      removeGuestFollow(row.unitId);
      setGuestFollowed(false);
    } else {
      upsertGuestFollow(row.unitId, { status: "considering" });
      setGuestFollowed(true);
    }
  };

  const primaryAction = (() => {
    if (step.kind === "login") {
      return (
        <Button
          size="sm"
          variant={guestFollowed ? "secondary" : "primary"}
          onClick={toggleGuestFollow}
          aria-pressed={guestFollowed}
        >
          {guestFollowed ? "已关注（本机保存）" : step.label}
        </Button>
      );
    }
    if (step.kind === "onboarding") {
      return (
        <LinkButton href="/onboarding" size="sm" variant="primary">
          {step.label}
        </LinkButton>
      );
    }
    if (step.kind === "official" && officialLink) {
      return (
        <a
          href={officialLink}
          target="_blank"
          rel="noopener noreferrer"
          className={PRIMARY_LINK_CLASS}
        >
          {step.label}
        </a>
      );
    }
    if (step.kind === "official") {
      return (
        <Button size="sm" variant="primary" onClick={onToggle}>
          查看判断依据
        </Button>
      );
    }
    return (
      <Button size="sm" variant="primary" onClick={onToggle}>
        {step.label}
      </Button>
    );
  })();

  return (
    <article
      className={cn(
        "rounded-xl border bg-surface",
        priority ? "border-brand ring-1 ring-brand-soft" : "border-line",
      )}
    >
      <h3 className="sr-only">{row.unitName}</h3>

      <div className="p-4">
        {/* 五要素之一：地区 + 报考单元 + 状态 */}
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-semibold text-ink">
            <span className="font-normal text-ink-muted">{row.regionText}</span>
            <span className="mx-1.5 text-ink-muted/60" aria-hidden="true">|</span>
            <span className="break-words">{row.unitName}</span>
          </p>
          {closed && row.gateCode ? (
            <GateTag code={row.gateCode} />
          ) : regionOutOfScope ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink-muted">
              <span
                aria-hidden="true"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-muted text-[10px] font-bold text-white"
              >
                ◌
              </span>
              地区不在选择范围
            </span>
          ) : (
            <MatchStatusTag status={row.status} />
          )}
        </div>

        {/* 五要素之二：用工性质 + 学段 + 招聘人数 */}
        <p className="mt-2 text-sm text-ink-muted">
          {row.natureText} · {row.stageText} · 招 {row.headcount} 人
        </p>

        {/* 五要素之三：报名截止 */}
        <p className={cn("mt-1 text-sm", closed ? "text-ink-muted" : "text-ink-muted")}>
          示例报名{row.deadline}
        </p>

        {/* 五要素之四：一条关键依据或风险 */}
        <p
          className={cn(
            "mt-2 text-sm leading-6",
            closed ? "font-medium text-danger" : "text-ink-muted",
          )}
        >
          {closed ? row.gateReason : row.oneLineReason}
        </p>

        {/* 五要素之五：一个下一步（查看判断依据 / 报名 / 登录关注）+ 次级展开入口 */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {primaryAction}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            {expanded ? "收起长证据" : "展开长证据"}
            <svg
              aria-hidden="true"
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-line px-4 py-3">
          {/* 长证据 1：逐项条件，官方事实与系统判断分两栏 */}
          <p className="text-xs font-semibold text-ink-muted">条件核对（虚构公告表述 / 系统预筛判断）</p>
          <ul className="mt-2 divide-y divide-line">
            {row.dimensions.map((dim) => {
              const meta = DIMENSION_VALUE_META[dim.value];
              return (
                <li key={`${row.unitId}-${dim.label}`} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{dim.label}</span>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium", meta.className)}>
                      <span aria-hidden="true">{meta.symbol}</span>
                      {meta.text}
                    </span>
                  </div>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    <p className="rounded-md bg-canvas p-2 text-xs leading-5 text-ink">
                      <span className="block font-medium text-ink-muted">示例公告怎么写（非官方事实）</span>
                      {dim.officialRequirement ?? (
                        <span className="text-ink-muted">
                          该条件无单独原文摘录，岗位地区以岗位表对应行为准
                        </span>
                      )}
                    </p>
                    <p className="rounded-md bg-surface p-2 text-xs leading-5 text-ink ring-1 ring-line">
                      <span className="block font-medium text-ink-muted">系统预筛判断（基于你填写的画像）</span>
                      {dim.reason}
                      {dim.value === "UNKNOWN" && (
                        <span className="mt-1 block text-warn">
                          缺少信息不是不符合，补充后会重新判断。
                        </span>
                      )}
                      {dim.value === "MANUAL_REVIEW" && (
                        <span className="mt-1 block text-warn">
                          公告表述可能有多种解释，需招聘单位确认，系统不能自动判定。
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* 长证据 2：官方来源与核对时间 */}
          <p className="mt-3 text-xs font-semibold text-ink-muted">示例来源与时间</p>
          <dl className="mt-1.5 space-y-1 text-xs text-ink-muted">
            <div className="flex gap-2">
              <dt className="shrink-0">发布单位</dt>
              <dd>{row.publisher}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0">模拟核对时间</dt>
              <dd>{row.checkedAtText}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0">公告来源</dt>
              <dd>
                {officialLink ? (
                  <a href={officialLink} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2 hover:text-brand-strong">
                    打开公告（新窗口）
                  </a>
                ) : "虚构示例，无可访问的官方公告"}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-ink-muted">
            演示示例，非在报岗位；字段以官方公告为准。初步匹配结果不等于保证可以报名，最终资格以招聘单位审核为准。
          </p>
        </div>
      )}
    </article>
  );
}
