/**
 * 7 天计划与任务生成：领域规则层（纯函数，无 React、无 localStorage、无网络）。
 *
 * 所有计划生成口径只允许在本文件定义与修改：
 * - 就绪检查（哪些数据缺失时不生成完整计划）；
 * - 任务来源收集（资料诊断 continue/partial + 已加入计划的公共资源）；
 * - 优先级排序（薄弱 → 必需 → 补充，关键模块优先）；
 * - 时间分配（每天 ≤3 项、总时长 ≤ 可用时间、每天至少 1 项最低任务）；
 * - 任务字段填充（完成标准、安排原因、复盘动作）。
 *
 * 没有真实 AI 接口时，全部走确定性规则：同样输入永远得到同样输出。
 */
import {
  AbilityBaseline,
  EvidenceItem,
  ExamTarget,
  MaterialDiagnosisItem,
  MaterialDiagnosisSnapshot,
  MaterialItem,
  PlanTask,
  ResourceItem,
  ResourcePlanLink,
  WeeklyPlan,
  DailyPlan,
} from "@/types";
import {
  EXAM_MODULES,
  assessEvidenceReadiness,
  chapterTitlesForModule,
  moduleLabel,
  requiredModuleKeys,
} from "@/lib/materials/domain";
import { checkRecommendable, scopeMatches } from "@/lib/resources/domain";

// ==================== 计划生成输入 ====================

export interface PlanGenerationInput {
  target: ExamTarget;
  /** 当前目标下的全部考情证据（含已审核与待审核，由规则层判定是否充分） */
  evidenceItems: EvidenceItem[];
  /** 资料诊断快照（可能为空：用户还没生成诊断） */
  diagnosis: MaterialDiagnosisSnapshot | null;
  materials: MaterialItem[];
  /** 已加入本周计划但未放弃的公共资源链接 */
  resourceLinks: ResourcePlanLink[];
  /** 公共资源索引（用于解析链接对应的资源详情） */
  resources: ResourceItem[];
  baseline: AbilityBaseline | null;
  /** 每日可用时间（分钟），来自能力基线或用户设置 */
  dailyAvailableMinutes: number;
  /** 每周可用时间（小时），仅用于说明 */
  weeklyAvailableHours: number;
  /** 计划周期起始日期 YYYY-MM-DD（由 service 传入，保证确定性） */
  startDate: string;
  /** 周序号 */
  weekNumber: number;
  /** 规则判定时刻 ISO（由 service 传入，保证确定性与可测试性） */
  nowIso: string;
}

// ==================== 就绪检查 ====================

export interface PlanReadiness {
  /** 是否可以生成完整计划 */
  ready: boolean;
  /** 缺失项列表（ready=false 时展示给用户） */
  missing: string[];
  /** 软警告：可以生成但需提示用户（不阻塞） */
  warnings: string[];
}

/**
 * 计划生成就绪检查。
 *
 * 硬性缺失（不生成）：
 * 1. 目标未确认；
 * 2. 没有任何可用学习内容（无 continue/partial 资料 且 无已加入计划的资源）；
 * 3. 每日可用时间 ≤ 0。
 *
 * 软警告（生成但提示）：
 * - 考试科目未官方确认 → 默认只排语文学科模块，教综模块暂不排入；
 * - 其他高影响字段（报名/考试时间、分值、资格）未官方确认 → 提示计划可能需要调整。
 */
