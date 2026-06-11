import { describe, it, expect } from 'vitest';
import { findReusableRefund } from './refundReuse';

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
    expect(
      findReusableRefund([refund('re_2', 'requires_action', 'entry-1')], 'entry-1')?.id
    ).toBe('re_2');
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
