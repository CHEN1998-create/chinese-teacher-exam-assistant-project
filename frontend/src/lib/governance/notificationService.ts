/**
 * 通知服务（本地 Mock，非生产实现：没有真实推送/短信/邮件，只有站内通知）。
 *
 * 职责：
 * - 按用户维护 NotificationPreference，修改即时生效（读取时同样套用闸门）；
 * - 四类站内通知：学习提醒 / 重要考情变化 / 纠错结果 / 计划重新确认；
 * - 学习提醒每天最多一条；没有重要变化不产生考情提醒（由调用方决定是否调用）；
 * - 已读状态管理；文案不使用排名、断签、惩罚语言。
 *
 * 闸门规则见 domain.isNotificationAllowed：
 * - “关闭所有非必要通知”只抑制学习提醒与考情变化；
 * - 功能性通知（纠错结果、计划重新确认）受各自开关控制。
 */
import {
  NotificationItem,
  NotificationPreference,
  NotificationType,
} from "@/types";
import { loadFromStorage, saveToStorageStrict } from "@/lib/storage";
import { STORAGE_KEYS } from "@/lib/mock-data";
import { authService } from "@/lib/auth";
import { planService } from "@/lib/plans/planService";
import {
  buildStudyReminderContent,
  defaultPreference,
  hasStudyReminderForDate,
  isNotificationAllowed,
} from "./domain";
import { emitGovernanceChanged } from "./events";

function loadPrefs(): NotificationPreference[] {
  return loadFromStorage<NotificationPreference[]>(STORAGE_KEYS.NOTIFICATION_PREFS, []);
}

function loadItems(): NotificationItem[] {
  return loadFromStorage<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PushNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  severity?: NotificationItem["severity"];
  nextSteps?: string[];
  related?: NotificationItem["related"];
  /** 默认按当前时间；测试/补录可覆盖 */
  createdAt?: string;
}

export const notificationService = {
  // ==================== 偏好 ====================

  /** 当前用户偏好：首次读取时从会话用户的旧通知设置迁移，不强制落库 */
  getPreference(): NotificationPreference | null {
    const session = authService.getSession();
    if (!session) return null;
    const stored = loadPrefs().find((p) => p.userId === session.user.id);
    return stored ?? defaultPreference(session.user.id, session.user);
  },

  /** 立即更新偏好并持久化（开关即时生效，无需“保存设置”） */
  updatePreference(patch: Partial<Omit<NotificationPreference, "userId">>): NotificationPreference {
    const session = authService.getSession();
    if (!session) throw new Error("未登录或会话已过期，请重新登录");
    const all = loadPrefs().filter((p) => p.userId !== session.user.id);
    const next: NotificationPreference = {
      ...(this.getPreference() ?? defaultPreference(session.user.id, session.user)),
      ...patch,
      userId: session.user.id,
      updatedAt: new Date().toISOString(),
    };
    all.push(next);
    saveToStorageStrict(STORAGE_KEYS.NOTIFICATION_PREFS, all);
    emitGovernanceChanged();
    return next;
  },

  // ==================== 读取 ====================

  /**
   * 当前用户通知（倒序）。
   * 读取时同样套用偏好闸门：关闭某类通知后该类立即从通知中心消失（即时生效）。
   */
  listMine(unreadOnly = false): NotificationItem[] {
    const session = authService.getSession();
    if (!session) return [];
    const pref = this.getPreference();
    return loadItems()
      .filter((n) => n.userId === session.user.id)
      .filter((n) => (unreadOnly ? !n.readAt : true))
      .filter((n) => (pref ? isNotificationAllowed(pref, n.type) : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  unreadCount(): number {
    return this.listMine(true).length;
  },

  // ==================== 已读 ====================

  markRead(id: string): void {
    const session = authService.getSession();
    if (!session) return;
    const all = loadItems();
    const idx = all.findIndex((n) => n.id === id && n.userId === session.user.id);
    if (idx === -1 || all[idx].readAt) return;
    all[idx] = { ...all[idx], readAt: new Date().toISOString() };
    saveToStorageStrict(STORAGE_KEYS.NOTIFICATIONS, all);
    emitGovernanceChanged();
  },

  markAllRead(): void {
    const session = authService.getSession();
    if (!session) return;
    const now = new Date().toISOString();
    const all = loadItems().map((n) =>
      n.userId === session.user.id && !n.readAt ? { ...n, readAt: now } : n
    );
    saveToStorageStrict(STORAGE_KEYS.NOTIFICATIONS, all);
    emitGovernanceChanged();
  },

  // ==================== 写入 ====================

  /**
   * 给指定用户写入通知；返回 null 表示被其偏好设置抑制。
   * 撤回等跨用户场景用本方法；当前用户自己的通知用 push()。
   */
  pushToUser(userId: string, input: PushNotificationInput): NotificationItem | null {
    const pref =
      loadPrefs().find((p) => p.userId === userId) ??
      defaultPreference(userId, null);
    if (!isNotificationAllowed(pref, input.type)) return null;

    const item: NotificationItem = {
      id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? (input.type === "study_reminder" ? "info" : "important"),
      nextSteps: input.nextSteps,
      related: input.related,
      readAt: null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    const all = loadItems();
    all.push(item);
    saveToStorageStrict(STORAGE_KEYS.NOTIFICATIONS, all);
    emitGovernanceChanged();
    return item;
  },

  /** 给当前登录用户写入通知；未登录或被抑制时返回 null */
  push(input: PushNotificationInput): NotificationItem | null {
    const session = authService.getSession();
    if (!session) return null;
    return this.pushToUser(session.user.id, input);
  },

  /**
   * 模拟“今日学习提醒检查”（真实环境由定时任务/推送通道触发）：
   * - 今天已生成过提醒 → 不重复发送（每天最多一条）；
   * - 偏好关闭 → 不发送；
   * - 文案中性，根据今日任务给出最低可完成建议。
   */
  ensureStudyReminder(): {
    outcome: "created" | "already_exists" | "suppressed";
    item?: NotificationItem;
  } {
    const session = authService.getSession();
    if (!session) throw new Error("未登录或会话已过期，请重新登录");
    const pref = this.getPreference()!;
    if (!isNotificationAllowed(pref, "study_reminder")) {
      return { outcome: "suppressed" };
    }

    const today = todayKey();
    const mine = loadItems().filter((n) => n.userId === session.user.id && n.type === "study_reminder");
    if (hasStudyReminderForDate(mine.map((n) => n.createdAt), today)) {
      return { outcome: "already_exists", item: mine.find((n) => n.createdAt.slice(0, 10) === today) };
    }

    const currentPlan = planService.getCurrentPlan();
    const todayPlan = planService.getTodayPlan();
    const belongsToCurrent =
      todayPlan && currentPlan ? todayPlan.weeklyPlanId === currentPlan.id : false;
    const tasks = belongsToCurrent && todayPlan ? todayPlan.tasks : [];
    const minimumTask = tasks.find((t) => t.isCore) ?? tasks[0];
    const content = buildStudyReminderContent({
      reminderTime: pref.reminderTime,
      todayTaskCount: tasks.length,
      todayMinimumTitle: minimumTask?.title,
    });

    const item = this.push({
      type: "study_reminder",
      title: content.title,
      body: content.body,
      severity: "info",
      related: { href: "/study" },
    });
    return item ? { outcome: "created", item } : { outcome: "suppressed" };
  },
};
