import {
  ExamTarget,
  ExamTargetInput,
  ClarificationResult,
  ClarificationTask,
  User,
  UserSettings,
} from "@/types";
import {
  mockExamTargets,
  mockUserSettings,
  STORAGE_KEYS,
} from "./mock-data";
import { loadFromStorage, saveToStorage, saveToStorageStrict, clearAllStorage } from "./storage";
import { authService } from "./auth";
import {
  buildClarification,
  buildTarget,
  canGeneratePlan,
  normalizeTarget,
  rebaseClarificationTasks,
  validateConfirm,
} from "./targets/domain";
import { planService as planServiceImpl } from "./plans/planService";
import { track, classifyErrorCode } from "./analytics/eventService";

// ==================== 用户服务 ====================
//
// 用户身份的唯一来源是登录会话（AuthService）。
// 页面组件应通过 useCurrentUser() 获取当前用户；
// 非组件代码（其他 service）使用本模块的方法间接读取会话。

export const userService = {
  /** 当前登录用户；未登录时返回 null */
  getUser(): User | null {
    return authService.getSession()?.user ?? null;
  },

  /** 更新当前会话中的用户资料（如当前目标考试） */
  updateUser(updates: Partial<User>): User | null {
    if (!this.getUser()) return null;
    return authService.updateProfile(updates).user;
  },

  /** 从会话用户派生设置，未登录时回退到本地演示设置 */
  getSettings(): UserSettings {
    const fallback = loadFromStorage(STORAGE_KEYS.SETTINGS, mockUserSettings);
    const user = this.getUser();
    if (!user) return fallback;
    return {
      educationLevel: user.educationLevel,
      dailyAvailableTime: user.dailyAvailableTime,
      studyReminderTime: user.studyReminderTime ?? fallback.studyReminderTime,
      notifications: user.notificationSettings,
    };
  },

  /** 写入设置并同步到当前会话用户 */
  updateSettings(updates: Partial<UserSettings>): UserSettings {
    const settings = { ...this.getSettings(), ...updates };
    const user = this.getUser();
    if (user) {
      authService.updateProfile({
        educationLevel: settings.educationLevel,
        dailyAvailableTime: settings.dailyAvailableTime,
        studyReminderTime: settings.studyReminderTime,
        notificationSettings: settings.notifications,
      });
    } else {
      saveToStorage(STORAGE_KEYS.SETTINGS, settings);
    }
    return settings;
  },

  /** 删除全部本地业务数据（含演示会话） */
  deleteAllData(): void {
    clearAllStorage();
  },
};

// ==================== 目标考试服务 ====================
//
// 目标的就绪门禁与澄清任务由 lib/targets/domain.ts 统一计算，
// 本服务只负责持久化（Mock：localStorage）与按用户存取。

/** 目标数据变更订阅（切换/编辑/归档后通知 UI 立即刷新） */
const targetListeners = new Set<() => void>();
/** 每次成功持久化自增，供 useSyncExternalStore 判断是否需要重读 */
let targetStoreVersion = 0;

function notifyTargetChanged(): void {
  targetStoreVersion += 1;
  targetListeners.forEach((fn) => fn());
}

