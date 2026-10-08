/**
 * 考情审核后台服务（当前为本地 Mock 实现，可整体替换为真实后端）。
 *
 * 职责：
 * - 跨用户读取全部目标与字段证据，派生五个审核队列；
 * - 审核详情：原始来源、AI 提取值、当前发布值、适用范围、同字段多来源、历史版本；
 * - 审核动作：通过 / 修改后通过 / 驳回 / 标记待确认 / 标记来源冲突；
 * - 每次操作进行角色鉴权、必填原因校验、版本管理，并不可变追加 ReviewLog。
 *
 * 安全边界（Mock 阶段同样遵守）：
 * - 本服务对用户资料/用户私有数据只读不写，考情审核员无法借此修改用户私有资料；
 * - 角色校验在 service 层重复一次，UI 的隐藏/禁用仅为体验，不是安全边界；
 * - 没有真实后端，localStorage 可被用户自行改写，不能作为生产级权限控制。
 *
 * 替换为真实服务：保持 getQueue/getDetail/submitReview/getLogs 等方法签名，
 * 新增 HttpAdminReviewService 调用后端接口即可，页面无需改动。
 */
import {
  EvidenceItem,
  ExamTarget,
  ReviewActionType,
  ReviewLog,
  ReviewQueueKey,
  ReviewStatus,
  UserRole,
} from "@/types";
import { loadFromStorage, saveToStorageStrict } from "@/lib/storage";
import { STORAGE_KEYS, mockEvidenceItems, mockExamTargets } from "@/lib/mock-data";
import { normalizeTarget } from "@/lib/targets/domain";
import {
  buildProfileRows,
  isHighImpact,
  summarizeRows,
} from "@/lib/evidence/domain";
import {
  emitEvidenceChanged,
  getEvidenceStoreVersion,
  subscribeEvidence,
} from "@/lib/evidence/events";
import { authService } from "@/lib/auth";
import {
  AdminQueueEntry,
  buildQueueEntries,
  canReviewField,
  canViewAdmin,
  permissionDeniedReason,
  queueCounts,
  selectQueue,
} from "./domain";
import { track } from "@/lib/analytics/eventService";

// ==================== 读取 ====================

function loadAllItems(): EvidenceItem[] {
  return loadFromStorage<EvidenceItem[]>(STORAGE_KEYS.EVIDENCE_ITEMS, mockEvidenceItems);
}

function loadAllTargets(): ExamTarget[] {
  return loadFromStorage<ExamTarget[]>(STORAGE_KEYS.EXAM_TARGETS, mockExamTargets).map(
    normalizeTarget
  );
}

function loadLogs(): ReviewLog[] {
  return loadFromStorage<ReviewLog[]>(STORAGE_KEYS.REVIEW_LOGS, []);
}

function currentRole(): UserRole {
  const role = authService.getSession()?.user.role;
  if (!role) throw new Error("未登录或会话已过期，请重新登录");
  return role;
}

function assertCanView(): UserRole {
  const role = currentRole();
  if (!canViewAdmin(role)) {
    throw new Error("当前账号没有审核后台权限");
  }
  return role;
}

function assertCanAct(role: UserRole, field: EvidenceItem["field"]): void {
  if (!canReviewField(role, field)) {
    throw new Error(permissionDeniedReason(role, field));
  }
}

// ==================== 详情与分组类型 ====================

export interface ReviewDetail {
  item: EvidenceItem;
  target: ExamTarget | null;
  /** 同字段全部来源结论（含已驳回项，审核员需要看到全貌） */
  fieldItems: EvidenceItem[];
  /** 当前已发布版本（official） */
  published: EvidenceItem | null;
  /** 该证据的审核操作历史（倒序） */
  logs: ReviewLog[];
}

export interface ReviewTargetGroup {
  target: ExamTarget;
  totals: ReturnType<typeof summarizeRows>;
  conflictCount: number;
  pendingHighImpactCount: number;
}

export interface SubmitReviewInput {
  evidenceItemId: string;
  action: ReviewActionType;
  /** 修改后通过时的校正值 */
  editedValue?: string;
  /** 必填：预置原因 */
  reasonPreset: string;
  /** 选填：补充说明 */
  reasonNote?: string;
}

// ==================== 服务 ====================

