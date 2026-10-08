/**
 * 纠错与结论撤回服务（本地 Mock，可整体替换为真实后端）。
 *
 * 用户侧：
 * - 提交纠错（对象 / 问题描述 / 补充来源 / 提交时间）、补充材料、查询自己的纠错与处理结果；
 * - 用户只能读到自己的纠错（service 层按 userId 过滤，UI 隐藏不是安全边界）。
 *
 * 后台侧（/admin/feedback）：
 * - 跨用户纠错队列：采纳 / 驳回 / 要求补充 / 开始处理；
 * - 采纳证据纠错时可同步走人工审核（adminReviewService 留痕 ReviewLog）；
 * - 撤回错误结论：先分析影响范围（目标/用户/执行中计划/任务），再撤回证据、
 *   追加撤回留痕（RetractionRecord，只追加不删除）、通知受影响用户并要求重新确认计划。
 *
 * 安全边界：
 * - 纠错处理与撤回需要 exam_reviewer/admin 角色；resource_reviewer 只读；
 * - 审计记录（ReviewLog / RetractionRecord / Correction）不物理删除。
 */
import {
  Correction,
  CorrectionSource,
  CorrectionStatus,
  CorrectionTargetType,
  CorrectionTimelineAction,
  DailyPlan,
  EvidenceItem,
  ExamTarget,
  RetractionImpactScope,
  RetractionRecord,
  UserRole,
  WeeklyPlan,
} from "@/types";
import { EVIDENCE_TYPE_LABELS } from "@/types";
import { loadFromStorage, saveToStorageStrict } from "@/lib/storage";
import {
  STORAGE_KEYS,
  mockCorrections,
  mockEvidenceItems,
  mockExamTargets,
} from "@/lib/mock-data";
import { normalizeTarget } from "@/lib/targets/domain";
import { authService, DEMO_ACCOUNTS } from "@/lib/auth";
import { adminReviewService } from "@/lib/admin/adminReviewService";
import { planService } from "@/lib/plans/planService";
import { emitEvidenceChanged } from "@/lib/evidence/events";
import { notificationService } from "./notificationService";
import { emitGovernanceChanged } from "./events";
import { HIGH_IMPACT_FIELDS, isHighImpact } from "@/lib/evidence/domain";
import {
  analyzeRetractionImpact,
  normalizeCorrection,
  selectCorrections,
  type CorrectionQueueKey,
} from "./domain";
import { track, classifyErrorCode } from "@/lib/analytics/eventService";

// ==================== 读取辅助 ====================

function loadAll(): Correction[] {
  return loadFromStorage<Correction[]>(STORAGE_KEYS.CORRECTIONS, mockCorrections).map(
    normalizeCorrection
  );
}

function persistAll(all: Correction[]): void {
  try {
    saveToStorageStrict(STORAGE_KEYS.CORRECTIONS, all);
  } catch (e) {
    track("critical_write_failed", "storage", {
      props: {
        module: "correction",
        storageKey: STORAGE_KEYS.CORRECTIONS,
        reasonCode: classifyErrorCode(e),
      },
    });
    throw e;
  }
  emitGovernanceChanged();
}

function loadItems(): EvidenceItem[] {
  return loadFromStorage<EvidenceItem[]>(STORAGE_KEYS.EVIDENCE_ITEMS, mockEvidenceItems);
}

function loadTargets(): ExamTarget[] {
  return loadFromStorage<ExamTarget[]>(STORAGE_KEYS.EXAM_TARGETS, mockExamTargets).map(
    normalizeTarget
  );
}

function loadWeeklyPlans(): WeeklyPlan[] {
  return loadFromStorage<WeeklyPlan[]>(STORAGE_KEYS.PLANS, []);
}

function loadDailyPlans(): DailyPlan[] {
  return loadFromStorage<DailyPlan[]>(STORAGE_KEYS.DAILY_PLANS, []);
}

function loadRetractions(): RetractionRecord[] {
  return loadFromStorage<RetractionRecord[]>(STORAGE_KEYS.RETRACTION_LOGS, []);
}

function currentUserId(): string {
  return authService.getSession()?.user.id ?? "anonymous";
}

function assertLogin(): { userId: string; name: string; role: UserRole } {
  const session = authService.getSession();
  if (!session) throw new Error("未登录或会话已过期，请重新登录");
  return { userId: session.user.id, name: session.user.name, role: session.user.role };
}

function assertCanView(): UserRole {
  const { role } = assertLogin();
  if (role !== "exam_reviewer" && role !== "resource_reviewer" && role !== "admin") {
    throw new Error("当前账号没有纠错治理后台权限");
  }
  return role;
}

