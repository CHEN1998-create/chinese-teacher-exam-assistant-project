import { describe, expect, it } from 'vitest';
import {
  FRESHNESS_MAX_AGE_HOURS,
  FRESHNESS_NEAR_DEADLINE_MAX_AGE_HOURS,
  NEAR_DEADLINE_WINDOW_HOURS,
  evaluateGates,
  isValidOpportunity,
  evaluateOpportunity,
} from './engine.js';
import type {
  AnnouncementVersion,
  ApplicationUnit,
  RecruitmentAnnouncement,
  Requirement,
  UserRecruitmentProfile,
} from './types.js';

const NOW = '2026-10-04T12:00:00+08:00';
const HOUR_MS = 60 * 60 * 1000;

function isoHoursFromNow(hours: number): string {
  return new Date(new Date(NOW).getTime() + hours * HOUR_MS).toISOString();
}

const PROFILE: UserRecruitmentProfile = {
  regions: [{ code: '330000', province: '浙江省', level: 'required' }],
  educationLevel: 'bachelor',
  degree: 'bachelor',
  majorFullName: '汉语言文学（师范）',
  graduationDate: '2026-06-30',
  employmentStatus: 'fresh_unemployed',
  socialSecurityMonths: 0,
  teacherCert: { status: 'obtained', subject: 'chinese', stage: 'middle' },
  acceptedEmploymentNatures: ['public_institution_staff'],
};

interface FixtureOptions {
  registrationStart?: string;
  registrationEnd?: string;
  checkedAt?: string;
  sourceState?: 'official' | 'ai_extracted' | 'pending_review';
  lifecycle?: 'active' | 'withdrawn';
  sourceHealth?: RecruitmentAnnouncement['sourceHealth'];
  reviewStatus?: RecruitmentAnnouncement['reviewStatus'];
  requirementState?: 'official' | 'ai_extracted';
}

function makeFixture(opts: FixtureOptions = {}): {
  announcement: RecruitmentAnnouncement;
  version: AnnouncementVersion;
  unit: ApplicationUnit;
} {
  const checkedAt = opts.checkedAt ?? NOW;
  const education: Requirement = {
    id: 'edu',
    dimension: 'education',
    description: '本科及以上',
    hard: true,
    criterion: { kind: 'education', minLevel: 'bachelor' },
    evidence: {
      id: 'edu-ev',
      locator: { kind: 'url', url: 'https://gov.example/ann' },
      state: opts.requirementState ?? 'official',
      checkedAt,
    },
  };
  const unit: ApplicationUnit = {
    id: 'unit-x',
    code: 'X-1',
    name: '测试单元',
    announcementId: 'ann-x',
    versionId: 'ann-x-v1',
    region: { code: '330100', province: '浙江省', city: '杭州市' },
    subject: 'chinese',
    stage: 'middle',
    headcount: 2,
    organizationType: 'government_unified',
    employmentNature: {
      code: 'public_institution_staff',
      officialName: '事业编制',
    },
    allocation: { code: 'direct_school', description: '直接定岗' },
    requirements: [education],
  };
  const version: AnnouncementVersion = {
    id: 'ann-x-v1',
    announcementId: 'ann-x',
    versionNumber: 1,
    sourceKind: 'original',
    publishedAt: NOW,
    officialSource: {
      id: 'src',
      locator: { kind: 'url', url: 'https://gov.example/ann' },
      state: opts.sourceState ?? 'official',
      checkedAt,
    },
    timeline: {
      registrationStart: opts.registrationStart,
      registrationEnd: opts.registrationEnd,
    },
    units: [],
  };
  // 版本与单元互相持有 id 引用
  version.units.push(unit);
  const announcement: RecruitmentAnnouncement = {
    id: 'ann-x',
    title: '测试公告',
    publisher: '测试教育局',
    organizationType: 'government_unified',
    officialUrl: 'https://gov.example/ann',
    subjectScope: ['chinese'],
    region: { code: '330000', province: '浙江省' },
    lifecycle: opts.lifecycle ?? 'active',
    firstPublishedAt: NOW,
    versions: [version],
    reviewStatus: opts.reviewStatus,
    sourceHealth: opts.sourceHealth,
  };
  return { announcement, version, unit };
}

function gateCodes(
  opts: FixtureOptions,
): ReturnType<typeof evaluateGates> {
  const { announcement, version, unit } = makeFixture(opts);
  return evaluateGates(announcement, version, unit, NOW);
}

