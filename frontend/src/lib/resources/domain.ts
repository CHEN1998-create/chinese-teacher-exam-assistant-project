/**
 * 公共资源索引与缺口匹配：领域规则层（纯函数，无 React、无 localStorage、无网络）。
 *
 * 匹配口径只允许在本文件修改：
 *  1) 候选：覆盖缺口模块；
 *  2) 合规闸门：状态/权利/关键字段/链接/失效时间/复核时效，任一不过即不强推；
 *  3) 范围匹配：地区、学段、招聘类型、年份；
 *  4) 排序：官方 > 自制 > 已授权/开放 > 第三方公开，同层级再按范围贴合度；
 *  5) 每个缺口最多 3 条。
 */
import {
  EDUCATION_LEVEL_LABELS,
  EXAM_TYPE_LABELS,
  EducationLevel,
  ExamTarget,
  ResourceItem,
  ResourceMatch,
  ResourceQueueKey,
  ResourceStatus,
  ResourceType,
  RightsStatus,
} from "@/types";
import { isKnownModule, moduleLabel, yearFit } from "@/lib/materials/domain";

/** 每个缺口最多展示的资源数 */
export const MAX_MATCHES_PER_GAP = 3;

/** 超过该天数未复核进入“待复核”队列，且不再强推 */
export const REVIEW_STALE_DAYS = 180;

/** 可管理资源的后台角色（service 层写入时再次校验） */
export const RESOURCE_ADMIN_ROLES = ["resource_reviewer", "admin"] as const;

// ==================== 优先层级 ====================

/**
 * 1 官方公告/大纲/样题/说明
 * 2 平台自制
 * 3 已授权 / 明确开放使用
 * 4 第三方公开资源（仅原始链接 + 必要摘要）
 * 99 权利不明（不可推荐）
 */
export function rightsTier(rights: RightsStatus): number {
  switch (rights) {
    case "official":
      return 1;
    case "self_made":
      return 2;
    case "licensed":
    case "open":
      return 3;
    case "third_party":
      return 4;
    default:
      return 99;
  }
}

export function tierLabel(tier: number): string {
  return { 1: "官方来源", 2: "平台自制", 3: "授权/开放", 4: "第三方公开" }[tier] ?? "其他";
}

// ==================== 旧数据归一化 ====================

/** 旧版资源使用中文模块名，迁移到 mod_* 目录 */
const LEGACY_MODULE_MAP: Record<string, string> = {
  语文课程标准解读: "mod_kebiao",
  真题练习: "mod_zhenti",
  浙江教招真题: "mod_zhenti",
  现代汉语基础: "mod_xiandai",
  教学设计: "mod_jiaoxue",
  教材分析: "mod_jiaocai",
};

function mapLegacyLicense(license?: string): RightsStatus {
  switch (license) {
    case "open":
      return "open";
    case "paid":
      return "licensed";
    case "restricted":
    case "free":
      return "third_party";
    default:
      return "unknown";
  }
}