export function checkPlanReadiness(input: PlanGenerationInput): PlanReadiness {
  const missing: string[] = [];
  const warnings: string[] = [];

  // 1. 目标
  if (input.target.status === "archived" || input.target.status !== "confirmed") {
    missing.push("你准备的考试尚未确认，请先在「我的考试」补充基本信息");
  }

  // 2. 学习内容来源
  const usableMaterials = (input.diagnosis?.materialDiagnoses ?? []).filter(
    (d) => d.recommendation !== "pause"
  );
  const hasUsableMaterial = usableMaterials.length > 0;
  const hasResourceLinks = usableResourceLinks(input).length > 0;
  if (!hasUsableMaterial && !hasResourceLinks) {
    missing.push(
      "还没有可用的学习内容：请在「资料与资源」页添加至少一套适用资料，或将公共资源加入本周计划"
    );
  }

  // 3. 可用时间
  if (input.dailyAvailableMinutes <= 0) {
    missing.push("每日可用时间为 0，请在「我的资料」的准备情况中填写可用学习时间");
  }

  // 软警告：考情
  const readiness = assessEvidenceReadiness(input.evidenceItems);
  const subjectsOfficial = input.evidenceItems.some(
    (i) => i.field === "subjects" && i.reviewStatus === "official"
  );
  if (!subjectsOfficial) {
    warnings.push(
      "考试科目尚未从官方公告核对：本周计划默认只安排语文学科模块，教综模块待科目核对后再排入"
    );
  }
  if (!readiness.complete) {
    const pendingLabels = readiness.pendingFields
      .map((f) => HIGH_IMPACT_FIELDS_LABELS[f] ?? f)
      .join("、");
    warnings.push(
      `以下高影响考情尚未从官方公告核对（${pendingLabels}）：计划中的时间分配可能需要在核对后调整`
    );
  }

  return { ready: missing.length === 0, missing, warnings };
}

const HIGH_IMPACT_FIELDS_LABELS: Record<string, string> = {
  registration_time: "报名时间",
  exam_time: "考试时间",
  subjects: "考试科目",
  score: "分值",
  qualification: "资格条件",
};

// ==================== 任务来源收集 ====================

/**
 * 当前仍然可用的资源链接：
 * - 链接未放弃、资源详情存在；
 * - 通过合规闸门（链接失效、停用、超期未复核等一律剔除）；
 * - 适用范围仍贴合目标（地区/学段/类型/年份）。
 * 计划生成时重新校验，不能因为“加入时可用”就默认一直可用。
 */
function usableResourceLinks(input: PlanGenerationInput): {
  link: ResourcePlanLink;
  resource: ResourceItem;
}[] {
  const resourceMap = new Map(input.resources.map((r) => [r.id, r]));
  const result: { link: ResourcePlanLink; resource: ResourceItem }[] = [];
  for (const link of input.resourceLinks) {
    if (link.status === "dismissed") continue;
    const resource = resourceMap.get(link.resourceId);
    if (!resource) continue;
    if (!checkRecommendable(resource, input.nowIso).ok) continue;
    if (!scopeMatches(resource, input.target)) continue;
    result.push({ link, resource });
  }
  return result;
}

interface TaskSource {
  module: string;
  sourceType: "material" | "resource";
  material?: MaterialItem;
  diagnosisItem?: MaterialDiagnosisItem;
  resource?: ResourceItem;
  link?: ResourcePlanLink;
  /** 建议章节标题（资料）或建议章节（资源） */
  chapterTitles: string[];
  /** 基础预计时间（分钟） */
  baseMinutes: number;
}

/**
 * 从资料诊断与已加入计划的资源中收集可用任务来源。
 * 只有诊断结论为 continue / partial 的资料模块可以作为主要任务来源
 * （pause 的资料本周暂不使用，规则 5）。
 */
function collectSources(input: PlanGenerationInput): TaskSource[] {
  const sources: TaskSource[] = [];
  const materialMap = new Map(input.materials.map((m) => [m.id, m]));

  // 1) 资料来源：只取 continue / partial 的模块项
  for (const diagnosis of input.diagnosis?.materialDiagnoses ?? []) {
    if (diagnosis.recommendation === "pause") continue;
    const material = materialMap.get(diagnosis.materialId);
    if (!material) continue;
    for (const item of diagnosis.items) {
      if (item.recommendation === "pause") continue;
      sources.push({
        module: item.module,
        sourceType: "material",
        material,
        diagnosisItem: item,
        chapterTitles:
          item.relatedChapterTitles.length > 0
            ? item.relatedChapterTitles
            : chapterTitlesForModule(material, item.module),
        baseMinutes: 60,
      });
    }
  }

  // 2) 公共资源来源：当前仍通过合规闸门、范围贴合
  for (const { link, resource } of usableResourceLinks(input)) {
    sources.push({
      module: link.module,
      sourceType: "resource",
      resource,
      link,
      chapterTitles: resource.suggestedChapters,
      baseMinutes: Math.min(resource.estimatedMinutes || 60, 120),
    });
  }

  return sources;
}

