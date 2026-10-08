"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCurrentUser } from "@/lib/auth";
import { guestSessionService } from "@/lib/guest/guestSession";
import { buildGuestPreview, type GuestPreview } from "@/lib/guest/previewEngine";
import { GUEST_COVERAGE } from "@/lib/guest/coverage";
import { getRollingDemoAnnouncements } from "@/lib/seed/demoTimeline";
import { Hero } from "@/components/ia/Hero";
import { OpportunityCard } from "@/components/ia/OpportunityCard";
import { Disclosure, LayerHeading } from "@/components/ia/Layer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/Loading";
import { trackOncePerUser } from "@/lib/analytics/eventService";
import type { GuestPreviewReady } from "@/lib/guest/previewEngine";
import type { ProfileLimitation } from "@/lib/guest/guestSession";

/**
 * v6.1 访客初步机会结果页：
 * 未登录完成五组画像后，立即看到按匹配程度排序的教师公开招聘机会。
 *
 * - 优先展示“初步符合”，其余机会按需要补充的条件分组，并说明为什么要补、影响几个机会；
 * - 每条机会都能展开看到逐项条件依据与官方来源；
 * - 未填写户籍/年龄等条件只显示“补充信息后判断”，绝不判为不符合；
 * - 未登录可完整查看，只有“关注/保存”一个主行动触发登录；
 * - 不生成 7 天备考计划；非语文学科显示“尚未开放 + 留下意向”终态。
 */
export default function PreviewPage() {
  const router = useRouter();
  const { status } = useCurrentUser();

  const [state] = useState<{ preview: GuestPreview | null; intentionLeft: boolean }>(() => {
    if (typeof window === "undefined") return { preview: null, intentionLeft: false };
    const session = guestSessionService.load();
    if (!session) return { preview: null, intentionLeft: false };
    const now = new Date();
    return {
      preview: buildGuestPreview(session.draft, getRollingDemoAnnouncements(now), now.toISOString()),
      intentionLeft: session.draft.intentionLeft === true,
    };
  });
  const [intentionLeft, setIntentionLeft] = useState(state.intentionLeft);
  const [intentionError, setIntentionError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated") {
      // 已登录用户有自己的机会主流程，访客预览不对其开放
      router.replace("/opportunities");
      return;
    }
    if (!state.preview || state.preview.kind === "incomplete") {
      router.replace("/onboarding");
    }
  }, [status, router, state.preview]);

  if (status === "loading") return <LoadingPage />;
  if (!state.preview || state.preview.kind === "incomplete") return <LoadingPage />;

  if (state.preview.kind === "subject_not_open") {
    return (
      <NotOpenSubject
        subjectLabel={state.preview.subjectLabel}
        intentionLeft={intentionLeft}
        error={intentionError}
        onLeaveIntention={() => {
          try {
            guestSessionService.save({ draft: { intentionLeft: true } });
            setIntentionLeft(true);
            setIntentionError(null);
          } catch {
            setIntentionError("本机存储不可用，意向没有保存，请检查浏览器存储设置后重试。");
          }
        }}
      />
    );
  }

  return <ReadyPreview preview={state.preview} />;
}

/* ================== 学科尚未开放终态 ================== */

