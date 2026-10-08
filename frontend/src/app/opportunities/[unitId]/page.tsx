"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Hero } from "@/components/ia/Hero";
import { Disclosure, LayerHeading } from "@/components/ia/Layer";
import { GateTag, MatchStatusTag } from "@/components/ia/MatchStatusTag";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingPage } from "@/components/ui/Loading";
import {
  deadlineText,
  natureShortLabel,
  regionLabel,
  stageLabel,
} from "@/lib/ia/labels";
import { MATCH_STATUS_LABELS } from "@/lib/matching/types";
import { opportunitiesApi } from "@/lib/opportunities/api";
import type {
  FollowStatus,
  MaterialStatus,
  StudyTargetRole,
  UnitDetailResponse,
} from "@/lib/opportunities/api-types";
import {
  failedGateViews,
  groupDimensions,
  nextAction,
  primaryGate,
} from "@/lib/opportunities/detail-view";
import { useActiveProfile } from "@/lib/opportunities/useOpportunities";
import {
  buildActiveProfile,
  supplementFactsService,
  type SupplementFacts,
} from "@/lib/profile/activeProfile";
import type { UserRecruitmentProfile } from "@/lib/profile/types";
import { ConditionRows } from "@/components/opportunities/ConditionRows";
import { FollowControls } from "@/components/opportunities/FollowControls";
import { SupplementForm } from "@/components/opportunities/SupplementForm";
import {
  OfficialSourceSection,
  VerificationSection,
} from "@/components/opportunities/EvidenceSection";
import { CorrectionModal } from "@/components/opportunities/CorrectionModal";
import { ActionChain } from "@/components/opportunities/ActionChain";
import { MaterialsList } from "@/components/opportunities/MaterialsList";
import { ConsultationPanel } from "@/components/opportunities/ConsultationPanel";
import { track, trackView } from "@/lib/analytics/eventService";
import { gateStateMeta } from "@/lib/gate-states";

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export default function OpportunityDetailPage() {
  const params = useParams<{ unitId: string }>();
  const unitId = params?.unitId ?? "";
  const router = useRouter();
  const profileState = useActiveProfile();

  const [detail, setDetail] = useState<UnitDetailResponse | null>(null);
  const [loading, setLoading] = useState(
    () => profileState.status === "ready",
  );
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<SupplementFacts>(() =>
    supplementFactsService.load(),
  );
  const [savingFacts, setSavingFacts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionDone, setCorrectionDone] = useState(false);

  // 手动重试 / 补充信息后重拉：事件处理器中调用，可以同步切 loading。
  // 返回最新响应，供「补信息导致结论变化」对比前后结论（模块 7 埋点）。
  const loadDetail = useCallback(
    async (profile: UserRecruitmentProfile): Promise<UnitDetailResponse | undefined> => {
      setLoading(true);
      setError(null);
      try {
        const response = await opportunitiesApi.unitDetail(unitId, profile);
        setDetail(response);
        // P0 漏斗③：打开详情即看到逐项官方依据（同一会话每机会只记一次）
        trackView(unitId, "match_basis_viewed", "opportunity", {
          targetId: unitId,
          props: { fieldCount: response.unit.dimensions.length },
        });
        return response;
      } catch (e) {
        setError(e instanceof Error ? e.message : "详情加载失败");
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [unitId],
  );

  // 首次加载：setState 均在异步回调中，避免渲染级联
  useEffect(() => {
    if (profileState.status !== "ready") return;
    let cancelled = false;
    opportunitiesApi
      .unitDetail(unitId, profileState.profile)
      .then((response) => {
        if (!cancelled) {
          setDetail(response);
          // P0 漏斗③：打开详情即看到逐项官方依据（同一会话每机会只记一次）
          trackView(unitId, "match_basis_viewed", "opportunity", {
            targetId: unitId,
            props: { fieldCount: response.unit.dimensions.length },
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "详情加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unitId, profileState]);

  if (loading) return <LoadingPage />;

  if (profileState.status === "no-profile") {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title="先完成基础画像，才能查看这项机会的匹配依据"
          description="机会详情中的每个结论都由后端按你的画像即时计算。"
          actionLabel="去完成基础画像"
          actionHref="/onboarding"
        />
      </div>
    );
  }

  // 到此分支 profileState 必然 ready（上面已对 loading/no-profile 提前返回）
  const profile = profileState.profile;

  if (error || !detail) {
    return (
      <ErrorState
        title="机会详情加载失败"
        description={
          error ?? "未找到该报考单元，它可能不属于当前已发布公告版本。"
        }
        onRetry={() => void loadDetail(profile)}
      />
    );
  }

  const unit = detail.unit;
  const groups = groupDimensions(unit.dimensions);
  const primaryClosedGate = primaryGate(unit.gates);
  const gateViews = failedGateViews(unit.gates);
  const closed = gateViews.length > 0;
  const action = nextAction(unit);
  const deadline = deadlineText(
    unit.version.timeline.registrationEnd,
    detail.meta.evaluatedAt,
  );

  const heroAction = (() => {
    const base = { label: action.label };
    if (action.href) {
      return { ...base, href: action.href, external: action.external };
    }
    if (action.kind === "supplement") {
      return { ...base, onClick: () => scrollToId("supplement") };
    }
    if (action.kind === "confirm") {
      return { ...base, onClick: () => scrollToId("to-confirm") };
    }
    if (action.kind === "reviewFail") {
      return { ...base, onClick: () => scrollToId("unsatisfied") };
    }
    if (action.kind === "follow") {
      return {
        ...base,
        onClick: () => void followUnit(),
      };
    }
    if (action.kind === "prepare") {
      // 必须走 handleTransition：首屏主行动与下方跟进区共用同一条状态流转与
      // P0 漏斗⑥埋点，不能只调 API 导致主行动路径漏记 follow_status_changed。
      return {
        ...base,
        onClick: () => void handleTransition("preparing"),
      };
    }
    // waiting / registered：滚动到跟进区（register/official 已在前面处理外链）
    return { ...base, onClick: () => scrollToId("follow") };
  })();

  /** 用最新本机画像（含刚保存的补充事实）重新拉取后端结论，返回最新详情 */
  function refreshDetail(): Promise<UnitDetailResponse | undefined> {
    const active = buildActiveProfile();
    if (!active.ready) return Promise.resolve(undefined);
    return loadDetail(active.profile);
  }

  async function runAction(
    fn: () => Promise<unknown>,
    options?: { redirectAfter?: boolean },
  ) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      if (options?.redirectAfter) {
        router.push("/opportunities");
        return;
      }
      await refreshDetail();
    } catch (e) {
      const err = e as Error & { status?: number; body?: { error?: string; current?: unknown } };
      // 乐观锁冲突：服务端已有更新版本，拉取最新状态后提示用户，不丢进度
      if (err.body?.error === "VERSION_CONFLICT") {
        setActionError("状态已在其他设备更新，已同步最新状态，请重试。");
        await refreshDetail();
      } else {
        setActionError(err.message || "操作失败");
      }
    } finally {
      setBusy(false);
    }
  }

  /** 关注成功后埋点（失败由 runAction 捕获，不会产生事件） */
  const followUnit = () =>
    runAction(async () => {
      await opportunitiesApi.follow(unitId);
      // P0 漏斗④：关注机会
      track("opportunity_followed", "opportunity", {
        targetId: unitId,
        props: { from: detail?.unit.overall ?? "unknown" },
      });
    });

  const handleTransition = (
    status: FollowStatus,
    opts?: { note?: string; abandonReason?: string },
  ) =>
    runAction(async () => {
      const from = unit.follow?.status ?? "considering";
      await opportunitiesApi.transition(unitId, status, {
        ...opts,
        version: unit.follow?.version,
      });
      // P0 漏斗⑥：标记准备报名/已报名（含其他报名状态流转）
      track("follow_status_changed", "opportunity", {
        targetId: unitId,
        props: { from, to: status },
      });
    });

  const handleSetRole = (role: StudyTargetRole) =>
    runAction(async () => {
      await opportunitiesApi.setRole(unitId, role);
      // P0 漏斗⑦：设为主要目标
      if (role === "primary") {
        track("primary_target_set", "opportunity", { targetId: unitId });
      }
    });

  /** 标记某报名材料项完成状态（带乐观锁）；材料完成进度进看板「材料完成」（模块 7） */
  const handleMaterialStatus = (itemId: string, status: MaterialStatus) =>
    runAction(async () => {
      if (!unit.follow) return;
      await opportunitiesApi.setMaterialStatus(
        unitId,
        itemId,
        status,
        unit.follow.version,
      );
      // 只记进度枚举，不采集证件信息
      track("material_status_changed", "opportunity", {
        targetId: unitId,
        props: { to: status },
      });
    });

  /** 保存用户自行记录的官方咨询结论（带乐观锁，不影响匹配） */
  const handleConsultationNote = (dimensionKey: string, note: string) =>
    runAction(async () => {
      if (!unit.follow) return;
      await opportunitiesApi.saveConsultationNote(
        unitId,
        dimensionKey,
        note,
        unit.follow.version,
      );
    });

  const handleSaveFacts = async (next: SupplementFacts) => {
    setSavingFacts(true);
    setActionError(null);
    try {
      const saved = supplementFactsService.save(next);
      setFacts(saved);
      // 必须重新装配画像：保存后的补充事实要参与后端重算，
      // 不能复用首屏缓存的 profile。
      const beforeOverall = detail?.unit.overall;
      const fresh = await refreshDetail();
      // P0 漏斗⑤：补充资格信息成功并触发重算（只记维度与字段数，不含答案）；
      // 模块 7：对比补问前后结论，结论变化单独进看板「补信息导致结论变化」。
      const dims = {
        age: saved.birthDate !== undefined,
        hukou: saved.hukouProvinceCode !== undefined,
        social_security: saved.socialSecurityMonths !== undefined,
        work_experience: saved.workExperienceMonths !== undefined,
        other: Object.keys(saved.extraAnswers ?? {}).length > 0,
      };
      const fieldCount = Object.values(dims).filter(Boolean).length;
      if (fieldCount > 0) {
        const conclusionChanged =
          fresh && beforeOverall !== undefined
            ? fresh.unit.overall !== beforeOverall
            : false;
        track("qualification_supplemented", "profile", {
          targetId: unitId,
          props: {
            fieldCount,
            age: dims.age ? 1 : 0,
            hukou: dims.hukou ? 1 : 0,
            social_security: dims.social_security ? 1 : 0,
            work_experience: dims.work_experience ? 1 : 0,
            other: dims.other ? 1 : 0,
            conclusionChanged: conclusionChanged ? 1 : 0,
          },
        });
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingFacts(false);
    }
  };

  const handleCorrection = async (input: {
    fieldPath: string;
    content: string;
    contact?: string;
  }) => {
    setCorrectionSubmitting(true);
    setActionError(null);
    try {
      await opportunitiesApi.submitCorrection(unitId, input);
      setCorrectionOpen(false);
      setCorrectionDone(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "纠错提交失败");
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-4">
      <nav className="text-xs text-slate-500">
        <Link
          href="/opportunities"
          className="underline underline-offset-2 hover:text-blue-700"
        >
          ← 返回机会列表
        </Link>
      </nav>

      {/* 标题区（报考单元基础事实） */}
      <header className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold leading-snug text-slate-900">
            {unit.unit.name}
          </h1>
          {primaryClosedGate ? (
            <GateTag code={primaryClosedGate.code} />
          ) : (
            <MatchStatusTag status={unit.overall} />
          )}
        </div>
        <p className="text-sm text-slate-500">
          {regionLabel(unit.unit.region)} ·{" "}
          {unit.unit.employmentNature.officialName}（
          {natureShortLabel(unit.unit.employmentNature.code as never)}） ·{" "}
          {stageLabel(unit.unit.stage)} · 招 {unit.unit.headcount} 人
        </p>
        <p className="text-sm text-slate-500">
          {unit.announcement.publisher} · 报名
          {closed ? "" : deadline.text}
        </p>
        {unit.announcement.dataset === "real" && (
          <p className="text-xs text-amber-700">
            真实监测记录 · AI 初核待人工复核，不作为正式推荐依据
          </p>
        )}
        {unit.follow?.newerVersion && (
          <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
            你关注时依据的公告版本已有更新，当前展示的是最新已发布版本。
          </p>
        )}
      </header>

      {/* 第一段：结论 + 唯一下一步 */}
      <Hero
        meta={`${
          primaryClosedGate
            ? gateStateMeta(primaryClosedGate.code).label
            : MATCH_STATUS_LABELS[unit.overall]
        } · 依据规则 ${detail.meta.ruleVersion}`}
        conclusion={unit.summary}
        action={busy ? { ...heroAction, disabled: true, label: "处理中…" } : heroAction}
      >
        {closed && (
          <div className="space-y-1.5 rounded-lg border border-red-100 bg-red-50/60 p-2.5">
            <p className="text-xs font-semibold text-red-700">
              不进入推荐的原因（历史留档已保留，不会当作资格不符合）
            </p>
            <ul className="space-y-1 text-sm text-slate-600">
              {gateViews.map(({ gate, meta }) => (
                <li key={gate.code}>
                  <span className="font-medium text-slate-700">· {meta.label}：</span>
                  {gate.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Hero>

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}
      {correctionDone && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          纠错已提交并留痕，我们会核对官方原文；如需更正将通过新版本发布，不会直接改动结论。
        </p>
      )}

      {/* 第二段：关键依据与不确定项（官方事实 vs 系统预筛判断分行展示） */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            关键依据与不确定项
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            每条都分「公告怎么写（官方事实）」与「系统预筛判断」；缺少信息不是不符合，向招聘单位确认前系统不自动下结论。
          </p>
        </div>

        {groups.missingInfo.length > 0 && (
          <div
            id="missing-info"
            className="scroll-mt-20 rounded-xl border border-amber-200 bg-white"
          >
            <div className="border-b border-amber-100 px-4 py-2.5">
              <LayerHeading
                title="需要补充的信息（补充后重新判断，不是不符合）"
                count={groups.missingInfo.length}
              />
            </div>
            <div className="px-4 py-2">
              <ConditionRows dimensions={groups.missingInfo} showDescription />
            </div>
          </div>
        )}

        {groups.confirmOfficial.length > 0 && (
          <div
            id="to-confirm"
            className="scroll-mt-20 rounded-xl border border-amber-200 bg-white"
          >
            <div className="border-b border-amber-100 px-4 py-2.5">
              <LayerHeading
                title="需要向招聘单位确认的歧义项（系统不能自动判定）"
                count={groups.confirmOfficial.length}
              />
            </div>
            <div className="px-4 py-2">
              <ConditionRows
                dimensions={groups.confirmOfficial}
                showDescription
              />
            </div>
          </div>
        )}

        {groups.unsatisfied.length > 0 && (
          <div
            id="unsatisfied"
            className="scroll-mt-20 rounded-xl border border-red-200 bg-white"
          >
            <div className="border-b border-red-100 px-4 py-2.5">
              <LayerHeading title="明确不符合项（依据公告原文）" count={groups.unsatisfied.length} />
            </div>
            <div className="px-4 py-2">
              <ConditionRows
                dimensions={groups.unsatisfied}
                showDescription
              />
            </div>
          </div>
        )}

        {groups.satisfied.length > 0 && (
          <Disclosure title="已满足的条件" count={groups.satisfied.length}>
            <ConditionRows dimensions={groups.satisfied} showDescription />
          </Disclosure>
        )}

        {/* 补充信息只影响当前画像，提交后即时重算；闸门失败（截止/来源失效等）时不引导补充 */}
        {!closed && groups.missingInfo.length > 0 && (
          <div id="supplement" className="scroll-mt-20">
            <SupplementForm
              dimensions={groups.missingInfo}
              initial={facts}
              saving={savingFacts}
              onSave={(next) => void handleSaveFacts(next)}
            />
          </div>
        )}
      </section>

      {/* 报名材料清单（关注后可标记进度；来源可追溯到官方公告） */}
      {unit.follow && unit.unit.materials && unit.unit.materials.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">报名材料清单</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              按公告要求生成；每项可追溯到官方来源。只记录准备进度，不采集证件号码或扫描件。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4">
            <MaterialsList
              materials={unit.unit.materials}
              statuses={unit.follow.materialStatuses}
              busy={busy}
              onStatusChange={(itemId, status) =>
                void handleMaterialStatus(itemId, status)
              }
            />
          </div>
        </section>
      )}

      {/* 官方联系信息与咨询模板（仅对需官方确认维度） */}
      {unit.follow && unit.consultationTemplates && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">官方咨询</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              复制问题向招聘单位确认；你记录的结论仅自己可见，不会变成官方事实或影响匹配。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <ConsultationPanel
              templates={unit.consultationTemplates}
              contact={{
                publisher: unit.announcement.publisher,
                officialUrl: unit.announcement.officialUrl,
                contactInfo: unit.announcement.contactInfo ?? null,
              }}
              notes={unit.follow.consultationNotes}
              busy={busy}
              onSaveNote={(key, note) => void handleConsultationNote(key, note)}
            />
          </div>
        </section>
      )}

      {/* 第三段：官方原文与岗位表位置 */}
      <OfficialSourceSection detail={detail} />

      {/* 第四段：核对时间与变化 */}
      <VerificationSection
        detail={detail}
        onOpenCorrection={() => {
          setCorrectionDone(false);
          setCorrectionOpen(true);
        }}
      />

      {/* 第五段：我的跟进（关注 / 准备报名 / 主要备考目标） */}
      <div id="follow" className="scroll-mt-20 space-y-3">
        <FollowControls
          follow={unit.follow}
          unitName={unit.unit.name}
          busy={busy}
          onFollow={() => void followUnit()}
          onTransition={(status, opts) => void handleTransition(status, opts)}
          onSetRole={(role) => void handleSetRole(role)}
          onUnfollow={() =>
            void runAction(async () => {
              await opportunitiesApi.unfollow(unitId);
              // 模块 7：取消关注（看板计入「关注」，但不再计后续阶段）
              track("opportunity_unfollowed", "opportunity", { targetId: unitId });
            }, { redirectAfter: true })
          }
        />

        {unit.follow && (
          <ActionChain
            follow={unit.follow}
            unitId={unitId}
            missingInfoCount={groups.missingInfo.length}
            confirmOfficialCount={groups.confirmOfficial.length}
            materials={unit.unit.materials ?? []}
            deadlineText={deadline.text}
            officialUrl={unit.unit.registerUrl ?? unit.announcement.officialUrl}
            busy={busy}
            onGoMissingInfo={() => scrollToId("missing-info")}
            onGoConfirm={() => scrollToId("to-confirm")}
            onPrepare={() => void handleTransition("preparing")}
            onMarkRegistered={() => void handleTransition("registered")}
          />
        )}
      </div>

      <CorrectionModal
        isOpen={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        submitting={correctionSubmitting}
        onSubmit={(input) => void handleCorrection(input)}
      />
    </div>
  );
}
