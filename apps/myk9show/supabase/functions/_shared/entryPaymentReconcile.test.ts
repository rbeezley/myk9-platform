import { describe, it, expect } from 'vitest';
import { reconcileEntryPaymentRequest } from './entryPaymentReconcile';

const base = {
  linkStatus: 'open',
  sessionPaymentStatus: 'paid',
  expectedEntryIds: ['mailin', 'wl'],
  paymentIntentId: 'pi_123',
  entries: [
    { id: 'mailin', payment_status: 'pending', entry_status: 'submitted' },
    { id: 'wl', payment_status: 'pending', entry_status: 'pending-payment' },
  ],
};

describe('reconcileEntryPaymentRequest', () => {
  it('flips unpaid entries to paid + online (the payout stamp cron-process-payouts requires)', () => {
    const r = reconcileEntryPaymentRequest(base);
    expect(r.action).toBe('apply');
    const mailin = r.patches.find(p => p.id === 'mailin')!;
    expect(mailin.payment_status).toBe('paid');
    // payment_method MUST be 'online' or calculateShowPayoutCents skips it and
    // the club is never paid (Task 1 finding).
    expect(mailin.payment_method).toBe('online');
    expect(mailin.stripe_payment_intent_id).toBe('pi_123');
  });

  it('advances a promoted waitlist entry pending-payment → confirmed, but leaves a mail-in entry_status alone', () => {
    const r = reconcileEntryPaymentRequest(base);
    const wl = r.patches.find(p => p.id === 'wl')!;
    expect(wl.entry_status).toBe('confirmed');
    const mailin = r.patches.find(p => p.id === 'mailin')!;
    expect(mailin.entry_status).toBeUndefined(); // money changed, lifecycle didn't
  });

  it('skips (idempotent) when the link is no longer open (replay / already processed)', () => {
    const r = reconcileEntryPaymentRequest({ ...base, linkStatus: 'paid' });
    expect(r.action).toBe('skip');
    expect(r.skipReason).toBe('link_not_open');
    expect(r.patches).toHaveLength(0);
  });

  it('revives a paid waitlist promotion that races the expiry cron latch', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      linkStatus: 'expired',
      expectedEntryIds: ['wl'],
      entries: [{ id: 'wl', payment_status: 'pending', entry_status: 'promotion-expired' }],
    });

    expect(r.action).toBe('apply');
    expect(r.inactiveEntryIds).toEqual([]);
    expect(r.patches).toEqual([
      {
        id: 'wl',
        payment_status: 'paid',
        payment_method: 'online',
        stripe_payment_intent_id: 'pi_123',
        entry_status: 'confirmed',
        allowExpiredPromotionClaim: true,
      },
    ]);
  });

  it('skips when the session is not actually paid (async/delayed method) — never marks paid on no money', () => {
    const r = reconcileEntryPaymentRequest({ ...base, sessionPaymentStatus: 'unpaid' });
    expect(r.action).toBe('skip');
    expect(r.skipReason).toBe('not_paid');
    expect(r.patches).toHaveLength(0);
  });

  it('reports entries that were deleted since the link was created (paid-for-nothing → caller alerts)', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ['mailin', 'wl', 'gone'],
      // 'gone' is missing from the loaded entries
    });
    expect(r.missingEntryIds).toEqual(['gone']);
    expect(r.patches.map(p => p.id)).toEqual(['mailin', 'wl']);
  });

  it('reports entries that became inactive since the link was created and does not mark them paid', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ['fresh', 'withdrawn'],
      entries: [
        { id: 'fresh', payment_status: 'pending', entry_status: 'submitted' },
        { id: 'withdrawn', payment_status: 'pending', entry_status: 'withdrawn' },
      ],
    });
    expect(r.patches.map(p => p.id)).toEqual(['fresh']);
    expect(r.inactiveEntryIds).toEqual(['withdrawn']);
  });

  it('flags an already-paid entry as a duplicate-charge candidate, does not re-patch it', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ['fresh', 'dup'],
      entries: [
        { id: 'fresh', payment_status: 'pending', entry_status: 'submitted' },
        { id: 'dup', payment_status: 'paid', entry_status: 'confirmed' },
      ],
    });
    expect(r.patches.map(p => p.id)).toEqual(['fresh']);
    expect(r.alreadyPaidEntryIds).toEqual(['dup']);
    // still 'apply' so the caller marks the link paid + handles the dup refund
    expect(r.action).toBe('apply');
  });

  it('treats a null payment intent as null on the patch (caller alerts; never crashes)', () => {
    const r = reconcileEntryPaymentRequest({ ...base, paymentIntentId: null });
    expect(r.patches[0].stripe_payment_intent_id).toBeNull();
  });
});