function NotOpenSubject({
  subjectLabel,
  intentionLeft,
  error,
  onLeaveIntention,
}: {
  subjectLabel: string;
  intentionLeft: boolean;
  error: string | null;
  onLeaveIntention: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-slate-50">
      <div className="max-w-lg mx-auto px-4 py-10">
        <Card className="text-center py-10">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl" aria-hidden="true">🚧</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            「{subjectLabel}」教师公开招聘匹配尚未开放
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">
            当前先开放<strong className="text-slate-700">语文</strong>教师公开招聘。
            为了避免误导，我们不会用语文岗位为你生成不相关的匹配结果。
          </p>
          {intentionLeft ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              已在本机记录你对「{subjectLabel}」的开注意向。
              <p className="text-xs text-emerald-700 mt-1">
                意向仅保存在当前浏览器，不会上传服务器；演示环境不会发送真实通知。
              </p>
            </div>
          ) : (
            <Button size="lg" fullWidth onClick={onLeaveIntention}>
              留下「{subjectLabel}」开注意向
            </Button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-3">
            意向只保存在本机浏览器，不上传、不发送真实通知。
          </p>
        </Card>
        <p className="text-center text-sm text-slate-500 mt-6">
          想先看看语文机会？
          <Link href="/onboarding" className="text-blue-600 hover:underline ml-1">
            返回修改学科
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ================== 初步机会结果 ================== */

/** 真实监测事实行（与首页同一数据源）；下方 seed 机会必须明确标注为演示示例 */
function formatCoverageLine(): string {
  const d = new Date(GUEST_COVERAGE.lastCheckedAt);
  const day = Number.isNaN(d.getTime())
    ? GUEST_COVERAGE.lastCheckedAt
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `真实监测：杭州、宁波语文教师渠道，最近核对 ${day}，当前在报 ${GUEST_COVERAGE.openOpportunityCount} 个；下方为功能演示示例公告，非在报岗位。`;
}

/** 这些维度属于「条件画像」，本就不在基础五组中采集；基础五组被跳过时不显示该行 */
const CONDITIONAL_DIMENSIONS = new Set([
  "hukou",
  "age",
  "social_security",
  "work_experience",
  "other",
]);

function ReadyPreview({ preview }: { preview: GuestPreviewReady }) {
  const { view, followUps, limitations, primaryAction } = preview;

  // P0 漏斗②：访客看到至少一个有效（初步符合）机会；同用户只记一次
  useEffect(() => {
    if (view.validCount > 0) {
      trackOncePerUser("opportunity_revealed", "opportunity", {
        targetId: view.priority?.unitId,
        props: { validCount: view.validCount },
      });
    }
    // 仅在预览结果首次展示时记录
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 优先卡默认展开，其余卡片默认收起（与机会页同一交互）
  const [priorityOpen, setPriorityOpen] = useState(true);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

  const toggleRow = (unitId: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  // 留档分区：即使没有有效机会（空态），地区不重叠/明确不符合/异常桶仍可追溯，
  // 不能因为无优先机会就把这些记录藏掉。
  const archiveSections = (
    <>
      {view.regionOutOfScope.length > 0 && (
        <Disclosure
          title="岗位地区不在你选择的范围（不是资格不符合）"
          count={view.regionOutOfScope.length}
        >
          <div className="space-y-3">
            <p className="text-xs leading-5 text-slate-500">
              这些岗位只是地点不在你勾选的可接受地区内，其他条件没有被判为不符合；
              修改画像地区后会重新评估。
            </p>
            {view.regionOutOfScope.map((row) => (
              <OpportunityCard
                key={row.unitId}
                row={row}
                regionOutOfScope
                expanded={openIds.has(row.unitId)}
                onToggle={() => toggleRow(row.unitId)}
              />
            ))}
          </div>
        </Disclosure>
      )}

      {view.notEligible.length > 0 && (
        <Disclosure title="明确不符合（资格条件本身不满足）" count={view.notEligible.length}>
          <div className="space-y-3">
            {view.notEligible.map((row) => (
              <OpportunityCard
                key={row.unitId}
                row={row}
                expanded={openIds.has(row.unitId)}
                onToggle={() => toggleRow(row.unitId)}
              />
            ))}
          </div>
        </Disclosure>
      )}

      {view.closedBuckets.map((bucket) => (
        <Disclosure key={bucket.key} title={bucket.label} count={bucket.rows.length}>
          <div className="space-y-3">
            {bucket.rows.map((row) => (
              <OpportunityCard
                key={row.unitId}
                row={row}
                expanded={openIds.has(row.unitId)}
                onToggle={() => toggleRow(row.unitId)}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            该状态只表示当前不进入推荐，历史留档仍可追溯；它不是资格不符合结论。
          </p>
        </Disclosure>
      ))}
    </>
  );

  // 空数据：画像完整但已覆盖公告中没有可考虑机会
  if (!view.priority) {
    const missingRegion = limitations.some((item) => item.step === 1);
    const regionFollowUp = followUps.find((f) => f.dimension === "region");
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-slate-50">
        <div className="mx-auto max-w-2xl space-y-4 py-6 px-4">
          <p className="text-xs text-slate-500">{formatCoverageLine()}</p>
          <UncoveredRegionsCard regionLabels={view.uncoveredRegions.map((r) => r.label)} />
          {missingRegion && (
            <Card className="border-amber-200 bg-amber-50/70" data-testid="missing-region-notice">
              <h2 className="text-sm font-semibold text-amber-900">
                你选择了暂不提供「能接受的地区」
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-800">
                没有地区意向时不会给出任何「初步符合」结果
                {regionFollowUp ? `（当前 ${regionFollowUp.affectsCount} 个示例岗位都在等你补充地区）` : ""}
                ；这不是不符合，补充至少一个地区后结论会立即重新计算。
              </p>
              <Link
                href="/onboarding"
                className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                返回补充地区
              </Link>
            </Card>
          )}
          <EmptyState
            title={
              missingRegion
                ? "补充地区后才能看到可考虑的机会"
                : "当前已覆盖的公告里还没有你能考虑的机会"
            }
            description="可以修改地区或学历等条件再看；未覆盖地区不等于没有招聘，新公告核对后会出现在这里。"
            actionLabel="返回修改画像"
            actionHref="/onboarding"
          />
          <LimitationsCard limitations={limitations} />
          {archiveSections}
        </div>
      </div>
    );
  }

  const priority = view.priority;
  const otherPreliminary = view.preliminary.filter((row) => row.unitId !== priority.unitId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* 第一层：一句结论 + 一个风险 + 唯一主行动（关注才登录） */}
        <Hero
          meta={formatCoverageLine()}
          conclusion={view.conclusion}
          risk={view.risk}
          action={
            primaryAction
              ? { label: primaryAction.label, href: primaryAction.href }
              : undefined
          }
        >
          <p className="text-xs text-slate-400">
            不登录也可以继续查看全部结果；登录后才能关注机会、保存画像和跟踪报名（演示环境不发送真实通知）。
          </p>
        </Hero>

        {/* 最低必要信息缺失导致的结果限制（用户选择过「暂不提供」） */}
        <LimitationsCard limitations={limitations} />

        {/* 画像地区暂未收录：暂未收录 ≠ 当地没有招聘 */}
        <UncoveredRegionsCard
          regionLabels={view.uncoveredRegions.map((region) => region.label)}
        />

        {/* 优先机会：首屏可见，默认展开依据 */}
        <div id="priority-opportunity" className="space-y-2">
          <LayerHeading title="最值得先看的机会" />
          <OpportunityCard
            row={priority}
            priority
            expanded={priorityOpen}
            onToggle={() => setPriorityOpen((v) => !v)}
          />
        </div>

        {/* 其他初步符合 */}
        {otherPreliminary.length > 0 && (
          <section className="space-y-3">
            <LayerHeading title="其他初步符合" count={otherPreliminary.length} />
            {otherPreliminary.map((row) => (
              <OpportunityCard
                key={row.unitId}
                row={row}
                expanded={openIds.has(row.unitId)}
                onToggle={() => toggleRow(row.unitId)}
              />
            ))}
          </section>
        )}

        {/* 按需补问：按缺失条件分组，说明原因与影响面；不补 ≠ 不符合 */}
        {followUps.map((followUp) => {
          const group = view.needInfoGroups.find((g) => g.dimension === followUp.dimension);
          if (!group) return null;
          return (
            <section key={followUp.dimension} className="space-y-3">
              <LayerHeading
                title={`补充${followUp.dimensionText}信息后判断`}
                count={followUp.affectsCount}
              />
              <Card className="bg-amber-50/60 border-amber-200">
                <p className="text-sm text-amber-800 leading-relaxed">
                  有 {followUp.affectsCount} 个机会需要这条信息。{followUp.reason}
                </p>
                {CONDITIONAL_DIMENSIONS.has(followUp.dimension) && (
                  <p className="text-xs text-amber-700/80 mt-1">
                    年龄、户籍、社保和工作经历只在具体机会需要时补问，不需要在基础信息里一次填完。
                  </p>
                )}
              </Card>
              {group.rows.map((row) => (
                <OpportunityCard
                  key={row.unitId}
                  row={row}
                  expanded={openIds.has(row.unitId)}
                  onToggle={() => toggleRow(row.unitId)}
                />
              ))}
            </section>
          );
        })}

        {/* 建议人工确认 */}
        {view.manualReview.length > 0 && (
          <section className="space-y-3">
            <LayerHeading title="建议向招聘单位确认" count={view.manualReview.length} />
            {view.manualReview.map((row) => (
              <OpportunityCard
                key={row.unitId}
                row={row}
                expanded={openIds.has(row.unitId)}
                onToggle={() => toggleRow(row.unitId)}
              />
            ))}
          </section>
        )}

        {/* 留档分区：仅地区不重叠 / 明确不符合 / 异常态分桶 */}
        {archiveSections}

        <p className="text-center text-xs text-slate-400">
          初步匹配结果不等于保证可以报名，最终资格以招聘单位审核为准。
          演示机会与画像均保存在本机浏览器，可随时
          <Link href="/onboarding" className="text-blue-600 hover:underline mx-1">
            返回修改画像
          </Link>
          ，结果会重新计算。
        </p>
      </div>
    </div>
  );
}

/* ================== 画像地区暂未收录提示 ================== */

function UncoveredRegionsCard({ regionLabels }: { regionLabels: string[] }) {
  if (regionLabels.length === 0) return null;
  return (
    <section
      data-testid="uncovered-regions"
      className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3"
    >
      <h2 className="text-sm font-semibold text-slate-700">
        这些地区当前暂未收录官方公告
      </h2>
      <p className="mt-1 text-xs text-slate-600">{regionLabels.join("、")}</p>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">
        暂未收录不等于当地没有招聘：可能公告尚未发布，或还没进入演示数据的覆盖范围。
        结果是预筛而非官方资格认定，报名前请以当地教育局/人社局官网为准。
      </p>
      <Link
        href="/onboarding"
        className="mt-2 inline-block text-xs font-medium text-blue-700 underline underline-offset-2"
      >
        修改画像地区
      </Link>
    </section>
  );
}

/* ================== 最低必要信息缺失的结果限制卡 ================== */

function LimitationsCard({ limitations }: { limitations: ProfileLimitation[] }) {
  if (limitations.length === 0) return null;
  return (
    <section
      aria-label="暂未提供信息导致的结果限制"
      data-testid="profile-limitations"
      className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3"
    >
      <h2 className="text-sm font-semibold text-amber-900">
        有 {limitations.length} 项信息你暂未提供，结果已相应收窄
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {limitations.map((item) => (
          <li key={item.step} className="text-xs leading-relaxed text-amber-800">
            <span className="font-medium">{item.label}：</span>
            {item.impact}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        缺失信息一律显示「补充信息后判断」，不会被判为不符合；
        <Link href="/onboarding" className="font-medium underline underline-offset-2 ml-1">
          返回补填
        </Link>
        后结果自动更新。
      </p>
    </section>
  );
}
