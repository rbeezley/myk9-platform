import { describe, it, expect } from 'vitest';
import { decideRefundStampGuard } from './entryRefundStampGuard';

describe('decideRefundStampGuard', () => {
  it('treats a zero-row match with no DB error as an already-stamped no-op, not a failure (MP-09: concurrent show-level refund stamped the entry first)', () => {
    const d = decideRefundStampGuard({ hasUpdateError: false, matchedEntryCount: 0 });
    expect(d).toEqual({ action: 'already_stamped_elsewhere' });
  });

  it('does NOT overwrite the existing stamp — the guard only reports the outcome, callers apply no further write on a zero-row match', () => {
    // Documents the contract: 'already_stamped_elsewhere' carries no patch to
    // apply. There is nothing else for a caller to write.
    const d = decideRefundStampGuard({ hasUpdateError: false, matchedEntryCount: 0 });
    expect(d.action).toBe('already_stamped_elsewhere');
    expect(Object.keys(d)).toEqual(['action']);
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
