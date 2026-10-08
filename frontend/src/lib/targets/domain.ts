/**
 * 目标澄清领域逻辑（纯函数，无存储、无 React）。
 *
 * 这里是“目标是否可以生成计划 / 进入考情核验”的唯一真值来源，
 * 页面与 service 都通过这些函数判断门禁，避免条件散落各处产生分叉。
 */
import {
  ClarificationResult,
  ClarificationTask,
  ConfirmedCondition,
  EducationLevel,
  ExamStatus,
  ExamTarget,
  ExamTargetInput,
  SubjectType,
  EDUCATION_LEVEL_LABELS,
  EXAM_TYPE_LABELS,
} from "@/types";

/** 由省份/城市/招聘单位派生地区展示串 */
export function deriveRegion(input: {
  province?: string;
  city?: string;
  recruiter?: string;
}): string {
  return [input.province, input.city || input.recruiter]
    .filter(Boolean)
    .join(" · ");
}

/** 候选的展示文案 */
export function candidateLabel(c: {
  province?: string;
  city?: string;
  educationLevel?: EducationLevel;
}): string {
  const region = deriveRegion(c);
  const level = c.educationLevel ? EDUCATION_LEVEL_LABELS[c.educationLevel] : "";
  return [region, level ? `${level}语文` : "语文"].filter(Boolean).join(" ");
}

/** 派生目标名称：信息充分时具体，不足时明确标注“待澄清”，不做精确伪装 */
export function deriveName(input: ExamTargetInput): string {
  const region = deriveRegion(input);
  const level = input.educationLevel ? EDUCATION_LEVEL_LABELS[input.educationLevel] : "";
  const type = input.examType ? EXAM_TYPE_LABELS[input.examType] : "";
  const subject = "语文";

  if (input.targetStatus === "candidates") {
    const confirmed = input.candidates?.find((c) => c.id === input.confirmedCandidateId);
    if (confirmed) {
      return [candidateLabel(confirmed), type].filter(Boolean).join(" · ");
    }
    const count = input.candidates?.filter((c) => c.province || c.city).length ?? 0;
    return count > 0 ? `${count} 个语文考编候选方向（待确认）` : "语文考编候选方向（待澄清）";
  }

  if (region) {
    return [region, `${level}${subject}`, type].filter(Boolean).join(" ");
  }
  return `${subject}教师编（目标待澄清）`;
}

/**
 * 核心门禁：是否满足生成完整计划 / 进入考情核验的条件。
 * 满足以下任意一项即可（见模块规则）：
 * 1. 提供目标考试公告；
 * 2. 明确目标省份 + 城市/招聘单位/招聘批次；
 * 3. 从候选目标中确认了一个本周准备方向。
 */
export function canGeneratePlan(target: Pick<ExamTarget,
  "status" | "targetStatus" | "province" | "city" | "recruiter" | "batch" | "announcementUrl" | "confirmedCandidateId"
>): boolean {
  if (target.status === "archived") return false;
  if (target.announcementUrl) return true;
  if (target.targetStatus === "candidates" && target.confirmedCandidateId) return true;
  if (target.province && (target.city || target.recruiter || target.batch)) return true;
  return false;
}

/** 进入考情核验的条件与计划门禁一致（目标本身已足够明确） */
export function canEnterVerification(target: ExamTarget): boolean {
  return canGeneratePlan(target);
}

/** 旧数据归一化：历史目标缺少新字段时补默认值，保证展示与门禁稳定 */
export function normalizeTarget(raw: ExamTarget): ExamTarget {
  const withDefaults: ExamTarget = {
    ...raw,
    subject: (raw.subject ?? "chinese") as SubjectType,
    targetStatus: raw.targetStatus ?? "region",
    region: raw.region || deriveRegion(raw),
    educationLevel: raw.educationLevel,
    examType: raw.examType,
  };
  // 归档状态不可被门禁翻转；其余按真实字段重新计算，避免旧的错误 status 漂移
  if (withDefaults.status !== "archived") {
    withDefaults.status = canGeneratePlan(withDefaults) ? "confirmed" : "draft";
  }
  return withDefaults;
}

