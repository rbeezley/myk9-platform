import { describe, expect, it, vi } from 'vitest';
import {
  decideLostClaim,
  decideSubmittedCartRecovery,
  recoverSubmittedCart,
} from './paidCartClaim';

const base = {
  paidSessionId: 'cs_paid',
  cartSessionId: 'cs_paid',
  cartUpdatedAt: '2026-09-28T12:00:00Z',
  nowIso: '2026-09-28T12:01:00Z',
};

describe('decideSubmittedCartRecovery', () => {
  it('retries a recent same-session claim while its first worker may be running', () => {
    expect(decideSubmittedCartRecovery(base)).toEqual({ action: 'retry' });
  });

  it('reclaims a crashed same-session cart after the worker lease', () => {
    expect(decideSubmittedCartRecovery({ ...base, nowIso: '2026-09-28T12:16:00Z' })).toEqual({
      action: 'reclaim',
    });
  });

  it('refunds a distinct paid session after a different session claimed the cart', () => {
    expect(decideSubmittedCartRecovery({ ...base, cartSessionId: 'cs_other' })).toEqual({
      action: 'refund',
    });
  });
});

describe('recoverSubmittedCart', () => {
  const deps = () => ({
    orderExists: vi.fn().mockResolvedValue(false),
    intentHasEntries: vi.fn().mockResolvedValue(false),
    alertPartial: vi.fn().mockResolvedValue(undefined),
    refundDuplicate: vi.fn().mockResolvedValue(undefined),
    releaseStaleClaim: vi.fn().mockResolvedValue(true),
  });

  it('resumes fulfilment after a crash between claim and first entry insert', async () => {
    const callbacks = deps();
    expect(await recoverSubmittedCart({ ...base, nowIso: '2026-09-28T12:16:00Z' }, callbacks)).toBe(
      'resume'
    );
    expect(callbacks.releaseStaleClaim).toHaveBeenCalledWith('2026-09-28T12:01:00.000Z');
    expect(callbacks.refundDuplicate).not.toHaveBeenCalled();
  });

  it('refunds only a genuinely different paid Session', async () => {
    const callbacks = deps();
    expect(await recoverSubmittedCart({ ...base, cartSessionId: 'cs_other' }, callbacks)).toBe(
      'handled'
    );
    expect(callbacks.refundDuplicate).toHaveBeenCalledOnce();
    expect(callbacks.releaseStaleClaim).not.toHaveBeenCalled();
  });

  it('does not resume or refund a Session with entries already inserted', async () => {
    const callbacks = deps();
    callbacks.intentHasEntries.mockResolvedValue(true);
    expect(await recoverSubmittedCart({ ...base, nowIso: '2026-09-28T12:16:00Z' }, callbacks)).toBe(
      'handled'
    );
    expect(callbacks.alertPartial).toHaveBeenCalledOnce();
    expect(callbacks.releaseStaleClaim).not.toHaveBeenCalled();
    expect(callbacks.refundDuplicate).not.toHaveBeenCalled();
  });
});

describe('decideLostClaim', () => {
  it.each(['submitted', 'active', 'expired'])('retries while the cart is %s', status => {
    expect(decideLostClaim(status)).toBe('retry');
  });

  it.each(['abandoned', 'cancelled', null, undefined])(
    'refunds a paid session on a cart that is %s',
    status => {
      expect(decideLostClaim(status)).toBe('refund');
    }
  );
});
