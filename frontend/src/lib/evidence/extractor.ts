/**
 * 公告提取器：可替换的接口契约 + Mock 实现。
 *
 * ⚠️ 当前没有真实后端，mockEvidenceExtractor 不访问任何网络/AI 服务：
 * - 链接来源：无法抓取网页，按目标信息生成“模拟提取”结果，原文摘录中明确标注；
 * - 文本来源：在本地用规则从粘贴文本中识别时间、科目、分值、资格条件等字段；
 * - 文件来源：占位入口，service 层直接拒绝并提示改用链接或文本。
 * 接入真实服务时，新增一个 HttpEvidenceExtractor 实现同一接口，
 * 在 evidenceService.setExtractor() 中替换即可，页面无需改动。
 */
import {
  AnnouncementSourceInput,
  EDUCATION_LEVEL_LABELS,
  EXAM_TYPE_LABELS,
  ExamTarget,
} from "@/types";
import { ExtractedField, ExtractedPayload } from "./domain";

export interface ExtractContext {
  target: ExamTarget;
}

export type ExtractProgressCallback = (progress: number, stage: string) => void;

export interface EvidenceExtractor {
  readonly name: string;
  extract(
    input: AnnouncementSourceInput,
    context: ExtractContext,
    onProgress: ExtractProgressCallback
  ): Promise<ExtractedPayload>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 模拟提取的阶段（进度 + 文案） */
const STAGES: { progress: number; stage: string; delay: number }[] = [
  { progress: 18, stage: "正在读取公告来源", delay: 360 },
  { progress: 46, stage: "正在识别结构化字段", delay: 420 },
  { progress: 74, stage: "正在核对时间、科目与分值", delay: 420 },
  { progress: 92, stage: "正在整理证据与适用范围", delay: 360 },
  { progress: 100, stage: "提取完成", delay: 200 },
];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname || "公告链接";
  } catch {
    return "公告链接";
  }
}

const DATE_PATTERN = /(?:20\d{2}年)?\d{1,2}月\d{1,2}日(?:\s*[—\-至到~]\s*(?:20\d{2}年)?\d{1,2}月\d{1,2}日)?/g;
/** 仅用于判断句子中是否含日期（不带 g，避免 lastIndex 状态问题） */
const hasDate = (s: string): boolean =>
  /(?:20\d{2}年)?\d{1,2}月\d{1,2}日/.test(s);