describe('降级闸门：报名时间未确定', () => {
  it('报名时间未公布 → registration_unconfirmed 失败且不判截止，机会无效', () => {
    const gates = gateCodes({});
    expect(gates.find((g) => g.code === 'registration_unconfirmed')?.passed).toBe(
      false,
    );
    expect(gates.find((g) => g.code === 'registration_closed')?.passed).toBe(
      true,
    );
    const { announcement, version, unit } = makeFixture({});
    const match = evaluateOpportunity(
      announcement,
      version,
      unit,
      PROFILE,
      NOW,
    );
    expect(isValidOpportunity(match)).toBe(false);
  });

  it('预告记录的理由明确说明「以官方后续通知为准」，不出现臆造日期', () => {
    const gates = gateCodes({});
    const reason = gates.find(
      (g) => g.code === 'registration_unconfirmed',
    )?.reason;
    expect(reason).toContain('官方尚未公布具体报名时间');
    expect(reason).toContain('官方后续通知');
  });
});

describe('降级闸门：证据未人工复核', () => {
  const openWindow = {
    registrationStart: '2026-10-01',
    registrationEnd: '2026-10-20',
  };

  it('AI 初核记录（reviewStatus + ai_extracted 证据）→ evidence_not_reviewed 与 no_official_source 均失败', () => {
    const gates = gateCodes({
      ...openWindow,
      reviewStatus: 'ai_reviewed_pending',
      sourceState: 'ai_extracted',
      requirementState: 'ai_extracted',
    });
    expect(gates.find((g) => g.code === 'evidence_not_reviewed')?.passed).toBe(
      false,
    );
    expect(gates.find((g) => g.code === 'no_official_source')?.passed).toBe(
      false,
    );
  });

  it('高影响条件证据为 ai_extracted 时即使公告级来源已核对也不放行', () => {
    const gates = gateCodes({
      ...openWindow,
      requirementState: 'ai_extracted',
    });
    expect(gates.find((g) => g.code === 'no_official_source')?.passed).toBe(
      true,
    );
    expect(gates.find((g) => g.code === 'evidence_not_reviewed')?.passed).toBe(
      false,
    );
  });
});

describe('降级闸门：来源失效', () => {
  it('sourceHealth.ok=false → source_unavailable 失败，理由含巡检现象与时间', () => {
    const gates = gateCodes({
      registrationStart: '2026-10-01',
      registrationEnd: '2026-10-20',
      sourceHealth: {
        ok: false,
        checkedAt: NOW,
        failReason: '公告页 HTTP 404',
      },
    });
    const gate = gates.find((g) => g.code === 'source_unavailable');
    expect(gate?.passed).toBe(false);
    expect(gate?.reason).toContain('HTTP 404');
  });

  it('公告撤回 → announcement_withdrawn 失败（取消演练）', () => {
    const gates = gateCodes({
      registrationStart: '2026-10-01',
      registrationEnd: '2026-10-20',
      lifecycle: 'withdrawn',
    });
    expect(gates.find((g) => g.code === 'announcement_withdrawn')?.passed).toBe(
      false,
    );
  });
});

describe('降级闸门：核对超期（新鲜度）', () => {
  const openWindow = {
    registrationStart: '2026-10-01',
    registrationEnd: '2026-11-15',
  };

  it('在报窗口常规期：核对时间超过 72 小时 → evidence_stale 失败', () => {
    const gates = gateCodes({
      ...openWindow,
      checkedAt: isoHoursFromNow(-(FRESHNESS_MAX_AGE_HOURS + 1)),
    });
    expect(gates.find((g) => g.code === 'evidence_stale')?.passed).toBe(false);
  });

  it('在报窗口常规期：72 小时内核对 → 通过', () => {
    const gates = gateCodes({
      ...openWindow,
      checkedAt: isoHoursFromNow(-(FRESHNESS_MAX_AGE_HOURS - 1)),
    });
    expect(gates.find((g) => g.code === 'evidence_stale')?.passed).toBe(true);
  });

  it('距截止 ≤72 小时：核对超过 24 小时即失败（提高频率）', () => {
    const nearEnd = isoHoursFromNow(NEAR_DEADLINE_WINDOW_HOURS - 1);
    const gates = gateCodes({
      registrationStart: isoHoursFromNow(-24 * 5),
      registrationEnd: nearEnd,
      checkedAt: isoHoursFromNow(
        -(FRESHNESS_NEAR_DEADLINE_MAX_AGE_HOURS + 1),
      ),
    });
    const stale = gates.find((g) => g.code === 'evidence_stale');
    expect(stale?.passed).toBe(false);
    expect(stale?.reason).toContain('24 小时');
  });

  it('已截止/预告记录不按在报频率卡新鲜度', () => {
    const closed = gateCodes({
      registrationStart: '2026-09-01',
      registrationEnd: '2026-09-20',
      checkedAt: '2026-01-01T00:00:00+08:00',
    });
    expect(closed.find((g) => g.code === 'evidence_stale')?.passed).toBe(true);

    const preview = gateCodes({ checkedAt: '2026-01-01T00:00:00+08:00' });
    expect(preview.find((g) => g.code === 'evidence_stale')?.passed).toBe(true);
  });
});