/** 组装持久化对象（service 层使用） */
export function buildTarget(params: {
  id: string;
  userId: string;
  input: ExamTargetInput;
  existing?: ExamTarget;
}): ExamTarget {
  const { id, userId, input, existing } = params;
  const now = new Date().toISOString();

  // 候选入口：从已确认候选回填省份/城市/学段
  let merged: ExamTargetInput = { ...input };
  if (input.targetStatus === "candidates" && input.confirmedCandidateId) {
    const chosen = input.candidates?.find((c) => c.id === input.confirmedCandidateId);
    if (chosen) {
      merged = {
        ...merged,
        province: chosen.province,
        city: chosen.city,
        educationLevel: chosen.educationLevel ?? merged.educationLevel,
      };
    }
  }

  const base: ExamTarget = {
    id,
    userId,
    name: deriveName(merged),
    region: deriveRegion(merged),
    regionCode: existing?.regionCode ?? "",
    province: merged.province,
    city: merged.city,
    recruiter: merged.recruiter,
    examType: merged.examType,
    educationLevel: merged.educationLevel,
    year: merged.year,
    batch: merged.batch,
    subject: "chinese",
    stage: merged.stage ?? existing?.stage ?? "preparation",
    targetStatus: merged.targetStatus,
    status: "draft",
    isCurrent: existing?.isCurrent ?? false,
    announcementUrl: merged.announcementUrl,
    announcementFile: merged.announcementFile ?? existing?.announcementFile,
    candidates: merged.candidates,
    confirmedCandidateId: merged.confirmedCandidateId,
    clarificationTasks: existing?.clarificationTasks,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const archived = existing?.status === "archived";
  base.status = archived
    ? "archived"
    : canGeneratePlan(base)
      ? "confirmed"
      : "draft";
  return base;
}

/** 校验“确认目标”提交；不满足时抛出带中文说明的错误 */
export function validateConfirm(input: ExamTargetInput): void {
  const missing: string[] = [];
  // 省份/城市只对“公告”和“已确定地区”两类入口强制；
  // candidates/subject 入口确认后仍处于澄清态，由澄清任务继续引导
  if (input.targetStatus === "announcement" || input.targetStatus === "region") {
    if (!input.province?.trim()) missing.push("省份");
  }
  if (input.targetStatus === "announcement" && !input.announcementUrl?.trim()) {
    missing.push("公告链接");
  }
  if (
    input.targetStatus === "region" &&
    !input.city?.trim() &&
    !input.recruiter?.trim() &&
    !input.batch?.trim()
  ) {
    missing.push("城市或招聘单位/批次");
  }
  if (
    input.targetStatus === "candidates" &&
    !(input.candidates ?? []).some((c) => c.province?.trim() || c.city?.trim())
  ) {
    missing.push("至少一个候选地区");
  }
  if (missing.length > 0) {
    throw new Error(`还缺少：${missing.join("、")}，可以先保存草稿稍后补充`);
  }
}

// ==================== 澄清结果 ====================

const CONDITION_LABELS: { key: keyof ExamTarget; label: string }[] = [
  { key: "subject", label: "学科" },
  { key: "province", label: "省份" },
  { key: "city", label: "城市" },
  { key: "recruiter", label: "招聘单位" },
  { key: "educationLevel", label: "学段" },
  { key: "examType", label: "招聘类型" },
  { key: "year", label: "年份" },
  { key: "batch", label: "批次" },
];

function conditionValue(target: ExamTarget, key: keyof ExamTarget): string | null {
  switch (key) {
    case "subject":
      return "语文";
    case "educationLevel":
      return target.educationLevel ? EDUCATION_LEVEL_LABELS[target.educationLevel] : null;
    case "examType":
      return target.examType ? EXAM_TYPE_LABELS[target.examType] : null;
    case "year":
      return target.year ? `${target.year}年` : null;
    default: {
      const v = target[key];
      return typeof v === "string" && v.trim() ? v : null;
    }
  }
}

/** 已确定条件列表（只列真实存在的字段，不臆造） */
export function getConfirmedConditions(target: ExamTarget): ConfirmedCondition[] {
  const result: ConfirmedCondition[] = [];
  for (const { key, label } of CONDITION_LABELS) {
    const value = conditionValue(target, key);
    if (value) result.push({ label, value });
  }
  if (target.announcementUrl) {
    result.push({ label: "公告", value: "已提供公告链接" });
  }
  if (target.targetStatus === "candidates") {
    const n = target.candidates?.filter((c) => c.province || c.city).length ?? 0;
    if (n > 0) result.push({ label: "候选方向", value: `${n} 个` });
  }
  return result;
}

interface TaskSeed {
  key: string;
  title: string;
  description: string;
  taskType: ClarificationTask["taskType"];
}

/**
 * 根据目标状态与缺失字段生成 1-3 个查找任务（稳定 id，完成状态可跨编辑保留）。
 */
function getTaskSeeds(target: ExamTarget): TaskSeed[] {
  const seeds: TaskSeed[] = [];
  const hasCity = !!(target.city || target.recruiter);

  if (target.targetStatus === "announcement" && !target.announcementUrl) {
    seeds.push({
      key: "find_announcement",
      title: "找到并粘贴官方招聘公告",
      description: "在目标地区教育局或人社局官网查找最新教师招聘公告，粘贴链接或上传文件。",
      taskType: "find_announcement",
    });
  }

  if (target.targetStatus === "region" && !hasCity && !target.batch) {
    seeds.push({
      key: "confirm_region",
      title: `确认${target.province ? "省内" : ""}意向城市或招聘单位`,
      description: "列出 1-2 个最想报考的城市或具体招聘单位（如某区教育局直属学校）。",
      taskType: "confirm_region",
    });
    seeds.push({
      key: "confirm_unit_or_batch",
      title: "确认招聘批次名称",
      description: "确认是上半年统招、下半年补招还是单位单独招聘，记录批次名称。",
      taskType: "confirm_unit_or_batch",
    });
  }

  if (target.targetStatus === "candidates" && !target.confirmedCandidateId) {
    seeds.push({
      key: "compare_candidates",
      title: "从候选方向中确认本周准备方向",
      description: "比较各候选地区的往年竞争和考查科目，先选一个作为本周主攻方向。",
      taskType: "compare_candidates",
    });
    seeds.push({
      key: "find_announcement",
      title: "为候选方向各找一条公告或往年招聘信息",
      description: "优先查找官方来源；找不到公告时，记录最近一年的招聘公告链接作为参考。",
      taskType: "find_announcement",
    });
  }

  if (target.targetStatus === "subject") {
    seeds.push({
      key: "confirm_region",
      title: "确定 1-2 个意向地区",
      description: "先从家乡、就读城市或就业意向城市中选出 1-2 个省份与城市。",
      taskType: "confirm_region",
    });
    seeds.push({
      key: "find_announcement",
      title: "查找意向地区近年语文教师招聘公告",
      description: "了解当地是否考教育综合知识、学科专业知识及大致报名时间。",
      taskType: "find_announcement",
    });
  }

  if (!target.educationLevel) {
    seeds.push({
      key: "confirm_level",
      title: "确认报考学段",
      description: "在小学、初中、高中之间确认一个主攻学段，不同学段考查内容和教材不同。",
      taskType: "confirm_level",
    });
  }

  return seeds.slice(0, 3);
}

/** 待确认问题 */
function getPendingQuestions(target: ExamTarget): string[] {
  const questions: string[] = [];
  if (target.targetStatus === "announcement" && !target.announcementUrl) {
    questions.push("官方公告链接或文件在哪里？");
  }
  if (!target.province) questions.push("目标省份是哪里？");
  if (!target.city && !target.recruiter && !target.batch) {
    questions.push("具体想考哪个城市、招聘单位或批次？");
  }
  if (!target.educationLevel) questions.push("准备报考哪个学段（小学/初中/高中）？");
  if (!target.examType) questions.push("参加哪类招聘（公办/事业单位/特岗等）？");
  if (target.targetStatus === "candidates" && !target.confirmedCandidateId) {
    questions.push("本周先以哪个候选方向作为主攻方向？");
  }
  return questions.slice(0, 4);
}

/** 生成或读取澄清结果；信息已充分时返回 null */
export function buildClarification(target: ExamTarget): ClarificationResult | null {
  if (canGeneratePlan(target)) return null;

  const seeds = getTaskSeeds(target);
  const existing = new Map(
    (target.clarificationTasks ?? []).map((t) => [t.id, t])
  );
  const createdAt = target.createdAt;
  const tasks: ClarificationTask[] = seeds.map((seed) => {
    const id = `${target.id}#${seed.key}`;
    const old = existing.get(id);
    return {
      id,
      title: seed.title,
      description: seed.description,
      taskType: seed.taskType,
      status: old?.status ?? "pending",
      dueHint: "本周内",
      createdAt: old?.createdAt ?? createdAt,
      completedAt: old?.completedAt,
    };
  });

  return {
    targetId: target.id,
    confirmedConditions: getConfirmedConditions(target),
    pendingQuestions: getPendingQuestions(target),
    tasks,
  };
}

/** 编辑后根据最新字段重新计算澄清任务（保留已完成状态） */
export function rebaseClarificationTasks(target: ExamTarget): ClarificationTask[] | undefined {
  const result = buildClarification(target);
  return result?.tasks;
}

/** 目标是否还有未完成的查找任务 */
export function hasPendingClarificationTasks(target: ExamTarget): boolean {
  return (target.clarificationTasks ?? []).some((t) => t.status === "pending");
}

export function lifecycleOf(target: ExamTarget): ExamStatus {
  return target.status === "archived"
    ? "archived"
    : canGeneratePlan(target)
      ? "confirmed"
      : "draft";
}
