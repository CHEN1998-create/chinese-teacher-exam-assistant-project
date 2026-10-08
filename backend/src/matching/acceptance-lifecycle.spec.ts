import { describe, expect, it } from 'vitest';
import { buildCandidates, isValidOpportunity } from './engine.js';
import type {
  AnnouncementVersion,
  ApplicationUnit,
  RecruitmentAnnouncement,
  Requirement,
  UserRecruitmentProfile,
} from './types.js';

/**
 * 模块 1 验收回放：延期 / 取消 / 来源失效三种变更下，
 * 旧版本必须保留（只追加、supersededAt 留痕），推荐状态必须正确。
 */
const NOW = '2026-10-06T12:00:00+08:00';

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

function eduRequirement(checkedAt: string): Requirement {
  return {
    id: 'edu',
    dimension: 'education',
    description: '本科及以上',
    hard: true,
    criterion: { kind: 'education', minLevel: 'bachelor' },
    evidence: {
      id: 'edu-ev',
      locator: { kind: 'url', url: 'https://gov.example/ann' },
      state: 'official',
      checkedAt,
    },
  };
}

function makeUnit(versionId: string): ApplicationUnit {
  return {
    id: `unit-${versionId}`,
    code: 'X-1',
    name: '测试语文岗',
    announcementId: 'ann-x',
    versionId,
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
    requirements: [eduRequirement(NOW)],
  };
}

function makeVersion(
  versionNumber: number,
  end: string | undefined,
  extra: Partial<AnnouncementVersion> = {},
): AnnouncementVersion {
  const id = `ann-x-v${versionNumber}`;
  const unit = makeUnit(id);
  return {
    id,
    announcementId: 'ann-x',
    versionNumber,
    sourceKind: versionNumber === 1 ? 'original' : 'supplement',
    publishedAt: NOW,
    officialSource: {
      id: `src-v${versionNumber}`,
      locator: { kind: 'url', url: 'https://gov.example/ann' },
      state: 'official',
      checkedAt: NOW,
    },
    timeline:
      end === undefined
        ? { pendingItems: ['具体报名时间另行通知'] }
        : {
            registrationStart: '2026-09-01',
            registrationEnd: end,
          },
    units: [unit],
    ...extra,
  };
}

function makeAnnouncement(
  versions: AnnouncementVersion[],
  extra: Partial<RecruitmentAnnouncement> = {},
): RecruitmentAnnouncement {
  return {
    id: 'ann-x',
    title: '测试公告',
    publisher: '测试教育局',
    organizationType: 'government_unified',
    officialUrl: 'https://gov.example/ann',
    subjectScope: ['chinese'],
    region: { code: '330000', province: '浙江省' },
    lifecycle: 'active',
    firstPublishedAt: NOW,
    reviewStatus: 'human_reviewed',
    versions,
    ...extra,
  };
}

describe('验收回放①：报名延期（补充公告 v2 取代 v1）', () => {
  it('旧版本完整保留且带 supersededAt；推荐只基于新版本，闸门全过', () => {
    const v1 = makeVersion(1, '2026-09-10', {
      publishedAt: '2026-08-01T09:00:00+08:00',
      supersededAt: '2026-09-05T10:00:00+08:00',
      changeNote: '原报名截止 9 月 10 日',
    });
    const v2 = makeVersion(2, '2026-10-20', {
      publishedAt: '2026-09-05T10:00:00+08:00',
      changeNote: '报名延期至 10 月 20 日',
    });
    const announcement = makeAnnouncement([v1, v2]);

    const candidates = buildCandidates([announcement], PROFILE, NOW);
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    // 推荐只认当前版本 v2
    expect(c.version.id).toBe('ann-x-v2');
    expect(c.version.timeline.registrationEnd).toBe('2026-10-20');
    expect(isValidOpportunity(c.match)).toBe(true);

    // 旧版本不删除、不覆盖：v1 留在版本链上并标记被取代时间
    const retainedV1 = announcement.versions.find((v) => v.id === 'ann-x-v1');
    expect(retainedV1).toBeDefined();
    expect(retainedV1!.timeline.registrationEnd).toBe('2026-09-10');
    expect(retainedV1!.supersededAt).toBe('2026-09-05T10:00:00+08:00');
  });
});

describe('验收回放②：公告取消（lifecycle=withdrawn）', () => {
  it('取消后机会不进推荐，旧版本仍保留可追溯', () => {
    const v1 = makeVersion(1, '2026-10-20', {
      publishedAt: '2026-08-01T09:00:00+08:00',
    });
    const announcement = makeAnnouncement([v1], {
      lifecycle: 'withdrawn',
      withdrawnAt: '2026-09-20T15:00:00+08:00',
      withdrawReason: '招聘计划调整，本次招聘取消',
    } as Partial<RecruitmentAnnouncement>);

    const candidates = buildCandidates([announcement], PROFILE, NOW);
    const c = candidates[0]!;
    expect(
      c.match.gates.find((g) => g.code === 'announcement_withdrawn')?.passed,
    ).toBe(false);
    expect(isValidOpportunity(c.match)).toBe(false);
    // 取消的是公告，不是删除数据：版本链与官方链接仍在
    expect(announcement.versions.map((v) => v.id)).toEqual(['ann-x-v1']);
    expect(announcement.officialUrl).toBe('https://gov.example/ann');
  });
});

describe('验收回放③：官方来源失效', () => {
  it('巡检发现来源不可达 → source_unavailable 失败且不进推荐，记录与旧版本保留', () => {
    const v1 = makeVersion(1, '2026-10-20', {
      publishedAt: '2026-08-01T09:00:00+08:00',
    });
    const announcement = makeAnnouncement([v1], {
      sourceHealth: {
        ok: false,
        checkedAt: NOW,
        failReason: '公告页 HTTP 404（2026-10-06 巡检）',
      },
    });

    const candidates = buildCandidates([announcement], PROFILE, NOW);
    const c = candidates[0]!;
    const gate = c.match.gates.find((g) => g.code === 'source_unavailable');
    expect(gate?.passed).toBe(false);
    expect(gate?.reason).toContain('HTTP 404');
    expect(isValidOpportunity(c.match)).toBe(false);
    expect(announcement.versions).toHaveLength(1);

    // 来源恢复后（新一次巡检 ok）同一版本自动重新参与评估，无需改数据
    const recovered = makeAnnouncement(
      [
        makeVersion(1, '2026-10-20', {
          publishedAt: '2026-08-01T09:00:00+08:00',
        }),
      ],
      { sourceHealth: { ok: true, checkedAt: NOW } },
    );
    const candidates2 = buildCandidates([recovered], PROFILE, NOW);
    expect(
      candidates2[0]!.match.gates.find((g) => g.code === 'source_unavailable')
        ?.passed,
    ).toBe(true);
    expect(isValidOpportunity(candidates2[0]!.match)).toBe(true);
  });
});
