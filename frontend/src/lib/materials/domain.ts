/**
 * 资料与能力基线：领域规则层（纯函数，无 React、无 localStorage、无网络）。
 *
 * 所有诊断口径（模块目录、考情就绪、范围匹配、多套取舍、薄弱项、签名）
 * 只允许在本文件定义与修改，service 负责编排持久化，页面只负责渲染。
 */
import {
  AbilityBaseline,
  EducationLevel,
  EvidenceItem,
  ExamTarget,
  MaterialDiagnosis,
  MaterialDiagnosisItem,
  MaterialConflictGroup,
  MaterialItem,
  MaterialRecommendation,
  MaterialSourceType,
  PracticeScore,
  SelfAssessmentLevel,
  UsageStatus,
} from "@/types";
import { HIGH_IMPACT_FIELDS } from "@/lib/evidence/domain";

// ==================== 考试模块目录（唯一口径） ====================

export type ModuleGroup = "chinese" | "general" | "practice";

export interface ExamModuleDef {
  key: string;
  label: string;
  group: ModuleGroup;
  /** 语文教师编默认必需（教综模块按考情动态判定） */
  requiredByDefault: boolean;
}

export const EXAM_MODULES: ExamModuleDef[] = [
  { key: "mod_xiandai", label: "现代汉语基础", group: "chinese", requiredByDefault: true },
  { key: "mod_gudai", label: "古代汉语（文言实词虚词句式）", group: "chinese", requiredByDefault: true },
  { key: "mod_wenxue", label: "文学常识与作品分析", group: "chinese", requiredByDefault: true },
  { key: "mod_kebiao", label: "语文课程标准解读", group: "chinese", requiredByDefault: true },
  { key: "mod_jiaoxue", label: "教学设计", group: "chinese", requiredByDefault: true },
  { key: "mod_jiaocai", label: "教材分析", group: "chinese", requiredByDefault: false },
  { key: "mod_yuedu", label: "阅读理解", group: "chinese", requiredByDefault: false },
  { key: "mod_xiezuo", label: "写作与案例分析", group: "chinese", requiredByDefault: true },
  { key: "mod_jiaoyuxue", label: "教育学基础", group: "general", requiredByDefault: false },
  { key: "mod_xinlixue", label: "心理学基础", group: "general", requiredByDefault: false },
  { key: "mod_fagui", label: "教育法律法规", group: "general", requiredByDefault: false },
  { key: "mod_daode", label: "教师职业道德", group: "general", requiredByDefault: false },
  { key: "mod_difang", label: "地方教育政策", group: "general", requiredByDefault: false },
  { key: "mod_zhenti", label: "报考地区历年真题", group: "practice", requiredByDefault: true },
  { key: "mod_lianxi", label: "分模块练习题库", group: "practice", requiredByDefault: false },
];

export const CHINESE_MODULES = EXAM_MODULES.filter((m) => m.group === "chinese");
export const GENERAL_MODULES = EXAM_MODULES.filter((m) => m.group === "general");

const MODULE_DEF_MAP = new Map(EXAM_MODULES.map((m) => [m.key, m]));

export function moduleDef(key: string): ExamModuleDef | undefined {
  return MODULE_DEF_MAP.get(key);
}

export function moduleLabel(key: string): string {
  return MODULE_DEF_MAP.get(key)?.label ?? key;
}

export function isKnownModule(key: string): boolean {
  return MODULE_DEF_MAP.has(key);
}

/**
 * 无资料时展示的“最小资料类别”清单。
 * generalPaperRequired=true（公告科目含教育综合知识）时教综类别也是必需。
 */
export interface MinimumCategory {
  key: string;
  label: string;
  desc: string;
  generalPaperOnly?: boolean;
}

export const MIN_MATERIAL_CATEGORIES: MinimumCategory[] = [
  {
    key: "cat_subject_book",
    label: "学科知识教材（语文）",
    desc: "系统覆盖现代汉语、古代汉语、文学常识等学科基础知识，作为一轮复习主干。",
  },
  {
    key: "cat_standard_design",
    label: "课程标准与教学设计资料",
    desc: "语文课程标准解读 + 教学设计/教案范例，对应教学设计与案例分析类考题。",
  },
  {
    key: "cat_general_book",
    label: "教育综合知识教材",
    desc: "教育学、心理学、教育法律法规等教综科目教材；公告含《教育综合知识》时必需。",
    generalPaperOnly: true,
  },
  {
    key: "cat_past_papers",
    label: "报考地区历年真题",
    desc: "浙江省/杭州市近年教师招聘语文真题，用于熟悉题型、分值与命题侧重。",
  },
  {
    key: "cat_practice_bank",
    label: "分模块练习题库",
    desc: "按模块刷题并记录正确率，配合真题暴露薄弱环节。",
  },
];