export function normalizeResource(raw: Partial<ResourceItem> & {
  type?: ResourceType;
  source?: string;
  license?: string;
  isActive?: boolean;
  isVerified?: boolean;
  verifiedAt?: string;
}): ResourceItem {
  const modules = Array.from(
    new Set(
      (raw.modules ?? [])
        .map((m) => (isKnownModule(m) ? m : LEGACY_MODULE_MAP[m]))
        .filter((m): m is string => Boolean(m) && isKnownModule(m))
    )
  );
  const now = new Date(0).toISOString();
  const rightsStatus: RightsStatus = raw.rightsStatus ?? mapLegacyLicense(raw.license);
  const status: ResourceStatus =
    raw.status ?? (raw.isActive === false ? "inactive" : rightsStatus === "unknown" ? "pending_review" : "active");
  return {
    id: raw.id || `pr-${Date.now()}`,
    title: raw.title || "未命名资源",
    description: raw.description,
    resourceType: raw.resourceType ?? raw.type ?? "third_party",
    sourceName: raw.sourceName ?? raw.source ?? "",
    sourceUrl: raw.sourceUrl ?? "",
    rightsStatus,
    applicableRegions: raw.applicableRegions ?? [],
    year: raw.year,
    applicableLevels: raw.applicableLevels ?? [],
    applicableTypes: raw.applicableTypes ?? [],
    modules,
    recommendReason: raw.recommendReason ?? raw.description ?? "",
    suggestedChapters: raw.suggestedChapters ?? [],
    estimatedMinutes: typeof raw.estimatedMinutes === "number" ? raw.estimatedMinutes : 0,
    lastReviewedAt: raw.lastReviewedAt ?? raw.verifiedAt ?? raw.updatedAt ?? now,
    expiresAt: raw.expiresAt,
    linkCheckedAt: raw.linkCheckedAt ?? raw.verifiedAt,
    linkAlive: raw.linkAlive ?? true,
    status,
    reviewedBy: raw.reviewedBy,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
  };
}

// ==================== 合规闸门 ====================

export interface RecommendableCheck {
  ok: boolean;
  /** 不通过原因（后台/调试可读，不强推的逐条依据） */
  reasons: string[];
}

