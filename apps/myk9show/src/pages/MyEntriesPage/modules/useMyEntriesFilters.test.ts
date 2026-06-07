import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { useMyEntriesFilters } from './useMyEntriesFilters';
import type { MyEntry } from './my-entries-types';

// The hook reads `new Date()` internally; pin the clock so the test is
// deterministic regardless of when it runs.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 2, 12, 0, 0)); // Jun 2 2026, noon local
});
afterEach(() => {
  vi.useRealTimers();
});

function makeEntry(overrides: Partial<MyEntry>): MyEntry {
  return {
    id: 'entry',
    registrationId: 'reg',
    showId: 'show',
    showName: 'Show',
    showDate: new Date(2026, 5, 2),
    location: { venue: '', city: '', state: '' },
    dogName: 'Dog',
    dogId: 'dog',
    classes: [],
    totalFee: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date(2026, 4, 1),
    lastUpdated: new Date(2026, 4, 1),
    ...overrides,
  };
}

// A multi-day show that started before today but is still running (ends in the
// future) must behave like the summary cards: upcoming, not completed.
const runningTodayShow = makeEntry({
  id: 'running',
  showId: 'running-show',
  showDate: new Date(2026, 4, 31), // started May 31
  showEndDate: new Date(2026, 5, 14), // ends Jun 14 (well after "now")
  entryStatus: EntryStatus.ACCEPTED,
});

const endedShow = makeEntry({
  id: 'ended',
  showId: 'ended-show',
  showDate: new Date(2026, 4, 14),
  showEndDate: new Date(2026, 4, 16), // ended May 16
  entryStatus: EntryStatus.ACCEPTED,
});

describe('useMyEntriesFilters tab filtering (date-range aware)', () => {
  it('keeps a show running today in the Upcoming tab', () => {
    const { result } = renderHook(() =>
      useMyEntriesFilters({ entries: [runningTodayShow, endedShow] })
    );
    act(() => result.current.setSelectedTab('upcoming'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['running']);
  });

  it('keeps future entries in the Upcoming tab even when they still need action', () => {
    const pendingFutureEntry = makeEntry({
      id: 'pending-future',
      showId: 'headline-show',
      showDate: new Date(2026, 5, 9),
      entryStatus: EntryStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
    });

    const { result } = renderHook(() =>
      useMyEntriesFilters({ entries: [pendingFutureEntry, endedShow] })
    );
    act(() => result.current.setSelectedTab('upcoming'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['pending-future']);
  });

  it('puts only genuinely-ended shows in the Completed tab', () => {
    const { result } = renderHook(() =>
      useMyEntriesFilters({ entries: [runningTodayShow, endedShow] })
    );
    act(() => result.current.setSelectedTab('completed'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['ended']);
  });

  it('derives current summary counts and amount due from non-past entries once', () => {
    const acceptedUnpaidCurrent = makeEntry({
      id: 'accepted-unpaid-current',
      showId: 'accepted-unpaid-show',
      showDate: new Date(2026, 5, 9),
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PENDING,
      totalFee: 25,
    });
    const acceptedPaidCurrent = makeEntry({
      id: 'accepted-paid-current',
      showId: 'accepted-paid-show',
      showDate: new Date(2026, 5, 10),
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PAID_ONLINE,
      totalFee: 10,
    });
    const pendingReviewCurrent = makeEntry({
      id: 'pending-review-current',
      showId: 'pending-review-show',
      showDate: new Date(2026, 5, 11),
      entryStatus: EntryStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      totalFee: 30,
    });
    const waitlistCurrent = makeEntry({
      id: 'waitlist-current',
      showId: 'waitlist-show',
      showDate: new Date(2026, 5, 12),
      entryStatus: EntryStatus.WAITLIST,
      paymentStatus: PaymentStatus.PENDING,
      totalFee: 40,
    });
    const acceptedUnpaidPast = makeEntry({
      id: 'accepted-unpaid-past',
      showId: 'accepted-unpaid-past-show',
      showDate: new Date(2026, 4, 1),
      showEndDate: new Date(2026, 4, 2),
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PENDING,
      totalFee: 50,
    });

    const { result } = renderHook(() =>
      useMyEntriesFilters({
        entries: [
          acceptedUnpaidCurrent,
          acceptedPaidCurrent,
          pendingReviewCurrent,
          waitlistCurrent,
          acceptedUnpaidPast,
        ],
      })
    );

    expect(result.current.entryStats.currentAcceptedEntries).toBe(2);
    expect(result.current.entryStats.currentPendingEntries).toBe(1);
    expect(result.current.entryStats.currentFees).toBe(65);
    expect(result.current.entryStats.currentAmountDue).toBe(25);
  });
});
