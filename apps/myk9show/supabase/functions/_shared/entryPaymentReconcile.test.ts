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

  it('settles a move-up payment on the original money root while the checkout line stays on the destination', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ['destination'],
      reconciliationEntryIds: ['source'],
      entries: [
        {
          id: 'destination',
          payment_status: 'pending',
          entry_status: 'confirmed',
          moved_from_entry_id: 'source',
        },
        { id: 'source', payment_status: 'pending', entry_status: 'moved' },
      ],
    });

    expect(r.patches.map(patch => patch.id)).toEqual(['source']);
  });

  it.each([
    ['destination', 'source'],
    ['source', 'destination'],
  ])('settles one canonical root regardless of duplicate line order (%s first)', first => {
    const ids = first === 'destination' ? ['destination', 'source'] : ['source', 'destination'];
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ids,
      reconciliationEntryIds: ['source', 'source'],
      duplicateEntryIds: ['destination'],
      entries: [
        {
          id: 'destination',
          payment_status: 'pending',
          entry_status: 'confirmed',
          moved_from_entry_id: 'source',
        },
        { id: 'source', payment_status: 'pending', entry_status: 'moved' },
      ],
    });

    expect(r.patches.map(patch => patch.id)).toEqual(['source']);
    expect(r.alreadyPaidEntryIds).toEqual(['destination']);
  });

  it('refunds an inactive move-up destination instead of settling its root', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ['destination'],
      reconciliationEntryIds: ['destination'],
      entries: [
        {
          id: 'destination',
          payment_status: 'pending',
          entry_status: 'withdrawn',
          moved_from_entry_id: 'source',
        },
        { id: 'source', payment_status: 'pending', entry_status: 'moved' },
      ],
    });

    expect(r.patches).toEqual([]);
    expect(r.inactiveEntryIds).toEqual(['destination']);
  });

  it('refunds a destination when its move-up money root cannot be read safely', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ['destination'],
      reconciliationEntryIds: ['destination'],
      blockedEntryIds: ['destination'],
      entries: [
        {
          id: 'destination',
          payment_status: 'pending',
          entry_status: 'confirmed',
          moved_from_entry_id: 'deleted-source',
        },
      ],
    });

    expect(r.patches).toEqual([]);
    expect(r.inactiveEntryIds).toEqual([]);
    expect(r.unresolvedEntryIds).toEqual(['destination']);
  });

  it('advances a moved destination lifecycle while stamping its money root', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ['destination'],
      reconciliationEntryIds: ['source'],
      lifecycleEntryIdsByRoot: { source: 'destination' },
      entries: [
        {
          id: 'destination',
          payment_status: 'pending',
          entry_status: 'pending-payment',
          moved_from_entry_id: 'source',
        },
        { id: 'source', payment_status: 'pending', entry_status: 'moved' },
      ],
    });

    expect(r.patches[0]).toMatchObject({ id: 'source', entry_status: 'confirmed' });
    expect(r.patches[0]?.entryStatusEntryId).toBe('destination');
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

  it('treats an already-paid entry stamped by this same payment intent as idempotent success', () => {
    const r = reconcileEntryPaymentRequest({
      ...base,
      expectedEntryIds: ['same-intent'],
      entries: [
        {
          id: 'same-intent',
          payment_status: 'paid',
          entry_status: 'confirmed',
          stripe_payment_intent_id: 'pi_123',
        },
      ],
    });

    expect(r.action).toBe('apply');
    expect(r.patches).toEqual([]);
    expect(r.alreadyPaidEntryIds).toEqual([]);
    expect(r.sameIntentPaidEntryIds).toEqual(['same-intent']);
  });

  it('treats a null payment intent as null on the patch (caller alerts; never crashes)', () => {
    const r = reconcileEntryPaymentRequest({ ...base, paymentIntentId: null });
    expect(r.patches[0].stripe_payment_intent_id).toBeNull();
  });
});
