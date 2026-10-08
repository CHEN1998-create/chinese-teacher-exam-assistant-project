/**
 * 公告版本变更领域逻辑（v6.1 模块 7，纯函数）。
 *
 * 输入：关注记录的通知基线（lastNotifiedState）+ 公告当前状态。
 * 输出：结构化变更列表，每条都带「旧值 → 新值 → 对当前用户的影响 → 下一步」。
 *
 * 边界与约定：
 * - 只检测并描述变化，不改写任何存储；通知幂等由调用方用 lastNotifiedState 保证；
 * - 时间线（报名截止等）变化由日程事件同步逐节点负责，这里不重复产出，
 *   避免同一延期既发事件通知又发版本通知（验收：不重复通知）；
 * - 旧版本对象一律从 announcement.versions 中查找（旧版本保留可查）；
 *   找不到时只提示「有新版」，绝不臆造差异；
 * - 报考单元跨版本按 code 对齐（同一岗位在新旧版本中 id 不同、code 稳定）；
 * - 资格条件差异以公告原文表述（description）与判定条件（criterion）为准；
 *   未核实/待复核字段不写成官方结论，只提示重新查看。
 * - 时间未定一律写「待官方通知」，不写推测日期。
 */
import type {
  AnnouncementLifecycle,
  AnnouncementVersion,
  ApplicationUnit,
  RecruitmentAnnouncement,
  RequirementDimension,
} from '../matching/types.js';
import type { NotificationSeverity, TimelineEventKind } from '../schedule/events.domain.js';

// ==================== 通知基线（存 FollowedOpportunity.lastNotifiedState） ====================

/**
 * 用户「上次已被通知到时」的公告状态。只有在该状态与当前状态不一致时才
 * 产生变更通知，随后基线推进到当前状态——同一变更对同一用户只通知一次。
 */
export interface FollowNoticeState {
  versionId: string;
  lifecycle: AnnouncementLifecycle;
  sourceOk: boolean;
}

export function noticeStateOf(
  announcement: RecruitmentAnnouncement,
  version: AnnouncementVersion,
): FollowNoticeState {
  return {
    versionId: version.id,
    lifecycle: announcement.lifecycle,
    sourceOk: !announcement.sourceHealth || announcement.sourceHealth.ok,
  };
}

export function sameNoticeState(
  a: FollowNoticeState,
  b: FollowNoticeState,
): boolean {
  return (
    a.versionId === b.versionId &&
    a.lifecycle === b.lifecycle &&
    a.sourceOk === b.sourceOk
  );
}

/**
 * 历史关注记录（lastNotifiedState 为空）的基线回填：
 * 版本以用户关注时为准（首次同步可补发一次版本差异通知）；
 * lifecycle/sourceOk 以当前为准（历史状态不可考，避免补发无法核实的风暴）。
 */
export function baselineStateFor(
  followVersionId: string,
  announcement: RecruitmentAnnouncement,
): FollowNoticeState {
  return {
    versionId: followVersionId,
    lifecycle: announcement.lifecycle,
    sourceOk: !announcement.sourceHealth || announcement.sourceHealth.ok,
  };
}

// ==================== 结构化变更 ====================

export type VersionChangeKind =
  | 'announcement_withdrawn'
  | 'source_unavailable'
  | 'source_recovered'
  | 'unit_removed'
  | 'headcount_changed'
  | 'requirement_added'
  | 'requirement_modified'
  | 'requirement_removed'
  | 'version_updated';

export interface VersionChange {
  kind: VersionChangeKind;
  /** 变更位置的人可读标签（如「报名截止」「专业」） */
  fieldLabel: string;
  /** 人可读旧值；时间未定写「待官方通知」 */
  oldValue: string;
  newValue: string;
  severity: NotificationSeverity;
  /** 对当前用户的影响（一句话，面向「你」） */
  impact: string;
  /** 下一步建议动作 */
  nextStep: string;
}

const DIMENSION_LABELS: Record<RequirementDimension, string> = {
  region: '地区范围',
  education: '学历',
  degree: '学位',
  major: '专业',
  graduate_status: '应届身份',
  teacher_cert: '教师资格',
  age: '年龄',
  hukou: '户籍',
  social_security: '社保',
  work_experience: '工作经历',
  other: '其他条件',
};

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  must_handle: 0,
  suggest_handle: 1,
  info: 2,
};

