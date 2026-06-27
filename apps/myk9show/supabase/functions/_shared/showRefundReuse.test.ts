import { describe, it, expect } from 'vitest';
import { findReusableShowRefund, showRefundAttemptCount } from './showRefundReuse.ts';

describe('findReusableShowRefund', () => {
  it('reuses a live refund tagged with this show', () => {
    const refunds = [
      { id: 're_other', status: 'succeeded', metadata: { show_refund: 'show_z' } },
      { id: 're_mine', status: 'succeeded', metadata: { show_refund: 'show_a' } },
    ];
    expect(findReusableShowRefund(refunds, 'show_a')?.id).toBe('re_mine');
  });

  it('ignores dead (failed/canceled) refunds so a fresh one is created', () => {
    const refunds = [
      { id: 're_dead', status: 'failed', metadata: { show_refund: 'show_a' } },
      { id: 're_canceled', status: 'canceled', metadata: { show_refund: 'show_a' } },
    ];
    expect(findReusableShowRefund(refunds, 'show_a')).toBeUndefined();
  });

  it('ignores refunds for other shows and per-entry refunds (no show_refund tag)', () => {
    const refunds = [
      { id: 're_entry', status: 'succeeded', metadata: { show_refund: undefined } },
      { id: 're_show_b', status: 'succeeded', metadata: { show_refund: 'show_b' } },
    ];
    expect(findReusableShowRefund(refunds, 'show_a')).toBeUndefined();
  });
});

describe('showRefundAttemptCount', () => {
  it('counts only this show’s prior refunds (live or dead)', () => {
    const refunds = [
      { id: 'r1', status: 'failed', metadata: { show_refund: 'show_a' } },
      { id: 'r2', status: 'succeeded', metadata: { show_refund: 'show_b' } },
      { id: 'r3', status: 'canceled', metadata: { show_refund: 'show_a' } },
    ];
    expect(showRefundAttemptCount(refunds, 'show_a')).toBe(2);
    expect(showRefundAttemptCount(refunds, 'show_b')).toBe(1);
    expect(showRefundAttemptCount(refunds, 'show_c')).toBe(0);
  });
});
