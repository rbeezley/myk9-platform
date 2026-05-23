import { describe, expect, it } from 'vitest';
import {
  countAttention,
  emptyAttentionCounts,
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

  it('returns null for entries with all status fields missing', () => {
    expect(getEntryAttention({})).toBe(null);
    expect(getEntryAttention({ entry_status: null, check_in_status: null })).toBe(null);
  });

  it("returns 'pending_review' when entry_status='submitted'", () => {
    expect(getEntryAttention({ entry_status: 'submitted' })).toBe('pending_review');
  });

  it("does not flag check_in_status='conflict' as secretary attention (myK9Q owns that signal)", () => {
    expect(getEntryAttention({ entry_status: 'accepted', check_in_status: 'conflict' })).toBe(
      null
    );
  });

  it("still flags pending_review when submitted entry also has a check-in conflict", () => {
    expect(
      getEntryAttention({ entry_status: 'submitted', check_in_status: 'conflict' })
    ).toBe('pending_review');
  });

  it('returns null for unknown statuses (does not throw)', () => {
    expect(getEntryAttention({ entry_status: 'pending_review' })).toBe(null);
    expect(getEntryAttention({ entry_status: 'conflict' })).toBe(null);
    expect(getEntryAttention({ entry_status: 'mystery', check_in_status: 'mystery' })).toBe(null);
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
    ];
    expect(countAttention(entries)).toEqual({
      pending_review: 3,
      total: 3,
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
