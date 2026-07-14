import { describe, it, expect } from 'vitest';
import {
  getPendingResultLabel,
  getRemovedStateLabel,
  isPastTrialDate,
  type EntryPaymentStatus,
} from './entryResultDisplay';
import type { EntryStatus } from '@/types/entry-lifecycle';

describe('getRemovedStateLabel', () => {
  function entry(entryStatus: EntryStatus, paymentStatus: EntryPaymentStatus) {
    return { entryStatus, paymentStatus };
  }

  it('labels a withdrawn entry "Withdrawn"', () => {
    expect(getRemovedStateLabel(entry('withdrawn', 'paid'))).toBe('Withdrawn');
  });

  it('appends the refund state for a withdrawn + refunded entry (the P1-04 seam)', () => {
    expect(getRemovedStateLabel(entry('withdrawn', 'refunded'))).toBe('Withdrawn · Refunded');
  });

  it('distinguishes a partial refund (runtime value the store type denies exists)', () => {
    expect(getRemovedStateLabel(entry('withdrawn', 'partial_refund'))).toBe(
      'Withdrawn · Partial refund'
    );
  });

  it('labels a scratched entry, with refund suffix when refunded', () => {
    expect(getRemovedStateLabel(entry('scratched', 'paid'))).toBe('Scratched');
    expect(getRemovedStateLabel(entry('scratched', 'refunded'))).toBe('Scratched · Refunded');
  });

  it('labels a declined entry "Not accepted"', () => {
    expect(getRemovedStateLabel(entry('not_accepted', 'pending'))).toBe('Not accepted');
  });

  it('returns null for live, non-terminal entries so the caller falls through', () => {
    expect(getRemovedStateLabel(entry('confirmed', 'paid'))).toBeNull();
    expect(getRemovedStateLabel(entry('confirmed', 'pending'))).toBeNull();
    expect(getRemovedStateLabel(entry('checked-in', 'paid'))).toBeNull();
  });

  it('does not treat "absent" as a removal state (it flows through result rendering)', () => {
    expect(getRemovedStateLabel(entry('absent', 'paid'))).toBeNull();
  });

  it('does not label a "moved" source row — that de-dup belongs to the move-up seam', () => {
    expect(getRemovedStateLabel(entry('moved', 'waived'))).toBeNull();
  });
});

describe('getPendingResultLabel', () => {
  const future = '2999-01-01';
  const past = '2000-01-01';

  it('returns null once a result exists', () => {
    expect(
      getPendingResultLabel({ hasResult: true, result: { qualified: true }, trialDate: past })
    ).toBeNull();
  });

  it('says "Upcoming" before the trial date', () => {
    expect(getPendingResultLabel({ hasResult: false, trialDate: future })).toBe('Upcoming');
  });

  it('says "Awaiting results" after the trial date with no result', () => {
    expect(getPendingResultLabel({ hasResult: false, trialDate: past })).toBe('Awaiting results');
  });
});

describe('isPastTrialDate', () => {
  it('is false for an unparseable date (fail-safe to not-past)', () => {
    expect(isPastTrialDate('not-a-date')).toBe(false);
  });
});
