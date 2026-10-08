import { describe, expect, it } from 'vitest';
import { REAL_COVERAGE } from './coverage.js';
import {
  REAL_ANNOUNCEMENTS,
  REAL_ANNOUNCEMENT_IDS,
  REAL_CATALOG_VERSION,
  REAL_CHECKED_AT,
} from './real-catalog.js';
import { buildCandidates, isValidOpportunity } from './engine.js';
import type { UserRecruitmentProfile } from './types.js';

const PROFILE: UserRecruitmentProfile = {
  regions: [
    { code: '330000', province: '浙江省', level: 'required' },
    { code: '320000', province: '江苏省', level: 'consider' },
  ],
  educationLevel: 'bachelor',
  degree: 'bachelor',
  majorFullName: '汉语言文学（师范）',
  graduationDate: '2026-06-30',
  employmentStatus: 'fresh_unemployed',
  socialSecurityMonths: 0,
  teacherCert: { status: 'obtained', subject: 'chinese', stage: 'middle' },
  acceptedEmploymentNatures: [
    'public_institution_staff',
    'record_filing',
    'post_quota',
    'headcount_control',
    'other',
  ],
};

const candidates = buildCandidates(
  REAL_ANNOUNCEMENTS,
  PROFILE,
  REAL_CHECKED_AT,
);

function of(announcementId: string) {
  return candidates.filter((c) => c.announcement.id === announcementId);
}

describe('真实台账：3 条杭州/宁波公告的结构与证据', () => {
  it('台账含 3 条公告、4 个语文报考单元，全部标记 real + AI 初核待复核', () => {
    expect(REAL_ANNOUNCEMENTS).toHaveLength(3);
    expect(candidates).toHaveLength(4);
    for (const a of REAL_ANNOUNCEMENTS) {
      expect(a.dataset).toBe('real');
      expect(a.reviewStatus).toBe('ai_reviewed_pending');
      expect(a.reviewedBy).toBeNull();
      expect(a.sourceHealth?.ok).toBe(true);
      expect(a.officialUrl).toMatch(/\.gov\.cn\//);
    }
    expect(REAL_CATALOG_VERSION).toMatch(/^kb-real-catalog-/);
  });

  it('鄞州预告：报名时间留空、registration_unconfirmed 失败；语文岗 7 人且锚定岗位表序号1', () => {
    const list = of(REAL_ANNOUNCEMENT_IDS.yinzhouPreview);
    expect(list).toHaveLength(1);
    const c = list[0]!;
    expect(c.unit.headcount).toBe(7);
    expect(c.version.timeline.registrationEnd).toBeUndefined();
    expect(
      c.match.gates.find((g) => g.code === 'registration_unconfirmed')?.passed,
    ).toBe(false);
    expect(
      c.match.gates.find((g) => g.code === 'registration_closed')?.passed,
    ).toBe(true);
    expect(c.unit.sourceRow?.locator.kind).toBe('url');
    expect(c.unit.sourceRow?.excerpt).toContain('7');
    if (c.unit.sourceRow?.locator.kind === 'url') {
      expect(c.unit.sourceRow.locator.anchor).toContain('序号1');
      expect(c.unit.sourceRow.locator.url).toContain('download');
    }
  });

  it('杭州 4 月批次：2 个高中语文单元（4 人/1 人），报名已截止，岗位表序号 5/6', () => {
    const list = of(REAL_ANNOUNCEMENT_IDS.hangzhou202604);
    expect(list.map((c) => c.unit.headcount).sort((a, b) => a - b)).toEqual([1, 4]);
    for (const c of list) {
      expect(
        c.match.gates.find((g) => g.code === 'registration_closed')?.passed,
      ).toBe(false);
      expect(c.unit.registerUrl).toBe('https://jszp.hzedu.gov.cn/');
      if (c.unit.sourceRow?.locator.kind === 'url') {
        expect(c.unit.sourceRow.locator.anchor).toMatch(/序号[56]/);
      }
    }
  });

  it('宁波直属 7 月批次：宁外高中语文 2 人，报名已截止，报名入口为教育考试院链接', () => {
    const list = of(REAL_ANNOUNCEMENT_IDS.ningbo202607);
    expect(list).toHaveLength(1);
    const c = list[0]!;
    expect(c.unit.headcount).toBe(2);
    expect(c.unit.registerUrl).toContain('nbeea.nbedu.net.cn');
    expect(
      c.match.gates.find((g) => g.code === 'registration_closed')?.passed,
    ).toBe(false);
  });

  it('全部真实单元当前均不进有效推荐（闸门失败），且失败原因可解释', () => {
    for (const c of candidates) {
      expect(isValidOpportunity(c.match)).toBe(false);
      const failed = c.match.gates.filter((g) => !g.passed);
      expect(failed.length).toBeGreaterThan(0);
      for (const gate of failed) expect(gate.reason.length).toBeGreaterThan(5);
      // AI 初核证据一律不允许冒充 official
      expect(c.version.officialSource.state).not.toBe('official');
      expect(
        c.unit.requirements.every((r) => r.evidence.state === 'ai_extracted'),
      ).toBe(true);
    }
  });

  it('覆盖事实源：杭州/宁波已监测、当前 0 个在报、最近核对 2026-10-06', () => {
    expect(REAL_COVERAGE.status).toBe('monitoring_no_open');
    expect(REAL_COVERAGE.openOpportunityCount).toBe(0);
    expect(REAL_COVERAGE.lastCheckedAt.startsWith('2026-10-06')).toBe(true);
    const codes = REAL_COVERAGE.regions.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['330100', '330200']));
    expect(REAL_COVERAGE.scopeNote).toContain('暂未收录');
  });
});
