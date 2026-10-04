import { describe, it, expect } from 'vitest';
import {
  findReusableRefund,
  refundAttemptCount,
  buildEntryRefundStamp,
  entryRefundMetadata,
} from './refundReuse';
import { refundIsClubFunded } from './orderSnapshot';

describe('entryRefundMetadata (MYK9-997)', () => {
  it('tags the entry for reuse AND marks the refund club-funded', () => {
    const metadata = entryRefundMetadata('entry-1');
    expect(metadata).toEqual({ entry_id: 'entry-1', myk9_club_funded: 'true' });
    // A secretary refund is docked from the club's payout: never a platform loss.
    expect(refundIsClubFunded({ metadata })).toBe(true);
    // ...and it is still found by the reuse lookup.
    expect(findReusableRefund([{ id: 're_1', status: 'pending', metadata }], 'entry-1')?.id).toBe(
      're_1'
    );
  });
});

const refund = (id: string, status: string | null, entryId?: string) => ({
  id,
  status,
  metadata: entryId ? { entry_id: entryId } : null,
});

describe('findReusableRefund', () => {
  it('reuses a succeeded refund for the entry', () => {
    const r = refund('re_1', 'succeeded', 'entry-1');
    expect(findReusableRefund([r], 'entry-1')).toBe(r);
  });

  it('reuses an in-flight refund (pending / requires_action)', () => {
    expect(findReusableRefund([refund('re_1', 'pending', 'entry-1')], 'entry-1')?.id).toBe('re_1');
    expect(findReusableRefund([refund('re_2', 'requires_action', 'entry-1')], 'entry-1')?.id).toBe(
      're_2'
    );
  });

  it('does NOT reuse a failed or canceled refund — the customer was never paid', () => {
    expect(findReusableRefund([refund('re_1', 'failed', 'entry-1')], 'entry-1')).toBeUndefined();
    expect(findReusableRefund([refund('re_2', 'canceled', 'entry-1')], 'entry-1')).toBeUndefined();
  });

  it('skips a dead refund but reuses a later live one for the same entry', () => {
    const dead = refund('re_1', 'failed', 'entry-1');
    const live = refund('re_2', 'succeeded', 'entry-1');
    expect(findReusableRefund([dead, live], 'entry-1')).toBe(live);
  });

  it('ignores refunds for other entries and refunds without metadata', () => {
    const other = refund('re_1', 'succeeded', 'entry-2');
    const bare = refund('re_2', 'succeeded');
    expect(findReusableRefund([other, bare], 'entry-1')).toBeUndefined();
  });
});

describe('refundAttemptCount', () => {
  it('counts only this entry refunds — sibling-entry refunds must not shift the key', () => {
    const refunds = [
      refund('re_1', 'failed', 'entry-1'),
      refund('re_2', 'succeeded', 'entry-2'),
      refund('re_3', 'succeeded', 'entry-3'),
    ];
    expect(refundAttemptCount(refunds, 'entry-1')).toBe(1);
    expect(refundAttemptCount(refunds, 'entry-4')).toBe(0);
  });
});

describe('buildEntryRefundStamp', () => {
  it('converts Stripe cents to the NUMERIC-dollars column and flips payment_status', () => {
    const stamp = buildEntryRefundStamp(3000, 'judge change', '2026-06-11T12:00:00Z');
    expect(stamp).toEqual({
      refund_amount: 30,
      refunded_at: '2026-06-11T12:00:00Z',
      refund_notes: 'judge change',
      payment_status: 'refunded',
    });
  });

  it('null-coalesces missing notes', () => {
    expect(buildEntryRefundStamp(500, undefined, 't').refund_notes).toBeNull();
  });
});