// ==================== 章节目录 → 模块 的关键词预填映射 ====================
//
// 仅用于根据章节标题“猜”覆盖模块、预填勾选；识别不确定时用户可手动修改。

const CHAPTER_KEYWORDS: { module: string; words: string[] }[] = [
  { module: "mod_xiandai", words: ["现代汉语", "语法", "词语", "拼音", "汉字", "修辞"] },
  { module: "mod_gudai", words: ["古代汉语", "文言", "实词", "虚词", "句式", "古文"] },
  { module: "mod_wenxue", words: ["文学常识", "文学", "作品", "作家", "名著"] },
  { module: "mod_kebiao", words: ["课程标准", "课标"] },
  { module: "mod_jiaoxue", words: ["教学设计", "教案", "备课", "课堂设计"] },
  { module: "mod_jiaocai", words: ["教材分析", "课本", "篇目分析", "文本解读"] },
  { module: "mod_yuedu", words: ["阅读理解", "阅读题"] },
  { module: "mod_xiezuo", words: ["写作", "作文", "案例分析", "案例"] },
  { module: "mod_jiaoyuxue", words: ["教育学", "教育原理", "课程与教学论"] },
  { module: "mod_xinlixue", words: ["心理学", "教育心理", "认知"] },
  { module: "mod_fagui", words: ["法规", "法律", "义务教育法", "教师法"] },
  { module: "mod_daode", words: ["职业道德", "师德", "教师职业"] },
  { module: "mod_difang", words: ["地方政策", "杭州", "浙江", "教育政策"] },
  { module: "mod_zhenti", words: ["真题", "试题", "考卷", "历年题"] },
  { module: "mod_lianxi", words: ["练习", "题库", "习题", "刷题"] },
];

/** 根据章节标题猜测覆盖的模块 key（去重，仅预填用） */
export function guessModulesFromChapterTitles(titles: string[]): string[] {
  const hit = new Set<string>();
  for (const title of titles) {
    for (const { module, words } of CHAPTER_KEYWORDS) {
      if (words.some((w) => title.includes(w))) hit.add(module);
    }
  }
  return EXAM_MODULES.filter((m) => hit.has(m.key)).map((m) => m.key);
}

/** 返回资料中与某模块相关的章节标题 */
export function chapterTitlesForModule(material: MaterialItem, moduleKey: string): string[] {
  const def = MODULE_DEF_MAP.get(moduleKey);
  if (!def) return [];
  const rule = CHAPTER_KEYWORDS.find((r) => r.module === moduleKey);
  const matched = material.chapters
    .filter((c) => rule?.words.some((w) => c.title.includes(w)))
    .map((c) => c.title);
  return matched;
}

// ==================== 旧数据归一化 ====================

export function normalizeMaterial(raw: Partial<MaterialItem>): MaterialItem {
  const chapters = (raw.chapters ?? []).map((c, i) => ({
    id: c.id || `ch-${raw.id ?? "new"}-${i}`,
    materialId: c.materialId || raw.id || "",
    title: c.title || `第${i + 1}章`,
    order: typeof c.order === "number" ? c.order : i + 1,
    isCompleted: Boolean(c.isCompleted),
    completedAt: c.completedAt,
  }));
  const guessed = guessModulesFromChapterTitles(chapters.map((c) => c.title));
  const coversModules = Array.from(
    new Set([...(raw.coversModules ?? []), ...(raw.coversModules?.length ? [] : guessed)])
  ).filter(isKnownModule);
  return {
    id: raw.id || `um-${Date.now()}`,
    userId: raw.userId || "anonymous",
    examTargetId: raw.examTargetId || "",
    name: raw.name || "未命名资料",
    sourceType: (raw.sourceType as MaterialSourceType) ?? "other",
    author: raw.author,
    publisher: raw.publisher,
    applicableRegion: raw.applicableRegion ?? "",
    year: raw.year,
    applicableLevel: raw.applicableLevel ?? "unknown",
    coversModules,
    chapters,
    catalogConfirmed: Boolean(raw.catalogConfirmed),
    progress: typeof raw.progress === "number" ? raw.progress : 0,
    note: raw.note,
    createdAt: raw.createdAt || new Date(0).toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date(0).toISOString(),
    status: raw.status,
    diagnosis: raw.diagnosis,
  };
}

