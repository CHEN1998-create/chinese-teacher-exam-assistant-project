"use client";

import Link from "next/link";
import { Hero } from "@/components/ia/Hero";
import { Disclosure, LayerHeading } from "@/components/ia/Layer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingPage } from "@/components/ui/Loading";
import { dimensionLabel, daysUntil } from "@/lib/ia/labels";
import { useOpportunities } from "@/lib/opportunities/useOpportunities";
import {
  buildListViewModel,
  formatEvaluatedAt,
} from "@/lib/opportunities/list-view";
import { OpportunityListItem } from "@/components/opportunities/OpportunityListItem";
import { CoverageBanner } from "@/components/opportunities/CoverageBanner";

const NO_PROFILE_COPY: Record<string, { title: string; description: string }> = {
  no_draft: {
    title: "先完成基础画像，才能看到为你匹配的机会",
    description:
      "完成可接受地区、学历学位、专业、毕业与就业状态、教师资格五组基础信息后，系统会即时匹配已发布公告。",
  },
  incomplete: {
    title: "基础画像还差几步",
    description: "回到画像向导补全五组基础信息，机会列表会立即重新计算。",
  },
  subject_not_open: {
    title: "当前只开放语文学科的机会匹配",
    description:
      "你的意向学科尚未开放。可以在画像向导中登记意向，开放后会优先评估。",
  },
};