/** 取包含关键词的句子（按句号/分号/换行切分） */
function sentencesContaining(text: string, keywords: string[]): string[] {
  const sentences = text
    .split(/[。；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.filter((s) => keywords.some((k) => s.includes(k)));
}

function firstMatch(text: string, pattern: RegExp): string {
  const m = text.match(pattern);
  return m ? m[0] : "";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

/**
 * 从粘贴的公告正文中按规则识别字段。
 * 识别不到的高影响字段不返回（画像将显示“待确认”），绝不编造。
 */
function parseAnnouncementText(text: string, target: ExamTarget): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const add = (field: ExtractedField["field"], value: string, excerpt: string) => {
    if (value.trim()) fields.push({ field, value: value.trim(), excerpt: excerpt.trim() });
  };

  // 低影响字段：从已确认目标带入，证据标注为目标信息
  const targetBasis = "根据已确认的目标信息带入";
  add("region", [target.region, target.recruiter].filter(Boolean).join(" · "), targetBasis);
  if (target.examType) add("recruit_type", EXAM_TYPE_LABELS[target.examType], targetBasis);
  add(
    "year_batch",
    [target.year ? `${target.year}年` : null, target.batch ?? null].filter(Boolean).join(" "),
    targetBasis
  );
  if (target.educationLevel) {
    add("education_level", EDUCATION_LEVEL_LABELS[target.educationLevel], targetBasis);
  }

  // 正文里出现的年份优先于目标带入
  const yearInText = firstMatch(text, /20\d{2}(?=年)/);
  if (yearInText && !fields.some((f) => f.field === "year_batch")) {
    add("year_batch", `${yearInText}年`, `正文出现“${yearInText}年”`);
  }

  // 报名时间：含“报名/网上注册”且带日期的句子
  const regSentence = sentencesContaining(text, ["报名", "注册", "报考"]).find((s) =>
    hasDate(s)
  );
  if (regSentence) {
    const dateRange = firstMatch(regSentence, DATE_PATTERN);
    add("registration_time", dateRange, regSentence.slice(0, 80));
  }

  // 考试时间：含“笔试/考试时间”且带日期的句子
  const examSentence = sentencesContaining(text, ["笔试时间", "考试时间", "笔试定于", "统一笔试"]).find(
    (s) => hasDate(s)
  );
  if (examSentence) {
    add("exam_time", firstMatch(examSentence, DATE_PATTERN), examSentence.slice(0, 80));
  }

  // 考试科目：《》中的科目名
  const bookMatches = text.match(/《[^》]+》/g) ?? [];
  const subjects = unique(bookMatches).slice(0, 4);
  if (subjects.length > 0) {
    add("subjects", subjects.join("、"), `原文：${subjects.join("、")}`);
  }

  // 分值：含“满分/各100分/总分”的句子
  const scoreSentence =
    sentencesContaining(text, ["满分", "总分", "100分", "150分"])[0] ?? "";
  if (scoreSentence) {
    add("score", scoreSentence.replace(/\s+/g, " ").slice(0, 60), scoreSentence.slice(0, 80));
  }

  // 资格条件：学历 / 教师资格证 / 年龄
  const qualSentences = unique(
    sentencesContaining(text, ["学历", "教师资格证", "周岁", "年龄", "户籍"]).slice(0, 3)
  );
  if (qualSentences.length > 0) {
    add("qualification", qualSentences.join("；"), qualSentences.join("；").slice(0, 120));
  }

  // 考试范围：关键词后的句子；或含考查模块关键词的句子
  const scopeSentences = unique(
    sentencesContaining(text, [
      "考试范围",
      "考查内容",
      "笔试内容",
      "现代汉语",
      "古代汉语",
      "文学常识",
      "课程标准",
      "教学设计",
    ]).slice(0, 4)
  );
  if (scopeSentences.length > 0) {
    add("exam_scope", scopeSentences.join("；"), scopeSentences.join("；").slice(0, 120));
  }

  return fields;
}

/**
 * 链接来源的模拟提取：演示环境无法访问网页内容，
 * 依据已确认目标生成结构化模板，字段摘录中明确标注“模拟”。
 */
function buildSimulatedFromUrl(target: ExamTarget): ExtractedField[] {
  const level = target.educationLevel ? EDUCATION_LEVEL_LABELS[target.educationLevel] : "中小学";
  const year = target.year ?? 2026;
  const mockNote = "模拟提取：演示环境不会真实访问链接内容";
  return [
    { field: "region", value: [target.region, target.recruiter].filter(Boolean).join(" · "), excerpt: mockNote },
    ...(target.examType
      ? [{ field: "recruit_type" as const, value: EXAM_TYPE_LABELS[target.examType], excerpt: mockNote }]
      : []),
    { field: "year_batch", value: `${[target.year ? `${year}年` : null, target.batch ?? null].filter(Boolean).join(" ")}`.trim(), excerpt: mockNote },
    ...(target.educationLevel
      ? [{ field: "education_level" as const, value: level, excerpt: mockNote }]
      : []),
    { field: "registration_time", value: `${year}年11月1日—11月7日`, excerpt: mockNote },
    { field: "exam_time", value: `${year}年12月13日`, excerpt: mockNote },
    {
      field: "subjects",
      value: "《教育综合知识》、《学科专业知识（语文）》",
      excerpt: mockNote,
    },
    { field: "score", value: "两科各100分，总分200分", excerpt: mockNote },
    {
      field: "qualification",
      value: "本科及以上学历；持有相应学段教师资格证；年龄35周岁以下",
      excerpt: mockNote,
    },
    {
      field: "exam_scope",
      value: "现代汉语、古代汉语、文学常识、语文课程标准与教学设计、写作",
      excerpt: mockNote,
    },
  ];
}

export const mockEvidenceExtractor: EvidenceExtractor = {
  name: "mock-evidence-extractor",

  async extract(input, { target }, onProgress) {
    // 模拟异步阶段
    for (const step of STAGES) {
      await sleep(step.delay);
      onProgress(step.progress, step.stage);
    }

    if (input.sourceType === "announcement_file") {
      throw new Error(
        "公告文件解析当前为占位能力，暂不支持读取文件内容，请改用公告链接或粘贴公告文本"
      );
    }

    if (input.sourceType === "announcement_url") {
      const url = (input.url ?? "").trim();
      if (!/^https?:\/\/.+/i.test(url)) {
        throw new Error("公告链接格式不正确，请粘贴以 http(s):// 开头的完整链接");
      }
      if (/fail|error|404|invalid/i.test(url)) {
        throw new Error("无法访问该公告链接（链接不存在或已失效），请检查后重试，或粘贴公告文本");
      }
      return {
        sourceName: hostnameOf(url),
        sourceUrl: url,
        sourceType: "announcement_url",
        fields: buildSimulatedFromUrl(target),
      };
    }

    // 文本来源：真实做本地规则识别
    const text = (input.text ?? "").trim();
    if (text.length < 10) {
      throw new Error("公告内容为空或过短，未能识别到结构化信息，请粘贴更完整的公告正文");
    }
    const fields = parseAnnouncementText(text, target);
    const recognized = fields.filter(
      (f) => !["region", "recruit_type", "year_batch", "education_level"].includes(f.field)
    );
    if (recognized.length === 0) {
      throw new Error(
        "未在文本中识别到报名时间、考试时间、科目、分值或资格条件等信息，请检查粘贴内容是否为公告正文"
      );
    }
    return {
      sourceName: "用户粘贴的公告文本",
      sourceType: "announcement_text",
      fields,
    };
  },
};
