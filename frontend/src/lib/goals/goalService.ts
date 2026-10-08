/**
 * 主要目标服务（模块 7）：机会关注 → 计划管线的桥接层。
 *
 * - fetchGoals：拉取后端备考目标列表（活跃关注 + 公告版本聚合）；
 * - syncPrimaryTarget：把主要目标 upsert 进本地目标库并设为当前主目标，
 *   旧目标保留为历史（不删除、不自动生成多套计划）；
 * - confirmExamContent / getExamContentConfirmation：考试内容人工确认记录。
 *   确认绑定公告版本——公告出新版本后旧确认自动失效，需重新核对。
 *
 * 领域判定（门禁三态/影响说明）在 ./domain.ts；本服务只做取数与持久化。
 */
import { opportunitiesApi } from "@/lib/opportunities/api";
import type { GoalDTO, GoalsResponse } from "@/lib/opportunities/api-types";
import { STORAGE_KEYS } from "@/lib/mock-data";
import { loadFromStorage, saveToStorageStrict } from "@/lib/storage";
import { examTargetService, userService } from "@/lib/services";
import { deriveTargetFromGoal, type ExamContentConfirmation } from "./domain";

/** 确认记录按用户隔离：Record<userId, confirmation>（每个用户同时只有一个主要目标） */
type ConfirmationStore = Record<string, ExamContentConfirmation>;

function readConfirmationStore(): ConfirmationStore {
  return loadFromStorage<ConfirmationStore>(STORAGE_KEYS.EXAM_CONTENT_CONFIRMATIONS, {});
}

export const goalService = {
  /** 备考目标列表（未登录时由调用方走未登录分支，不发请求） */
  fetchGoals(): Promise<GoalsResponse> {
    return opportunitiesApi.getGoals();
  },

  /**
   * 把主要目标同步进本地目标库（upsert + 设为当前主目标）。
   * 稳定 id（tgt-${unitId}）保证同一机会此前生成的计划/反馈/重排数据仍可复用；
   * 更换主要目标后，旧目标与其计划保留为历史，不删除、不再展示在备考首页。
   */
  syncPrimaryTarget(goal: GoalDTO): string {
    const userId = userService.getUser()?.id;
    if (!userId) throw new Error("未登录，无法同步备考目标");
    const target = deriveTargetFromGoal(goal, userId, new Date().toISOString());
    examTargetService.upsertFixedId(target);
    examTargetService.setCurrent(target.id);
    return target.id;
  },

  /** 当前用户的考试内容确认记录；未登录或未确认返回 null */
  getExamContentConfirmation(userId: string | undefined): ExamContentConfirmation | null {
    if (!userId) return null;
    return readConfirmationStore()[userId] ?? null;
  },

  /**
   * 记录"我已对照官方公告核对考试内容"的人工确认（绑定当前公告版本）。
   * 版本变更后 evaluateStudyGate 会判定失效，要求重新核对。
   */
  confirmExamContent(goal: GoalDTO): ExamContentConfirmation {
    const userId = userService.getUser()?.id;
    if (!userId) throw new Error("未登录，无法确认考试内容");
    const store = readConfirmationStore();
    const record: ExamContentConfirmation = {
      unitId: goal.unitId,
      versionId: goal.version.id,
      confirmedAt: new Date().toISOString(),
    };
    store[userId] = record;
    saveToStorageStrict(STORAGE_KEYS.EXAM_CONTENT_CONFIRMATIONS, store);
    return record;
  },
};
