/**
 * 机会列表视图模型（纯函数，模块 5）。
 *
 * 输入是后端 MatchResponse（分组与排序已由后端完成），这里只决定页面叙事：
 * - 第一屏的“优先机会”：用户设置的主要备考目标优先，否则取首个初步符合；
 * - 结论文案与有效机会计数；
 * - 模块 5 新增：异常态分桶（过期/来源失效/待复核等）、“仅地区不重叠”与
 *   “资格明确不符合”分离、画像地区“暂未收录”判定、空结果态、卡片下一步文案。
 * 不做任何资格判定，判定规则只存在于后端。
 */
import type {
  CoverageDTO,
  MatchResponse,
  MetaDTO,
  UnitMatchDTO,
} from "./api-types";
import type { UserRecruitmentProfile } from "@/lib/profile/types";
import {
  bucketClosedUnits,
  gateStateMeta,
  primaryFailedGate,
  type ClosedBucketKey,
} from "@/lib/gate-states";

export interface UncoveredRegion {
  code: string;
  label: string;
}

export interface ClosedBucketView {
  key: ClosedBucketKey;
  label: string;
  units: UnitMatchDTO[];
}

export interface OpportunityListViewModel {
  meta: MetaDTO;
  /** 真实监测覆盖（地区/最近核对/在报数） */
  coverage: CoverageDTO;
  primaryTargetUnitId: string | null;
  /** 第一屏优先机会（主要目标或首个初步符合），可能为 null */
  priority: UnitMatchDTO | null;
  /** 初步符合中除优先外的其余机会（保持后端顺序） */
  otherPreliminary: UnitMatchDTO[];
  needInfoGroups: MatchResponse["groups"]["needInfo"];
  manualReview: UnitMatchDTO[];
  /** 存在非地区维度的明确不符合（或无 FAIL 维度但后端判 not_eligible） */
  notEligible: UnitMatchDTO[];
  /**
   * 仅因“岗位地区不在画像可接受范围”而未推荐：这不是资格不符合。
   * 与 notEligible 分开标注，避免把地区偏好说成不符合项。
   */
  regionOutOfScope: UnitMatchDTO[];
  /** 已截止/预告/未通过闸门的演示数据卡片（保留，closedBuckets 是其子态分桶） */
  closed: UnitMatchDTO[];
  /** closed 按异常态（来源失效/过期/待复核…）的稳定分桶 */
  closedBuckets: ClosedBucketView[];
  /** 真实监测台账卡片（杭州/宁波，AI 初核待人工复核，均未进推荐） */
  realMonitored: UnitMatchDTO[];
  /** 画像中当前既无演示岗位、也不在真实监测覆盖内的地区（暂未收录 ≠ 没有招聘） */
  uncoveredRegions: UncoveredRegion[];
  /** 有效机会数（闸门通过且非明确不符合；已截止不计） */
  validCount: number;
  /** Hero 主结论 */
  conclusion: string;
  /** 已截止/明确不符合的数量，用于风险提示 */
  excludedCount: number;
  /** 没有任何可行动机会（四档全空）：页面展示空结果态，留档分区仍可查 */
  emptyResult: boolean;
}

function pickPriority(
  preliminary: UnitMatchDTO[],
  primaryTargetUnitId: string | null,
): UnitMatchDTO | null {
  if (preliminary.length === 0) return null;
  const primary = primaryTargetUnitId
    ? preliminary.find((u) => u.unit.id === primaryTargetUnitId)
    : undefined;
  return primary ?? preliminary[0]!;
}

/**
 * 区划层级前缀：省级码（330000）→ ["33"]；市级/区县级（330100/330102）→ ["3301","33"]。
 * 画像选浙江省时，省内任何城市岗位都算覆盖；选城市时只认该城市前缀。
 */
function regionPrefixes(code: string): string[] {
  if (code.slice(2, 4) === "00") return [code.slice(0, 2)];
  return [code.slice(0, 4), code.slice(0, 2)];
}

/**
 * 仅地区不重叠：FAIL 维度非空且全部是地区维度。
 * 只要同时存在任何非地区 FAIL，就仍是“明确不符合”。
 * （地区维度没有 requirementId 之外的非 FAIL 也可以：UNKNOWN/MANUAL 不影响判定。）
 */
function isRegionOnlyMismatch(unit: UnitMatchDTO): boolean {
  const fails = unit.dimensions.filter((d) => d.value === "FAIL");
  if (fails.length === 0) return false;
  return fails.every((d) => d.dimension === "region");
}

