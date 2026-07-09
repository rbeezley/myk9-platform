import { describe, it, expect } from 'vitest';
import { decideRefundStampGuard, entryHasRefundStamp } from './entryRefundStampGuard';

describe('decideRefundStampGuard', () => {
  it('treats a zero-row match as benign ONLY when the re-read shows an existing refund stamp (MP-09: concurrent show-level refund stamped the entry first)', () => {
    const d = decideRefundStampGuard({
      hasUpdateError: false,
      matchedEntryCount: 0,
      reread: { found: true, hasRefundStamp: true },
    });
    expect(d).toEqual({ action: 'already_stamped_elsewhere' });
  });

  it('does NOT overwrite the existing stamp — the guard only reports the outcome, callers apply no further write on a benign zero-row match', () => {
    // Documents the contract: 'already_stamped_elsewhere' carries no patch to
    // apply. There is nothing else for a caller to write.
    const d = decideRefundStampGuard({
      hasUpdateError: false,
      matchedEntryCount: 0,
      reread: { found: true, hasRefundStamp: true },
    });
    expect(d.action).toBe('already_stamped_elsewhere');
    expect(Object.keys(d)).toEqual(['action']);
  });

  it('reports a real failure when the re-read finds no entry row — the Stripe refund has no local accounting record (deleted entry)', () => {
    const d = decideRefundStampGuard({
      hasUpdateError: false,
      matchedEntryCount: 0,
      reread: { found: false, hasRefundStamp: false },
    });
    expect(d).toEqual({ action: 'record_failure' });
  });

  it('reports a real failure when the re-read row exists but carries no refund stamp — status changed without a stamp', () => {
    const d = decideRefundStampGuard({
      hasUpdateError: false,
      matchedEntryCount: 0,
      reread: { found: true, hasRefundStamp: false },
    });
    expect(d).toEqual({ action: 'record_failure' });
  });

  it('fails closed when a zero-row match has no re-read result at all', () => {
    const d = decideRefundStampGuard({ hasUpdateError: false, matchedEntryCount: 0 });
    expect(d).toEqual({ action: 'record_failure' });
  });

  it('still reports a real failure when the UPDATE itself errored, even with zero matched rows', () => {
    const d = decideRefundStampGuard({ hasUpdateError: true, matchedEntryCount: 0 });
    expect(d).toEqual({ action: 'record_failure' });
  });

  it('reports success on the normal happy path — one row matched, no error', () => {
    const d = decideRefundStampGuard({ hasUpdateError: false, matchedEntryCount: 1 });
    expect(d).toEqual({ action: 'stamped' });
  });
});

describe('entryHasRefundStamp', () => {
  it("recognises the stamp both refund paths write: payment_status 'refunded'", () => {
    expect(entryHasRefundStamp({ payment_status: 'refunded', refund_amount: null })).toBe(true);
  });

  it('recognises a positive refund_amount even if payment_status drifted (numeric and string forms)', () => {
    expect(entryHasRefundStamp({ payment_status: 'paid', refund_amount: 25 })).toBe(true);
    expect(entryHasRefundStamp({ payment_status: 'paid', refund_amount: '25.00' })).toBe(true);
  });

  it('rejects an unstamped entry — paid status with null/zero refund_amount', () => {
    expect(entryHasRefundStamp({ payment_status: 'paid', refund_amount: null })).toBe(false);
    expect(entryHasRefundStamp({ payment_status: 'paid', refund_amount: 0 })).toBe(false);
    expect(entryHasRefundStamp({ payment_status: 'pending', refund_amount: null })).toBe(false);
  });
});
