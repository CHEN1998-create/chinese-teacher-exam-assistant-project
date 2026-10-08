/**
 * 闸门异常态展示元信息（模块 5）。
 *
 * 登录链路（opportunities/api-types 的 GateDTO）与访客链路
 * （matching/types 的 GateResult）共用同一份口径；本文件只决定「怎么称呼、
 * 怎么分组、卡片下一步写什么」，不包含任何判定逻辑——闸门通过/失败仍分别由
 * 后端匹配引擎（kb-match-rules）与访客侧 matching/domain.ts 计算。
 *
 * 口径原则（PRD v7.0）：
 * - 缺信息不是不符合；闸门失败只表示「当前不进入推荐」，公告留档仍可追溯；
 * - 每个态都有文字名称（不只靠颜色），名称必须区分过期/时间未定/来源失效/
 *   撤回/待复核/超期/不收录，不允许统一灰标「不在当前推荐」。
 */

export type GateStateTone = "neutral" | "warning" | "danger";

export interface GateStateMeta {
  /** 异常态名称（卡片角标/异常面板标题，文字 + 符号） */
  label: string;
  /** 视觉/分组语气：中性留档 / 等待官方或复核 / 高风险 */
  tone: GateStateTone;
  /** 列表卡「一个下一步」上的文案（主行动都是回官方依据） */
  cardAction: string;
}

const FALLBACK_META: GateStateMeta = {
  label: "暂不进入推荐",
  tone: "neutral",
  cardAction: "查看公告留档",
};

export const GATE_STATE_META: Record<string, GateStateMeta> = {
  subject_not_open: {
    label: "学科未开放",
    tone: "neutral",
    cardAction: "查看公告说明",
  },
  registration_unconfirmed: {
    label: "报名时间待官方通知",
    tone: "warning",
    cardAction: "查看公告原文",
  },
  registration_closed: {
    label: "报名已截止",
    tone: "neutral",
    cardAction: "查看公告留档",
  },
  out_of_scope_nature: {
    label: "不在收录范围",
    tone: "neutral",
    cardAction: "查看公告说明",
  },
  announcement_withdrawn: {
    label: "公告已取消或撤回",
    tone: "danger",
    cardAction: "查看官方留档",
  },
  source_unavailable: {
    label: "官方来源暂不可访问",
    tone: "danger",
    cardAction: "查看公告留档",
  },
  no_official_source: {
    label: "缺少已核对官方依据",
    tone: "warning",
    cardAction: "查看公告原文",
  },
  evidence_not_reviewed: {
    label: "待人工复核",
    tone: "warning",
    cardAction: "查看官方原文",
  },
  evidence_stale: {
    label: "核对超期·待重新复核",
    tone: "warning",
    cardAction: "查看官方原文",
  },
};

export function gateStateMeta(code: string): GateStateMeta {
  return GATE_STATE_META[code] ?? FALLBACK_META;
}

/**
 * 一个单元可能同时挂多个失败闸门（如「报名时间未定 + 待人工复核」）。
 * 面向用户解释「为什么不推荐」时按以下稳定优先级取主态，
 * 其余失败闸门仍在详情异常面板中逐条列出，不隐藏。
 */
const GATE_PRIORITY = [
  "source_unavailable",
  "announcement_withdrawn",
  "registration_closed",
  "registration_unconfirmed",
  "evidence_stale",
  "evidence_not_reviewed",
  "no_official_source",
  "out_of_scope_nature",
  "subject_not_open",
] as const;

interface GateLike {
  code: string;
  passed: boolean;
}

export function failedGatesOf<T extends GateLike>(gates: readonly T[]): T[] {
  return gates.filter((g) => !g.passed);
}

/** 主异常闸门：优先解释「来源/撤回/过期」，其次才是待复核类 */
export function primaryFailedGate<T extends GateLike>(gates: readonly T[]): T | null {
  const failed = failedGatesOf(gates);
  if (failed.length === 0) return null;
  for (const code of GATE_PRIORITY) {
    const hit = failed.find((g) => g.code === code);
    if (hit) return hit;
  }
  return failed[0]!;
}

// ==================== 列表分组（closed 子态） ====================

export type ClosedBucketKey =
  | "source"
  | "withdrawn"
  | "expired"
  | "pending"
  | "review"
  | "scope";

export interface ClosedBucketMeta {
  key: ClosedBucketKey;
  /** 折叠区分组标题 */
  label: string;
}

export const CLOSED_BUCKETS: readonly ClosedBucketMeta[] = [
  { key: "source", label: "来源失效·暂不推荐" },
  { key: "withdrawn", label: "公告取消或撤回" },
  { key: "expired", label: "报名已截止（历史留档）" },
  { key: "pending", label: "报名时间待官方通知" },
  { key: "review", label: "依据待人工复核" },
  { key: "scope", label: "不在收录范围" },
];

const CODE_TO_BUCKET: Record<string, ClosedBucketKey> = {
  source_unavailable: "source",
  announcement_withdrawn: "withdrawn",
  registration_closed: "expired",
  registration_unconfirmed: "pending",
  evidence_stale: "review",
  evidence_not_reviewed: "review",
  no_official_source: "review",
  out_of_scope_nature: "scope",
  subject_not_open: "scope",
};

export function closedBucketKeyOf(code: string): ClosedBucketKey {
  return CODE_TO_BUCKET[code] ?? "scope";
}

export function closedBucketMeta(key: ClosedBucketKey): ClosedBucketMeta {
  return CLOSED_BUCKETS.find((b) => b.key === key) ?? CLOSED_BUCKETS[5]!;
}

/** 把闸门失败的单元按主异常态分到稳定顺序的桶里（保持入参相对顺序） */
export function bucketClosedUnits<T>(
  units: readonly T[],
  gateOf: (unit: T) => readonly GateLike[],
): { key: ClosedBucketKey; label: string; units: T[] }[] {
  const map = new Map<ClosedBucketKey, T[]>();
  for (const unit of units) {
    const primary = primaryFailedGate(gateOf(unit));
    if (!primary) continue;
    const key = closedBucketKeyOf(primary.code);
    const list = map.get(key) ?? [];
    list.push(unit);
    map.set(key, list);
  }
  return CLOSED_BUCKETS.filter((b) => map.has(b.key)).map((b) => ({
    key: b.key,
    label: b.label,
    units: map.get(b.key)!,
  }));
}