// ==================== 优先级排序 ====================

/**
 * 排序规则（规则 4：关键考试模块优先于非关键内容）：
 * 1. 薄弱模块（来自诊断 weakModules） → high
 * 2. 必需模块（requiredModuleKeys）但非薄弱 → medium
 * 3. 其他模块 → low
 *
 * 同优先级内按模块目录顺序稳定排序，保证同样输入得到同样结果。
 */
function sortSources(
  sources: TaskSource[],
  weakModules: string[],
  required: string[]
): (TaskSource & { priority: "high" | "medium" | "low" })[] {
  const weakSet = new Set(weakModules);
  const requiredSet = new Set(required);
  const orderMap = new Map(EXAM_MODULES.map((m, i) => [m.key, i]));

  const withPriority = sources.map((s) => {
    let priority: "high" | "medium" | "low";
    if (weakSet.has(s.module)) priority = "high";
    else if (requiredSet.has(s.module)) priority = "medium";
    else priority = "low";
    return { ...s, priority };
  });

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return withPriority.sort((a, b) => {
    if (a.priority !== b.priority) return priorityRank[a.priority] - priorityRank[b.priority];
    const oa = orderMap.get(a.module) ?? 999;
    const ob = orderMap.get(b.module) ?? 999;
    if (oa !== ob) return oa - ob;
    // 同模块同优先级：资料优先于资源（资料是用户已有的主干）
    if (a.sourceType !== b.sourceType) return a.sourceType === "material" ? -1 : 1;
    return 0;
  });
}

// ==================== 日期工具 ====================

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay(); // 0=周日
}

// ==================== 任务构造 ====================

