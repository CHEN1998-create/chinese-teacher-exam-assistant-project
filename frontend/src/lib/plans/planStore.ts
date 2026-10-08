/**
 * 学习计划统一存储层（模块 8）。
 *
 * - demo 模式：读写 localStorage（现有行为，演示数据）；
 * - invited 模式：内存持有当前目标的计划快照，从服务端 GET 加载，
 *   任何写入后 PUT 同步到服务端；不把真实用户数据写入 localStorage，
 *   也不在服务端不可达时静默回退到本地伪造数据。
 *
 * planService / feedbackService / replanService 统一通过本模块读写，
 * 纯函数（生成/重排/诊断）完全不动。
 */
import { AUTH_MODE } from "@/lib/auth";
import { STORAGE_KEYS } from "@/lib/mock-data";
import { loadFromStorage, saveToStorageStrict } from "@/lib/storage";
import type {
  DailyPlan,
  TaskFeedback,
  TaskAdjustment,
  WeeklyPlan,
  WeeklyReview,
} from "@/types";

interface Snapshot {
  weeklyPlans: WeeklyPlan[];
  dailyPlans: DailyPlan[];
  feedbacks: TaskFeedback[];
  adjustments: TaskAdjustment[];
  reviews: WeeklyReview[];
}

const EMPTY: Snapshot = {
  weeklyPlans: [],
  dailyPlans: [],
  feedbacks: [],
  adjustments: [],
  reviews: [],
};

class RemotePlanStore {
  private targetId: string | null = null;
  private data: Snapshot = { ...EMPTY };
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 设置当前目标并从服务端加载快照（异步）。
   * 调用方（usePlans）必须 await 本方法后再读取计划，
   * 未加载完成前 loadX 返回空数组，不会伪造数据。
   */
  async setTarget(targetId: string): Promise<void> {
    if (this.targetId === targetId) return;
    this.targetId = targetId;
    this.data = { ...EMPTY };
    try {
      const res = await fetch(
        `/api/plans?examTargetId=${encodeURIComponent(targetId)}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const snap = (await res.json()) as Partial<Snapshot>;
        this.data = {
          weeklyPlans: (snap.weeklyPlans ?? []) as WeeklyPlan[],
          dailyPlans: (snap.dailyPlans ?? []) as DailyPlan[],
          feedbacks: (snap.feedbacks ?? []) as TaskFeedback[],
          adjustments: [],
          reviews: [],
        };
      }
    } catch {
      // 服务端不可达：保持空数据，不回退本地伪造
    }
  }

  private scheduleSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      void this.sync();
    }, 300);
  }

  private async sync(): Promise<void> {
    if (!this.targetId) return;
    try {
      await fetch("/api/plans/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          examTargetId: this.targetId,
          weeklyPlans: this.data.weeklyPlans,
          dailyPlans: this.data.dailyPlans,
          feedbacks: this.data.feedbacks,
        }),
      });
    } catch {
      // 同步失败不阻塞用户操作；下次写入会重试
    }
  }

  loadWeeklyPlans(): WeeklyPlan[] {
    return this.data.weeklyPlans;
  }
  persistWeeklyPlans(all: WeeklyPlan[]): void {
    this.data.weeklyPlans = all;
    this.scheduleSync();
  }
  loadDailyPlans(): DailyPlan[] {
    return this.data.dailyPlans;
  }
  persistDailyPlans(all: DailyPlan[]): void {
    this.data.dailyPlans = all;
    this.scheduleSync();
  }
  loadFeedbacks(): TaskFeedback[] {
    return this.data.feedbacks;
  }
  persistFeedbacks(all: TaskFeedback[]): void {
    this.data.feedbacks = all;
    this.scheduleSync();
  }
  loadAdjustments(): TaskAdjustment[] {
    return this.data.adjustments;
  }
  persistAdjustments(all: TaskAdjustment[]): void {
    this.data.adjustments = all;
  }
  loadReviews(): WeeklyReview[] {
    return this.data.reviews;
  }
  persistReviews(all: WeeklyReview[]): void {
    this.data.reviews = all;
  }
}

class LocalPlanStore {
  loadWeeklyPlans(): WeeklyPlan[] {
    return loadFromStorage<WeeklyPlan[]>(STORAGE_KEYS.PLANS, []);
  }
  persistWeeklyPlans(all: WeeklyPlan[]): void {
    saveToStorageStrict(STORAGE_KEYS.PLANS, all);
  }
  loadDailyPlans(): DailyPlan[] {
    return loadFromStorage<DailyPlan[]>(STORAGE_KEYS.DAILY_PLANS, []);
  }
  persistDailyPlans(all: DailyPlan[]): void {
    saveToStorageStrict(STORAGE_KEYS.DAILY_PLANS, all);
  }
  loadFeedbacks(): TaskFeedback[] {
    return loadFromStorage<TaskFeedback[]>(STORAGE_KEYS.TASK_FEEDBACKS, []);
  }
  persistFeedbacks(all: TaskFeedback[]): void {
    saveToStorageStrict(STORAGE_KEYS.TASK_FEEDBACKS, all);
  }
  loadAdjustments(): TaskAdjustment[] {
    return loadFromStorage<TaskAdjustment[]>(STORAGE_KEYS.PLAN_ADJUSTMENTS, []);
  }
  persistAdjustments(all: TaskAdjustment[]): void {
    saveToStorageStrict(STORAGE_KEYS.PLAN_ADJUSTMENTS, all);
  }
  loadReviews(): WeeklyReview[] {
    return loadFromStorage<WeeklyReview[]>(STORAGE_KEYS.WEEKLY_REVIEWS, []);
  }
  persistReviews(all: WeeklyReview[]): void {
    saveToStorageStrict(STORAGE_KEYS.WEEKLY_REVIEWS, all);
  }
}

export const planStore =
  AUTH_MODE === "invited" ? new RemotePlanStore() : new LocalPlanStore();

/** 受邀模式下切换当前目标并加载服务端快照（study 页加载目标时 await） */
export async function setActivePlanTarget(targetId: string): Promise<void> {
  if (planStore instanceof RemotePlanStore) {
    await planStore.setTarget(targetId);
  }
}