export const examTargetService = {
  /** 订阅目标数据变更，返回取消订阅函数 */
  subscribe(listener: () => void): () => void {
    targetListeners.add(listener);
    return () => {
      targetListeners.delete(listener);
    };
  },

  /** 当前存储版本号 */
  getVersion(): number {
    return targetStoreVersion;
  },

  /** 读取全部目标（含其他演示账号的数据，避免跨账号覆盖），已做旧数据归一化 */
  getAllRaw(): ExamTarget[] {
    const list = loadFromStorage<ExamTarget[]>(STORAGE_KEYS.EXAM_TARGETS, mockExamTargets);
    return list.map(normalizeTarget);
  },

  /** 当前登录用户的全部目标，未登录返回空数组 */
  getAll(): ExamTarget[] {
    const userId = userService.getUser()?.id;
    if (!userId) return [];
    return this.getAllRaw().filter((t) => t.userId === userId);
  },

  /** 当前主目标：优先持久化 isCurrent，回退会话指针；归档目标不作为主目标 */
  getCurrent(): ExamTarget | null {
    const targets = this.getAll();
    const currentId = userService.getUser()?.currentExamTargetId;
    // 持久化的 isCurrent 是 durable 真值；重新登录会重放种子 session 指针（et-001），
    // 若 session 指针优先，用户迁移/确认过的目标在重登后将永远找不到。
    const found =
      targets.find((t) => t.isCurrent) ||
      targets.find((t) => t.id === currentId) ||
      null;
    return found && found.status !== "archived" ? found : null;
  },

  getById(id: string): ExamTarget | null {
    return this.getAll().find((t) => t.id === id) || null;
  },

  /** 保存草稿（信息填写中，不做完整性校验，不允许直接覆盖为当前主目标） */
  saveDraft(input: ExamTargetInput): ExamTarget {
    return this.persistNew(input);
  },

  /**
   * 确认目标：校验进入条件后保存。
   * 条件不足时抛出 Error（调用方展示“保存失败/还缺什么”）。
   */
  confirmTarget(input: ExamTargetInput): ExamTarget {
    validateConfirm(input);
    const target = this.persistNew(input);
    if (!canGeneratePlan(target)) {
      // 例如 subject/candidates 入口即使字段校验通过也不满足门禁
      return target;
    }
    this.setCurrent(target.id);
    return target;
  },

  persistNew(input: ExamTargetInput): ExamTarget {
    const userId = userService.getUser()?.id ?? "anonymous";
    const id = `et-${Date.now()}`;
    const newTarget = buildTarget({ id, userId, input });
    // 新建目标（含信息不足的草稿）即成为当前主目标，
    // 旧主目标保留在历史目标中，可随时切换回来
    newTarget.isCurrent = true;

    const all = this.getAllRaw().map((t) =>
      t.userId === userId ? { ...t, isCurrent: false } : t
    );
    all.push(newTarget);
    this.persist(all);

    // 生成初始澄清任务并持久化（保留在目标上，完成状态可追踪）
    const withTasks = this.attachGeneratedTasks(newTarget.id);
    userService.updateUser({ currentExamTargetId: newTarget.id });
    const result = withTasks ?? newTarget;
    track("target_created", "target", {
      targetId: newTarget.id,
      props: {
        ready: canGeneratePlan(result) ? 1 : 0,
        status: result.status,
      },
    });
    return result;
  },

  /**
   * 固定 id 的 upsert（模块 7：主要目标桥接用）。
   * 同一机会派生的目标 id 稳定（tgt-${unitId}）：已存在则原位更新
   * （保留 createdAt 与 isCurrent，澄清任务按最新字段重算），
   * 不存在则插入。不在此处改动当前主目标指针，由调用方决定。
   */
  upsertFixedId(target: ExamTarget): ExamTarget {
    const all = this.getAllRaw();
    const index = all.findIndex(
      (t) => t.id === target.id && t.userId === target.userId,
    );
    if (index !== -1) {
      all[index] = {
        ...target,
        createdAt: all[index].createdAt,
        isCurrent: all[index].isCurrent,
      };
      this.persist(all);
      this.attachGeneratedTasks(target.id);
      return this.getById(target.id) ?? all[index];
    }
    all.push({ ...target, isCurrent: false });
    this.persist(all);
    return target;
  },

  /** 编辑目标：重新派生名称/地区/生命周期与澄清任务 */
  update(id: string, input: ExamTargetInput): ExamTarget | null {
    const all = this.getAllRaw();
    const index = all.findIndex((t) => t.id === id);
    if (index === -1) return null;

    const rebuilt = buildTarget({ id, userId: all[index].userId, input, existing: all[index] });
    all[index] = rebuilt;
    this.persist(all);
    this.attachGeneratedTasks(id);
    return this.getById(id);
  },

  /** 切换当前主目标；归档目标不允许被切换为主目标 */
  setCurrent(id: string): ExamTarget {
    const target = this.getById(id);
    if (!target) throw new Error("目标不存在或不属于当前账号");
    if (target.status === "archived") throw new Error("已归档目标不能设为当前目标");

    const all = this.getAllRaw().map((t) => ({
      ...t,
      isCurrent: t.id === id,
    }));
    this.persist(all);
    userService.updateUser({ currentExamTargetId: id });
    return this.getById(id)!;
  },

  /** 归档目标：移出主目标；若无其他主目标则当前目标为空 */
  archive(id: string): ExamTarget {
    const all = this.getAllRaw();
    const index = all.findIndex((t) => t.id === id);
    if (index === -1) throw new Error("目标不存在");
    all[index] = { ...all[index], status: "archived", isCurrent: false };

    // 若归档的是当前主目标，自动选择最近的非归档目标
    const remainingActive = all
      .filter((t) => t.userId === all[index].userId && t.status !== "archived")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (remainingActive.length > 0) {
      remainingActive.forEach((t, i) => {
        const idx = all.findIndex((x) => x.id === t.id);
        all[idx] = { ...all[idx], isCurrent: i === 0 };
      });
      userService.updateUser({ currentExamTargetId: remainingActive[0].id });
    } else {
      userService.updateUser({ currentExamTargetId: undefined });
    }

    this.persist(all);
    return all[index];
  },

  /** 从历史归档中重新启用目标 */
  restore(id: string): ExamTarget {
    const all = this.getAllRaw();
    const index = all.findIndex((t) => t.id === id);
    if (index === -1) throw new Error("目标不存在");
    const input: ExamTargetInput = {
      targetStatus: all[index].targetStatus,
      province: all[index].province,
      city: all[index].city,
      recruiter: all[index].recruiter,
      examType: all[index].examType,
      year: all[index].year,
      batch: all[index].batch,
      educationLevel: all[index].educationLevel,
      stage: all[index].stage,
      announcementUrl: all[index].announcementUrl,
      candidates: all[index].candidates,
      confirmedCandidateId: all[index].confirmedCandidateId,
    };
    all[index] = buildTarget({ id, userId: all[index].userId, input, existing: all[index] });
    // buildTarget 会保留 existing 的归档状态；重新启用需按非归档口径重算门禁，
    // 否则 canGeneratePlan 因 archived 短路恒为 false，目标被错误降为 draft
    all[index].status = canGeneratePlan({ ...all[index], status: "draft" })
      ? "confirmed"
      : "draft";
    this.persist(all);
    return all[index];
  },

  /** candidates 入口：确认一个候选为本周准备方向（门禁条件之一），并自动切为主目标 */
  confirmCandidateDirection(targetId: string, candidateId: string): ExamTarget {
    const target = this.getById(targetId);
    if (!target) throw new Error("目标不存在");
    const candidate = target.candidates?.find((c) => c.id === candidateId);
    if (!candidate) throw new Error("候选方向不存在");

    this.update(targetId, {
      targetStatus: "candidates",
      candidates: target.candidates,
      confirmedCandidateId: candidateId,
      province: candidate.province,
      city: candidate.city,
      educationLevel: candidate.educationLevel ?? target.educationLevel,
      examType: target.examType,
      stage: target.stage,
    });
    // 方向一经确认即成为当前主目标（此时已满足门禁）
    return this.setCurrent(targetId);
  },

  /** 信息不足时的澄清结果；已充分返回 null */
  getClarification(id: string): ClarificationResult | null {
    const target = this.getById(id);
    return target ? buildClarification(target) : null;
  },

  /** 勾选/取消查找任务 */
  toggleClarificationTask(targetId: string, taskId: string, done: boolean): ClarificationTask | null {
    const all = this.getAllRaw();
    const index = all.findIndex((t) => t.id === targetId);
    if (index === -1) return null;
    const tasks = all[index].clarificationTasks ?? [];
    const updatedTasks = tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status: done ? ("done" as const) : ("pending" as const),
            completedAt: done ? new Date().toISOString() : undefined,
          }
        : t
    );
    all[index] = { ...all[index], clarificationTasks: updatedTasks };
    this.persist(all);
    return updatedTasks.find((t) => t.id === taskId) ?? null;
  },

  /** 目标是否可以生成完整计划（门禁的 service 出口） */
  canGeneratePlan(id: string): boolean {
    const target = this.getById(id);
    return target ? canGeneratePlan(target) : false;
  },

  /** 编辑表单用：把目标还原为输入结构 */
  toInput(target: ExamTarget): ExamTargetInput {
    return {
      targetStatus: target.targetStatus,
      province: target.province,
      city: target.city,
      recruiter: target.recruiter,
      examType: target.examType,
      year: target.year,
      batch: target.batch,
      educationLevel: target.educationLevel,
      stage: target.stage,
      announcementUrl: target.announcementUrl,
      candidates: target.candidates,
      confirmedCandidateId: target.confirmedCandidateId,
    };
  },

  /** 重新计算并保存澄清任务（保留已完成状态） */
  attachGeneratedTasks(id: string): ExamTarget | null {
    const all = this.getAllRaw();
    const index = all.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const tasks = rebaseClarificationTasks(all[index]);
    all[index] = { ...all[index], clarificationTasks: tasks };
    try {
      this.persist(all);
    } catch {
      // 任务生成失败不阻断主流程
    }
    return all[index];
  },

  /** 严格持久化：存储失败时向上抛出，由页面展示“保存失败” */
  persist(all: ExamTarget[]): void {
    try {
      saveToStorageStrict(STORAGE_KEYS.EXAM_TARGETS, all);
    } catch (e) {
      track("critical_write_failed", "storage", {
        props: {
          module: "target",
          storageKey: STORAGE_KEYS.EXAM_TARGETS,
          reasonCode: classifyErrorCode(e),
        },
      });
      throw e;
    }
    notifyTargetChanged();
  },
};