export default function OpportunitiesPage() {
  const { state, reload, followBusyId, actionError, toggleFollow } =
    useOpportunities();

  if (state.status === "loading") return <LoadingPage />;

  if (state.status === "no-profile") {
    const copy = NO_PROFILE_COPY[state.reason] ?? NO_PROFILE_COPY.no_draft!;
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title={copy.title}
          description={copy.description}
          actionLabel="去完成基础画像"
          actionHref="/onboarding"
        />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <ErrorState
        title="机会暂时加载失败"
        description={`${state.error}。正式结果来自已登录的后端服务，不会用本地演示数据替代；请检查服务后重试。`}
        onRetry={reload}
      />
    );
  }

  const view = buildListViewModel(state.data, state.profile);
  const evaluatedAt = view.meta.evaluatedAt;

  // 最近的报名截止（只在初步符合中找）：7 天内给出必须级风险提示
  let risk: { tone: "must" | "info"; text: string } | null = null;
  const priorityEnd = view.priority?.version.timeline.registrationEnd;
  const nearest =
    view.priority && priorityEnd ? daysUntil(priorityEnd, evaluatedAt) : null;
  if (nearest !== null && nearest >= 0 && nearest <= 7) {
    risk = {
      tone: "must",
      text: `优先机会报名还有 ${nearest} 天截止，请尽快完成关注与报名准备。`,
    };
  } else if (view.needInfoGroups.length > 0 || view.manualReview.length > 0) {
    risk = {
      tone: "info",
      text: "部分机会需要补充信息或向招聘单位确认后才能判断，未确认前不要当作可报结论。",
    };
  } else if (view.excludedCount > 0) {
    risk = {
      tone: "info",
      text: "已截止与明确不符合的机会不进入推荐，可在页面底部查看原因与公告留档。",
    };
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-2">
      <Hero
        meta={`已发布公告即时匹配 · 有效机会 ${view.validCount} 个 · 评估于 ${formatEvaluatedAt(evaluatedAt)}`}
        conclusion={view.conclusion}
        risk={risk}
        action={
          view.priority
            ? {
                label: "查看优先机会的依据与下一步",
                href: `/opportunities/${view.priority.unit.id}`,
              }
            : undefined
        }
      />

      <CoverageBanner coverage={view.coverage} />

      {view.uncoveredRegions.length > 0 && (
        <div
          data-testid="uncovered-regions"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"
        >
          <p className="text-sm font-semibold text-slate-700">
            这些地区当前暂未收录官方公告
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {view.uncoveredRegions.map((region) => (
              <span
                key={region.code}
                className="inline-flex items-center rounded-full bg-white px-2 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200"
              >
                {region.label}
              </span>
            ))}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            暂未收录不等于当地没有招聘：可能公告尚未发布，或还没进入我们的监测范围。
            结果是预筛而非官方资格认定，报名前请以当地教育局/人社局官网为准。
          </p>
          <Link
            href="/onboarding"
            className="mt-2 inline-block text-xs font-medium text-blue-700 underline underline-offset-2"
          >
            修改画像地区
          </Link>
        </div>
      )}

      {view.emptyResult && (
        <EmptyState
          title="当前已核对范围内没有可展示的机会"
          description={`已核对范围见上方监测说明（${view.coverage.scopeNote || "未覆盖地区不等于没有招聘"}）。你可以修改画像条件后重新评估，或稍后回来查看新公告。`}
          actionLabel="修改我的画像"
          actionHref="/onboarding"
        />
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          操作未完成：{actionError}
        </p>
      )}

      {view.priority && (
        <div id="priority-opportunity" className="scroll-mt-20 space-y-2">
          <LayerHeading
            title={
              view.priority.unit.id === view.primaryTargetUnitId
                ? "主要备考目标"
                : "优先机会"
            }
          />
          <OpportunityListItem
            unit={view.priority}
            evaluatedAt={evaluatedAt}
            priority
            defaultExpanded
            followBusy={followBusyId === view.priority.unit.id}
            onToggleFollow={toggleFollow}
          />
        </div>
      )}

      {view.otherPreliminary.length > 0 && (
        <section className="space-y-3">
          <LayerHeading title="其他初步符合" count={view.otherPreliminary.length} />
          {view.otherPreliminary.map((unit) => (
            <OpportunityListItem
              key={unit.unit.id}
              unit={unit}
              evaluatedAt={evaluatedAt}
              followBusy={followBusyId === unit.unit.id}
              onToggleFollow={toggleFollow}
            />
          ))}
        </section>
      )}

      {view.needInfoGroups.map((group) => (
        <section key={group.dimension} className="space-y-3">
          <LayerHeading
            title={`补充${dimensionLabel(group.dimension)}信息后判断`}
            count={group.count}
          />
          {group.units.map((unit) => (
            <OpportunityListItem
              key={unit.unit.id}
              unit={unit}
              evaluatedAt={evaluatedAt}
              followBusy={followBusyId === unit.unit.id}
              onToggleFollow={toggleFollow}
            />
          ))}
        </section>
      ))}

      {view.manualReview.length > 0 && (
        <section className="space-y-3">
          <LayerHeading
            title="建议向招聘单位确认"
            count={view.manualReview.length}
          />
          {view.manualReview.map((unit) => (
            <OpportunityListItem
              key={unit.unit.id}
              unit={unit}
              evaluatedAt={evaluatedAt}
              followBusy={followBusyId === unit.unit.id}
              onToggleFollow={toggleFollow}
            />
          ))}
        </section>
      )}

      {view.realMonitored.length > 0 && (
        <section
          id="real-monitored"
          data-testid="real-monitored"
          className="space-y-3 scroll-mt-20"
        >
          <LayerHeading
            title="真实监测记录（杭州 / 宁波 · AI 初核待人工复核）"
            count={view.realMonitored.length}
          />
          {view.realMonitored.map((unit) => (
            <OpportunityListItem
              key={unit.unit.id}
              unit={unit}
              evaluatedAt={evaluatedAt}
              followBusy={followBusyId === unit.unit.id}
              onToggleFollow={toggleFollow}
            />
          ))}
          <p className="text-xs leading-relaxed text-slate-400">
            这些记录来自政府官网公告原文与岗位表附件，可逐卡片点开「官方原文 /
            岗位表附件」核对；在人工复核完成前，它们不会进入「初步符合」推荐。
          </p>
        </section>
      )}

      {view.regionOutOfScope.length > 0 && (
        <Disclosure
          title="岗位地区不在你选择的范围（不是资格不符合）"
          count={view.regionOutOfScope.length}
        >
          <div className="space-y-3">
            <p className="text-xs leading-5 text-slate-500">
              这些岗位只是地点不在你画像勾选的可接受地区内，学历、专业等条件并未判定为不符合。
              调整画像地区后会重新评估。
            </p>
            {view.regionOutOfScope.map((unit) => (
              <OpportunityListItem
                key={unit.unit.id}
                unit={unit}
                evaluatedAt={evaluatedAt}
                regionOutOfScope
              />
            ))}
          </div>
        </Disclosure>
      )}

      {view.notEligible.length > 0 && (
        <Disclosure title="明确不符合（资格条件本身不满足）" count={view.notEligible.length}>
          <div className="space-y-3">
            {view.notEligible.map((unit) => (
              <OpportunityListItem
                key={unit.unit.id}
                unit={unit}
                evaluatedAt={evaluatedAt}
              />
            ))}
          </div>
        </Disclosure>
      )}

      {view.closedBuckets.map((bucket) => (
        <Disclosure key={bucket.key} title={bucket.label} count={bucket.units.length}>
          <div className="space-y-3">
            {bucket.units.map((unit) => (
              <OpportunityListItem
                key={unit.unit.id}
                unit={unit}
                evaluatedAt={evaluatedAt}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            该状态只表示当前不进入推荐，历史留档与官方依据仍可追溯；它不是资格不符合结论。
          </p>
        </Disclosure>
      ))}
    </div>
  );
}
