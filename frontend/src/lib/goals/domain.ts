/**
 * 主要目标 → 备考闭环领域逻辑（纯函数，无存储、无 React）。
 *
 * 职责：
 * 1. 把用户已关注的机会（GoalDTO）桥接为现有计划管线的 ExamTarget
 *    （稳定 id：tgt-${unitId}，保证计划/反馈/重排数据可跨登录延续）；
 * 2. 备考首页门禁三态判定：无主要目标 / 考试内容未确认 / 就绪；
 * 3. 更换主要目标前的影响说明。
 *
 * 原则：官方确认只能来自用户对照公告后的人工确认动作；
 * 未确认时不生成伪精确计划，备选目标不自动创建多套计划。
 */
import type { GoalDTO } from "@/lib/opportunities/api-types";
import { EDUCATION_LEVEL_LABELS } from "@/types";
import type { EducationLevel, ExamTarget } from "@/types";

/** 由主要目标派生的本地目标稳定 id（同一机会的计划数据因此可复用） */
export function derivedTargetIdOf(unitId: string): string {
  return `tgt-${unitId}`;
}

/** 考试内容人工确认记录：绑定机会单元 + 公告版本，版本变更即失效 */
export interface ExamContentConfirmation {
  unitId: string;
  versionId: string;
  confirmedAt: string;
}

/** 备考首页门禁三态 */
export type StudyGateState =
  | {
      kind: "no_primary";
      /** 明确下一步：去机会页选择主要目标 */
      nextStep: string;
    }
  | {
      kind: "exam_unverified";
      reason: "no_confirmation" | "version_changed";
      goal: GoalDTO;
      /** 核对考试内容的今日任务（做什么/用什么/预计多久/完成标准/为什么先做） */
      verifyTask: ExamContentVerifyTask;
    }
  | {
      kind: "ready";
      goal: GoalDTO;
      /** 桥接出的本地目标（计划管线输入） */
      target: ExamTarget;
      /** 软警告（不阻塞生成计划，例如部分时间待官方通知） */
      warnings: string[];
    };

/** 核对考试内容任务：五字段对齐今日任务卡结构 */
export interface ExamContentVerifyTask {
  title: string;
  what: string;
  withWhat: string;
  estimatedMinutes: number;
  doneCriteria: string;
  whyFirst: string;
  url: string;
}

/** 备选目标（继续作为备选，不自动创建计划） */
export function backupGoalsOf(goals: readonly GoalDTO[], primaryUnitId: string | null): GoalDTO[] {
  return goals.filter((g) => g.unitId !== primaryUnitId);
}

function educationLevelOf(goal: GoalDTO): EducationLevel | undefined {
  return goal.stage === "primary" || goal.stage === "middle" || goal.stage === "high"
    ? goal.stage
    : undefined;
}

/**
 * 把主要关注机会桥接为计划管线的本地目标。
 * 稳定 id 让同一机会的历史计划/反馈/重排数据在重新选择后仍然可用。
 */
export function deriveTargetFromGoal(goal: GoalDTO, userId: string, nowIso: string): ExamTarget {
  const city = goal.region.city || goal.region.district;
  const level = educationLevelOf(goal);
  return {
    id: derivedTargetIdOf(goal.unitId),
    userId,
    name: goal.unitName,
    region: [goal.region.province, city].filter(Boolean).join(" · "),
    regionCode: goal.region.code,
    province: goal.region.province,
    city,
    recruiter: goal.unitName,
    examType: undefined,
    educationLevel: level,
    year: Number.isFinite(new Date(goal.version.publishedAt).getFullYear())
      ? new Date(goal.version.publishedAt).getFullYear()
      : undefined,
    batch: undefined,
    subject: "chinese",
    stage: "preparation",
    targetStatus: "announcement",
    status: "confirmed",
    isCurrent: false,
    announcementUrl: goal.announcement.officialUrl,
    announcementFile: undefined,
    candidates: undefined,
    confirmedCandidateId: undefined,
    clarificationTasks: undefined,
    createdAt: goal.followedAt,
    updatedAt: nowIso,
  };
}

