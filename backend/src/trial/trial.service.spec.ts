/**
 * 事件摄取服务测试（v7.0 模块 7）：
 * 白名单、脱敏（拒绝资格原文/证件字段/超长文本）、身份取服务端、
 * once-per-user 去重键与 P2002 幂等。
 */
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { getAuthMode } from '../auth/auth.service.js';
import { REAL_ANNOUNCEMENTS } from '../matching/real-catalog.js';
import { TrialService } from './trial.service.js';

const REAL_UNIT = REAL_ANNOUNCEMENTS[0].versions[0].units[0].id;

function buildFakePrisma() {
  const created: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const trialEvent = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const key = `${String(data.userId)}\u0000${String(data.dedupKey)}`;
      if (data.dedupKey !== null && data.dedupKey !== undefined && seen.has(key)) {
        throw { code: 'P2002' };
      }
      if (data.dedupKey !== null && data.dedupKey !== undefined) seen.add(key);
      created.push(data);
      return data;
    }),
  };
  return { prisma: { trialEvent }, created };
}

function service() {
  const fake = buildFakePrisma();
  const svc = new TrialService(fake.prisma as never);
  return { ...fake, svc };
}

describe('TrialService.ingest', () => {
  it('白名单内事件：身份取服务端参数，dataset 按目录解析，去重键按范围生成', async () => {
    const { svc, created } = service();
    const result = await svc.ingest('user-1', 'user', {
      type: 'opportunity_followed',
      module: 'opportunity',
      unitId: REAL_UNIT,
      at: new Date().toISOString(),
    });
    expect(result).toEqual({ accepted: true });
    const row = created[0] as Record<string, unknown>;
    expect(row.userId).toBe('user-1');
    expect(row.userRole).toBe('user');
    expect(row.authMode).toBe(getAuthMode());
    expect(row.source).toBe('live');
    expect(row.dataset).toBe('real');
    expect(row.dedupKey).toBe(`once:opportunity_followed:${REAL_UNIT}`);
  });

  it('once-per-user：第二台设备重报同事件 → P2002 幂等吞掉，不落第二行', async () => {
    const { svc, created } = service();
    const body = { type: 'profile_completed', module: 'profile' };
    await svc.ingest('user-1', 'user', body);
    const second = await svc.ingest('user-1', 'user', body);
    expect(second).toEqual({ accepted: true, deduped: true });
    expect(created).toHaveLength(1);
  });

  it('画像步去重键包含步号', async () => {
    const { svc, created } = service();
    await svc.ingest('user-1', 'user', {
      type: 'profile_step_completed',
      module: 'profile',
      props: { step: 3 },
    });
    expect(created[0].dedupKey).toBe('once:profile_step_completed:3');
  });

  it('未登记事件类型 / 未登记模块 → 400', async () => {
    const { svc } = service();
    await expect(
      svc.ingest('user-1', 'user', { type: 'extraction_failed', module: 'evidence' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      svc.ingest('user-1', 'user', { type: 'profile_completed', module: 'not_a_module' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('证件字段键名 → 拒绝（sensitive_prop_key），绝不落库', async () => {
    const { svc, created } = service();
    await expect(
      svc.ingest('user-1', 'user', {
        type: 'qualification_supplemented',
        module: 'profile',
        props: { id_card: '3301...' },
      }),
    ).rejects.toThrow('sensitive_prop_key');
    expect(created).toHaveLength(0);
  });

  it('超长字符串值（疑似资格原文粘贴）→ 拒绝', async () => {
    const { svc } = service();
    await expect(
      svc.ingest('user-1', 'user', {
        type: 'qualification_supplemented',
        module: 'profile',
        props: { field_long: 'x'.repeat(65) },
      }),
    ).rejects.toThrow('prop_value_too_long');
  });

  it('非标量值与坏键名 → 拒绝', async () => {
    const { svc } = service();
    await expect(
      svc.ingest('user-1', 'user', {
        type: 'profile_completed',
        module: 'profile',
        props: { nested: { a: 1 } },
      }),
    ).rejects.toThrow('prop_value_not_scalar');
    await expect(
      svc.ingest('user-1', 'user', {
        type: 'profile_completed',
        module: 'profile',
        props: { '9key': 1 },
      }),
    ).rejects.toThrow('bad_prop_key');
  });

  it('发生时间越界：未来 / 超过 90 天 → 400', async () => {
    const { svc } = service();
    await expect(
      svc.ingest('user-1', 'user', {
        type: 'profile_completed',
        module: 'profile',
        at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toThrow('occurred_at_in_future');
    await expect(
      svc.ingest('user-1', 'user', {
        type: 'profile_completed',
        module: 'profile',
        at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toThrow('occurred_at_too_old');
  });

  it('无 unitId 的事件 dataset 为 null，不影响摄取', async () => {
    const { svc, created } = service();
    await svc.ingest('user-1', 'user', {
      type: 'primary_target_set',
      module: 'opportunity',
      unitId: 'unknown-unit',
    });
    expect(created[0].dataset).toBeNull();
    expect(created[0].dedupKey).toBeNull();
  });
});