/** 纠错处理与撤回：仅考情审核员 / 管理员（资源审核员只读） */
function assertCanAct(): { userId: string; name: string; role: UserRole } {
  assertCanView();
  const me = assertLogin();
  if (me.role !== "exam_reviewer" && me.role !== "admin") {
    throw new Error("纠错处理与结论撤回需要考情审核员或管理员权限");
  }
  return me;
}

const KNOWN_USER_NAMES = new Map(DEMO_ACCOUNTS.map((a) => [a.user.id, a.user.name]));

/** 跨用户展示用的提交人名称（Mock：从演示账号解析；真实环境由后端返回） */
export function resolveUserName(userId: string): string {
  return KNOWN_USER_NAMES.get(userId) ?? `用户 ${userId.slice(0, 6)}`;
}

function timelineEntry(
  action: CorrectionTimelineAction,
  actor: { id: string; name: string; role: UserRole | "user" },
  note?: string
) {
  return {
    id: `cor-tl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    note,
  };
}

// ==================== 输入与视图类型 ====================

export interface SubmitCorrectionInput {
  targetType: CorrectionTargetType;
  examTargetId: string;
  evidenceItemId?: string;
  /** 证据字段 key；other 类型传空串 */
  field: string;
  fieldLabel?: string;
  /** other 类型时手动填写的纠错对象 */
  subject?: string;
  currentValue?: string;
  /** 问题描述（必填） */
  description: string;
  /** 认为正确的内容（选填） */
  suggestedValue?: string;
  /** 补充来源（至少一条：链接或文字说明） */
  sources: { url?: string; note?: string }[];
}

export interface AdminCorrectionView {
  correction: Correction;
  target: ExamTarget | null;
  submitterName: string;
  linkedItem: EvidenceItem | null;
}

export interface ProcessCorrectionInput {
  resultNote?: string;
  /** 采纳时：是否同步把结论更新到证据（走人工审核留痕） */
  applyToEvidence?: boolean;
  /** 采纳并更新证据时的最终结论值（默认取用户建议值） */
  finalValue?: string;
}

// ==================== 服务 ====================

export const correctionService = {
  // ---------- 用户侧 ----------

  /** 当前用户的全部纠错（跨目标），倒序 */
  listMine(): Correction[] {
    const userId = currentUserId();
    return loadAll()
      .filter((c) => c.userId === userId && !c.anonymized)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  /** 当前用户在某目标下的纠错（保持 evidenceService 旧调用口径） */
  listForTarget(targetId: string): Correction[] {
    return this.listMine().filter((c) => c.examTargetId === targetId);
  },

  /** 读取自己的单条纠错；不属于本人时返回 null */
  getMine(id: string): Correction | null {
    const userId = currentUserId();
    const item = loadAll().find((c) => c.id === id);
    return item && item.userId === userId ? item : null;
  },

  /** 提交纠错 */
  submit(input: SubmitCorrectionInput): Correction {
    const me = assertLogin();
    const description = input.description.trim();
    if (!description) throw new Error("请填写问题描述");

    const sources: CorrectionSource[] = input.sources
      .map((s) => ({ url: s.url?.trim(), note: s.note?.trim() }))
      .filter((s) => s.url || s.note)
      .map((s, i) => ({
        id: `cor-src-${Date.now()}-${i}`,
        url: s.url || undefined,
        note: s.note || undefined,
        createdAt: new Date().toISOString(),
      }));
    if (sources.length === 0) {
      throw new Error("请至少提供一条补充来源（公告链接或文字说明）");
    }

    let subject: string;
    let field = input.field;
    if (input.targetType === "evidence") {
      if (!field) throw new Error("请选择纠错的考情字段");
      subject = input.fieldLabel || EVIDENCE_TYPE_LABELS[field as keyof typeof EVIDENCE_TYPE_LABELS] || field;
    } else {
      subject = (input.subject ?? "").trim();
      if (!subject) throw new Error("请填写纠错对象");
      field = "";
    }

    const now = new Date().toISOString();
    const correction: Correction = {
      id: `cor-${Date.now()}`,
      userId: me.userId,
      targetType: input.targetType,
      examTargetId: input.examTargetId,
      evidenceItemId: input.evidenceItemId,
      field,
      fieldLabel: input.fieldLabel,
      subject,
      currentValue: input.currentValue?.trim() ?? "",
      description,
      suggestedValue: input.suggestedValue?.trim() ?? "",
      sources,
      status: "submitted",
      timeline: [timelineEntry("submit", { id: me.userId, name: me.name, role: "user" })],
      createdAt: now,
      updatedAt: now,
    };

    const all = loadAll();
    all.push(correction);
    persistAll(all);
    track("correction_submitted", "correction", {
      targetId: correction.examTargetId,
      props: { targetType: correction.targetType },
    });
    return correction;
  },

  /** 用户补充材料：待补充/处理中/已提交状态均可补充，补充后回到已提交队列 */
  supplement(id: string, input: { url?: string; note?: string }): Correction {
    const me = assertLogin();
    const all = loadAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("纠错不存在或已被删除");
    const current = all[idx];
    if (current.userId !== me.userId) throw new Error("只能补充自己提交的纠错");
    if (current.status === "accepted" || current.status === "rejected") {
      throw new Error("该纠错已处理结束，不能再补充材料");
    }
    const url = input.url?.trim();
    const note = input.note?.trim();
    if (!url && !note) throw new Error("请填写补充链接或文字说明");

    const now = new Date().toISOString();
    const source: CorrectionSource = {
      id: `cor-src-${Date.now()}`,
      url: url || undefined,
      note: note || undefined,
      createdAt: now,
    };
    const next: Correction = {
      ...current,
      sources: [...current.sources, source],
      status: "submitted",
      resultNote: current.status === "need_info" ? undefined : current.resultNote,
      timeline: [
        ...current.timeline,
        timelineEntry("supplement", { id: me.userId, name: me.name, role: "user" }, note ?? url),
      ],
      updatedAt: now,
    };
    all[idx] = next;
    persistAll(all);
    return next;
  },

  // ---------- 后台侧 ----------

  /** 后台纠错队列（跨用户） */
  listQueue(queue: CorrectionQueueKey): AdminCorrectionView[] {
    assertCanView();
    const corrections = selectCorrections(loadAll(), queue);
    const targets = loadTargets();
    const items = loadItems();
    return corrections.map((correction) => ({
      correction,
      target: targets.find((t) => t.id === correction.examTargetId) ?? null,
      submitterName: correction.anonymized
        ? "已注销用户"
        : resolveUserName(correction.userId),
      linkedItem: correction.evidenceItemId
        ? items.find((i) => i.id === correction.evidenceItemId) ?? null
        : null,
    }));
  },

  /** 后台纠错详情（含目标名称、提交人、关联证据当前值） */
  getAdminDetail(id: string): AdminCorrectionView | null {
    assertCanView();
    const correction = loadAll().find((c) => c.id === id);
    if (!correction) return null;
    const targets = loadTargets();
    const items = loadItems();
    return {
      correction,
      target: targets.find((t) => t.id === correction.examTargetId) ?? null,
      submitterName: correction.anonymized ? "已注销用户" : resolveUserName(correction.userId),
      linkedItem: correction.evidenceItemId
        ? items.find((i) => i.id === correction.evidenceItemId) ?? null
        : null,
    };
  },

  /** 开始处理（已提交 → 处理中） */
  startProcessing(id: string): Correction {
    const me = assertCanAct();
    return this.transition(id, "processing", "start_processing", { actor: me });
  },

  /**
   * 采纳纠错：
   * - 记录采纳结果与时间线，给提交人发送纠错结果通知；
   * - applyToEvidence 时对关联证据执行“修改后通过”的人工审核动作（写 ReviewLog），
   *   字段级权限由 adminReviewService 再校验一次。
   */
  accept(id: string, input: ProcessCorrectionInput = {}): Correction {
    const me = assertCanAct();
    const detail = this.getAdminDetail(id);
    if (!detail) throw new Error("纠错不存在或已被删除");
    let appliedToEvidence = false;

    if (input.applyToEvidence && detail.correction.evidenceItemId) {
      const finalValue = (input.finalValue ?? detail.correction.suggestedValue).trim();
      if (!finalValue) throw new Error("请填写采纳后的最终结论值");
      adminReviewService.submitReview({
        evidenceItemId: detail.correction.evidenceItemId,
        action: "approve_with_edit",
        editedValue: finalValue,
        reasonPreset: "用户纠错经查证属实",
        reasonNote: `纠错单号 ${id}：${detail.correction.description.slice(0, 80)}`,
      });
      appliedToEvidence = true;
    }

    const note = input.resultNote?.trim() || "纠错内容经查证属实，已采纳，感谢反馈。";
    const updated = this.transition(id, "accepted", "accept", {
      actor: me,
      note,
      extra: { appliedToEvidence },
    });

    notificationService.pushToUser(detail.correction.userId, {
      type: "correction_result",
      title: `你的纠错已采纳：${detail.correction.subject}`,
      body:
        (appliedToEvidence ? "考情结论已更新。" : "纠错已被采纳并记录。") +
        `处理说明：${note}`,
      severity: "important",
      related: { correctionId: id, examTargetId: detail.correction.examTargetId, href: "/opportunities" },
    });
    return updated;
  },

  /** 驳回（必须填写原因） */
  reject(id: string, resultNote: string): Correction {
    const me = assertCanAct();
    const note = resultNote.trim();
    if (!note) throw new Error("请填写驳回原因");
    const detail = this.getAdminDetail(id);
    if (!detail) throw new Error("纠错不存在或已被删除");

    const updated = this.transition(id, "rejected", "reject", { actor: me, note });
    notificationService.pushToUser(detail.correction.userId, {
      type: "correction_result",
      title: `纠错处理结果：${detail.correction.subject}`,
      body: `你提交的纠错未被采纳。原因：${note}`,
      severity: "important",
      related: { correctionId: id, examTargetId: detail.correction.examTargetId, href: "/opportunities" },
    });
    return updated;
  },

  /** 要求补充材料（必须填写需要补充的内容），状态回到待补充 */
  requestInfo(id: string, question: string): Correction {
    const me = assertCanAct();
    const ask = question.trim();
    if (!ask) throw new Error("请填写需要用户补充的内容");
    const detail = this.getAdminDetail(id);
    if (!detail) throw new Error("纠错不存在或已被删除");

    const updated = this.transition(id, "need_info", "request_info", {
      actor: me,
      note: ask,
    });
    notificationService.pushToUser(detail.correction.userId, {
      type: "correction_result",
      title: `纠错需要补充材料：${detail.correction.subject}`,
      body: `审核员需要你补充更多信息：${ask}`,
      severity: "important",
      related: { correctionId: id, examTargetId: detail.correction.examTargetId, href: "/opportunities" },
    });
    return updated;
  },

  /** 通用状态迁移（内部） */
  transition(
    id: string,
    status: CorrectionStatus,
    action: CorrectionTimelineAction,
    opts: {
      actor: { userId: string; name: string; role: UserRole };
      note?: string;
      extra?: Partial<Correction>;
    }
  ): Correction {
    const all = loadAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("纠错不存在或已被删除");
    const now = new Date().toISOString();
    const isTerminal = status === "accepted" || status === "rejected";
    const next: Correction = {
      ...all[idx],
      ...opts.extra,
      status,
      resultNote: opts.note ?? (status === "processing" ? all[idx].resultNote : opts.note),
      handlerId: isTerminal || status === "need_info" || status === "processing"
        ? opts.actor.userId
        : all[idx].handlerId,
      handlerName:
        isTerminal || status === "need_info" || status === "processing"
          ? opts.actor.name
          : all[idx].handlerName,
      handledAt: isTerminal ? now : all[idx].handledAt,
      timeline: [
        ...all[idx].timeline,
        timelineEntry(
          action,
          { id: opts.actor.userId, name: opts.actor.name, role: opts.actor.role },
          opts.note
        ),
      ],
      updatedAt: now,
    };
    all[idx] = next;
    persistAll(all);
    return next;
  },

  // ---------- 错误结论撤回 ----------

  listRetractions(): RetractionRecord[] {
    assertCanView();
    return loadRetractions().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** 撤回前预览影响范围（只读，不写任何数据） */
  previewRetraction(evidenceItemId: string): {
    item: EvidenceItem;
    impact: RetractionImpactScope;
    targets: ExamTarget[];
    plans: WeeklyPlan[];
    highImpact: boolean;
  } {
    assertCanView();
    const items = loadItems();
    const item = items.find((i) => i.id === evidenceItemId);
    if (!item) throw new Error("结论不存在或已被处理");
    const targets = loadTargets();
    const plans = loadWeeklyPlans();
    const dailyPlans = loadDailyPlans();
    const impact = analyzeRetractionImpact({ item, items, targets, weeklyPlans: plans, dailyPlans });
    return {
      item,
      impact,
      targets: targets.filter((t) => impact.targetIds.includes(t.id)),
      plans: plans.filter((p) => impact.planIds.includes(p.id)),
      highImpact: HIGH_IMPACT_FIELDS.includes(item.field),
    };
  },

  /**
   * 撤回错误结论：
   * 1. 仅考情审核员/管理员，撤回原因与用户变化说明必填；
   * 2. 分析受影响目标/用户/执行中计划/任务（同字段同值的结论一并撤回）；
   * 3. 逐条走人工审核“驳回”动作置为待确认并写 ReviewLog（原值留痕）；
   * 4. 高影响字段：执行中计划的任务标记待重新确认；
   * 5. 向受影响用户发送考情变化通知（含变化说明与下一步）及计划重新确认通知；
   * 6. 追加不可变 RetractionRecord。
   */
  retractConclusion(input: {
    evidenceItemId: string;
    reason: string;
    userNotice: string;
    nextSteps?: string[];
  }): RetractionRecord {
    const me = assertCanAct();
    const reason = input.reason.trim();
    const userNotice = input.userNotice.trim();
    if (!reason) throw new Error("请填写撤回原因");
    if (!userNotice) throw new Error("请填写给受影响用户的变化说明");

    const items = loadItems();
    const seed = items.find((i) => i.id === input.evidenceItemId);
    if (!seed) throw new Error("待撤回的结论不存在或已被处理");
    if (seed.reviewStatus === "unconfirmed") {
      throw new Error("该结论当前已是“待确认”状态，不需要撤回");
    }

    const targets = loadTargets();
    const weeklyPlans = loadWeeklyPlans();
    const dailyPlansBefore = loadDailyPlans();
    const impact: RetractionImpactScope = analyzeRetractionImpact({
      item: seed,
      items,
      targets,
      weeklyPlans,
      dailyPlans: dailyPlansBefore,
    });

    const now = new Date().toISOString();
    const nextSteps =
      input.nextSteps && input.nextSteps.length > 0
        ? input.nextSteps
        : [
            "到「我的考试」核对该字段的最新结论",
            "到「接下来 7 天」重新确认受影响的任务",
            "如发现新的公告来源，可在「这次考试怎么考」中提交纠错",
          ];

    // 逐条撤回：走人工审核留痕（同一原因），每条都会写 ReviewLog 并刷新证据事件
    for (const evidenceItemId of impact.evidenceItemIds) {
      adminReviewService.submitReview({
        evidenceItemId,
        action: "reject",
        reasonPreset: "错误结论撤回（治理操作）",
        reasonNote: `撤回原因：${reason}`,
      });
    }

    // 高影响字段：标记执行中计划的任务待重新确认；低影响字段只通知不打断计划
    const flagged = isHighImpact(seed.field)
      ? planService.flagEvidenceChange(impact.targetIds, {
          field: seed.field,
          reason,
          retractionAt: now,
        })
      : { planIds: [], taskIds: [], plansByUser: {} as Record<string, string[]>, meta: { field: seed.field, reason, retractionAt: now } };
    impact.planIds = [...new Set([...impact.planIds, ...flagged.planIds])];
    impact.taskIds = [...new Set([...impact.taskIds, ...flagged.taskIds])];

    const recordId = `ret-${Date.now()}`;

    // 通知受影响用户（按其个人偏好可能被抑制）
    const notifiedUserIds: string[] = [];
    for (const userId of impact.userIds) {
      const examNotice = notificationService.pushToUser(userId, {
        type: "exam_change",
        title: `重要考情变化：${EVIDENCE_TYPE_LABELS[seed.field]}结论已撤回`,
        body: userNotice,
        severity: "important",
        nextSteps,
        related: { examTargetId: seed.examTargetId, retractionId: recordId, href: "/opportunities" },
        createdAt: now,
      });
      if (examNotice) notifiedUserIds.push(userId);

      for (const weeklyPlanId of flagged.plansByUser[userId] ?? []) {
        notificationService.pushToUser(userId, {
          type: "plan_reconfirm",
          title: "本周计划需要重新确认",
          body: `由于「${EVIDENCE_TYPE_LABELS[seed.field]}」结论撤回，计划中相关任务已标记为“待重新确认”，请确认后继续执行。`,
          severity: "important",
          nextSteps: ["查看标记任务，确认继续或调整安排"],
          related: { weeklyPlanId, examTargetId: seed.examTargetId, retractionId: recordId, href: "/study" },
          createdAt: now,
        });
      }
    }

    const record: RetractionRecord = {
      id: recordId,
      evidenceItemId: seed.id,
      examTargetId: seed.examTargetId,
      field: seed.field,
      fieldLabel: EVIDENCE_TYPE_LABELS[seed.field],
      withdrawnValue: seed.value,
      reason,
      operatorId: me.userId,
      operatorName: me.name,
      operatorRole: me.role,
      createdAt: now,
      impact,
      userNotice,
      nextSteps,
      notifiedUserIds,
    };
    const retractions = loadRetractions();
    retractions.push(record);
    saveToStorageStrict(STORAGE_KEYS.RETRACTION_LOGS, retractions);
    emitEvidenceChanged();
    emitGovernanceChanged();
    return record;
  },
};