/** 就绪态的软警告：只陈述公告事实，不臆造 */
function warningsOf(goal: GoalDTO): string[] {
  const warnings: string[] = [];
  if (goal.newerVersion) {
    warnings.push("该机会公告已有新版本，建议到机会详情页核对最新内容");
  }
  if (goal.version.timeline.pendingItems?.length) {
    warnings.push(`以下信息待官方通知：${goal.version.timeline.pendingItems.join("、")}`);
  }
  return warnings;
}

/**
 * 备考首页门禁：只有选择了主要目标、且该目标考试内容已对照公告确认时才就绪。
 * 确认记录绑定公告版本——公告出新版本后旧确认自动失效，避免按旧内容继续备考。
 */
export function evaluateStudyGate(
  goals: readonly GoalDTO[],
  primaryUnitId: string | null,
  confirmation: ExamContentConfirmation | null,
): StudyGateState {
  const goal = goals.find((g) => g.unitId === primaryUnitId) ?? null;
  if (!goal) {
    return {
      kind: "no_primary",
      nextStep: "先到「机会」页从已关注机会中选择一个主要备考目标，再回到这里开始备考。",
    };
  }

  if (!confirmation || confirmation.unitId !== goal.unitId) {
    return { kind: "exam_unverified", reason: "no_confirmation", goal, verifyTask: verifyTaskOf(goal) };
  }
  if (confirmation.versionId !== goal.version.id) {
    return { kind: "exam_unverified", reason: "version_changed", goal, verifyTask: verifyTaskOf(goal) };
  }

  return {
    kind: "ready",
    goal,
    target: deriveTargetFromGoal(
      goal,
      "", // userId 由 service 层补齐（领域层不读会话）
      confirmation.confirmedAt,
    ),
    warnings: warningsOf(goal),
  };
}

function verifyTaskOf(goal: GoalDTO): ExamContentVerifyTask {
  const examDate = goal.version.timeline.writtenExamDate;
  return {
    title: "核对考试内容",
    what: `打开官方公告，核对「${goal.unitName}」的考试科目、分值与${examDate ? `笔试时间（${examDate}）` : "笔试时间"}`,
    withWhat: `官方公告：${goal.announcement.title}`,
    estimatedMinutes: 15,
    doneCriteria: "确认公告中的考试科目与内容后，点击下方确认按钮",
    whyFirst: "考试内容未确认前不会生成备考计划，避免按错误的科目安排复习",
    url: goal.announcement.officialUrl,
  };
}

/** 更换主要目标的影响说明（确认弹窗文案，纯函数便于测试） */
export interface PrimarySwitchImpact {
  title: string;
  points: string[];
}

export function describePrimarySwitchImpact(
  currentPrimaryName: string | null,
  nextUnitName: string,
): PrimarySwitchImpact {
  const points: string[] = [];
  if (currentPrimaryName && currentPrimaryName !== nextUnitName) {
    points.push(`原主要目标「${currentPrimaryName}」将自动转为备选目标，可随时切换回来`);
    points.push("当前主要目标已有的计划与学习记录会保留为历史，但不再出现在备考首页");
  }
  points.push(`新主要目标「${nextUnitName}」需要重新确认考试内容后才会生成首个 7 天计划`);
  points.push("其他备选目标保持不变，不会自动创建多套计划");
  return {
    title: currentPrimaryName ? "更换主要备考目标？" : "设为主要备考目标？",
    points,
  };
}

/** 目标卡展示用的地区/学段串（与现有机会页口径一致） */
export function goalLabel(goal: GoalDTO): string {
  const region = [goal.region.province, goal.region.city || goal.region.district]
    .filter(Boolean)
    .join(" · ");
  const level = educationLevelOf(goal);
  return [region, level ? `${EDUCATION_LEVEL_LABELS[level]}语文` : "语文", goal.unitName]
    .filter(Boolean)
    .join(" | ");
}
