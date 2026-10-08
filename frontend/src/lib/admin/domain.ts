/**
 * 考情审核后台领域逻辑（纯函数，无存储、无 React、无异步）。
 *
 * 集中管理：
 * - 角色对考情字段的操作权限（高影响字段仅考情审核员/管理员可操作）；
 * - 五个审核队列的分类与排序（待审核 / 高风险优先 / 来源冲突 / 即将过期 / 已完成）；
 * - 风险分级与“即将过期”日期判定。
 */
import {
  EvidenceItem,
  ExamTarget,
  ReviewLog,
  ReviewQueueKey,
  ReviewStatus,
  UserRole,
} from "@/types";
import { isHighImpact } from "@/lib/evidence/domain";

/** 可以进入运营后台的角色 */
export const ADMIN_STAFF_ROLES: UserRole[] = ["exam_reviewer", "resource_reviewer", "admin"];

/** 可以实际执行考情审核动作的角色（资源审核员仅可处理低影响字段） */
export function canViewAdmin(role: UserRole | null | undefined): boolean {
  return !!role && ADMIN_STAFF_ROLES.includes(role);
}

/**
 * 操作级权限闸门（UI 显隐与 service 层共用，service 层会再次校验）：
 * - 考情审核员 / 管理员：全部考情字段；
 * - 资源审核员：仅低影响字段，高影响字段一律拒绝；
 * - 备考用户：全部拒绝。
 * 当前账号体系为单角色制，不支持“资源审核员同时具有考情权限”的叠加身份。
 */
export function canReviewField(role: UserRole | null | undefined, field: EvidenceItem["field"]): boolean {
  if (role === "exam_reviewer" || role === "admin") return true;
  if (role === "resource_reviewer") return !isHighImpact(field);
  return false;
}

/** 权限不足时给 UI 的说明文案 */
export function permissionDeniedReason(role: UserRole | null | undefined, field: EvidenceItem["field"]): string {
  if (role === "resource_reviewer" && isHighImpact(field)) {
    return "高影响考情（报名时间/考试日期/科目/分值/资格条件）需要考情审核权限，资源审核员仅可查看";
  }
  return "当前角色没有考情审核权限";
}

// ==================== 风险与过期 ====================

export type ReviewRiskLevel = "high" | "medium" | "low";

