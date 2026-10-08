/**
 * v6.1 信息架构展示层：纯展示文案/格式化辅助。
 *
 * 这里不做资格判断（规则在 lib/matching/domain.ts），只把领域对象格式化为
 * 页面可直接渲染的短文案；所有函数无副作用、确定性，便于单测。
 */
import type {
  EmploymentNatureCode,
  RegionRef,
  StageCode,
} from "@/lib/announcements/types";

/** 学段（v6.1 StageCode 用户可见文案） */
export const STAGE_LABELS: Record<string, string> = {
  primary: "小学",
  middle: "初中",
  high: "高中",
};

export function stageLabel(stage: StageCode): string {
  return STAGE_LABELS[stage] ?? "其他学段";
}

/** 用工性质短标签：编码稳定，文案比 officialName 更短，适合卡片一行展示 */
export const NATURE_SHORT_LABELS: Record<EmploymentNatureCode, string> = {
  public_institution_staff: "事业编",
  record_filing: "备案制",
  post_quota: "员额制",
  headcount_control: "控制数",
  other: "其他官方用工",
};

export function natureShortLabel(code: EmploymentNatureCode): string {
  return NATURE_SHORT_LABELS[code] ?? NATURE_SHORT_LABELS.other;
}

/** 地区短标签：优先“城市·区”，其次城市，其次省 */
export function regionLabel(region: RegionRef): string {
  if (region.district && region.city) return `${region.city}·${region.district}`;
  return region.district ?? region.city ?? region.province;
}

/** 条件维度文案（“补充户籍信息后判断”分组标题用） */
export const DIMENSION_LABELS: Record<string, string> = {
  region: "地区意向",
  education: "学历",
  degree: "学位",
  major: "专业",
  graduate_status: "毕业与就业状态",
  teacher_cert: "教师资格",
  age: "年龄",
  hukou: "户籍",
  social_security: "社保",
  work_experience: "工作经历",
  other: "公告特有条件",
};

export function dimensionLabel(dimension: string): string {
  return DIMENSION_LABELS[dimension] ?? DIMENSION_LABELS.other;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateMidnight(iso: string): Date {
  // 日期字段（YYYY-MM-DD）与完整 ISO 都按本地零点比较，避免时区误差
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 剩余自然日；返回负数表示已过去 N 天 */
export function daysUntil(dateIso: string, nowIso: string): number {
  const target = toDateMidnight(dateIso).getTime();
  const now = toDateMidnight(nowIso).getTime();
  return Math.round((target - now) / MS_PER_DAY);
}

/** “M月D日 周X” */
export function dateWithWeekday(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return dateIso;
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 周${weekdays[date.getDay()]}`;
}

export interface DeadlineText {
  /** 完整一句话，如“10月20日截止，还剩 16 天”；预告批次为“报名时间待官方通知” */
  text: string;
  closed: boolean;
  /** 官方未公布报名时间时为 null（绝不臆造日期） */
  daysLeft: number | null;
  /** 官方尚未公布具体报名时间（预告批次） */
  unconfirmed: boolean;
}

/** 报名截止文案；未公布/未开始/进行中/已截止四态都有文字，不只靠颜色 */
export function deadlineText(
  registrationEnd: string | undefined,
  nowIso: string,
): DeadlineText {
  // 官方尚未公布具体报名日期：不得用“预计”“参考往年”等措辞冒充确定时间
  if (!registrationEnd) {
    return {
      text: "报名时间待官方通知",
      closed: false,
      daysLeft: null,
      unconfirmed: true,
    };
  }
  const daysLeft = daysUntil(registrationEnd, nowIso);
  const dateText = dateWithWeekday(registrationEnd);
  if (daysLeft < 0) {
    return { text: `${dateText} 已截止`, closed: true, daysLeft, unconfirmed: false };
  }
  if (daysLeft === 0) {
    return { text: `${dateText} 今天截止`, closed: false, daysLeft, unconfirmed: false };
  }
  return {
    text: `${dateText} 截止，还剩 ${daysLeft} 天`,
    closed: false,
    daysLeft,
    unconfirmed: false,
  };
}