// 考情证据服务（公告提取 / 字段证据 / 纠错）已独立到 lib/evidence，
// 这里转出保持 `import { evidenceService } from "@/lib/services"` 的用法稳定。
export { evidenceService } from "./evidence/evidenceService";

// 资料与能力基线服务已独立到 lib/materials（私有资料 CRUD / 基线 / 诊断快照）。
export { materialService } from "./materials/materialService";

// 公共资源服务已独立到 lib/resources（索引 / 缺口匹配 / 查看与加入计划记录 / 后台维护）。
// 公共资源与用户私有资料物理分开存储，私有上传不会自动进入公共资源库。
export { resourceService } from "./resources/resourceService";
export type { ResourceItemInput, ResourceQueues } from "./resources/resourceService";

// 7 天计划与任务生成已独立到 lib/plans（PlanEngine 规则层 + service + 订阅）。
// 旧版 mock 周计划/每日计划不再作为默认数据，计划由用户点击"生成草稿"后按规则产出。
export { planService } from "./plans/planService";

// 今日任务执行反馈：独立持久化（kb_task_feedbacks），关联用户/计划版本/任务，
// 一条任务仅一条反馈（可修改），供后续计划重排模块读取。
export { feedbackService, DuplicateFeedbackError, nextStepHint } from "./plans/feedbackService";