/** 即将过期窗口：报名/考试时间在未来 45 天内视为“即将过期” */
export const EXPIRING_WINDOW_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 从“2026年11月1日—11月7日”这类文案中解析第一个带年份的日期 */
export function earliestUpcomingDate(value: string): Date | null {
  const m = value.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isExpiringItem(item: EvidenceItem, now: Date = new Date()): boolean {
  if (item.reviewStatus === "unconfirmed") return false;
  if (item.field !== "registration_time" && item.field !== "exam_time") return false;
  const date = earliestUpcomingDate(item.value);
  if (!date) return false;
  const diffDays = (date.getTime() - now.getTime()) / DAY_MS;
  return diffDays >= 0 && diffDays <= EXPIRING_WINDOW_DAYS;
}

// ==================== 队列派生 ====================

/** 当前事实结论状态（与 evidence/domain.ts 的口径保持一致） */
const FACT_CLAIM_STATUSES: ReviewStatus[] = ["official", "pending_review", "ai_extracted"];

/** 审核队列中的一条记录（证据 + 目标 + 派生标记） */
export interface AdminQueueEntry {
  item: EvidenceItem;
  target: ExamTarget | null;
  risk: ReviewRiskLevel;
  highImpact: boolean;
  expiring: boolean;
  /** 待处理：待审核或 AI 已提取待人工复核 */
  open: boolean;
  /** 该字段存在来源冲突（不同事实来源结论不一致 / 被手动标记） */
  conflict: boolean;
  /** 同字段其他来源的不同结论 */
  conflictWith: EvidenceItem[];
  /** 是否已完成（官方确认或存在终态审核记录） */
  completed: boolean;
}

function riskOf(item: EvidenceItem, conflict: boolean, expiring: boolean): ReviewRiskLevel {
  if (isHighImpact(item.field)) return "high";
  if (conflict || expiring) return "medium";
  return "low";
}

/**
 * 由全部证据 + 全部目标 + 审核记录派生队列条目（跨用户，供后台使用）。
 */
export function buildQueueEntries(
  items: EvidenceItem[],
  targets: ExamTarget[],
  logs: ReviewLog[]
): AdminQueueEntry[] {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const loggedItemIds = new Set(logs.map((l) => l.evidenceItemId));

  // 按字段分组，计算“事实结论冲突”：不同来源 + 不同值
  const byField = new Map<EvidenceItem["field"], EvidenceItem[]>();
  for (const item of items) {
    const list = byField.get(item.field) ?? [];
    list.push(item);
    byField.set(item.field, list);
  }

  const conflictFieldSet = new Set<EvidenceItem["field"]>();
  for (const [field, list] of byField) {
    const claims = list.filter(
      (i) =>
        i.reviewStatus !== "unconfirmed" &&
        (FACT_CLAIM_STATUSES.includes(i.reviewStatus) || i.reviewerFlaggedConflict === true)
    );
    const distinctValues = new Set(claims.filter((i) => i.value.trim()).map((i) => i.value.trim()));
    const distinctSources = new Set(claims.map((i) => i.sourceName));
    if (
      claims.some((i) => i.reviewerFlaggedConflict === true) ||
      (distinctValues.size > 1 && distinctSources.size > 1)
    ) {
      conflictFieldSet.add(field);
    }
  }

  return items.map((item) => {
    const fieldItems = byField.get(item.field) ?? [];
    const conflict = conflictFieldSet.has(item.field);
    const expiring = isExpiringItem(item);
    const open = item.reviewStatus === "pending_review" || item.reviewStatus === "ai_extracted";
    const completed =
      item.reviewStatus === "official" ||
      (item.reviewStatus === "unconfirmed" && loggedItemIds.has(item.id)) ||
      loggedItemIds.has(item.id);
    const conflictWith = conflict
      ? fieldItems.filter(
          (other) =>
            other.id !== item.id &&
            other.reviewStatus !== "unconfirmed" &&
            other.value.trim() !== item.value.trim()
        )
      : [];

    return {
      item,
      target: targetMap.get(item.examTargetId) ?? null,
      risk: riskOf(item, conflict, expiring),
      highImpact: isHighImpact(item.field),
      expiring,
      open,
      conflict,
      conflictWith,
      completed,
    };
  });
}

const RISK_ORDER: Record<ReviewRiskLevel, number> = { high: 3, medium: 2, low: 1 };

/**
 * 五个队列的过滤与排序规则：
 * - pending：全部待人工处理项（待审核在前，AI已提取可复核在后）；
 * - high_risk：待处理项中的高影响/冲突/即将过期，按风险倒序；
 * - conflict：仍存在事实冲突（或手动标记）的字段条目；
 * - expiring：报名/考试时间在未来 45 天内的有效结论；
 * - completed：已官方确认或已有终态审核记录。
 */
export function selectQueue(entries: AdminQueueEntry[], view: ReviewQueueKey): AdminQueueEntry[] {
  const byUpdatedDesc = (a: AdminQueueEntry, b: AdminQueueEntry) =>
    b.item.updatedAt.localeCompare(a.item.updatedAt);

  let list: AdminQueueEntry[];
  switch (view) {
    case "pending":
      list = entries.filter((e) => e.open);
      list.sort((a, b) => {
        if (a.item.reviewStatus !== b.item.reviewStatus) {
          return a.item.reviewStatus === "pending_review" ? -1 : 1;
        }
        return byUpdatedDesc(a, b);
      });
      break;
    case "high_risk":
      list = entries.filter((e) => e.open && (e.highImpact || e.conflict || e.expiring));
      list.sort((a, b) => {
        const score = (e: AdminQueueEntry) =>
          RISK_ORDER[e.risk] + (e.conflict ? 0.5 : 0) + (e.expiring ? 0.3 : 0);
        if (score(b) !== score(a)) return score(b) - score(a);
        return byUpdatedDesc(a, b);
      });
      break;
    case "conflict":
      list = entries.filter((e) => e.conflict);
      list.sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1;
        return byUpdatedDesc(a, b);
      });
      break;
    case "expiring":
      list = entries.filter((e) => e.expiring);
      list.sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1;
        const da = earliestUpcomingDate(a.item.value)?.getTime() ?? 0;
        const db = earliestUpcomingDate(b.item.value)?.getTime() ?? 0;
        return da - db;
      });
      break;
    case "completed":
      list = entries.filter((e) => e.completed);
      list.sort((a, b) => {
        const ta = a.item.reviewedAt ?? a.item.updatedAt;
        const tb = b.item.reviewedAt ?? b.item.updatedAt;
        return tb.localeCompare(ta);
      });
      break;
  }
  return list;
}

/** 各队列计数（标签页角标） */
export function queueCounts(entries: AdminQueueEntry[]): Record<ReviewQueueKey, number> {
  return {
    pending: selectQueue(entries, "pending").length,
    high_risk: selectQueue(entries, "high_risk").length,
    conflict: selectQueue(entries, "conflict").length,
    expiring: selectQueue(entries, "expiring").length,
    completed: selectQueue(entries, "completed").length,
  };
}
