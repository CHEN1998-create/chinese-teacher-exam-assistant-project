/**
 * 机会纠错处理状态机（v7.0 P0-F / 模块 8 发布门槛）。
 *
 * 用户只能提交纠错；处理闭环由员工在运营后台完成：
 *
 *   submitted（已提交）
 *      ├─ reviewing（核对中）
 *      │     ├─ resolved（已修正）
 *      │     └─ rejected（不采纳）
 *      ├─ resolved（已修正）   ← 允许不经过 reviewing 直接闭环
 *      └─ rejected（不采纳）
 *
 * 不变量：
 * - resolved/rejected 为终态，任何人不能再改（纠错不物理删除，留痕可审计）；
 * - rejected 必须附处理说明，向提交人解释为什么未采纳；
 * - 每次状态推进都记录处理人与处理时间。
 */

export const CORRECTION_STATUSES = [
  'submitted',
  'reviewing',
  'resolved',
  'rejected',
] as const;

export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

export const TERMINAL_STATUSES: readonly CorrectionStatus[] = [
  'resolved',
  'rejected',
];

/** 员工可设置的状态（submitted 只能由用户提交产生） */
export const REVIEW_ACTIONS: readonly CorrectionStatus[] = [
  'reviewing',
  'resolved',
  'rejected',
];

const ALLOWED_TRANSITIONS: Record<CorrectionStatus, readonly CorrectionStatus[]> = {
  submitted: ['reviewing', 'resolved', 'rejected'],
  reviewing: ['resolved', 'rejected'],
  resolved: [],
  rejected: [],
};

export function isCorrectionStatus(value: string): value is CorrectionStatus {
  return (CORRECTION_STATUSES as readonly string[]).includes(value);
}

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function canTransition(from: string, to: CorrectionStatus): boolean {
  if (!isCorrectionStatus(from)) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * 校验一次员工处理动作。
 * @returns null 表示合法；否则返回面向用户的错误信息
 */
export function validateReview(input: {
  from: string;
  to: unknown;
  reviewNote?: unknown;
}): { ok: false; message: string } | { ok: true; status: CorrectionStatus; note: string | null } {
  if (typeof input.to !== 'string' || !isCorrectionStatus(input.to)) {
    return { ok: false, message: '处理状态无效' };
  }
  const to = input.to;
  if (to === 'submitted') {
    return { ok: false, message: '不能将纠错退回到已提交状态' };
  }
  if (!canTransition(input.from, to)) {
    return isTerminalStatus(input.from)
      ? { ok: false, message: '该纠错已处理完成，终态不能再次修改' }
      : { ok: false, message: '当前纠错状态不允许该操作' };
  }
  const note =
    typeof input.reviewNote === 'string' && input.reviewNote.trim().length > 0
      ? input.reviewNote.trim()
      : null;
  if (note && note.length > 500) {
    return { ok: false, message: '处理说明不能超过 500 字' };
  }
  if (to === 'rejected' && !note) {
    return { ok: false, message: '标记「不采纳」必须填写处理说明，向提交人解释原因' };
  }
  return { ok: true, status: to, note };
}

/** 用户在纠错弹窗中选择的问题位置（与前端 CorrectionModal FIELD_OPTIONS 对应） */
export const FIELD_PATH_LABELS: Record<string, string> = {
  major: '专业目录 / 资格条件',
  timeline: '报名时间 / 考试安排',
  headcount: '招聘人数 / 岗位信息',
  evidence: '官方来源或原文摘录',
  other: '其他问题',
};

export function fieldPathLabel(fieldPath: string): string {
  return FIELD_PATH_LABELS[fieldPath] ?? fieldPath;
}

/** 纠错记录对外 DTO（不含他人联系方式；contact 仅员工队列按权限使用） */
export interface CorrectionDTO {
  id: string;
  unitId: string;
  /** 单元已随旧版本移除时为 null，记录仍保留可审计 */
  unitName: string | null;
  announcementId: string;
  announcementTitle: string | null;
  versionId: string;
  fieldPath: string;
  fieldLabel: string;
  content: string;
  contact: string | null;
  status: string;
  reviewNote: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** 员工队列项：附带提交人账号信息（仅 STAFF_ROLES 可见） */
export interface StaffCorrectionDTO extends CorrectionDTO {
  submitter: {
    id: string;
    email: string;
    name: string | null;
  };
}
