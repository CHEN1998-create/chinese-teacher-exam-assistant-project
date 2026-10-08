/**
 * v6.1 招聘领域统一入口。
 *
 * 页面与 service 从这里取类型和纯函数，不直接依赖各分域文件；
 * 本文件只做聚合导出，不含逻辑。
 */
export * from "@/lib/announcements/types";
export {
  appendVersion,
  currentVersion,
  isRegistrationOpen,
  linkSupplement,
  snapshotFingerprint,
  withdrawAnnouncement,
} from "@/lib/announcements/domain";
export type {
  AppendVersionResult,
  NewVersionDraft,
} from "@/lib/announcements/domain";

export * from "@/lib/profile/types";

export * from "@/lib/matching/types";
export {
  ageAt,
  aggregateOverall,
  buildCandidates,
  evaluateAnnouncement,
  evaluateGates,
  evaluateOpportunity,
  evaluateRegion,
  evaluateRequirement,
  filterValidOpportunities,
  groupByMissingDimension,
  isValidOpportunity,
  normalizeMajor,
  sortCandidates,
} from "@/lib/matching/domain";
export type { OpportunityCandidate } from "@/lib/matching/domain";

export * from "@/lib/opportunities/types";
export {
  assignRole,
  canTransition,
  createFollow,
  hasNewerVersion,
  transitionFollow,
} from "@/lib/opportunities/domain";
