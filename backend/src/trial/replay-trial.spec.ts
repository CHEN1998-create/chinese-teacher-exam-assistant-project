/**
 * 受邀试用指标手算对账（v7.0 模块 7 回放样本）。
 *
 * 用固定基准时间逐条手算期望值，覆盖：
 * 1. 完整旅程主样本（含重复点击关注/官方入口的重复行）；
 * 2. 未满 7 日观察期（单列「观察中」，不进分母）；
 * 3. 重复点击（去重用户口径，重复行不虚增）；
 * 4. 取消关注（计关注、不计后续阶段、不进北极星分子）；
 * 5. 跨设备（同账号两台设备 → 1 个去重用户）；
 * 6. 空样本（分母 0 → rate=null，显示「—」，绝不显示 0%）；
 * 7. seed/live × 员工/真实 × invited/demo 四层分群隔离；
 * 8. 补信息导致结论变化；
 * 9. 机会数据集分列（北极星只认真实台账机会）。
 */
import { describe, expect, it } from 'vitest';
import {
  computeTrialDashboard,
  type TrialEventRecord,
} from './trial.domain.js';

const NOW = new Date('2026-10-06T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const REAL_UNIT = 'unit-real-hangzhou-01';
const DEMO_UNIT = 'unit-demo-01';

function at(daysAgo: number): Date {
  return new Date(NOW.getTime() - daysAgo * DAY);
}

interface EvSpec {
  userId: string;
  type: string;
  daysAgo: number;
  unitId?: string | null;
  dataset?: string | null;
  userRole?: string;
  authMode?: string;
  source?: string;
  props?: Record<string, unknown>;
}

function ev(spec: EvSpec): TrialEventRecord {
  return {
    userId: spec.userId,
    userRole: spec.userRole ?? 'user',
    type: spec.type,
    unitId: spec.unitId === undefined ? REAL_UNIT : spec.unitId,
    dataset: spec.dataset === undefined ? 'real' : spec.dataset,
    source: spec.source ?? 'live',
    authMode: spec.authMode ?? 'invited',
    props: spec.props ?? null,
    occurredAt: at(spec.daysAgo),
  };
}

describe('受邀试用看板 · 手算对账', () => {
  it('主样本：完整旅程全部指标逐项对上（含重复点击的重复行不虚增）', () => {
    // u-a：10 天前完成画像并获得 2 个真实机会，次日关注并推进，第 8 天进入官方入口并已报名。
    // 关注被连点 2 次、官方入口被点 2 次 → 重复行保留，但去重用户口径不虚增。
    const events: TrialEventRecord[] = [
      ev({ userId: 'u-a', type: 'profile_completed', daysAgo: 10, unitId: null, dataset: null, props: { stepCount: 5 } }),
      ...[1, 2, 3, 4, 5].map((step) =>
        ev({ userId: 'u-a', type: 'profile_step_completed', daysAgo: 10, unitId: null, dataset: null, props: { step } }),
      ),
      ev({ userId: 'u-a', type: 'opportunity_revealed', daysAgo: 10, props: { validCount: 2 } }),
      ev({ userId: 'u-a', type: 'match_basis_viewed', daysAgo: 10 }),
      // 重复点击：同一用户同一机会两条 follow 行
      ev({ userId: 'u-a', type: 'opportunity_followed', daysAgo: 9 }),
      ev({ userId: 'u-a', type: 'opportunity_followed', daysAgo: 9 }),
      ev({ userId: 'u-a', type: 'follow_status_changed', daysAgo: 9, props: { from: 'considering', to: 'preparing' } }),
      ev({ userId: 'u-a', type: 'primary_target_set', daysAgo: 9 }),
      ev({ userId: 'u-a', type: 'material_status_changed', daysAgo: 8, props: { to: 'done' } }),
      // 重复点击：官方入口两条行
      ev({ userId: 'u-a', type: 'register_entry_opened', daysAgo: 8 }),
      ev({ userId: 'u-a', type: 'register_entry_opened', daysAgo: 8 }),
      ev({ userId: 'u-a', type: 'follow_status_changed', daysAgo: 8, props: { from: 'preparing', to: 'registered' } }),
    ];

    const { cohorts } = computeTrialDashboard(events, NOW);
    const r = cohorts.invited;

    expect(r.users).toBe(1);
    // 有效机会获得率 = 1/1
    expect(r.opportunityRate).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    // 画像各步：5 步各 1 人，相对第 1 步均为 1
    expect(r.profileSteps.map((s) => s.users)).toEqual([1, 1, 1, 1, 1]);
    expect(r.profileSteps.every((s) => s.rateFromFirst === 1)).toBe(true);
    expect(r.matchBasis).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.follow).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.conclusionChanged).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(r.materialsDone).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.preparing).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.registerEntry).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.registered).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.primaryTarget).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    // 北极星：获得真实机会已满 7 日（分母 1），7 日内关注且完成推进（分子 1）
    expect(r.northStar).toEqual({ denominator: 1, numerator: 1, rate: 1, observing: 0 });
    expect(r.datasetSplit).toEqual({ real: 1, demo: 0, unknown: 1 });
  });

  it('未满 7 日：进「观察中」分群，不进分母，比率显示 null（—）', () => {
    const events: TrialEventRecord[] = [
      ev({ userId: 'u-b', type: 'opportunity_revealed', daysAgo: 5, props: { validCount: 1 } }),
      ev({ userId: 'u-b', type: 'opportunity_followed', daysAgo: 4 }),
      ev({ userId: 'u-b', type: 'follow_status_changed', daysAgo: 4, props: { from: 'considering', to: 'preparing' } }),
    ];
    const { cohorts } = computeTrialDashboard(events, NOW);
    const r = cohorts.invited;

    expect(r.northStar.observing).toBe(1);
    expect(r.northStar.denominator).toBe(0);
    expect(r.northStar.numerator).toBe(0);
    expect(r.northStar.rate).toBeNull();
    // 漏斗本身照常计算
    expect(r.follow).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.preparing).toEqual({ numerator: 1, denominator: 1, rate: 1 });
  });

  it('重复点击：两条关注/两条官方入口行只算 1 个去重用户，北极星分子仍为 1', () => {
    const events: TrialEventRecord[] = [
      ev({ userId: 'u-c', type: 'opportunity_revealed', daysAgo: 8, props: { validCount: 1 } }),
      ev({ userId: 'u-c', type: 'opportunity_followed', daysAgo: 7 }),
      ev({ userId: 'u-c', type: 'opportunity_followed', daysAgo: 7 }),
      ev({ userId: 'u-c', type: 'register_entry_opened', daysAgo: 6 }),
      ev({ userId: 'u-c', type: 'register_entry_opened', daysAgo: 6 }),
    ];
    const { cohorts } = computeTrialDashboard(events, NOW);
    const r = cohorts.invited;

    expect(r.follow.numerator).toBe(1);
    expect(r.registerEntry.numerator).toBe(1);
    expect(r.northStar).toEqual({ denominator: 1, numerator: 1, rate: 1, observing: 0 });
  });

  it('取消关注：计入「关注」，不计后续阶段，无推进动作不进北极星分子', () => {
    const events: TrialEventRecord[] = [
      ev({ userId: 'u-d', type: 'opportunity_revealed', daysAgo: 8, props: { validCount: 1 } }),
      ev({ userId: 'u-d', type: 'opportunity_followed', daysAgo: 7 }),
      ev({ userId: 'u-d', type: 'opportunity_unfollowed', daysAgo: 6 }),
    ];
    const { cohorts } = computeTrialDashboard(events, NOW);
    const r = cohorts.invited;

    expect(r.follow).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.preparing).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(r.registerEntry).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(r.northStar).toEqual({ denominator: 1, numerator: 0, rate: 0, observing: 0 });
  });

  it('跨设备：同账号两台设备重复上报 → 1 个去重用户，画像第 1 步不重复计', () => {
    const events: TrialEventRecord[] = [
      // 设备 A
      ev({ userId: 'u-e', type: 'profile_completed', daysAgo: 9, unitId: null, dataset: null }),
      ev({ userId: 'u-e', type: 'profile_step_completed', daysAgo: 9, unitId: null, dataset: null, props: { step: 1 } }),
      ev({ userId: 'u-e', type: 'opportunity_revealed', daysAgo: 9, props: { validCount: 2 } }),
      // 设备 B（同账号重报画像 + 二次获得机会 + 关注）
      ev({ userId: 'u-e', type: 'profile_completed', daysAgo: 9, unitId: null, dataset: null }),
      ev({ userId: 'u-e', type: 'profile_step_completed', daysAgo: 9, unitId: null, dataset: null, props: { step: 1 } }),
      ev({ userId: 'u-e', type: 'opportunity_revealed', daysAgo: 8, props: { validCount: 1 } }),
      ev({ userId: 'u-e', type: 'opportunity_followed', daysAgo: 8 }),
    ];
    const { cohorts } = computeTrialDashboard(events, NOW);
    const r = cohorts.invited;

    expect(r.users).toBe(1);
    expect(r.profileSteps[0].users).toBe(1);
    expect(r.opportunityRate).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    // 观察窗口从最早一次获得机会（9 天前）起算：已满 7 日；只有关注、无推进 → 分子 0
    expect(r.northStar).toEqual({ denominator: 1, numerator: 0, rate: 0, observing: 0 });
  });

  it('空样本：全部分群为空，比率一律 null（—），绝不出现 0% 或 NaN', () => {
    const { cohorts, generatedAt } = computeTrialDashboard([], NOW);
    for (const key of ['invited', 'invited_staff', 'demo', 'seed'] as const) {
      const r = cohorts[key];
      expect(r.users).toBe(0);
      expect(r.opportunityRate.rate).toBeNull();
      expect(r.follow.rate).toBeNull();
      expect(r.registered.rate).toBeNull();
      expect(r.northStar.rate).toBeNull();
      expect(r.northStar.observing).toBe(0);
      expect(r.profileSteps.every((s) => s.rateFromFirst === null)).toBe(true);
    }
    expect(generatedAt).toBe(NOW.toISOString());
  });

  it('分群隔离：seed / 员工 / 演示环境 / 受邀真实互不混算', () => {
    const journey = (userId: string, extra: Partial<EvSpec> = {}): TrialEventRecord[] => [
      ev({ userId, type: 'opportunity_revealed', daysAgo: 10, props: { validCount: 1 }, ...extra }),
      ev({ userId, type: 'opportunity_followed', daysAgo: 9, ...extra }),
      ev({ userId, type: 'register_entry_opened', daysAgo: 8, ...extra }),
    ];
    const events: TrialEventRecord[] = [
      ...journey('u-real'), // 受邀真实用户
      ...journey('u-staff', { userRole: 'exam_reviewer' }), // 受邀员工账号
      ...journey('u-demo', { authMode: 'demo' }), // 演示环境
      ...journey('trial-seed-u1', { source: 'seed', authMode: 'demo' }), // 演示种子
    ];
    const { cohorts } = computeTrialDashboard(events, NOW);

    expect(cohorts.invited.users).toBe(1);
    expect(cohorts.invited_staff.users).toBe(1);
    expect(cohorts.demo.users).toBe(1);
    expect(cohorts.seed.users).toBe(1);
    // 各分群北极星独立成立（真实机会 + 满 7 日 + 关注 + 推进）
    for (const key of ['invited', 'invited_staff', 'demo', 'seed'] as const) {
      expect(cohorts[key].northStar).toEqual({ denominator: 1, numerator: 1, rate: 1, observing: 0 });
    }
  });

  it('补信息导致结论变化：只有 conclusionChanged=1 的用户计入', () => {
    const events: TrialEventRecord[] = [
      ev({ userId: 'u-h1', type: 'opportunity_revealed', daysAgo: 9, props: { validCount: 1 } }),
      ev({ userId: 'u-h1', type: 'qualification_supplemented', daysAgo: 8, unitId: null, dataset: null, props: { fieldCount: 2, conclusionChanged: 1 } }),
      ev({ userId: 'u-h2', type: 'opportunity_revealed', daysAgo: 9, props: { validCount: 1 } }),
      ev({ userId: 'u-h2', type: 'qualification_supplemented', daysAgo: 8, unitId: null, dataset: null, props: { fieldCount: 1, conclusionChanged: 0 } }),
    ];
    const { cohorts } = computeTrialDashboard(events, NOW);
    expect(cohorts.invited.conclusionChanged).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
  });

  it('数据集分列：只看演示台账机会的用户不进北极星分母', () => {
    const events: TrialEventRecord[] = [
      ev({ userId: 'u-i', type: 'opportunity_revealed', daysAgo: 8, unitId: DEMO_UNIT, dataset: 'demo', props: { validCount: 1 } }),
      ev({ userId: 'u-i', type: 'opportunity_followed', daysAgo: 7, unitId: DEMO_UNIT, dataset: 'demo' }),
    ];
    const { cohorts } = computeTrialDashboard(events, NOW);
    const r = cohorts.invited;

    expect(r.datasetSplit).toEqual({ real: 0, demo: 1, unknown: 0 });
    expect(r.follow).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(r.northStar).toEqual({ denominator: 0, numerator: 0, rate: null, observing: 0 });
  });

  it('第 7 天边界：恰好满 7×24 小时即进入分母', () => {
    const events: TrialEventRecord[] = [
      ev({ userId: 'u-j', type: 'opportunity_revealed', daysAgo: 7, props: { validCount: 1 } }),
    ];
    const { cohorts } = computeTrialDashboard(events, NOW);
    expect(cohorts.invited.northStar.observing).toBe(0);
    expect(cohorts.invited.northStar.denominator).toBe(1);
  });
});
