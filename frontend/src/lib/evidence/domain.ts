/**
 * 考情证据领域逻辑（纯函数，无存储、无 React、无异步）。
 *
 * 这里集中管理：
 * - 画像字段顺序与分组、高影响字段清单；
 * - AI 提取结论的审核状态归属（AI 只能产生 ai_extracted / pending_review）；
 * - 多来源合并、来源冲突判定、缺失字段的“待确认”占位。
 */
import {
  AnnouncementSourceInput,
  EDUCATION_LEVEL_LABELS,
  EVIDENCE_TYPE_LABELS,
  EXAM_STAGE_LABELS,
  EXAM_TYPE_LABELS,
  ExamTarget,
  EvidenceItem,
  EvidenceType,
  ReviewStatus,
} from "@/types";

/** 高影响字段：日期、科目、分值、资格条件，重点展示审核状态 */
export const HIGH_IMPACT_FIELDS: EvidenceType[] = [
  "registration_time",
  "exam_time",
  "subjects",
  "score",
  "qualification",
];

export function isHighImpact(field: EvidenceType): boolean {
  return HIGH_IMPACT_FIELDS.includes(field);
}

/** 画像字段的展示顺序与分组 */
export const PROFILE_GROUPS: { key: string; title: string; fields: EvidenceType[] }[] = [
  {
    key: "basic",
    title: "基本信息",
    fields: ["region", "recruit_type", "year_batch", "education_level", "exam_stage"],
  },
  {
    key: "high_impact",
    title: "高影响字段（重点核对）",
    fields: ["registration_time", "exam_time", "subjects", "score", "qualification"],
  },
  {
    key: "scope",
    title: "考试范围",
    fields: ["exam_scope"],
  },
];

export const PROFILE_FIELD_ORDER: EvidenceType[] = PROFILE_GROUPS.flatMap((g) => g.fields);

/** 适用范围文案：把目标已知信息串成范围说明，不臆造缺失项 */
export function buildScope(target: Pick<ExamTarget, "region" | "year" | "batch" | "educationLevel">): string {
  const parts: string[] = [];
  if (target.region) parts.push(target.region);
  const yearBatch = [target.year ? `${target.year}年` : null, target.batch ?? null]
    .filter(Boolean)
    .join("");
  if (yearBatch) parts.push(yearBatch);
  if (target.educationLevel) parts.push(`${EDUCATION_LEVEL_LABELS[target.educationLevel]}语文`);
  return parts.length > 0 ? parts.join(" · ") : "适用范围待确认";
}

/**
 * AI 提取结论的审核状态：
 * 高影响字段一律进入待审核；低影响字段标记 AI已提取。
 * 永远不会返回 official —— 官方确认只能由人工审核写入。
 */
export function reviewStatusForExtracted(field: EvidenceType): ReviewStatus {
  return isHighImpact(field) ? "pending_review" : "ai_extracted";
}

/** 提取器产出的原始字段（还未持久化为 EvidenceItem） */
export interface ExtractedField {
  field: EvidenceType;
  value: string;
  /** 命中的原文片段 */
  excerpt: string;
}

/** 来源名称与元信息 */
export interface ExtractedPayload {
  sourceName: string;
  sourceUrl?: string;
  sourceType: AnnouncementSourceInput["sourceType"];
  fields: ExtractedField[];
}

/** 缺失字段的“待确认”占位行（不落库，只在画像视图生成） */
export function placeholderItem(
  target: ExamTarget,
  field: EvidenceType
): EvidenceItem {
  return {
    id: `${target.id}#placeholder#${field}`,
    examTargetId: target.id,
    field,
    value: "",
    reviewStatus: "unconfirmed",
    sourceName: "",
    sourceType: "seed",
    scope: buildScope(target),
    updatedAt: target.updatedAt,
    version: 0,
  };
}

const STATUS_PRIORITY: Record<ReviewStatus, number> = {
  official: 6,
  personal: 5,
  historical: 4,
  pending_review: 3,
  ai_extracted: 2,
  unconfirmed: 1,
};

export interface ProfileRow extends EvidenceItem {
  /** 同字段其他来源的冲突/备选结论 */
  alternatives: EvidenceItem[];
}

/**
 * 当前事实结论的状态：官方确认 / 待审核 / AI已提取。
 * historical（历史经验）与 personal（个人经验）是参考信息，不参与“来源冲突”判定；
 * unconfirmed（驳回/待确认）已退出事实结论，不参与主结论选取。
 */
const FACT_CLAIM_STATUSES: ReviewStatus[] = ["official", "pending_review", "ai_extracted"];

/** 结论是否仍参与画像展示（被审核员标记冲突的项即使为 unconfirmed 仍需展示冲突） */
function isActiveForProfile(item: EvidenceItem): boolean {
  return item.reviewStatus !== "unconfirmed" || item.reviewerFlaggedConflict === true;
}