export function maxSeverity(
  changes: readonly VersionChange[],
): NotificationSeverity {
  let max: NotificationSeverity = 'info';
  for (const c of changes) {
    if (SEVERITY_RANK[c.severity] < SEVERITY_RANK[max]) max = c.severity;
  }
  return max;
}

// ==================== 单元跨版本解析 ====================

/**
 * 在指定版本中解析关注记录指向的单元：
 * 先按 id 精确命中；未命中时按「关注版本中的 code」对齐到目标版本
 * （同一岗位跨版本 id 变、code 不变）。
 */
export function resolveUnitInVersion(
  version: AnnouncementVersion,
  followedUnitId: string,
  followVersion: AnnouncementVersion | undefined,
): ApplicationUnit | undefined {
  const byId = version.units.find((u) => u.id === followedUnitId);
  if (byId) return byId;
  const followUnit = followVersion?.units.find((u) => u.id === followedUnitId);
  if (!followUnit) return undefined;
  return version.units.find((u) => u.code === followUnit.code);
}

// ==================== 版本差异检测 ====================

export interface DiffInput {
  announcement: RecruitmentAnnouncement;
  /** 上次通知基线 */
  previous: FollowNoticeState;
  /** 公告当前（未被取代的最高）版本 */
  current: AnnouncementVersion;
  /** 关注记录指向的单元 id（可能是旧版本中的 id） */
  followedUnitId: string;
}

/**
 * 检测关注记录「上次通知基线 → 当前公告状态」之间的全部结构化变更。
 * 时间线字段（报名/缴费/笔试等日期）不在此产出——由日程事件同步逐节点通知。
 */
export function diffFollowedAnnouncement(input: DiffInput): VersionChange[] {
  const { announcement, previous, current, followedUnitId } = input;
  const changes: VersionChange[] = [];

  // 1. 公告取消 / 失效（lifecycle active → withdrawn）
  if (previous.lifecycle !== 'withdrawn' && announcement.lifecycle === 'withdrawn') {
    changes.push({
      kind: 'announcement_withdrawn',
      fieldLabel: '公告状态',
      oldValue: '公告有效',
      newValue: '公告已取消或失效',
      severity: 'must_handle',
      impact: '该招聘事件已被官方取消，相关报名与考试安排不再有效',
      nextStep: '停止为该机会准备材料与报名；可在机会列表中改选其他目标',
    });
  }

  // 2. 官方来源失效 / 恢复（人工巡检确认，不含网络抖动）
  const sourceOk = !announcement.sourceHealth || announcement.sourceHealth.ok;
  if (previous.sourceOk && !sourceOk) {
    changes.push({
      kind: 'source_unavailable',
      fieldLabel: '官方来源',
      oldValue: '官方发布页可访问',
      newValue: `官方来源失效（${announcement.sourceHealth?.failReason ?? '原因未登记'}）`,
      severity: 'must_handle',
      impact: '公告原文暂时无法从官方渠道核验，已展示的信息仅作历史留档，不作为官方结论',
      nextStep: '等待来源恢复并重新核对；恢复前不要据此做关键决策，时间以官方恢复后的通知为准',
    });
  } else if (!previous.sourceOk && sourceOk) {
    changes.push({
      kind: 'source_recovered',
      fieldLabel: '官方来源',
      oldValue: '官方来源失效',
      newValue: '官方发布页恢复可访问',
      severity: 'info',
      impact: '公告原文可重新从官方渠道核验',
      nextStep: '查看官方发布页确认最新安排',
    });
  }

  // 3. 版本差异（资格条件 / 招聘人数 / 岗位移除）
  if (previous.versionId !== current.id) {
    const oldVersion = announcement.versions.find(
      (v) => v.id === previous.versionId,
    );
    if (!oldVersion) {
      // 旧版本对象缺失：只提示有新版，不臆造差异
      changes.push({
        kind: 'version_updated',
        fieldLabel: '公告版本',
        oldValue: `第 ${previous.versionId} 版（原始记录已不可追溯）`,
        newValue: `第 ${current.versionNumber} 版（${sourceKindLabel(current.sourceKind)}）`,
        severity: 'suggest_handle',
        impact: '你关注后公告发布了新版本，具体内容差异无法自动核对',
        nextStep: '打开机会详情，对照官方原文逐条确认条件与时间',
      });
    } else {
      const newUnit = resolveUnitInVersion(current, followedUnitId, oldVersion);
      const oldUnit = resolveUnitInVersion(oldVersion, followedUnitId, oldVersion);
      if (!newUnit) {
        changes.push({
          kind: 'unit_removed',
          fieldLabel: '报考岗位',
          oldValue: oldUnit?.name ?? '原报考岗位',
          newValue: '新版公告中不再包含该岗位',
          severity: 'must_handle',
          impact: '你关注的岗位在新版公告中被移除，相关安排不再有效',
          nextStep: '查看新版公告确认岗位调整；可在机会列表中改选其他目标',
        });
      } else if (oldUnit) {
        if (oldUnit.headcount !== newUnit.headcount) {
          changes.push({
            kind: 'headcount_changed',
            fieldLabel: '招聘人数',
            oldValue: `${oldUnit.headcount} 人`,
            newValue: `${newUnit.headcount} 人`,
            severity: 'info',
            impact:
              newUnit.headcount > oldUnit.headcount
                ? '招聘人数增加，竞争压力相对减小'
                : '招聘人数减少，竞争压力相对增大',
            nextStep: '查看最新岗位详情，结合自身情况调整备考优先级',
          });
        }
        changes.push(...diffRequirements(oldUnit.requirements, newUnit.requirements));
      }
    }
  }

  return changes;
}

