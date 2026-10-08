/**
 * 治理模块领域逻辑（纯函数，无存储、无 React、无异步）。
 *
 * 集中管理：
 * - 旧版纠错数据归一化、后台纠错队列的分类与排序；
 * - 通知偏好的默认值与发送闸门（总开关只抑制非必要通知）；
 * - 学习提醒文案（不使用排名、断签、惩罚语言）与每日一次判定；
 * - 错误结论撤回的影响范围分析（目标 / 用户 / 执行中计划 / 任务）；
 * - 个人数据类别清单与删除处理方式（私有删除、公共保留、审计匿名化）。
 */
import {
  Correction,
  CorrectionStatus,
  DailyPlan,
  DataDeletionHandling,
  EvidenceItem,
  ExamTarget,
  NotificationPreference,
  NotificationType,
  RetractionImpactScope,
  User,
  WeeklyPlan,
} from "@/types";
import { NON_ESSENTIAL_NOTIFICATION_TYPES } from "@/types";
import { isHighImpact } from "@/lib/evidence/domain";

// ==================== 纠错队列 ====================

/**
 * 后台纠错队列 key：
 * - open 待处理（已提交/处理中/待补充）
 * - submitted/processing/need_info 细分视图
 * - accepted/rejected 终态
 * - all 全部
 */
export type CorrectionQueueKey =
  | "open"
  | "submitted"
  | "processing"
  | "need_info"
  | "accepted"
  | "rejected"
  | "all";

export const CORRECTION_QUEUE_LABELS: Record<CorrectionQueueKey, string> = {
  open: "待处理",
  submitted: "已提交",
  processing: "处理中",
  need_info: "待补充",
  accepted: "已采纳",
  rejected: "未采纳",
  all: "全部",
};

export const OPEN_CORRECTION_STATUSES: CorrectionStatus[] = [
  "submitted",
  "processing",
  "need_info",
];

/** 旧版纠错（pending/accepted/rejected + reason/sourceUrl）归一化为新结构 */
export function normalizeCorrection(raw: Partial<Correction>): Correction {
  const now = (raw.createdAt as string) ?? new Date().toISOString();
  if (raw.targetType && Array.isArray(raw.sources) && Array.isArray(raw.timeline)) {
    return {
      ...(raw as Correction),
      updatedAt: raw.updatedAt ?? now,
      suggestedValue: raw.suggestedValue ?? "",
      currentValue: raw.currentValue ?? "",
      description: raw.description ?? raw.reason ?? "",
    };
  }

  const legacyStatus = String(raw.status ?? "pending");
  const status: CorrectionStatus =
    legacyStatus === "accepted"
      ? "accepted"
      : legacyStatus === "rejected"
        ? "rejected"
        : "submitted";
  const sourceUrl = (raw.sourceUrl as string | undefined)?.trim();
  const fieldLabel = raw.fieldLabel as string | undefined;
  const userId = (raw.userId as string) ?? "anonymous";

  return {
    id: (raw.id as string) ?? `cor-legacy-${Date.now()}`,
    userId,
    targetType: "evidence",
    examTargetId: (raw.examTargetId as string) ?? "",
    field: (raw.field as string) ?? "",
    fieldLabel,
    subject: fieldLabel ?? (raw.field as string) ?? "考情纠错",
    currentValue: (raw.currentValue as string) ?? "",
    description: (raw.reason as string) ?? (raw.description as string) ?? "",
    suggestedValue: (raw.suggestedValue as string) ?? "",
    sources: sourceUrl
      ? [{ id: `cor-src-legacy-${now}`, url: sourceUrl, createdAt: now }]
      : [],
    status,
    timeline: [
      {
        id: `cor-tl-legacy-${now}`,
        at: now,
        actorId: userId,
        actorName: "用户",
        actorRole: "user",
        action: "submit",
      },
    ],
    createdAt: now,
    updatedAt: (raw.updatedAt as string) ?? now,
  };
}

const QUEUE_ORDER: Record<CorrectionStatus, number> = {
  submitted: 0,
  need_info: 1,
  processing: 2,
  accepted: 3,
  rejected: 4,
};