function computeUncoveredRegions(
  profile: UserRecruitmentProfile | undefined,
  response: MatchResponse,
): UncoveredRegion[] {
  if (!profile || profile.regions.length === 0) return [];
  const allUnits = [
    ...response.groups.preliminary,
    ...response.groups.needInfo.flatMap((g) => g.units),
    ...response.groups.manualReview,
    ...response.groups.notEligible,
    ...response.groups.closed,
  ];
  const coveredPrefixes = new Set<string>();
  for (const unit of allUnits)
    for (const prefix of regionPrefixes(unit.unit.region.code))
      coveredPrefixes.add(prefix);
  for (const region of response.coverage.regions)
    for (const prefix of regionPrefixes(region.code))
      coveredPrefixes.add(prefix);

  const result: UncoveredRegion[] = [];
  const seen = new Set<string>();
  for (const pref of profile.regions) {
    if (seen.has(pref.code)) continue;
    seen.add(pref.code);
    if (regionPrefixes(pref.code).some((prefix) => coveredPrefixes.has(prefix)))
      continue;
    result.push({
      code: pref.code,
      label: pref.city ? `${pref.province}${pref.city}` : pref.province,
    });
  }
  return result;
}

export function buildListViewModel(
  response: MatchResponse,
  profile?: UserRecruitmentProfile,
): OpportunityListViewModel {
  const { groups, primaryTargetUnitId, meta, coverage } = response;
  const priority = pickPriority(groups.preliminary, primaryTargetUnitId);
  const otherPreliminary = groups.preliminary.filter(
    (u) => u.unit.id !== priority?.unit.id,
  );
  const needInfoCount = groups.needInfo.reduce((sum, g) => sum + g.count, 0);
  const validCount =
    groups.preliminary.length + needInfoCount + groups.manualReview.length;
  // 模块 7.5 合规过滤：用户端不显示 AI 初核待人工复核记录（dataset === "real"）。
  // 后端 PUBLISHED_ANNOUNCEMENTS 仍包含 real 记录（用于管理端复核），
  // 这里在前端兜底过滤：closed 不包含 real，realMonitored 字段保留为稳定类型但永远为空。
  // 真正解决需后端在用户端 API 加 status 过滤（见最终报告"后续任务"）。
  const closed = groups.closed.filter(
    (u) => u.announcement.dataset !== "real",
  );
  const realMonitored: UnitMatchDTO[] = [];
  // 地区偏好不重叠与资格不符合分离（仅前端叙事拆分，后端分组结构不变）
  const regionOutOfScope = groups.notEligible.filter(isRegionOnlyMismatch);
  const notEligible = groups.notEligible.filter(
    (u) => !isRegionOnlyMismatch(u),
  );
  const uncoveredRegions = computeUncoveredRegions(profile, response);
  const closedBuckets = bucketClosedUnits(closed, (u) => u.gates);
  const excludedCount =
    groups.notEligible.length + groups.closed.length;
  const emptyResult =
    groups.preliminary.length === 0 &&
    needInfoCount === 0 &&
    groups.manualReview.length === 0 &&
    groups.notEligible.length === 0 &&
    groups.closed.length === 0;

  let conclusion: string;
  if (groups.preliminary.length > 0) {
    const extras: string[] = [];
    if (needInfoCount > 0) extras.push(`${needInfoCount} 个待补充信息`);
    if (groups.manualReview.length > 0)
      extras.push(`${groups.manualReview.length} 个建议人工确认`);
    conclusion =
      `为你找到 ${groups.preliminary.length} 个初步符合的机会` +
      (extras.length > 0 ? `（另有 ${extras.join("、")}）` : "");
  } else if (needInfoCount > 0) {
    conclusion = `还没有能直接判断的机会：补充 ${needInfoCount} 个机会缺失的信息后会重新判断`;
  } else if (groups.manualReview.length > 0) {
    conclusion = `有 ${groups.manualReview.length} 个机会的条件需要向招聘单位确认`;
  } else if (uncoveredRegions.length > 0) {
    conclusion = "你选择的地区当前暂未收录官方公告";
  } else {
    conclusion = "当前没有与你画像匹配的有效机会，完善画像后会重新评估";
  }

  return {
    meta,
    coverage,
    primaryTargetUnitId,
    priority,
    otherPreliminary,
    needInfoGroups: groups.needInfo,
    manualReview: groups.manualReview,
    notEligible,
    regionOutOfScope,
    closed,
    closedBuckets,
    realMonitored,
    uncoveredRegions,
    validCount,
    conclusion,
    excludedCount,
    emptyResult,
  };
}

/**
 * 列表卡「一个下一步」文案（点进详情完成该动作）。
 * 闸门失败时与异常态口径一致；四档各自给不同下一步；
 * “查看详情”本身不算下一步，这里必须说明进去做什么。
 */
export function listCardNextStepLabel(unit: UnitMatchDTO): string {
  const failed = primaryFailedGate(unit.gates);
  if (failed) return gateStateMeta(failed.code).cardAction;
  switch (unit.overall) {
    case "preliminary_eligible":
      return unit.follow ? "查看跟进与报名准备" : "查看依据并关注";
    case "need_more_info":
      return "查看要补充的信息";
    case "manual_review":
      return "查看确认要点";
    case "not_eligible":
      return "查看不符合原因";
  }
}

/** “M月D日 HH:mm”短格式（评估时间展示） */
export function formatEvaluatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
