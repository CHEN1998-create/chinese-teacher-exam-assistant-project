/**
 * 首批地区「真实官方监测覆盖」单一事实源（模块 1）。
 *
 * 前台如实说明：实际监测了哪些地区的哪些官方栏目、最近核对时间、
 * 当前在报数量与下一预期窗口。「暂未收录」不等于当地没有招聘。
 *
 * 本文件只登记监测范围与巡检结论；具体公告台账见 real-catalog.ts，
 * 人工维护流程与降级规则见 docs/教招有据-模块1-复核SOP与降级规则.md。
 */

/** 监测中的官方来源栏目 */
export interface MonitoredSource {
  id: string;
  name: string;
  url: string;
  /** 最近一次人工/AI 巡检时间 ISO */
  lastCheckedAt: string;
  /** 巡检结果：true=栏目可访问且已核对在报批次清单 */
  ok: boolean;
  failReason?: string | null;
}

export interface MonitoredRegion {
  /** 行政区划代码（市级） */
  code: string;
  label: string;
  authority: string;
  sources: MonitoredSource[];
}

export type MonitoringStatus =
  /** 监测中，当前无在报批次 */
  | 'monitoring_no_open'
  /** 监测中，存在在报批次 */
  | 'open_batch_exists'
  /** 监测暂停（如实告知用户） */
  | 'paused';

export interface MonitoringCoverage {
  subject: 'chinese';
  subjectLabel: string;
  status: MonitoringStatus;
  regions: MonitoredRegion[];
  /** 全部监测栏目最近一次核对的统一时间（取各栏目巡检时间的最早值） */
  lastCheckedAt: string;
  /** 当前在报语文岗位数（按报考单元计） */
  openOpportunityCount: number;
  /** 下一预期招聘窗口的说明（基于往年节奏的预期，不是官方承诺） */
  nextWindowNote: string;
  /** 覆盖边界声明：未监测地区不能被表述为「没有招聘」 */
  scopeNote: string;
}

/** 覆盖数据版本：监测范围/巡检结论更新时随响应返回 */
export const COVERAGE_VERSION = 'kb-monitoring-coverage-1.0.0';

export const COVERAGE_CHECKED_AT = '2026-10-06T11:30:00+08:00';

/**
 * 首批监测范围：浙江省杭州市、宁波市（含市辖区县，如鄞州）。
 * 三个官方栏目已于 2026-10-06 完成巡检：当前 0 个在报语文批次。
 */
export const REAL_COVERAGE: MonitoringCoverage = {
  subject: 'chinese',
  subjectLabel: '语文教师',
  status: 'monitoring_no_open',
  regions: [
    {
      code: '330100',
      label: '浙江省·杭州市',
      authority: '杭州市教育局',
      sources: [
        {
          id: 'src-hz-edu-recruit',
          name: '杭州教育网 · 教师招聘栏目',
          url: 'https://edu.hangzhou.gov.cn/col/col1228921906/index.html',
          lastCheckedAt: COVERAGE_CHECKED_AT,
          ok: true,
          failReason: null,
        },
      ],
    },
    {
      code: '330200',
      label: '浙江省·宁波市（含鄞州等区县）',
      authority: '宁波市教育局、鄞州区教育局',
      sources: [
        {
          id: 'src-nb-edu-recruit',
          name: '宁波市教育局 · 人才招聘栏目',
          url: 'http://jyj.ningbo.gov.cn/col/col1229166692/index.html',
          lastCheckedAt: COVERAGE_CHECKED_AT,
          ok: true,
          failReason: null,
        },
        {
          id: 'src-yz-edu-recruit',
          name: '鄞州区政府 · 教育局事业招聘栏目',
          url: 'https://www.nbyz.gov.cn/col/col1229117192/index.html',
          lastCheckedAt: COVERAGE_CHECKED_AT,
          ok: true,
          failReason: null,
        },
      ],
    },
  ],
  lastCheckedAt: COVERAGE_CHECKED_AT,
  openOpportunityCount: 0,
  nextWindowNote:
    '按往年节奏，下一窗口预计在 2026 年 11—12 月（提前批/冬季批）；鄞州 7 月 31 日预告批次的报名时间待官方通知，本监测会持续跟踪。',
  scopeNote:
    '当前仅监测浙江杭州、宁波两市教育/人社官方渠道；其他城市暂未收录，「暂未收录」不代表当地没有招聘。',
};