/** 后台队列过滤与排序：待处理按紧急度（新提交→待补充→处理中）+ 时间倒序 */
export function selectCorrections(
  list: Correction[],
  queue: CorrectionQueueKey
): Correction[] {
  let filtered = list;
  if (queue === "open") {
    filtered = list.filter((c) => OPEN_CORRECTION_STATUSES.includes(c.status));
  } else if (queue !== "all") {
    filtered = list.filter((c) => c.status === queue);
  }
  return [...filtered].sort((a, b) => {
    const openDiff = QUEUE_ORDER[a.status] - QUEUE_ORDER[b.status];
    if (openDiff !== 0 && OPEN_CORRECTION_STATUSES.includes(a.status) && OPEN_CORRECTION_STATUSES.includes(b.status)) {
      return openDiff || b.updatedAt.localeCompare(a.updatedAt);
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function correctionQueueCounts(list: Correction[]): Record<CorrectionQueueKey, number> {
  const count = (q: CorrectionQueueKey) => selectCorrections(list, q).length;
  return {
    open: count("open"),
    submitted: count("submitted"),
    processing: count("processing"),
    need_info: count("need_info"),
    accepted: count("accepted"),
    rejected: count("rejected"),
    all: list.length,
  };
}

// ==================== 通知偏好与闸门 ====================

/** 新用户默认偏好；老用户首次读取时从会话用户的旧通知设置迁移 */
export function defaultPreference(userId: string, user?: User | null): NotificationPreference {
  return {
    userId,
    studyReminder: user?.notificationSettings.studyReminder ?? true,
    examChange: user?.notificationSettings.examUpdate ?? true,
    correctionResult: true,
    planReconfirm: true,
    nonEssentialOff: false,
    reminderTime: user?.studyReminderTime ?? "08:00",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 通知发送/展示闸门：
 * - 总开关 nonEssentialOff 只抑制非必要通知（学习提醒、考情变化）；
 * - 功能性通知（纠错结果、计划重新确认）仍受各自开关控制，不被总开关一刀切。
 */
export function isNotificationAllowed(
  pref: NotificationPreference,
  type: NotificationType
): boolean {
  if (NON_ESSENTIAL_NOTIFICATION_TYPES.includes(type) && pref.nonEssentialOff) {
    return false;
  }
  switch (type) {
    case "study_reminder":
      return pref.studyReminder;
    case "exam_change":
      return pref.examChange;
    case "correction_result":
      return pref.correctionResult;
    case "plan_reconfirm":
      return pref.planReconfirm;
  }
}

/** 当天是否已存在学习提醒（每天最多一次） */
export function hasStudyReminderForDate(
  createdAtValues: string[],
  dateKey: string
): boolean {
  return createdAtValues.some((at) => at.slice(0, 10) === dateKey);
}

/**
 * 学习提醒文案：中性、鼓励性，不使用排名、断签、惩罚语言。
 */
export function buildStudyReminderContent(input: {
  reminderTime: string;
  todayTaskCount: number;
  todayMinimumTitle?: string;
}): { title: string; body: string } {
  const { reminderTime, todayTaskCount, todayMinimumTitle } = input;
  if (todayTaskCount > 0) {
    return {
      title: "今天的学习任务已为你准备好",
      body:
        `今天安排了 ${todayTaskCount} 项任务（提醒时间 ${reminderTime}）。` +
        (todayMinimumTitle
          ? `如果时间紧张，先完成最低任务「${todayMinimumTitle}」就很好。`
          : "如果时间紧张，先完成其中最低可完成的一项就很好。"),
    };
  }
  return {
    title: "今天可以从一个小任务开始",
    body: `今天还没有安排学习任务（提醒时间 ${reminderTime}），可以到「本周计划」查看安排，或先用十分钟回顾最近的学习内容。`,
  };
}

// ==================== 撤回影响范围分析 ====================

function normalizeValue(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

/**
 * 撤回影响分析（纯函数）：
 * - 同字段、同结论值（忽略空白差异）的证据条目视为同一错误结论，全部撤回；
 * - 影响目标：这些条目挂在的非归档目标；
 * - 影响用户：目标所属用户（去重）；
 * - 影响计划：影响目标下处于执行中的周计划；
 * - 待重新确认任务：高影响字段撤回时，执行中计划下的全部任务。
 */
export function analyzeRetractionImpact(input: {
  item: EvidenceItem;
  items: EvidenceItem[];
  targets: ExamTarget[];
  weeklyPlans: WeeklyPlan[];
  dailyPlans: DailyPlan[];
}): RetractionImpactScope {
  const { item, items, targets, weeklyPlans, dailyPlans } = input;
  const targetValue = normalizeValue(item.value);

  const matchedItems = items.filter(
    (i) =>
      i.field === item.field &&
      i.reviewStatus !== "unconfirmed" &&
      normalizeValue(i.value) === targetValue &&
      targetValue !== ""
  );
  if (!matchedItems.some((i) => i.id === item.id)) matchedItems.push(item);

  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const affectedTargets = matchedItems
    .map((i) => targetMap.get(i.examTargetId))
    .filter((t): t is ExamTarget => !!t && t.status !== "archived");
  const targetIds = [...new Set(affectedTargets.map((t) => t.id))];
  const userIds = [...new Set(affectedTargets.map((t) => t.userId))];

  const affectedPlans = weeklyPlans.filter(
    (p) => p.status === "active" && targetIds.includes(p.examTargetId)
  );
  const planIds = [...new Set(affectedPlans.map((p) => p.id))];

  // 高影响字段撤回才把既有任务标记为待重新确认；低影响字段只通知不打断计划
  const taskIds = isHighImpact(item.field)
    ? [
        ...new Set(
          dailyPlans
            .filter((d) => planIds.includes(d.weeklyPlanId))
            .flatMap((d) => d.tasks.map((t) => t.id))
        ),
      ]
    : [];

  return {
    targetIds,
    userIds,
    planIds,
    taskIds,
    evidenceItemIds: [...new Set(matchedItems.map((i) => i.id))],
  };
}

// ==================== 个人数据类别 ====================

export interface DataCategoryMeta {
  key: string;
  label: string;
  /** 数据用途说明（设置页展示） */
  purpose: string;
  /** 保存范围说明 */
  retention: string;
  handling: DataDeletionHandling;
}

/**
 * 个人数据类别清单（用途与保存范围的唯一口径）。
 * 与用户私有数据、公共数据、审计留痕三类一一对应，删除时按 handling 分流。
 */
export const DATA_CATEGORY_META: DataCategoryMeta[] = [
  {
    key: "profile",
    label: "账号与会话",
    purpose: "维持登录状态、展示昵称与角色、保存每日可用学习时间",
    retention: "仅保存在本设备浏览器中，退出登录即清除会话",
    handling: "delete",
  },
  {
    key: "targets",
    label: "目标考试",
    purpose: "生成学习计划与匹配考情、资料、资源",
    retention: "保留到你主动归档或删除账号",
    handling: "delete",
  },
  {
    key: "evidence_submissions",
    label: "公告提取记录与原文",
    purpose: "从你提交的公告链接或粘贴文本生成考情信息",
    retention: "保留到你删除账号；原文仅用于本次提取",
    handling: "delete",
  },
  {
    key: "materials",
    label: "私有资料与学习进度",
    purpose: "资料怎么用分析、任务安排与薄弱项分析，不会自动进入公共资源库",
    retention: "仅你本人可见，保留到你删除账号",
    handling: "delete",
  },
  {
    key: "baseline",
    label: "准备情况与资料分析结果",
    purpose: "安排任务量、识别薄弱模块",
    retention: "仅你本人可见，保留到你删除账号",
    handling: "delete",
  },
  {
    key: "plans",
    label: "周计划、任务、执行反馈与周复盘",
    purpose: "生成每日任务、调整后面的安排与学习复盘",
    retention: "仅你本人可见，保留到你删除账号",
    handling: "delete",
  },
  {
    key: "resource_records",
    label: "资源查看与加入计划记录",
    purpose: "记录你查看过的公共资源与“加入本周计划”的操作",
    retention: "仅你本人可见，保留到你删除账号",
    handling: "delete",
  },
  {
    key: "notifications",
    label: "通知偏好与站内通知",
    purpose: "按你的偏好发送学习提醒、考情变化与处理结果通知",
    retention: "保留到你删除账号",
    handling: "delete",
  },
  {
    key: "shared_evidence",
    label: "考情证据池（公共）",
    purpose: "经审核的公告结论可供其他相同目标的用户参考，内容来自公开公告，不含个人信息",
    retention: "公共数据：删除账号不删除证据本身",
    handling: "retain_public",
  },
  {
    key: "public_resources",
    label: "公共资源索引（公共）",
    purpose: "面向全部用户的资源条目与合规状态",
    retention: "公共数据：与个人账号无关，删除账号不受影响",
    handling: "retain_public",
  },
  {
    key: "corrections",
    label: "纠错记录（审计留痕）",
    purpose: "追踪纠错处理过程与结论质量",
    retention: "删除账号时匿名化保留，无法再识别到你本人",
    handling: "retain_audit",
  },
  {
    key: "audit_logs",
    label: "审核与撤回留痕（审计留痕）",
    purpose: "记录审核员的人工审核与错误结论撤回操作，保护所有用户",
    retention: "只追加、不物理删除；不随个人删除申请移除",
    handling: "retain_audit",
  },
  {
    key: "deletion_requests",
    label: "数据删除申请凭证（审计留痕）",
    purpose: "证明删除申请已按流程处理",
    retention: "完成后匿名化保留申请状态、范围与时间",
    handling: "retain_audit",
  },
];

export function dataCategoryMeta(key: string): DataCategoryMeta | undefined {
  return DATA_CATEGORY_META.find((c) => c.key === key);
}