/**
 * 由持久化证据生成 11 个画像字段行：
 * - 每个字段取可信度最高的一条“有效结论”作为主结论（驳回/待确认项已退出）；
 * - 当前事实结论之间存在不同来源的不同值，或被审核员手动标记 → hasConflict；
 * - 历史/个人经验作为备选结论展示，但不打“来源冲突”红标；
 * - 没有任何有效结论的字段生成“待确认”占位。
 */
export function buildProfileRows(target: ExamTarget, items: EvidenceItem[]): ProfileRow[] {
  const byField = new Map<EvidenceType, EvidenceItem[]>();
  for (const item of items) {
    const list = byField.get(item.field) ?? [];
    list.push(item);
    byField.set(item.field, list);
  }

  return PROFILE_FIELD_ORDER.map((field) => {
    const all = byField.get(field) ?? [];
    const active = all.filter(isActiveForProfile);
    if (active.length === 0) {
      return { ...placeholderItem(target, field), alternatives: [] };
    }

    const sorted = [...active].sort((a, b) => STATUS_PRIORITY[b.reviewStatus] - STATUS_PRIORITY[a.reviewStatus]);
    const canonical = { ...sorted[0] };
    const alternatives = sorted.slice(1);

    // 冲突只在“当前事实结论”之间计算：不同来源 + 不同结论值；
    // 或审核员已手动标记来源冲突（单来源也保留标记，直到冲突被处理）
    const claims = active.filter(
      (i) => FACT_CLAIM_STATUSES.includes(i.reviewStatus) || i.reviewerFlaggedConflict === true
    );
    const distinctValues = new Set(
      claims.filter((i) => i.value.trim()).map((i) => i.value.trim())
    );
    const distinctSources = new Set(claims.map((i) => i.sourceName));
    canonical.hasConflict =
      (distinctValues.size > 1 && distinctSources.size > 1) ||
      claims.some((i) => i.reviewerFlaggedConflict === true);

    return { ...canonical, alternatives };
  });
}

/**
 * 新一次提取入库前与历史证据合并：
 * - 同一字段的历史 AI 结论（ai_extracted/pending_review）被新结论替代；
 * - 官方确认、历史经验、个人经验保留；若与新结论冲突，交由画像层的冲突判定展示。
 */
export function mergeExtractedItems(
  previous: EvidenceItem[],
  newItems: EvidenceItem[]
): EvidenceItem[] {
  const newFields = new Set(newItems.map((i) => i.field));
  const retained = previous.filter(
    (i) =>
      !(
        newFields.has(i.field) &&
        (i.reviewStatus === "ai_extracted" || i.reviewStatus === "pending_review")
      )
  );
  return [...retained, ...newItems];
}

/** 由提取结果构造可持久化的 EvidenceItem 列表 */
export function buildEvidenceItems(params: {
  jobId: string;
  target: ExamTarget;
  payload: ExtractedPayload;
  now: string;
}): EvidenceItem[] {
  const { jobId, target, payload, now } = params;
  const scope = buildScope(target);
  return payload.fields
    .filter((f) => f.value.trim())
    .map((f) => ({
      id: `ev-${jobId}-${f.field}`,
      examTargetId: target.id,
      field: f.field,
      value: f.value.trim(),
      reviewStatus: reviewStatusForExtracted(f.field),
      sourceName: payload.sourceName,
      sourceType: payload.sourceType,
      sourceUrl: payload.sourceUrl,
      sourceExcerpt: f.excerpt,
      scope,
      updatedAt: now,
      jobId,
      version: 1,
    }));
}

/** 画像行统计（摘要条用） */
export function summarizeRows(rows: ProfileRow[]): Record<ReviewStatus, number> {
  const counts: Record<ReviewStatus, number> = {
    ai_extracted: 0,
    pending_review: 0,
    official: 0,
    historical: 0,
    personal: 0,
    unconfirmed: 0,
  };
  for (const row of rows) counts[row.reviewStatus] += 1;
  return counts;
}

/** 供提取器带入低影响字段的目标展示值 */
export function targetFieldValue(target: ExamTarget, field: EvidenceType): string {
  switch (field) {
    case "region":
      return [target.region, target.recruiter].filter(Boolean).join(" · ");
    case "recruit_type":
      return target.examType ? EXAM_TYPE_LABELS[target.examType] : "";
    case "year_batch":
      return [target.year ? `${target.year}年` : null, target.batch ?? null]
        .filter(Boolean)
        .join(" ");
    case "education_level":
      return target.educationLevel ? EDUCATION_LEVEL_LABELS[target.educationLevel] : "";
    case "exam_stage":
      return EXAM_STAGE_LABELS[target.stage];
    default:
      return "";
  }
}

export function fieldLabel(field: EvidenceType): string {
  return EVIDENCE_TYPE_LABELS[field];
}