// 动态计划重排与第 7 天周复盘：ReplanEngine 规则层（lib/plans/replanEngine）+ 服务。
// 重排生成新版本（草稿→确认），历史版本只追加不覆盖；周复盘仅聚合真实反馈。
export { replanService } from "./plans/replanService";

// 治理模块（lib/governance）：用户纠错与后台处理、错误结论撤回留痕、
// 站内通知与偏好、隐私数据类别与删除申请。当前为本地 Mock（localStorage），
// 无真实推送与服务端删除任务，替换为真实后端时保持这些方法签名。
export { correctionService } from "./governance/correctionService";
export type {
  SubmitCorrectionInput,
  AdminCorrectionView,
  ProcessCorrectionInput,
} from "./governance/correctionService";
export { notificationService } from "./governance/notificationService";
export type { PushNotificationInput } from "./governance/notificationService";
export { privacyService } from "./governance/privacyService";

// ==================== 统计服务 ====================

export const statsService = {
  getWeeklyStats(): {
    totalTasks: number;
    completedTasks: number;
    totalTime: number;
    actualTime: number;
    completionRate: number;
  } {
    const dailyPlans = planServiceImpl.getDailyPlans(planServiceImpl.getCurrentPlan()?.id || "");
    let totalTasks = 0;
    let completedTasks = 0;
    let totalTime = 0;
    let actualTime = 0;

    dailyPlans.forEach((day) => {
      totalTasks += day.tasks.length;
      totalTime += day.totalEstimatedTime;
      day.tasks.forEach((task) => {
        if (task.status === "completed") {
          completedTasks++;
          actualTime += task.feedback?.actualTime || task.estimatedTime;
        }
      });
    });

    return {
      totalTasks,
      completedTasks,
      totalTime,
      actualTime,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  },
};
