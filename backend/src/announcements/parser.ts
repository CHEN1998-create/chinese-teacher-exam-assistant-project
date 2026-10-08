/**
 * 确定性公告解析器（首版，不依赖外部 AI/OCR）。
 *
 * 从 HTML 或纯文本公告中按规则提取字段，同时返回原文摘录作为证据锚点。
 * 提取结果始终是"候选"（pending_review），不得标记为已审核。
 *
 * 接入真实 AI 时，替换本模块为调用后端适配器的实现，service 层无需改动。
 */
import type { CandidateField, EvidenceAnchorInput, ExtractionCandidate } from './domain.js';

const DATE_PATTERN =
  /(?:20\d{2}年)?\d{1,2}月\d{1,2}日(?:\s*[—\-至到~]\s*(?:20\d{2}年)?\d{1,2}月\d{1,2}日)?/g;

function hasDate(s: string): boolean {
  return /(?:20\d{2}年)?\d{1,2}月\d{1,2}日/.test(s);
}

/** 去除 HTML 标签，保留文本 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentencesContaining(text: string, keywords: string[]): string[] {
  const sentences = text
    .split(/[。；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.filter((s) => keywords.some((k) => s.includes(k)));
}

function firstMatch(text: string, pattern: RegExp): string {
  const m = text.match(pattern);
  return m ? m[0] : '';
}

function anchor(field: string, excerpt: string): EvidenceAnchorInput {
  return { field, locator: { kind: 'excerpt', excerpt: excerpt.slice(0, 200) } };
}

/**
 * 解析公告正文（HTML 或纯文本），返回候选字段 + 证据锚点。
 * 解析不到的高影响字段不返回（审核时显示缺失），绝不编造。
 */
export function parseAnnouncement(rawContent: string, mimeType: string): ExtractionCandidate {
  const text = mimeType.includes('html') ? stripHtml(rawContent) : rawContent;
  const fields: CandidateField[] = [];

  const add = (field: string, value: string, excerpt: string) => {
    const v = value.trim();
    if (v) {
      fields.push({ field, value: v, anchor: anchor(field, excerpt) });
    }
  };

  // 公告标题（第一个非空短行，或 <title>）
  const titleMatch = rawContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    add('title', titleMatch[1].trim(), `<title>${titleMatch[1].trim()}</title>`);
  } else {
    const firstLine = text.split(/\n/).map((l) => l.trim()).find(Boolean);
    if (firstLine && firstLine.length < 80) {
      add('title', firstLine, firstLine);
    }
  }

  // 报名时间
  const regSentence = sentencesContaining(text, ['报名', '注册', '报考']).find(hasDate);
  if (regSentence) {
    add('registration_time', firstMatch(regSentence, DATE_PATTERN), regSentence.slice(0, 120));
  }

  // 考试时间
  const examSentence = sentencesContaining(text, [
    '笔试时间',
    '考试时间',
    '笔试定于',
    '统一笔试',
  ]).find(hasDate);
  if (examSentence) {
    add('exam_time', firstMatch(examSentence, DATE_PATTERN), examSentence.slice(0, 120));
  }

  // 考试科目（《》中的科目名）
  const bookMatches = text.match(/《[^》]+》/g) ?? [];
  const subjects = Array.from(new Set(bookMatches)).slice(0, 4);
  if (subjects.length > 0) {
    add('subjects', subjects.join('、'), `原文科目：${subjects.join('、')}`);
  }

  // 分值
  const scoreSentence = sentencesContaining(text, ['满分', '总分', '100分', '150分'])[0] ?? '';
  if (scoreSentence) {
    add('score', scoreSentence.replace(/\s+/g, ' ').slice(0, 80), scoreSentence.slice(0, 120));
  }

  // 资格条件：学历 / 教师资格证 / 年龄 / 户籍
  const qualSentences = Array.from(
    new Set(
      sentencesContaining(text, ['学历', '教师资格证', '周岁', '年龄', '户籍']).slice(0, 3),
    ),
  );
  if (qualSentences.length > 0) {
    add(
      'qualification',
      qualSentences.join('；'),
      qualSentences.join('；').slice(0, 200),
    );
  }

  // 招聘人数
  const headcountMatch = text.match(/招聘[^\d]{0,6}(\d+)\s*名/);
  if (headcountMatch) {
    add('headcount', headcountMatch[1], headcountMatch[0].slice(0, 60));
  }

  return {
    fields,
    parserVersion: 'deterministic-parser@1.0.0',
    rawJson: { fieldCount: fields.length },
  };
}