function sourceKindLabel(kind: AnnouncementVersion['sourceKind']): string {
  switch (kind) {
    case 'supplement':
      return '补充公告';
    case 'correction':
      return '更正公告';
    default:
      return '原公告';
  }
}

/** 资格条件逐项对比（按维度对齐；以公告原文表述与判定条件是否一致为准） */
function diffRequirements(
  oldReqs: ApplicationUnit['requirements'],
  newReqs: ApplicationUnit['requirements'],
): VersionChange[] {
  const changes: VersionChange[] = [];
  const oldByDim = new Map(oldReqs.map((r) => [r.dimension, r]));
  const newDims = new Set(newReqs.map((r) => r.dimension));

  for (const req of newReqs) {
    const label = DIMENSION_LABELS[req.dimension] ?? req.dimension;
    const old = oldByDim.get(req.dimension);
    if (!old) {
      changes.push({
        kind: 'requirement_added',
        fieldLabel: label,
        oldValue: '（原公告无此条件）',
        newValue: req.description,
        severity: 'must_handle',
        impact: '新版公告新增了资格条件，你的匹配结论可能变化',
        nextStep: '重新查看该机会的逐条资格判断；不确定的条款向招聘单位确认',
      });
      continue;
    }
    const criterionChanged =
      JSON.stringify(old.criterion) !== JSON.stringify(req.criterion);
    if (old.description !== req.description || criterionChanged) {
      changes.push({
        kind: 'requirement_modified',
        fieldLabel: label,
        oldValue: old.description,
        newValue: req.description,
        severity: 'must_handle',
        impact: '资格条件发生变化，你的匹配结论可能变化',
        nextStep: '重新查看该机会的逐条资格判断；不确定的条款向招聘单位确认',
      });
    }
  }

  for (const req of oldReqs) {
    if (newDims.has(req.dimension)) continue;
    changes.push({
      kind: 'requirement_removed',
      fieldLabel: DIMENSION_LABELS[req.dimension] ?? req.dimension,
      oldValue: req.description,
      newValue: '（新版公告取消该条件）',
      severity: 'suggest_handle',
      impact: '新版公告取消了该资格条件，你的匹配结论可能改善',
      nextStep: '重新查看该机会的逐条资格判断',
    });
  }

  return changes;
}

// ==================== 时间线变更的「影响 → 下一步」描述 ====================

/**
 * 为日程事件级时间变更生成人可读的「影响 + 下一步」。
 * 日期为 null 时文案固定为「待官方通知」，绝不写推测日期。
 */
