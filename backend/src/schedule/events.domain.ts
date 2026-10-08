/**
 * 日程与通知领域类型（v6.1 模块 6）。
 *
 * 事件由已发布公告版本的 timeline 派生，按“用户关注的报考单元”落库。
 * eventKey = `${unitId}-${kind}` 在同一用户下唯一，保证同一公告版本
 * 重复同步不产生重复事件；新版本变更时间时更新同一记录并追加 changeHistory。
 */

/** 时间线事件类型（与公告 timeline 字段一一对应；不凭空发明“审核”等无数据节点） */
export type TimelineEventKind =
  | 'registration_start'
  | 'registration_end'
  | 'payment'
  | 'admit_ticket'
  | 'written_exam'
  | 'score'
  | 'interview'
  | 'pending_notice';

/** 通知分级（docs IA 第 5 节） */
export type NotificationSeverity = 'must_handle' | 'suggest_handle' | 'info';

/** 日程展示强度（前端视觉：must=必须处理/suggest=建议处理/info=普通信息） */
export type ScheduleUrgency = 'must' | 'suggest' | 'info';

export interface TimelineChangeRecord {
  versionId: string;
  dateIso: string | null;
  title: string;
  changedAt: string;
}

/** 从公告版本派生的原始事件（未落库） */
export interface RawTimelineEvent {
  eventKey: string;
  kind: TimelineEventKind;
  title: string;
  /** ISO 日期；待官方通知时为 null，绝不写推测日期 */
  dateIso: string | null;
}

/** 事件中文标签 */
export const KIND_LABELS: Record<TimelineEventKind, string> = {
  registration_start: '报名开始',
  registration_end: '报名截止',
  payment: '缴费截止',
  admit_ticket: '准考证打印',
  written_exam: '笔试',
  score: '成绩发布',
  interview: '面试',
  pending_notice: '待官方通知',
};

/**
 * 从公告版本 timeline 生成事件列表。
 * - 时间未定的字段直接跳过（不生成伪精确事件）；
 * - pendingItems 生成 dateIso=null 的 pending_notice 事件。
 */
export function generateEvents(
  unitId: string,
  timeline: {
    registrationStart?: string;
    registrationEnd?: string;
    paymentDeadline?: string;
    admitTicketStart?: string;
    writtenExamDate?: string;
    scoreDate?: string;
    interviewDate?: string;
    pendingItems?: string[];
  },
): RawTimelineEvent[] {
  const events: RawTimelineEvent[] = [];

  if (timeline.registrationStart) {
    events.push({
      eventKey: `${unitId}-registration_start`,
      kind: 'registration_start',
      title: KIND_LABELS.registration_start,
      dateIso: timeline.registrationStart,
    });
  }
  if (timeline.registrationEnd) {
    events.push({
      eventKey: `${unitId}-registration_end`,
      kind: 'registration_end',
      title: KIND_LABELS.registration_end,
      dateIso: timeline.registrationEnd,
    });
  }
  if (timeline.paymentDeadline) {
    events.push({
      eventKey: `${unitId}-payment`,
      kind: 'payment',
      title: KIND_LABELS.payment,
      dateIso: timeline.paymentDeadline,
    });
  }
  if (timeline.admitTicketStart) {
    events.push({
      eventKey: `${unitId}-admit_ticket`,
      kind: 'admit_ticket',
      title: KIND_LABELS.admit_ticket,
      dateIso: timeline.admitTicketStart,
    });
  }
  if (timeline.writtenExamDate) {
    events.push({
      eventKey: `${unitId}-written_exam`,
      kind: 'written_exam',
      title: KIND_LABELS.written_exam,
      dateIso: timeline.writtenExamDate,
    });
  }
  if (timeline.scoreDate) {
    events.push({
      eventKey: `${unitId}-score`,
      kind: 'score',
      title: KIND_LABELS.score,
      dateIso: timeline.scoreDate,
    });
  }
  if (timeline.interviewDate) {
    events.push({
      eventKey: `${unitId}-interview`,
      kind: 'interview',
      title: KIND_LABELS.interview,
      dateIso: timeline.interviewDate,
    });
  }

  for (const [index, item] of (timeline.pendingItems ?? []).entries()) {
    events.push({
      eventKey: `${unitId}-pending_notice-${index}`,
      kind: 'pending_notice',
      title: item,
      dateIso: null,
    });
  }

  return events;
}

/**
 * 根据事件类型与距今天数推导展示强度（不写库，查询时计算）。
 * - 报名/缴费截止在 7 天内 → must；
 * - 笔试/面试/准考证在 14 天内 → suggest；
 * - 其余为 info；已过去的事件统一按 info 展示。
 */
export function urgencyOf(
  kind: TimelineEventKind,
  daysUntil: number | null,
): ScheduleUrgency {
  if (daysUntil === null || daysUntil < 0) return 'info';
  if ((kind === 'registration_end' || kind === 'payment') && daysUntil <= 7) {
    return 'must';
  }
  if (
    (kind === 'written_exam' ||
      kind === 'interview' ||
      kind === 'admit_ticket') &&
    daysUntil <= 14
  ) {
    return 'suggest';
  }
  if (kind === 'registration_start' && daysUntil <= 3) return 'suggest';
  return 'info';
}

/**
 * 由事件变更推导通知分级。
 * - 截止日期提前/资格相关条件变化 → must_handle；
 * - 笔试/面试时间变化 → suggest_handle；
 * - 仅新增待定事项或成绩日期 → info。
 */
export function severityOfChange(
  kind: TimelineEventKind,
  oldDateIso: string | null,
  newDateIso: string | null,
): NotificationSeverity {
  if (kind === 'registration_end' || kind === 'payment') {
    // 截止日期变化（无论提前还是明确）都必须处理
    return oldDateIso !== newDateIso ? 'must_handle' : 'info';
  }
  if (
    kind === 'written_exam' ||
    kind === 'interview' ||
    kind === 'admit_ticket' ||
    kind === 'registration_start'
  ) {
    return 'suggest_handle';
  }
  return 'info';
}

/** 计算两个 ISO 日期相差的天数（today - target）；target 为 null 时返回 null */
export function daysUntil(targetIso: string | null, nowIso: string): number | null {
  if (!targetIso) return null;
  const target = new Date(`${targetIso}T00:00:00`).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(target) || Number.isNaN(now)) return null;
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000));
}

/** 判断事件是否已过去 */
export function isPast(dateIso: string | null, nowIso: string): boolean {
  if (!dateIso) return false;
  const d = daysUntil(dateIso, nowIso);
  return d !== null && d < 0;
}
