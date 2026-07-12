import { describe, expect, it } from 'vitest';
import {
  countAttention,
  emptyAttentionCounts,
  getClassAttention,
  getEntryAttention,
  type EntryLike,
} from '../attention';

describe('getEntryAttention', () => {
  it('returns null for entries with no attention-worthy status', () => {
    expect(getEntryAttention({ entry_status: 'accepted', check_in_status: 'checked-in' })).toBe(
      null
    );
    expect(getEntryAttention({ entry_status: 'completed' })).toBe(null);
    expect(getEntryAttention({ entry_status: 'withdrawn' })).toBe(null);
  });

  it('matches Entry Management by putting blank statuses in the pending bucket', () => {
    expect(getEntryAttention({})).toBe('pending_review');
    expect(getEntryAttention({ entry_status: null, check_in_status: null })).toBe('pending_review');
  });

  it("returns 'pending_review' for the Entry Management pending bucket", () => {
    expect(getEntryAttention({ entry_status: 'submitted' })).toBe('pending_review');
    expect(getEntryAttention({ entry_status: 'paid' })).toBe('pending_review');
    expect(getEntryAttention({ entry_status: 'promotion-expired' })).toBe('pending_review');
  });

  it("does not flag check_in_status='conflict' as secretary attention (myK9Q owns that signal)", () => {
    expect(getEntryAttention({ entry_status: 'accepted', check_in_status: 'conflict' })).toBe(null);
  });

  it('still flags pending_review when submitted entry also has a check-in conflict', () => {
    expect(getEntryAttention({ entry_status: 'submitted', check_in_status: 'conflict' })).toBe(
      'pending_review'
    );
  });

  it('matches Entry Management by putting unknown statuses in the pending bucket', () => {
    expect(getEntryAttention({ entry_status: 'pending_review' })).toBe('pending_review');
    expect(getEntryAttention({ entry_status: 'conflict' })).toBe('pending_review');
    expect(getEntryAttention({ entry_status: 'mystery', check_in_status: 'mystery' })).toBe(
      'pending_review'
    );
  });
});

describe('countAttention', () => {
  it('returns zeroed counts for empty input', () => {
    expect(countAttention([])).toEqual({
      pending_review: 0,
      total: 0,
    });
  });

  it('aggregates pending_review and ignores conflict-only entries', () => {
    const entries: EntryLike[] = [
      { entry_status: 'submitted' },
      { entry_status: 'submitted' },
      { entry_status: 'submitted', check_in_status: 'conflict' },
      { entry_status: 'accepted', check_in_status: 'conflict' },
      { entry_status: 'accepted', check_in_status: 'checked-in' },
      { entry_status: 'completed' },
      { entry_status: 'paid' },
    ];
    expect(countAttention(entries)).toEqual({
      pending_review: 4,
      total: 4,
    });
  });
});

describe('emptyAttentionCounts', () => {
  it('returns a fresh zeroed object each call', () => {
    const a = emptyAttentionCounts();
    const b = emptyAttentionCounts();
    a.pending_review = 99;
    expect(b.pending_review).toBe(0);
  });
});

describe('getClassAttention', () => {
  it('returns null when reopenedAfterCloseoutAt is null or absent', () => {
    expect(getClassAttention({ reopenedAfterCloseoutAt: null })).toBe(null);
    expect(getClassAttention({})).toBe(null);
  });

  it("returns 'reopened_after_closeout' when a late entry reopened the class", () => {
    expect(getClassAttention({ reopenedAfterCloseoutAt: '2026-07-12T18:00:00Z' })).toBe(
      'reopened_after_closeout'
    );
  });
});