function daysBetween(fromIso: string, nowIso: string): number {
  return (new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

/**
 * 第 2 层：合规与完整性闸门。
 * 权利不明、关键字段缺失、停用/待复核/失效、链接失效、复核过期的资源不能强推荐。
 */
export function checkRecommendable(resource: ResourceItem, nowIso: string): RecommendableCheck {
  const reasons: string[] = [];
  if (resource.status !== "active") reasons.push(`状态为${resource.status}，不参与推荐`);
  if (resource.rightsStatus === "unknown") reasons.push("权利状态不明");
  if (!resource.sourceUrl.trim()) reasons.push("缺少原始来源链接");
  if (!resource.sourceName.trim()) reasons.push("缺少来源名称");
  if (resource.modules.length === 0) reasons.push("缺少对应考试模块");
  if (!resource.recommendReason.trim()) reasons.push("缺少推荐理由");
  if (resource.applicableRegions.length === 0) reasons.push("适用地区未标注");
  if (resource.applicableLevels.length === 0) reasons.push("适用学段未标注");
  if (!resource.linkAlive) reasons.push("原始链接已失效");
  if (resource.expiresAt && new Date(resource.expiresAt).getTime() < new Date(nowIso).getTime()) {
    reasons.push("已过失效时间");
  }
  if (daysBetween(resource.lastReviewedAt, nowIso) > REVIEW_STALE_DAYS) {
    reasons.push(`超过 ${REVIEW_STALE_DAYS} 天未复核`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ==================== 适用范围匹配（第 3 层） ====================

function stripRegionSuffix(name: string): string {
  return name.replace(/省|市|自治区|壮族|回族|维吾尔/g, "");
}

/** 地区是否匹配；“全国”通用，省/市按包含关系判定 */
export function regionMatchesResource(resource: ResourceItem, target: ExamTarget): boolean {
  return resource.applicableRegions.some((region) => {
    const r = region.trim();
    if (!r) return false;
    if (r.includes("全国")) return true;
    if (target.city && r.includes(target.city)) return true;
    if (target.province && r.includes(target.province)) return true;
    if (target.province && r.includes(stripRegionSuffix(target.province))) return true;
    return false;
  });
}

/** 范围贴合度分：城市 30 / 省 20 / 全国 10，仅用于同层级内排序 */
export function regionScopeScore(resource: ResourceItem, target: ExamTarget): number {
  let best = 0;
  for (const region of resource.applicableRegions) {
    const r = region.trim();
    if (target.city && r.includes(target.city)) best = Math.max(best, 30);
    else if (target.province && (r.includes(target.province) || r.includes(stripRegionSuffix(target.province)))) {
      best = Math.max(best, 20);
    } else if (r.includes("全国")) {
      best = Math.max(best, 10);
    }
  }
  return best;
}

export interface ScopeMatch {
  region: boolean;
  level: boolean;
  examType: boolean;
  yearCurrent: boolean;
}

export function checkScope(resource: ResourceItem, target: ExamTarget): ScopeMatch {
  return {
    region: regionMatchesResource(resource, target),
    level: target.educationLevel ? resource.applicableLevels.includes(target.educationLevel) : true,
    examType: target.examType ? resource.applicableTypes.includes(target.examType) : true,
    yearCurrent: yearFit(resource.year, target.year) !== "outdated",
  };
}

export function scopeMatches(resource: ResourceItem, target: ExamTarget): boolean {
  const s = checkScope(resource, target);
  return s.region && s.level && s.examType && s.yearCurrent;
}

/** 面向用户的适用范围摘要 */
export function scopeSummary(resource: ResourceItem): string {
  const parts: string[] = [];
  parts.push(resource.applicableRegions.includes("全国") ? "全国通用" : resource.applicableRegions.join("/"));
  if (resource.year) parts.push(`${resource.year} 年适用`);
  if (resource.applicableLevels.length > 0) {
    parts.push(resource.applicableLevels.map((l: EducationLevel) => EDUCATION_LEVEL_LABELS[l]).join("/"));
  }
  if (resource.applicableTypes.length > 0) {
    parts.push(resource.applicableTypes.map((t) => EXAM_TYPE_LABELS[t]).join("/"));
  }
  return parts.join(" · ");
}

// ==================== 匹配（第 4-5 层：排序与截断） ====================

function tierReason(resource: ResourceItem): string {
  switch (resource.rightsStatus) {
    case "official":
      return "招考主管部门或官方机构公开发布，权利状态明确、权威性最高";
    case "self_made":
      return "平台自制内容，权利清晰，可按建议章节直接学习";
    case "licensed":
      return "已取得授权的内容，权利状态清晰";
    case "open":
      return "明确开放使用的内容，权利状态清晰";
    case "third_party":
      return "第三方公开资源，仅索引原始链接与必要摘要，请以原始来源为准";
    default:
      return "权利状态待核实";
  }
}

export interface MatchTrace {
  module: string;
  candidateCount: number;
  blocked: { id: string; title: string; reasons: string[] }[];
  outOfScope: { id: string; title: string }[];
  matches: ResourceMatch[];
}

/** 单缺口完整匹配流水线（含逐层丢弃记录，便于核对与排查） */
export function matchGapWithTrace(
  resources: ResourceItem[],
  moduleKey: string,
  target: ExamTarget,
  nowIso: string
): MatchTrace {
  // 第 1 层：模块候选
  const candidates = resources.filter((r) => r.modules.includes(moduleKey));
  // 第 2 层：合规闸门
  const blocked: MatchTrace["blocked"] = [];
  const compliant: ResourceItem[] = [];
  for (const r of candidates) {
    const check = checkRecommendable(r, nowIso);
    if (check.ok) compliant.push(r);
    else blocked.push({ id: r.id, title: r.title, reasons: check.reasons });
  }
  // 第 3 层：适用范围
  const outOfScope: MatchTrace["outOfScope"] = [];
  const inScope = compliant.filter((r) => {
    if (scopeMatches(r, target)) return true;
    outOfScope.push({ id: r.id, title: r.title });
    return false;
  });
  // 第 4 层：优先层级 + 范围贴合度 + 复核新近度
  const ranked = inScope
    .map((r) => {
      const tier = rightsTier(r.rightsStatus);
      const scope = checkScope(r, target);
      const reviewFresh = Math.max(
        0,
        1 - daysBetween(r.lastReviewedAt, nowIso) / REVIEW_STALE_DAYS
      );
      const yearBonus = !r.year || scope.yearCurrent ? 5 : 0;
      const matchScore =
        (5 - tier) * 100 + regionScopeScore(r, target) + yearBonus + Math.round(reviewFresh * 5);
      return { r, tier, matchScore };
    })
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.r.title.localeCompare(b.r.title, "zh-CN");
    });
  // 第 5 层：每缺口最多 3 条
  const matches: ResourceMatch[] = ranked.slice(0, MAX_MATCHES_PER_GAP).map((entry, index) => ({
    resource: entry.r,
    module: moduleKey,
    tier: entry.tier,
    rank: index + 1,
    matchScore: entry.matchScore,
    scopeSummary: scopeSummary(entry.r),
    matchReason: `${tierReason(entry.r)}；适用范围：${scopeSummary(entry.r)}。${entry.r.recommendReason}`,
  }));
  return { module: moduleKey, candidateCount: candidates.length, blocked, outOfScope, matches };
}

export function matchGap(
  resources: ResourceItem[],
  moduleKey: string,
  target: ExamTarget,
  nowIso: string
): ResourceMatch[] {
  return matchGapWithTrace(resources, moduleKey, target, nowIso).matches;
}

// ==================== 缺口派生 ====================

/**
 * 缺口模块：优先用已生成诊断的 missingModules；
 * 尚未诊断（典型：无资料）时按当前考情下的必需模块兜底。
 */
export function gapModules(
  snapshotMissingModules: string[] | null | undefined,
  requiredKeys: string[]
): string[] {
  if (snapshotMissingModules) return snapshotMissingModules;
  return requiredKeys;
}

/** 无匹配资源时的查找建议（按模块给更具体的指引） */
export function gapSearchAdvice(moduleKey: string): string[] {
  const common = [
    "在报考地区教育局、人社局或人事考试网官网查找当年招聘公告及附件（笔试大纲、考试说明、样题）",
    "核对发布机构、发布时间与适用年份，优先使用官方原始链接",
    "不要使用来源不明的完整扫描件或网盘合集",
  ];
  if (moduleKey === "mod_zhenti") {
    return [
      "在报考地区教育局/人社局官网“往年招聘”“人事考试”栏目查找历年公告与真题样例",
      "官方未公布完整真题时，只记录公开的题型、分值说明，不购买所谓“内部真题”",
      ...common.slice(1),
    ];
  }
  if (moduleKey === "mod_difang") {
    return ["查阅报考地区教育局官网“政策文件/通知公告”栏目，记录文件名、发布日期与原文链接", ...common.slice(1)];
  }
  return common;
}

// ==================== 后台队列分类 ====================

/**
 * 派生队列（静态 status + 时效事实）：
 * 手动停用优先归入“已停用”；链接失效/过失效时间 → 已失效；
 * 待复核状态或复核超期 → 待复核；其余为正常。
 */
export function classifyQueue(resource: ResourceItem, nowIso: string): ResourceQueueKey {
  if (resource.status === "inactive") return "inactive";
  if (!resource.linkAlive) return "expired";
  if (resource.expiresAt && new Date(resource.expiresAt).getTime() < new Date(nowIso).getTime()) {
    return "expired";
  }
  if (resource.status === "pending_review") return "pending_review";
  if (daysBetween(resource.lastReviewedAt, nowIso) > REVIEW_STALE_DAYS) return "pending_review";
  return "active";
}

/** 用户端公共资源浏览：仅看正常且合规的资源（与缺口匹配同一闸门） */
export function listBrowseable(resources: ResourceItem[], nowIso: string): ResourceItem[] {
  return resources
    .filter((r) => classifyQueue(r, nowIso) === "active")
    .filter((r) => checkRecommendable(r, nowIso).ok)
    .sort((a, b) => {
      const tierDiff = rightsTier(a.rightsStatus) - rightsTier(b.rightsStatus);
      if (tierDiff !== 0) return tierDiff;
      return b.lastReviewedAt.localeCompare(a.lastReviewedAt);
    });
}

/** 模块标签便捷导出（页面统一从这里取也可） */
export { moduleLabel };