export function createEmptyBaseline(
  userId: string,
  examTargetId: string,
  dailyAvailableMinutes = 120
): AbilityBaseline {
  return {
    id: `ab-${examTargetId}`,
    userId,
    examTargetId,
    inventoryStatus: "none",
    chineseAssessments: [],
    generalAssessments: [],
    recentScores: [],
    weakModules: [],
    dailyAvailableMinutes,
    weeklyAvailableHours: 10,
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeBaseline(raw: Partial<AbilityBaseline>, fallback: AbilityBaseline): AbilityBaseline {
  return {
    ...fallback,
    ...raw,
    inventoryStatus: (raw.inventoryStatus as UsageStatus) ?? fallback.inventoryStatus,
    chineseAssessments: raw.chineseAssessments ?? [],
    generalAssessments: raw.generalAssessments ?? [],
    recentScores: (raw.recentScores ?? []) as PracticeScore[],
    weakModules: raw.weakModules ?? [],
  };
}

/** 根据资料数量派生入口状态（未显式选择时使用） */
export function deriveInventoryStatus(count: number): UsageStatus {
  if (count <= 0) return "none";
  if (count === 1) return "single";
  return "multiple";
}

// ==================== 考情就绪评估 ====================

export interface EvidenceReadiness {
  /** 高影响五字段是否全部已有官方确认结论 */
  complete: boolean;
  pendingFields: typeof HIGH_IMPACT_FIELDS;
  /** 官方科目文本表明笔试含教育综合/教育理论类科目 */
  hasGeneralPaper: boolean;
}

export function assessEvidenceReadiness(items: EvidenceItem[]): EvidenceReadiness {
  const official = items.filter((i) => i.reviewStatus === "official");
  const officialFields = new Set(official.map((i) => i.field));
  const pendingFields = HIGH_IMPACT_FIELDS.filter((f) => !officialFields.has(f));
  const subjectsText = official
    .filter((i) => i.field === "subjects")
    .map((i) => i.value)
    .join(" ");
  const hasGeneralPaper = /教育综合|教育理论|教育基础|公共基础/.test(subjectsText);
  return { complete: pendingFields.length === 0, pendingFields, hasGeneralPaper };
}

/** 当前考情下必需的考试模块 key */
export function requiredModuleKeys(readiness: EvidenceReadiness): string[] {
  const keys = EXAM_MODULES.filter((m) => m.requiredByDefault).map((m) => m.key);
  if (readiness.hasGeneralPaper) {
    keys.push("mod_jiaoyuxue", "mod_xinlixue", "mod_fagui");
  }
  return Array.from(new Set(keys));
}

// ==================== 适用范围匹配 ====================

export function regionMatches(materialRegion: string, target: ExamTarget): boolean {
  const region = materialRegion.trim();
  if (!region) return false; // 未标注视为不确定（不直接判错，进入警告但不致命）
  if (region.includes("全国")) return true;
  if (target.city && region.includes(target.city)) return true;
  if (target.province && region.includes(target.province.replace(/省|市|自治区|壮族|回族|维吾尔/g, ""))) {
    return true;
  }
  if (target.province && region.includes(target.province)) return true;
  return false;
}

export function levelMatches(
  materialLevel: EducationLevel | "unknown" | undefined,
  targetLevel: EducationLevel | undefined
): boolean | null {
  if (!materialLevel || materialLevel === "unknown" || !targetLevel) return null; // 无法判断
  return materialLevel === targetLevel;
}

export type YearFit = "ok" | "outdated" | "unknown";

export function yearFit(materialYear: number | undefined, targetYear: number | undefined): YearFit {
  if (!materialYear || !targetYear) return "unknown";
  return targetYear - materialYear <= 2 ? "ok" : "outdated";
}

const LEGITIMATE_SOURCE_TYPES: MaterialSourceType[] = ["published", "open_web", "self_notes"];

// ==================== 单资料诊断 ====================

interface ScopeSignals {
  region: ReturnType<typeof regionMatches>;
  regionKnown: boolean;
  level: boolean | null;
  year: YearFit;
  isUnknownScan: boolean;
  sourceLegit: boolean;
}

function scopeSignals(material: MaterialItem, target: ExamTarget): ScopeSignals {
  return {
    region: regionMatches(material.applicableRegion, target),
    regionKnown: material.applicableRegion.trim().length > 0,
    level: levelMatches(material.applicableLevel, target.educationLevel),
    year: yearFit(material.year, target.year),
    isUnknownScan: material.sourceType === "unknown_scan",
    sourceLegit: LEGITIMATE_SOURCE_TYPES.includes(material.sourceType),
  };
}

/** 针对地区敏感模块，范围不符时直接本周暂缓 */
const REGION_SENSITIVE_MODULES = new Set(["mod_zhenti", "mod_difang"]);

function baseRecommendationForModule(
  moduleKey: string,
  signals: ScopeSignals
): MaterialRecommendation {
  if (signals.isUnknownScan) return "pause";
  if (signals.regionKnown && !signals.region && REGION_SENSITIVE_MODULES.has(moduleKey)) {
    return "pause";
  }
  const hasMismatch =
    (signals.regionKnown && !signals.region) || signals.level === false || signals.year === "outdated";
  if (hasMismatch) return "partial";
  return "continue";
}

function reasonForModule(
  moduleKey: string,
  signals: ScopeSignals,
  target: ExamTarget,
  regionText: string
): string {
  const label = moduleLabel(moduleKey);
  const reasons: string[] = [];
  if (signals.isUnknownScan) {
    return `《${label}》内容来自来源不明的完整扫描件，版权与准确性均无法核实，本周不使用，也不能进入公共资源库。`;
  }
  if (signals.regionKnown && !signals.region) {
    reasons.push(`适用地区为“${regionText}”，不是当前目标地区（${target.region}）`);
  }
  if (signals.level === false) {
    reasons.push("适用学段与当前目标不一致");
  }
  if (signals.year === "outdated") {
    reasons.push("出版年份偏旧，考点与课标可能已变化");
  }
  if (reasons.length === 0) {
    return `对应考试模块「${label}」，适用地区/学段/年份与当前目标匹配，可继续按章节使用。`;
  }
  const head = REGION_SENSITIVE_MODULES.has(moduleKey)
    ? `「${label}」`
    : `「${label}」相关章节`;
  return `${head}${reasons.join("、")}，只建议挑选其中仍通用的章节参考。`;
}

export interface ModuleOverride {
  recommendation: MaterialRecommendation;
  reason: string;
}

export interface DiagnosisComputeContext {
  target: ExamTarget;
  readiness: ReturnType<typeof assessEvidenceReadiness>;
  baseline: AbilityBaseline | null;
  /** diagnoseAll 多套取舍/时间约束后对单模块结论的覆盖 */
  overrides?: Map<string, ModuleOverride>;
}

export function assessMaterial(
  material: MaterialItem,
  ctx: DiagnosisComputeContext
): MaterialDiagnosis {
  const { target, readiness, overrides } = ctx;
  const signals = scopeSignals(material, target);
  const required = requiredModuleKeys(readiness);
  const now = new Date().toISOString();

  const warnings: string[] = [];
  if (signals.isUnknownScan) {
    warnings.push("来源不明的完整扫描件：仅可作个人临时参考，不能进入公共资源库，也不应作为主要复习依据。");
  }
  if (signals.regionKnown && !signals.region) {
    warnings.push(`资料标注适用地区与当前目标（${target.region}）不一致。`);
  }
  if (signals.level === false) {
    warnings.push("资料适用学段与当前目标学段不一致。");
  }
  if (signals.year === "outdated") {
    warnings.push("资料出版年份距考试年份已超过 2 年，请核对是否仍符合最新课标与考纲。");
  }

  const items: MaterialDiagnosisItem[] = material.coversModules.map((moduleKey) => {
    const relatedChapterTitles = chapterTitlesForModule(material, moduleKey);
    const override = overrides?.get(`${material.id}::${moduleKey}`);
    const recommendation = override?.recommendation ?? baseRecommendationForModule(moduleKey, signals);
    const reason = override?.reason ?? reasonForModule(moduleKey, signals, target, material.applicableRegion);
    return { module: moduleKey, moduleLabel: moduleLabel(moduleKey), recommendation, reason, relatedChapterTitles };
  });

  const usableItems = items.filter((i) => i.recommendation !== "pause");
  const continueItems = items.filter((i) => i.recommendation === "continue");

  let recommendation: MaterialRecommendation;
  let reason: string;

  const coveredRequired = material.coversModules.filter((m) => required.includes(m));
  if (signals.isUnknownScan) {
    recommendation = "pause";
    reason = "来源不明的完整扫描资料存在版权与准确性风险，本周暂不使用；建议替换为正版教材或已核验公共资源。";
  } else if (coveredRequired.length === 0) {
    recommendation = "pause";
    reason = "该资料未覆盖当前考试必需的模块，对当前目标帮助有限，本周暂不使用。";
  } else if (continueItems.length === 0) {
    recommendation = "partial";
    reason = "该资料覆盖了部分必需模块，但适用范围存在不一致，仅建议使用其中通用章节。";
  } else if (usableItems.length < items.length) {
    recommendation = "partial";
    reason = "该资料整体适用，但部分模块/章节与当前目标不匹配，建议只使用匹配的章节。";
  } else {
    recommendation = "continue";
    reason = `覆盖 ${coveredRequired.length} 个当前考试必需模块，适用范围与来源均无明显问题，建议继续使用。`;
  }

  const suggestedChapterTitles = Array.from(
    new Set(
      items.filter((i) => i.recommendation !== "pause").flatMap((i) => i.relatedChapterTitles)
    )
  );
  const missingModules = required.filter((key) => !material.coversModules.includes(key));

  return {
    id: `md-${material.id}`,
    materialId: material.id,
    examTargetId: material.examTargetId,
    recommendation,
    reason,
    items,
    suggestedChapterTitles,
    coversModules: material.coversModules,
    missingModules,
    warnings,
    diagnosedAt: now,
  };
}

// ==================== 多资料取舍 & 总体诊断 ====================

/** 资料质量分（仅用于多套同模块时的确定性取舍，不用于任何商业排序） */
function materialScore(material: MaterialItem, target: ExamTarget): number {
  const signals = scopeSignals(material, target);
  let score = 0;
  if (signals.region) score += 3;
  else if (!signals.regionKnown) score += 1;
  if (signals.level === true) score += 2;
  else if (signals.level === null) score += 1;
  if (signals.year === "ok") score += 2;
  else if (signals.year === "unknown") score += 1;
  if (material.sourceType === "published" || material.sourceType === "open_web") score += 2;
  else if (material.sourceType === "self_notes") score += 1;
  else if (material.sourceType === "unknown_scan") score -= 3;
  score += material.progress / 100; // 已有进度作为微弱决胜项
  return score;
}

const TIME_BUDGET_HOURS = 8;

export interface FullDiagnosisResult {
  diagnoses: MaterialDiagnosis[];
  missingModules: string[];
  conflictGroups: MaterialConflictGroup[];
  weakModules: string[];
  readiness: EvidenceReadiness;
}

export function diagnoseAll(
  materials: MaterialItem[],
  baseline: AbilityBaseline | null,
  target: ExamTarget,
  items: EvidenceItem[]
): FullDiagnosisResult {
  const readiness = assessEvidenceReadiness(items);
  const required = requiredModuleKeys(readiness);
  const overrides = new Map<string, ModuleOverride>();
  const conflictGroups: MaterialConflictGroup[] = [];

  // 1) 同模块多套资料：选最优保留，其余本周暂缓
  const winners = new Map<string, MaterialItem>();
  for (const moduleKey of required) {
    const covering = materials.filter((m) => m.coversModules.includes(moduleKey));
    if (covering.length <= 1) {
      if (covering[0]) winners.set(moduleKey, covering[0]);
      continue;
    }
    const ranked = [...covering].sort((a, b) => {
      const diff = materialScore(b, target) - materialScore(a, target);
      return diff !== 0 ? diff : a.createdAt.localeCompare(b.createdAt);
    });
    const winner = ranked[0];
    winners.set(moduleKey, winner);
    const paused = ranked.slice(1).map((loser) => ({
      materialId: loser.id,
      reason: `同一模块「${moduleLabel(moduleKey)}」已有更匹配的资料《${winner.name}》，为避免重复用功，本周先用《${winner.name}》。`,
    }));
    paused.forEach((p) => {
      overrides.set(`${p.materialId}::${moduleKey}`, { recommendation: "pause", reason: p.reason });
    });
    conflictGroups.push({
      module: moduleKey,
      moduleLabel: moduleLabel(moduleKey),
      keepMaterialId: winner.id,
      paused,
      advice: `保留《${winner.name}》（适用范围与来源更匹配），其余 ${paused.length} 套本周暂缓；暂缓不等于丢弃，后续可作为补充查阅。`,
    });
  }

  // 2) 时间约束：周可用时间不足 8 小时时，仅保留赢下模块最多的一套，其余赢下的模块降为暂缓
  const weeklyHours = baseline?.weeklyAvailableHours ?? 0;
  if (weeklyHours > 0 && weeklyHours < TIME_BUDGET_HOURS) {
    const winCounts = new Map<string, number>();
    winners.forEach((m) => winCounts.set(m.id, (winCounts.get(m.id) ?? 0) + 1));
    const rankedWinners = [...winCounts.entries()].sort((a, b) => {
      const diff = b[1] - a[1];
      if (diff !== 0) return diff;
      const ma = materials.find((x) => x.id === a[0]);
      const mb = materials.find((x) => x.id === b[0]);
      return (mb ? materialScore(mb, target) : 0) - (ma ? materialScore(ma, target) : 0);
    });
    const keepId = rankedWinners[0]?.[0];
    if (keepId) {
      winners.forEach((m, moduleKey) => {
        if (m.id === keepId) return;
        const reason = `每周可用时间约 ${weeklyHours} 小时，时间有限：本周先集中完成《${
          materials.find((x) => x.id === keepId)?.name
        }》，「${moduleLabel(moduleKey)}」本周暂缓。`;
        overrides.set(`${m.id}::${moduleKey}`, { recommendation: "pause", reason });
      });
    }
  }

  // 3) 逐资料诊断（带入取舍覆盖）
  const diagnoses = materials.map((m) => assessMaterial(m, { target, readiness, baseline, overrides }));

  // 4) 仍缺少的必需模块：只统计结论为 continue/partial 的覆盖
  const usableCovered = new Set<string>();
  diagnoses.forEach((d) => {
    d.items.filter((i) => i.recommendation !== "pause").forEach((i) => usableCovered.add(i.module));
  });
  const missingModules = required.filter((key) => !usableCovered.has(key));

  // 5) 薄弱模块：手填薄弱项 + 自评 ≤2 + 最近折算成绩 <60
  const weak = new Set<string>();
  (baseline?.weakModules ?? []).forEach((key) => {
    if (isKnownModule(key)) weak.add(key);
  });
  const collectLowLevel = (assessments: { module: string; level: SelfAssessmentLevel }[]) => {
    assessments
      .filter((a) => a.level <= 2 && isKnownModule(a.module))
      .forEach((a) => weak.add(a.module));
  };
  collectLowLevel(baseline?.chineseAssessments ?? []);
  collectLowLevel(baseline?.generalAssessments ?? []);
  (baseline?.recentScores ?? [])
    .filter((s: PracticeScore) => typeof s.scorePercent === "number" && (s.scorePercent ?? 100) < 60)
    .forEach((s) => weak.add(s.module));

  return {
    diagnoses,
    missingModules,
    conflictGroups,
    weakModules: EXAM_MODULES.filter((m) => weak.has(m.key)).map((m) => m.key),
    readiness,
  };
}

// ==================== 诊断输入签名 ====================

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * 当前输入的签名：目标/考情/资料/基线任一实质变化都会改变签名，
 * 与已存快照签名不一致时，页面提示“诊断可能已过时，请重新计算”。
 */
export function buildDiagnosisSignature(params: {
  target: ExamTarget;
  items: EvidenceItem[];
  materials: MaterialItem[];
  baseline: AbilityBaseline | null;
}): string {
  const { target, items, materials, baseline } = params;
  const evidencePart = items
    .filter((i) => HIGH_IMPACT_FIELDS.includes(i.field))
    .map((i) => `${i.field}:${i.reviewStatus}:${i.updatedAt}`)
    .sort()
    .join("|");
  const materialPart = materials
    .map(
      (m) =>
        `${m.id}:${m.updatedAt}:${m.progress}:${m.coversModules.slice().sort().join(",")}:${m.chapters.length}:${m.sourceType}:${m.applicableRegion}:${m.year ?? ""}:${m.applicableLevel ?? ""}`
    )
    .sort()
    .join("|");
  const baselinePart = baseline
    ? `${baseline.updatedAt}:${baseline.weeklyAvailableHours}:${baseline.weakModules.slice().sort().join(",")}:${[
        ...baseline.chineseAssessments,
        ...baseline.generalAssessments,
      ]
        .map((a) => `${a.module}=${a.level}`)
        .sort()
        .join(",")}`
    : "none";
  return djb2Hash(
    [
      target.id,
      target.updatedAt,
      evidencePart,
      materialPart,
      baselinePart,
    ].join("##")
  );
}
