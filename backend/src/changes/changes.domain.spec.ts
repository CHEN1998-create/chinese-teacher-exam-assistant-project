import { describe, expect, it } from 'vitest';
import {
  baselineStateFor,
  deriveUnitTrust,
  describeTimelineChange,
  diffFollowedAnnouncement,
  maxSeverity,
  noticeStateOf,
  resolveUnitInVersion,
  sameNoticeState,
} from './changes.domain.js';
import type {
  AnnouncementVersion,
  ApplicationUnit,
  RecruitmentAnnouncement,
  Requirement,
} from '../matching/types.js';

const NOW = '2026-10-06T12:00:00+08:00';

function eduReq(): Requirement {
  return {
    id: 'edu',
    dimension: 'education',
    description: '本科及以上学历',
    hard: true,
    criterion: { kind: 'education', minLevel: 'bachelor' },
    evidence: {
      id: 'edu-ev',
      locator: { kind: 'url', url: 'https://gov.example/ann' },
      state: 'official',
      checkedAt: NOW,
    },
  };
}

function ageReq(maxAge: number): Requirement {
  return {
    id: 'age',
    dimension: 'age',
    description: `年龄不超过 ${maxAge} 周岁`,
    hard: true,
    criterion: { kind: 'age', maxAgeYears: maxAge },
    evidence: {
      id: 'age-ev',
      locator: { kind: 'url', url: 'https://gov.example/ann' },
      state: 'official',
      checkedAt: NOW,
    },
  };
}

function makeUnit(
  id: string,
  code: string,
  versionId: string,
  requirements: Requirement[] = [eduReq()],
  headcount = 2,
): ApplicationUnit {
  return {
    id,
    code,
    name: '测试语文岗',
    announcementId: 'ann-x',
    versionId,
    region: { code: '330100', province: '浙江省', city: '杭州市' },
    subject: 'chinese',
    stage: 'middle',
    headcount,
    organizationType: 'government_unified',
    employmentNature: {
      code: 'public_institution_staff',
      officialName: '事业编制',
    },
    allocation: { code: 'direct_school', description: '直接定岗' },
    requirements,
  };
}