export const adminReviewService = {
  subscribe(listener: () => void): () => void {
    return subscribeEvidence(listener);
  },

  getVersion(): number {
    return getEvidenceStoreVersion();
  },

  /** 全部队列条目（跨用户），可按目标过滤 */
  getAllEntries(targetId?: string): AdminQueueEntry[] {
    const items = loadAllItems();
    const targets = loadAllTargets();
    const logs = loadLogs();
    const entries = buildQueueEntries(items, targets, logs);
    return targetId ? entries.filter((e) => e.item.examTargetId === targetId) : entries;
  },

  /** 某一队列视图（带计数/排序），可按目标过滤 */
  getQueue(view: ReviewQueueKey, targetId?: string): AdminQueueEntry[] {
    assertCanView();
    return selectQueue(this.getAllEntries(targetId), view);
  },

  getQueueCounts(targetId?: string): Record<ReviewQueueKey, number> {
    return queueCounts(this.getAllEntries(targetId));
  },

  /** 审核详情：原始来源 / AI 值 / 当前发布值 / 适用范围 / 历史版本 */
  getDetail(evidenceItemId: string): ReviewDetail | null {
    assertCanView();
    const items = loadAllItems();
    const item = items.find((i) => i.id === evidenceItemId);
    if (!item) return null;
    const targets = loadAllTargets();
    const logs = loadLogs()
      .filter((l) => l.evidenceItemId === evidenceItemId)
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));

    const fieldItems = items
      .filter((i) => i.field === item.field)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const published =
      fieldItems.find((i) => i.reviewStatus === "official") ?? null;

    return {
      item,
      target: targets.find((t) => t.id === item.examTargetId) ?? null,
      fieldItems,
      published,
      logs,
    };
  },

  /** 考情管理页：全部目标 + 每目标画像统计（与用户端口径一致） */
  getTargetGroups(): ReviewTargetGroup[] {
    assertCanView();
    const targets = loadAllTargets();
    const items = loadAllItems();
    return targets
      .filter((t) => t.status !== "archived")
      .map((target) => {
        const rows = buildProfileRows(
          target,
          items.filter((i) => i.examTargetId === target.id)
        );
        return {
          target,
          totals: summarizeRows(rows),
          conflictCount: rows.filter((r) => r.hasConflict).length,
          pendingHighImpactCount: rows.filter(
            (r) => r.reviewStatus === "pending_review"
          ).length,
        };
      })
      .sort((a, b) => b.target.updatedAt.localeCompare(a.target.updatedAt));
  },

  /** 最近审核记录（概览/留痕审计用） */
  getRecentLogs(limit = 20): ReviewLog[] {
    assertCanView();
    return loadLogs()
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
      .slice(0, limit);
  },

  /**
   * 提交审核动作（操作级最终闸门）：
   * 1. 登录 + 后台角色 + 字段级权限校验；
   * 2. 原因必选；修改后通过必须给出非空校正值；
   * 3. 已发布结论被修改时版本号 +1；其他动作保留版本号；
   * 4. 更新证据状态并追加不可变 ReviewLog，一次写入后通知订阅者。
   */
  submitReview(input: SubmitReviewInput): { item: EvidenceItem; log: ReviewLog } {
    const role = assertCanView();
    const reasonPreset = input.reasonPreset?.trim();
    if (!reasonPreset) throw new Error("请选择本次操作的原因");
    const note = input.reasonNote?.trim();
    const reason = note ? `${reasonPreset}（补充：${note}）` : reasonPreset;

    const items = loadAllItems();
    const index = items.findIndex((i) => i.id === input.evidenceItemId);
    if (index === -1) throw new Error("待审核结论不存在或已被处理");
    const before = items[index];

    assertCanAct(role, before.field);

    const now = new Date().toISOString();
    const session = authService.getSession()!;
    let afterStatus: ReviewStatus;
    let nextValue = before.value;
    let nextVersion = before.version;
    let flaggedConflict = before.reviewerFlaggedConflict === true;

    switch (input.action) {
      case "approve":
        afterStatus = "official";
        break;
      case "approve_with_edit": {
        const edited = input.editedValue?.trim() ?? "";
        if (!edited) throw new Error("请填写校正后的结论内容");
        afterStatus = "official";
        // 已发布结论被修改必须升版本；首次发布即使改了值也不产生历史发布版本
        if (before.reviewStatus === "official" && edited !== before.value.trim()) {
          nextVersion = before.version + 1;
        }
        nextValue = edited;
        break;
      }
      case "reject":
        afterStatus = "unconfirmed";
        flaggedConflict = false;
        break;
      case "mark_unconfirmed":
        afterStatus = "unconfirmed";
        flaggedConflict = false;
        break;
      case "mark_conflict":
        afterStatus = "unconfirmed";
        flaggedConflict = true;
        break;
      default: {
        const exhaustive: never = input.action;
        throw new Error(`未知审核动作：${String(exhaustive)}`);
      }
    }

    const updatedItem: EvidenceItem = {
      ...before,
      value: nextValue,
      reviewStatus: afterStatus,
      version: nextVersion,
      reviewerName: session.user.name,
      reviewedAt: now,
      reviewerFlaggedConflict: flaggedConflict ? true : undefined,
      updatedAt: now,
    };
    items[index] = updatedItem;

    const log: ReviewLog = {
      id: `rlog-${Date.now()}`,
      evidenceItemId: before.id,
      examTargetId: before.examTargetId,
      field: before.field,
      action: input.action,
      beforeValue: before.value,
      afterValue: nextValue,
      beforeStatus: before.reviewStatus,
      afterStatus,
      version: nextVersion,
      reason,
      reasonPreset,
      reviewerId: session.user.id,
      reviewerName: session.user.name,
      reviewerRole: role,
      reviewedAt: now,
    };
    const logs = loadLogs();
    logs.push(log);

    saveToStorageStrict(STORAGE_KEYS.EVIDENCE_ITEMS, items);
    saveToStorageStrict(STORAGE_KEYS.REVIEW_LOGS, logs);
    emitEvidenceChanged();

    // 审核完成留痕事件（不包含审核前后的值正文，仅记录动作与耗时）
    const owner = loadAllTargets().find((t) => t.id === before.examTargetId);
    const durationMinutes = Math.max(
      0,
      Math.round(
        (new Date(now).getTime() - new Date(before.updatedAt).getTime()) / 60000
      )
    );
    track("review_completed", "review", {
      targetId: before.examTargetId,
      props: {
        action: input.action,
        durationMinutes,
        highImpact: isHighImpact(before.field) ? 1 : 0,
        edited: input.action === "approve_with_edit" ? 1 : 0,
        ownerId: owner?.userId ?? "unknown",
      },
    });

    return { item: updatedItem, log };
  },
};