export function describeTimelineChange(
  kind: TimelineEventKind,
  oldDateIso: string | null,
  newDateIso: string | null,
): { impact: string; nextStep: string } {
  // 已公布 → 待官方通知（官方撤回具体时间）
  if (oldDateIso && !newDateIso) {
    return {
      impact: '官方撤回了已公布的具体时间，原安排不再有效',
      nextStep: '等待官方另行通知，不要按旧时间安排行程',
    };
  }
  // 待官方通知 → 已公布（时间明确）
  if (!oldDateIso && newDateIso) {
    return {
      impact: '该事项时间已由官方明确',
      nextStep: '把它纳入你的日程安排，并检查是否与其他机会冲突',
    };
  }
  const postponed =
    oldDateIso && newDateIso
      ? new Date(newDateIso).getTime() > new Date(oldDateIso).getTime()
      : null;

  switch (kind) {
    case 'registration_end':
      return postponed
        ? {
            impact: '报名窗口延长，准备时间更充裕',
            nextStep: '按新的截止时间安排报名，仍建议尽早完成，避免最后时刻系统拥堵',
          }
        : {
            impact: '报名截止时间提前，原定计划可能来不及',
            nextStep: '立即确认能否在新截止时间前完成报名与材料提交',
          };
    case 'registration_start':
      return {
        impact: '报名开始时间变化，影响你可提交报名的时间窗口',
        nextStep: '按新的开始时间调整报名计划',
      };
    case 'payment':
      return postponed
        ? {
            impact: '缴费截止时间延后',
            nextStep: '仍建议在报名确认后尽早缴费，逾期通常视为放弃',
          }
        : {
            impact: '缴费截止时间提前，逾期通常视为放弃报名',
            nextStep: '尽快完成缴费并保留缴费凭证',
          };
    case 'written_exam':
      return {
        impact: postponed
          ? '笔试延期，备考时间增加'
          : '笔试提前，备考时间被压缩',
        nextStep: '调整备考计划的节奏与重点',
      };
    case 'interview':
      return {
        impact: '面试时间变化，影响后续行程安排',
        nextStep: '按新时间调整行程，并留意官方后续通知',
      };
    case 'admit_ticket':
      return {
        impact: '准考证打印时间变化',
        nextStep: '按新时间及时打印准考证并核对个人信息',
      };
    default:
      return {
        impact: '该事项时间有更新',
        nextStep: '按新时间调整你的安排',
      };
  }
}

// ==================== 降级可信状态 ====================

export type UnitTrustState =
  | 'ok'
  | 'source_unavailable'
  | 'withdrawn'
  | 'pending_review';

/**
 * 机会的可信状态（模块 7）：来源失效 / 公告取消 / 待人工复核时降级为
 * 可理解的状态文案。ok 时不展示任何标记。
 */
export interface UnitTrust {
  state: UnitTrustState;
  label: string;
  detail: string;
  checkedAt?: string;
}

export function deriveUnitTrust(announcement: RecruitmentAnnouncement): UnitTrust {
  if (announcement.lifecycle === 'withdrawn') {
    return {
      state: 'withdrawn',
      label: '公告已取消',
      detail:
        '该招聘事件已被官方取消或宣告失效，以下信息仅作历史留档，不再有效。',
    };
  }
  const health = announcement.sourceHealth;
  if (health && !health.ok) {
    return {
      state: 'source_unavailable',
      label: '官方来源失效',
      detail:
        `官方发布页当前不可用（${health.failReason ?? '原因未登记'}，巡检于 ${health.checkedAt}）。` +
        '信息未重新核验前仅作历史参考，不作为官方结论；时间以官方恢复后的通知为准。',
      checkedAt: health.checkedAt,
    };
  }
  if (announcement.reviewStatus === 'ai_reviewed_pending') {
    return {
      state: 'pending_review',
      label: '待人工复核',
      detail:
        '该记录为 AI 初核、尚未经人工复核，以下字段不作为官方结论，请以官方原文为准。',
    };
  }
  return { state: 'ok', label: '已核对', detail: '' };
}

// ==================== 通知文案组装 ====================

export const SOURCE_KIND_LABELS: Record<AnnouncementVersion['sourceKind'], string> = {
  original: '原公告',
  supplement: '补充公告',
  correction: '更正公告',
};

/** 变更通知标题：取消 / 来源失效优先，其次版本更新 */
export function changeNotificationTitle(
  unitName: string,
  changes: readonly VersionChange[],
  current: AnnouncementVersion,
): string {
  if (changes.some((c) => c.kind === 'announcement_withdrawn')) {
    return `${unitName} · 公告已取消`;
  }
  if (changes.some((c) => c.kind === 'source_unavailable')) {
    return `${unitName} · 官方来源失效`;
  }
  return `${unitName} · 公告有更新（第 ${current.versionNumber} 版·${SOURCE_KIND_LABELS[current.sourceKind]}）`;
}

/** 变更通知正文：逐条「【字段】旧值 → 新值。影响：…。下一步：…。」 */
export function changeNotificationBody(
  changes: readonly VersionChange[],
): string {
  const lines = changes.map(
    (c) =>
      `【${c.fieldLabel}】${c.oldValue} → ${c.newValue}。影响：${c.impact}。下一步：${c.nextStep}。`,
  );
  return lines.join('\n');
}