function makeVersion(
  versionNumber: number,
  end: string | undefined,
  units: ApplicationUnit[],
  extra: Partial<AnnouncementVersion> = {},
): AnnouncementVersion {
  return {
    id: `ann-x-v${versionNumber}`,
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
        : { registrationStart: '2026-09-01', registrationEnd: end },
    units,
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

// ==================== 基础工具 ====================

describe('noticeStateOf / sameNoticeState', () => {
  it('相同状态返回 true', () => {
    const ann = makeAnnouncement([makeVersion(1, '2026-10-20', [])]);
    const v = ann.versions[0]!;
    const s1 = noticeStateOf(ann, v);
    const s2 = noticeStateOf(ann, v);
    expect(sameNoticeState(s1, s2)).toBe(true);
  });

  it('sourceOk 不同返回 false', () => {
    const ann1 = makeAnnouncement([makeVersion(1, '2026-10-20', [])]);
    const v1 = ann1.versions[0]!;
    const ann2 = makeAnnouncement(
      [makeVersion(1, '2026-10-20', [])],
      { sourceHealth: { ok: false, checkedAt: NOW, failReason: '404' } },
    );
    expect(sameNoticeState(noticeStateOf(ann1, v1), noticeStateOf(ann2, ann2.versions[0]!))).toBe(false);
  });
});

describe('resolveUnitInVersion', () => {
  const v1 = makeVersion(1, '2026-10-10', [
    makeUnit('unit-v1', 'X-1', 'ann-x-v1'),
  ]);
  const v2 = makeVersion(2, '2026-11-10', [
    makeUnit('unit-v2', 'X-1', 'ann-x-v2'),
  ]);

  it('同一版本按 id 命中', () => {
    expect(resolveUnitInVersion(v1, 'unit-v1', v1)?.id).toBe('unit-v1');
  });

  it('跨版本按 code 对齐', () => {
    expect(resolveUnitInVersion(v2, 'unit-v1', v1)?.id).toBe('unit-v2');
  });

  it('岗位被移除返回 undefined', () => {
    const v3 = makeVersion(3, '2026-11-10', [
      makeUnit('unit-v3', 'X-2', 'ann-x-v3'),
    ]);
    expect(resolveUnitInVersion(v3, 'unit-v1', v1)).toBeUndefined();
  });
});

// ==================== 变更检测 ====================

describe('diffFollowedAnnouncement：报名延期', () => {
  it('版本升级 + 报名截止延期 → 时间线变更由事件同步负责；版本检测不重复产出', () => {
    const v1 = makeVersion(1, '2026-10-10', [
      makeUnit('unit-v1', 'X-1', 'ann-x-v1'),
    ]);
    const v2 = makeVersion(2, '2026-11-15', [
      makeUnit('unit-v2', 'X-1', 'ann-x-v2'),
    ], { sourceKind: 'supplement', changeNote: '报名延期至 11 月 15 日' });
    const ann = makeAnnouncement([v1, v2]);

    const changes = diffFollowedAnnouncement({
      announcement: ann,
      previous: baselineStateFor('ann-x-v1', ann),
      current: v2,
      followedUnitId: 'unit-v1',
    });

    // 版本域只关注资格条件 / 招聘人数 / 岗位移除；时间线变化由日程事件同步逐节点通知
    expect(changes.some((c) => c.kind === 'headcount_changed')).toBe(false);
    expect(changes.some((c) => c.kind === 'requirement_modified')).toBe(false);
    expect(changes.some((c) => c.kind === 'unit_removed')).toBe(false);
    expect(changes.length).toBe(0);
  });
});

describe('diffFollowedAnnouncement：公告取消', () => {
  it('lifecycle active → withdrawn → 必须处理通知', () => {
    const v1 = makeVersion(1, '2026-10-10', [
      makeUnit('unit-v1', 'X-1', 'ann-x-v1'),
    ]);
    const ann = makeAnnouncement([v1], { lifecycle: 'withdrawn' });

    const changes = diffFollowedAnnouncement({
      announcement: ann,
      // 用户上次被通知到时公告仍有效（持久基线）
      previous: { versionId: 'ann-x-v1', lifecycle: 'active', sourceOk: true },
      current: v1,
      followedUnitId: 'unit-v1',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('announcement_withdrawn');
    expect(changes[0]!.severity).toBe('must_handle');
    expect(changes[0]!.impact).toContain('取消');
  });
});

describe('diffFollowedAnnouncement：来源失效', () => {
  it('sourceHealth ok → not ok → 必须处理通知 + 信息不作为官方结论', () => {
    const v1 = makeVersion(1, '2026-10-10', [
      makeUnit('unit-v1', 'X-1', 'ann-x-v1'),
    ]);
    const ann = makeAnnouncement([v1], {
      sourceHealth: { ok: false, checkedAt: NOW, failReason: 'HTTP 404' },
    });

    const changes = diffFollowedAnnouncement({
      announcement: ann,
      // 用户上次被通知到时来源正常（持久基线）
      previous: { versionId: 'ann-x-v1', lifecycle: 'active', sourceOk: true },
      current: v1,
      followedUnitId: 'unit-v1',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('source_unavailable');
    expect(changes[0]!.severity).toBe('must_handle');
    expect(changes[0]!.nextStep).toContain('恢复');
    expect(changes[0]!.impact).toContain('不作为官方结论');
  });

  it('来源恢复 → info 通知', () => {
    const v1 = makeVersion(1, '2026-10-10', [
      makeUnit('unit-v1', 'X-1', 'ann-x-v1'),
    ]);
    const annOk = makeAnnouncement([v1]);

    const changes = diffFollowedAnnouncement({
      announcement: annOk,
      previous: { versionId: 'ann-x-v1', lifecycle: 'active', sourceOk: false },
      current: v1,
      followedUnitId: 'unit-v1',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('source_recovered');
    expect(changes[0]!.severity).toBe('info');
  });
});

describe('diffFollowedAnnouncement：资格条件变化', () => {
  it('新增年龄限制 → must_handle', () => {
    const v1 = makeVersion(1, '2026-10-10', [
      makeUnit('unit-v1', 'X-1', 'ann-x-v1', [eduReq()]),
    ]);
    const v2 = makeVersion(2, '2026-10-10', [
      makeUnit('unit-v2', 'X-1', 'ann-x-v2', [eduReq(), ageReq(30)]),
    ]);
    const ann = makeAnnouncement([v1, v2]);

    const changes = diffFollowedAnnouncement({
      announcement: ann,
      previous: baselineStateFor('ann-x-v1', ann),
      current: v2,
      followedUnitId: 'unit-v1',
    });

    const age = changes.find((c) => c.kind === 'requirement_added');
    expect(age).toBeDefined();
    expect(age!.severity).toBe('must_handle');
    expect(age!.impact).toContain('匹配结论可能变化');
  });

  it('招聘条件修改 → must_handle', () => {
    const v1 = makeVersion(1, '2026-10-10', [
      makeUnit('unit-v1', 'X-1', 'ann-x-v1', [ageReq(30)]),
    ]);
    const v2 = makeVersion(2, '2026-10-10', [
      makeUnit('unit-v2', 'X-1', 'ann-x-v2', [ageReq(35)]),
    ]);
    const ann = makeAnnouncement([v1, v2]);

    const changes = diffFollowedAnnouncement({
      announcement: ann,
      previous: baselineStateFor('ann-x-v1', ann),
      current: v2,
      followedUnitId: 'unit-v1',
    });

    const mod = changes.find((c) => c.kind === 'requirement_modified');
    expect(mod).toBeDefined();
    expect(mod!.oldValue).toContain('30');
    expect(mod!.newValue).toContain('35');
  });
});

describe('diffFollowedAnnouncement：岗位移除', () => {
  it('旧版有、新版无 → unit_removed', () => {
    const v1 = makeVersion(1, '2026-10-10', [
      makeUnit('unit-v1', 'X-1', 'ann-x-v1'),
    ]);
    const v2 = makeVersion(2, '2026-10-10', [
      makeUnit('unit-v2', 'X-2', 'ann-x-v2'),
    ]);
    const ann = makeAnnouncement([v1, v2]);

    const changes = diffFollowedAnnouncement({
      announcement: ann,
      previous: baselineStateFor('ann-x-v1', ann),
      current: v2,
      followedUnitId: 'unit-v1',
    });

    expect(changes.some((c) => c.kind === 'unit_removed')).toBe(true);
    expect(changes.find((c) => c.kind === 'unit_removed')!.severity).toBe('must_handle');
  });
});

describe('diffFollowedAnnouncement：旧版本缺失', () => {
  it('旧版本不可追溯 → 只提示有新版，不臆造差异', () => {
    const v2 = makeVersion(2, '2026-11-15', [
      makeUnit('unit-v2', 'X-1', 'ann-x-v2'),
    ]);
    const ann = makeAnnouncement([v2]);

    const changes = diffFollowedAnnouncement({
      announcement: ann,
      previous: { versionId: 'ann-x-v1', lifecycle: 'active', sourceOk: true },
      current: v2,
      followedUnitId: 'unit-v1',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('version_updated');
    expect(changes[0]!.nextStep).toContain('逐条确认');
    expect(changes[0]!.oldValue).toContain('不可追溯');
  });
});

// ==================== 时间线变更描述 ====================

describe('describeTimelineChange', () => {
  it('报名截止延期 → 影响 + 下一步', () => {
    const d = describeTimelineChange('registration_end', '2026-10-10', '2026-11-15');
    expect(d.impact).toContain('延长');
    expect(d.nextStep).toContain('新的截止时间');
  });

  it('已公布 → 待官方通知（撤回）', () => {
    const d = describeTimelineChange('written_exam', '2026-10-10', null);
    expect(d.impact).toContain('撤回');
    expect(d.nextStep).toContain('等待官方另行通知');
  });

  it('待官方通知 → 已公布（明确）', () => {
    const d = describeTimelineChange('registration_end', null, '2026-10-10');
    expect(d.impact).toContain('已由官方明确');
    expect(d.nextStep).toContain('日程安排');
  });
});

// ==================== 降级可信状态 ====================

describe('deriveUnitTrust', () => {
  it('正常公告 → ok', () => {
    const t = deriveUnitTrust(makeAnnouncement([makeVersion(1, '2026-10-10', [])]));
    expect(t.state).toBe('ok');
  });

  it('公告取消 → withdrawn', () => {
    const t = deriveUnitTrust(makeAnnouncement([], { lifecycle: 'withdrawn' }));
    expect(t.state).toBe('withdrawn');
    expect(t.label).toBe('公告已取消');
    expect(t.detail).toContain('历史留档');
  });

  it('来源失效 → source_unavailable', () => {
    const t = deriveUnitTrust(
      makeAnnouncement([], {
        sourceHealth: { ok: false, checkedAt: NOW, failReason: '404' },
      }),
    );
    expect(t.state).toBe('source_unavailable');
    expect(t.detail).toContain('不作为官方结论');
  });

  it('待人工复核 → pending_review', () => {
    const t = deriveUnitTrust(
      makeAnnouncement([], { reviewStatus: 'ai_reviewed_pending' }),
    );
    expect(t.state).toBe('pending_review');
  });
});

describe('maxSeverity', () => {
  it('混合级别取最高（最小 rank）', () => {
    const changes = [
      { severity: 'info' as const },
      { severity: 'suggest_handle' as const },
      { severity: 'must_handle' as const },
    ];
    expect(maxSeverity(changes)).toBe('must_handle');
  });
});