function makeTask(
  source: TaskSource & { priority: "high" | "medium" | "low" },
  dailyPlanId: string,
  order: number,
  estimatedMinutes: number,
  dateStr: string,
  dayIndex: number,
  nowIso: string
): PlanTask {
  const moduleName = moduleLabel(source.module);
  let title: string;
  let completionCriteria: string;
  let arrangementReason: string;
  let reviewAction: string;
  let chapterTitle: string | undefined;
  let materialId: string | undefined;
  let materialChapterId: string | undefined;
  let resourceId: string | undefined;

  if (source.sourceType === "material" && source.material && source.diagnosisItem) {
    const mat = source.material;
    chapterTitle = source.chapterTitles[0];
    materialId = mat.id;
    // 章节已知：写明具体章节；未知：不编造章节名，让用户对照目录定位
    title = chapterTitle
      ? `${moduleName}：《${chapterTitle}》`
      : `${moduleName}：对照《${mat.name}》目录学习对应章节`;
    completionCriteria = chapterTitle
      ? `完成《${mat.name}》中「${chapterTitle}」的学习，整理要点笔记`
      : `翻开《${mat.name}》目录找到与「${moduleName}」对应的章节学习，整理要点笔记（具体章节以你手上的书为准）`;
    arrangementReason = buildArrangementReason(source, dayIndex);
    reviewAction = `合上书本复述「${moduleName}」本节核心要点，完成课后练习并记录正确率`;
  } else if (source.resource) {
    const res = source.resource;
    chapterTitle = source.chapterTitles[0];
    resourceId = res.id;
    title = `${moduleName}：${res.title}`;
    completionCriteria = chapterTitle
      ? `学习资源「${res.title}」的「${chapterTitle}」部分，记录关键结论`
      : `学习资源「${res.title}」，记录关键结论与自己的理解`;
    arrangementReason = buildArrangementReason(source, dayIndex);
    reviewAction = `用自己的话概括「${moduleName}」本节学到的 3 个关键点，并对照原始来源核对`;
  } else {
    title = `${moduleName}：复习`;
    completionCriteria = "复习本模块已学内容";
    arrangementReason = "回顾已学内容，巩固记忆";
    reviewAction = "尝试默写本模块知识框架";
  }

  return {
    id: `pt-${dailyPlanId}-${order}`,
    dailyPlanId,
    title,
    module: source.module,
    sourceType: source.sourceType,
    materialId,
    materialChapterId,
    chapterTitle,
    resourceId,
    estimatedTime: estimatedMinutes,
    completionCriteria,
    arrangementReason,
    reviewAction,
    order,
    status: "pending",
    priority: source.priority,
    isCore: source.priority === "high",
    executable: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildArrangementReason(
  source: TaskSource & { priority: "high" | "medium" | "low" },
  dayIndex: number
): string {
  const moduleName = moduleLabel(source.module);
  const parts: string[] = [];
  if (source.priority === "high") {
    parts.push(`「${moduleName}」是你的薄弱模块`);
  } else if (source.priority === "medium") {
    parts.push(`「${moduleName}」是当前考试的必需模块`);
  } else {
    parts.push(`「${moduleName}」作为补充内容`);
  }
  if (source.sourceType === "material" && source.material) {
    parts.push(`使用已有资料《${source.material.name}》`);
    if (source.diagnosisItem?.recommendation === "partial") {
      parts.push("（仅使用其中适用章节）");
    }
  } else if (source.resource) {
    parts.push(`使用公共资源「${source.resource.title}」`);
  }
  parts.push(`安排在第 ${dayIndex + 1} 天，与其他模块交替避免疲劳`);
  return parts.join("，") + "。";
}

// ==================== 主生成函数 ====================

export interface GeneratedPlan {
  weekly: WeeklyPlan;
  daily: DailyPlan[];
}

/**
 * 确定性生成 7 天计划。
 * 调用方需先通过 checkPlanReadiness 校验，本函数假设输入就绪。
 */
export function generatePlan(input: PlanGenerationInput): GeneratedPlan {
  const { target, startDate, weekNumber, dailyAvailableMinutes, nowIso } = input;
  const weeklyId = `wp-${target.id}-${Date.now()}`;

  const readiness = assessEvidenceReadiness(input.evidenceItems);
  const required = requiredModuleKeys(readiness);
  const weakModules = input.diagnosis?.weakModules ?? [];

  const sources = sortSources(collectSources(input), weakModules, required);

  // 生成 7 天
  const daily: DailyPlan[] = [];
  let sourceCursor = 0;

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dateStr = addDays(startDate, dayIndex);
    const dow = dayOfWeek(dateStr);
    const dailyPlanId = `dp-${weeklyId}-${dayIndex}`;
    let remaining = dailyAvailableMinutes;
    const tasks: PlanTask[] = [];

    // 规则 3：每天至少 1 项最低可完成任务
    // 规则 1：每天最多 3 项核心任务
    // 规则 2：总时长不超过可用时间
    while (tasks.length < 3 && sourceCursor < sources.length) {
      const src = sources[sourceCursor];
      let est = Math.min(src.baseMinutes, remaining);

      if (tasks.length === 0) {
        // 首项保底只允许向下压缩以适配可用时间，绝不把小任务向上膨胀
        est = Math.min(est, remaining);
      } else if (est > remaining) {
        break; // 时间不够，不再加
      }

      // 每项至少 20 分钟，避免碎片化（除非剩余时间很少）
      if (tasks.length > 0 && est < 20) break;

      tasks.push(makeTask(src, dailyPlanId, tasks.length + 1, est, dateStr, dayIndex, nowIso));
      remaining -= est;
      sourceCursor++;
    }

    // 如果当天来源用完（最后几天），用复盘任务保底
    if (tasks.length === 0) {
      tasks.push(makeReviewTask(dailyPlanId, 1, dayIndex, remaining, nowIso, sources));
      remaining -= tasks[0].estimatedTime;
    }

    const total = tasks.reduce((sum, t) => sum + t.estimatedTime, 0);
    daily.push({
      id: dailyPlanId,
      weeklyPlanId: weeklyId,
      date: dateStr,
      dayOfWeek: dow,
      tasks,
      totalEstimatedTime: total,
      isMinimumViable: tasks.length === 1,
      availableMinutes: dailyAvailableMinutes,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  // 周重点：取高优先级任务中出现最多的模块
  const focus = buildFocus(sources, weakModules);
  const generationReason = buildGenerationReason(input, required, weakModules, sources.length);

  const weekly: WeeklyPlan = {
    id: weeklyId,
    userId: target.userId,
    examTargetId: target.id,
    weekNumber,
    startDate,
    endDate: addDays(startDate, 6),
    focus,
    status: "draft",
    version: 1,
    generationReason,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return { weekly, daily };
}

/**
 * 第 7 天或来源不足时的复盘保底任务。
 * 复盘也必须有明确资料入口：优先本周已排的可打开公共资源，其次用户自有资料；
 * 都没有时不标为可执行（不能假装用户对着空气复盘）。
 */
function makeReviewTask(
  dailyPlanId: string,
  order: number,
  dayIndex: number,
  remaining: number,
  nowIso: string,
  sources: TaskSource[]
): PlanTask {
  const refResource = sources.find((s) => s.resource)?.resource;
  const refMaterial = refResource ? undefined : sources.find((s) => s.material)?.material;
  const hasRef = !!(refResource || refMaterial);

  // 时长不超过当天剩余可用时间（原实现的 30 分钟下限可能超过可用时间）
  const est = remaining >= 20 ? Math.min(40, remaining) : remaining;

  return {
    id: `pt-${dailyPlanId}-${order}`,
    dailyPlanId,
    title: `本周学习回顾与薄弱点复盘`,
    module: "mod_zhenti",
    sourceType: refResource ? "resource" : "material",
    resourceId: refResource?.id,
    materialId: refMaterial?.id,
    estimatedTime: est,
    completionCriteria: "打开资料回顾本周已学内容，整理笔记，标记仍然不理解的知识点",
    arrangementReason: `第 ${dayIndex + 1} 天安排复盘，消化本周学习内容，避免堆积`,
    reviewAction: "列出本周 3 个掌握较好的点和 3 个需要再练的点",
    order,
    status: "pending",
    priority: "medium",
    isCore: false,
    executable: hasRef,
    blockedReason: hasRef
      ? undefined
      : "还没有可用于复盘的资料：请先添加合规公共资源，或确认你已有的资料",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildFocus(
  sources: (TaskSource & { priority: "high" | "medium" | "low" })[],
  weakModules: string[]
): string {
  if (weakModules.length > 0) {
    const weakNames = weakModules.slice(0, 3).map(moduleLabel).join("、");
    return `重点攻克薄弱模块：${weakNames}`;
  }
  const highModules = Array.from(new Set(sources.filter((s) => s.priority === "high").map((s) => s.module)));
  if (highModules.length > 0) {
    return `本周重点：${highModules.slice(0, 3).map(moduleLabel).join("、")}`;
  }
  const required = sources.filter((s) => s.priority === "medium").map((s) => s.module);
  if (required.length > 0) {
    return `本周重点：推进${Array.from(new Set(required)).slice(0, 3).map(moduleLabel).join("、")}等必需模块`;
  }
  return "本周重点：按计划推进各模块学习";
}

function buildGenerationReason(
  input: PlanGenerationInput,
  required: string[],
  weakModules: string[],
  sourceCount: number
): string {
  const parts: string[] = [];
  parts.push(`目标：${input.target.name}`);
  parts.push(`必需模块 ${required.length} 个`);
  if (weakModules.length > 0) {
    parts.push(`薄弱模块 ${weakModules.length} 个（优先安排）`);
  }
  const matCount = (input.diagnosis?.materialDiagnoses ?? []).filter((d) => d.recommendation !== "pause").length;
  const resCount = input.resourceLinks.length;
  parts.push(`可用资料 ${matCount} 套、已加入计划资源 ${resCount} 条`);
  parts.push(`共生成 ${sourceCount} 项任务来源，分配到 7 天`);
  parts.push(`每日可用时间 ${input.dailyAvailableMinutes} 分钟`);
  return parts.join("；") + "。";
}
