import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isTerminalStatus,
  validateReview,
} from './corrections.domain.js';

describe('纠错处理状态机（P0-F）', () => {
  it('合法迁移路径：submitted 可到三态，reviewing 只能到终态', () => {
    expect(canTransition('submitted', 'reviewing')).toBe(true);
    expect(canTransition('submitted', 'resolved')).toBe(true);
    expect(canTransition('submitted', 'rejected')).toBe(true);
    expect(canTransition('reviewing', 'resolved')).toBe(true);
    expect(canTransition('reviewing', 'rejected')).toBe(true);
  });

  it('终态不可再迁移；非法来源状态一律拒绝', () => {
    expect(canTransition('resolved', 'reviewing')).toBe(false);
    expect(canTransition('resolved', 'rejected')).toBe(false);
    expect(canTransition('rejected', 'resolved')).toBe(false);
    expect(canTransition('reviewing', 'reviewing')).toBe(false);
    expect(canTransition('not-a-status', 'resolved')).toBe(false);
    expect(isTerminalStatus('resolved')).toBe(true);
    expect(isTerminalStatus('reviewing')).toBe(false);
  });

  it('rejected 必须有非空处理说明；resolved/reviewing 可无说明', () => {
    expect(
      validateReview({ from: 'submitted', to: 'rejected' }).ok,
    ).toBe(false);
    expect(
      validateReview({ from: 'submitted', to: 'resolved' }).ok,
    ).toBe(true);
    expect(
      validateReview({ from: 'submitted', to: 'reviewing' }).ok,
    ).toBe(true);
    const rejected = validateReview({
      from: 'reviewing',
      to: 'rejected',
      reviewNote: '  官方原文未调整  ',
    });
    expect(rejected.ok).toBe(true);
    if (rejected.ok) expect(rejected.note).toBe('官方原文未调整');
  });

  it('处理说明超 500 字拒绝；不能退回 submitted', () => {
    expect(
      validateReview({
        from: 'submitted',
        to: 'resolved',
        reviewNote: '字'.repeat(501),
      }).ok,
    ).toBe(false);
    expect(
      validateReview({ from: 'reviewing', to: 'submitted' }).ok,
    ).toBe(false);
  });
});
