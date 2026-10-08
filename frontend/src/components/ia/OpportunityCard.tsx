"use client";

import { useId, useState } from "react";
import Link from "next/link";
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

/**
 * 访客机会卡（模块 5 信息层级：首层七要素 + 一个下一步）：
 * 报考单元 · 用工性质/学段 · 人数 · 截止时间 · 四档/闸门状态 ·
 * 一条关键依据或风险 · 一个下一步。长证据（逐项条件、官方来源）按需展开。
 * 整张卡不再是一个大按钮：主行动由 guestCardNextStep 唯一决定，
 * 展开/收起只是次级文本操作。
 */

const DIMENSION_VALUE_META: Record<
  DimensionView["value"],
  { text: string; symbol: string; className: string }
> = {
  PASS: { text: "已满足", symbol: "✓", className: "text-emerald-700" },
  UNKNOWN: { text: "信息不足，补充后判断", symbol: "?", className: "text-amber-700" },
  MANUAL_REVIEW: { text: "存在歧义，建议向招聘单位确认", symbol: "!", className: "text-amber-700" },
  FAIL: { text: "不满足", symbol: "×", className: "text-red-700" },
};

const PRIMARY_ACTION_CLASS =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

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
        <button
          type="button"
          onClick={toggleGuestFollow}
          className={PRIMARY_ACTION_CLASS}
          aria-pressed={guestFollowed}
        >
          {guestFollowed ? "已关注（本机保存）" : step.label}
        </button>
      );
    }
    if (step.kind === "onboarding") {
      return (
        <Link href="/onboarding" className={PRIMARY_ACTION_CLASS}>
          {step.label}
        </Link>
      );
    }
    if (step.kind === "official" && officialLink) {
      return (
        <a
          href={officialLink}
          target="_blank"
          rel="noopener noreferrer"
          className={PRIMARY_ACTION_CLASS}
        >
          {step.label}
        </a>
      );
    }
    if (step.kind === "official") {
      return <button type="button" onClick={onToggle} className={PRIMARY_ACTION_CLASS}>查看演示依据</button>;
    }
    return (
      <button type="button" onClick={onToggle} className={PRIMARY_ACTION_CLASS}>
        {step.label}
      </button>
    );
  })();

  return (
    <article
      className={cn(
        "rounded-xl border bg-white",
        priority ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200",
      )}
    >
      <h3 className="sr-only">{row.unitName}</h3>

      <div className="p-4">
        {/* 报考单元 + 状态 */}
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-semibold text-slate-900">
            <span className="font-normal text-slate-500">{row.regionText}</span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">|</span>
            <span className="break-words">{row.unitName}</span>
          </p>
          {closed && row.gateCode ? (
            <GateTag code={row.gateCode} />
          ) : regionOutOfScope ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-600">
              <span
                aria-hidden="true"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-400 text-[10px] font-bold text-white"
              >
                ◌
              </span>
              地区不在选择范围
            </span>
          ) : (
            <MatchStatusTag status={row.status} />
          )}
        </div>

        {/* 用工性质/学段 · 人数 */}
        <p className="mt-2 text-sm text-slate-600">
          {row.natureText} · {row.stageText} · 招 {row.headcount} 人
        </p>

        {/* 截止时间 */}
        <p className={cn("mt-1 text-sm", closed ? "text-slate-400" : "text-slate-600")}>
          示例报名{row.deadline}
        </p>

        {/* 一条关键依据或风险 */}
        <p
          className={cn(
            "mt-2 text-sm leading-6",
            closed ? "font-medium text-red-700" : "text-slate-600",
          )}
        >
          {closed ? row.gateReason : row.oneLineReason}
        </p>

        {/* 一个下一步 + 次级展开入口 */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {primaryAction}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
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
        <div id={panelId} className="border-t border-slate-200 px-4 py-3">
          {/* 长证据 1：逐项条件，官方事实与系统判断分两栏 */}
          <p className="text-xs font-semibold text-slate-500">条件核对（虚构公告表述 / 系统预筛判断）</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {row.dimensions.map((dim) => {
              const meta = DIMENSION_VALUE_META[dim.value];
              return (
                <li key={`${row.unitId}-${dim.label}`} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-700">{dim.label}</span>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium", meta.className)}>
                      <span aria-hidden="true">{meta.symbol}</span>
                      {meta.text}
                    </span>
                  </div>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    <p className="rounded-md bg-slate-50 p-2 text-xs leading-5 text-slate-700">
                      <span className="block font-medium text-slate-500">示例公告怎么写（非官方事实）</span>
                      {dim.officialRequirement ?? (
                        <span className="text-slate-400">
                          该条件无单独原文摘录，岗位地区以岗位表对应行为准
                        </span>
                      )}
                    </p>
                    <p className="rounded-md bg-white p-2 text-xs leading-5 text-slate-600 ring-1 ring-slate-100">
                      <span className="block font-medium text-slate-500">系统预筛判断（基于你填写的画像）</span>
                      {dim.reason}
                      {dim.value === "UNKNOWN" && (
                        <span className="mt-1 block text-amber-700">
                          缺少信息不是不符合，补充后会重新判断。
                        </span>
                      )}
                      {dim.value === "MANUAL_REVIEW" && (
                        <span className="mt-1 block text-amber-700">
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
          <p className="mt-3 text-xs font-semibold text-slate-500">示例来源与时间</p>
          <dl className="mt-1.5 space-y-1 text-xs text-slate-500">
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
                  <a href={officialLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-2">
                    打开公告（新窗口）
                  </a>
                ) : "虚构示例，无可访问的官方公告"}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-slate-400">
            演示示例，非在报岗位；字段以官方公告为准。初步匹配结果不等于保证可以报名，最终资格以招聘单位审核为准。
          </p>
        </div>
      )}
    </article>
  );
}
