import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { useMyEntriesFilters } from './useMyEntriesFilters';
import type { EntryClass, MyEntry } from './my-entries-types';

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
    dogs: [],
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
    expect(result.current.entryStats.currentAmountDue).toBe(55);
  });

  it('counts scored and move-up-requested entries as accepted (exhibitor "in" family)', () => {
    // Audit F2 follow-up: COMPLETED / MOVE_UP_REQUESTED reach My Entries via the
    // shared mapEntryStatus. They are confirmed entries, so the exhibitor's
    // "accepted" stat + tab must include them rather than dropping them.
    const scored = makeEntry({
      id: 'scored',
      showId: 'scored-show',
      entryStatus: EntryStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID_ONLINE,
    });
    const moveUp = makeEntry({
      id: 'move-up',
      showId: 'move-up-show',
      entryStatus: EntryStatus.MOVE_UP_REQUESTED,
      paymentStatus: PaymentStatus.PAID_ONLINE,
    });
    const plainAccepted = makeEntry({
      id: 'plain-accepted',
      showId: 'plain-accepted-show',
      entryStatus: EntryStatus.ACCEPTED,
      paymentStatus: PaymentStatus.PAID_ONLINE,
    });

    const { result } = renderHook(() =>
      useMyEntriesFilters({ entries: [scored, moveUp, plainAccepted] })
    );

    expect(result.current.entryStats.accepted).toBe(3);
    expect(result.current.entryStats.pending).toBe(0);
    expect(result.current.tabCounts.accepted).toBe(3);
    expect(result.current.tabCounts.pending).toBe(0);

    act(() => result.current.setSelectedTab('accepted'));
    expect(result.current.filteredEntries.map(e => e.id).sort()).toEqual([
      'move-up',
      'plain-accepted',
      'scored',
    ]);
  });
});

// Reported 2026-08-19 on /exhibitor/entries against seeded data: the tab strip
// read `Completed 0` while cards on screen carried a "Scored" badge, and
// `Upcoming 68` equalled `All 68`. Two definitions of "done" were in play — the
// card badge reads `entryStatusKind` (myEntriesUtils.getEntryStatusBadge labels
// it "Scored"), the Completed tab read `isPastShowEntry` (show date only). The
// seeded show ends Aug 30 2026 yet already carries scored entries, so a scored
// entry counted as Upcoming. Completed now means scored OR show ended.
// A class row as `groupEntriesByOrder` produces it. `scored` drives both the
// row status and its display kind, mirroring the DB's completed/completed pair.
function makeClass(id: string, scored: boolean): EntryClass {
  return {
    id,
    name: `Class ${id}`,
    number: id,
    fee: 0,
    status: 'entered',
    entryStatus: scored ? EntryStatus.COMPLETED : EntryStatus.ACCEPTED,
    entryStatusKind: scored ? 'completed' : 'accepted',
  };
}

describe('Completed tab agrees with the "Scored" card badge', () => {
  const scoredAtFutureShow = makeEntry({
    id: 'scored-future',
    showId: 'scored-future-show',
    showDate: new Date(2026, 7, 29), // Aug 29 2026 — after the pinned "now"
    showEndDate: new Date(2026, 7, 30),
    entryStatus: EntryStatus.COMPLETED,
    entryStatusKind: 'completed',
    paymentStatus: PaymentStatus.PAID_ONLINE,
  });

  it('places a scored entry at a future-dated show in the Completed tab', () => {
    const { result } = renderHook(() => useMyEntriesFilters({ entries: [scoredAtFutureShow] }));

    expect(result.current.tabCounts.completed).toBe(1);
    expect(result.current.tabCounts.upcoming).toBe(0);

    act(() => result.current.setSelectedTab('completed'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['scored-future']);
  });

  it('keeps a scored future entry out of the Upcoming tab', () => {
    const unscoredFuture = makeEntry({
      id: 'unscored-future',
      showId: 'unscored-future-show',
      showDate: new Date(2026, 7, 29),
      showEndDate: new Date(2026, 7, 30),
    });

    const { result } = renderHook(() =>
      useMyEntriesFilters({ entries: [scoredAtFutureShow, unscoredFuture] })
    );
    act(() => result.current.setSelectedTab('upcoming'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['unscored-future']);
  });

  // The badge is driven by `entryStatusKind`, which folds `check_in_status` in:
  // seeded rows exist at entry_status='confirmed' + check_in_status='completed'
  // and render "Scored". Keying the tab on `entryStatus` alone would miss them.
  it('treats a check-in-only scored entry (confirmed + completed) as Completed', () => {
    const checkInScored = makeEntry({
      id: 'check-in-scored',
      showId: 'check-in-scored-show',
      showDate: new Date(2026, 7, 29),
      showEndDate: new Date(2026, 7, 30),
      entryStatus: EntryStatus.ACCEPTED,
      entryStatusKind: 'completed',
    });

    const { result } = renderHook(() => useMyEntriesFilters({ entries: [checkInScored] }));

    expect(result.current.tabCounts.completed).toBe(1);
    expect(result.current.tabCounts.upcoming).toBe(0);
  });

  it('still counts an unscored entry at an ended show as Completed', () => {
    const { result } = renderHook(() => useMyEntriesFilters({ entries: [endedShow] }));

    expect(result.current.tabCounts.completed).toBe(1);
    expect(result.current.tabCounts.upcoming).toBe(0);
  });

  it('leaves the fee and summary stats on the show-date axis', () => {
    // A scored entry at a show that has not happened yet can still owe money,
    // so folding it into Completed must not move `currentFees`/amount due.
    const scoredUnpaidFuture = makeEntry({
      id: 'scored-unpaid-future',
      showId: 'scored-unpaid-future-show',
      showDate: new Date(2026, 7, 29),
      showEndDate: new Date(2026, 7, 30),
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      paymentStatus: PaymentStatus.PENDING,
      totalFee: 35,
    });

    const { result } = renderHook(() => useMyEntriesFilters({ entries: [scoredUnpaidFuture] }));

    expect(result.current.entryStats.currentFees).toBe(35);
    expect(result.current.entryStats.currentAmountDue).toBe(35);
    expect(result.current.entryStats.upcomingShows).toBe(1);
    expect(result.current.entryStats.pastShows).toBe(0);
    // ...while the tab axis still calls it done.
    expect(result.current.tabCounts.completed).toBe(1);
  });

  // Live seed shape (Aug 29 2026 show): `groupEntriesByOrder` merges a dog's
  // classes into one card and resolves the card's status by highest priority,
  // with COMPLETED at the top of the scale — so a one-of-two scored order reads
  // `entryStatusKind: 'completed'`. Keying the tab on that aggregate would file
  // the card as done while a class is still unrun, hiding the remaining run.
  it('keeps a partially scored order in Upcoming', () => {
    const partiallyScored = makeEntry({
      id: 'partially-scored',
      showId: 'partially-scored-show',
      showDate: new Date(2026, 7, 29),
      showEndDate: new Date(2026, 7, 30),
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed', // dominant status — one class IS scored
      classes: [makeClass('a', true), makeClass('b', false)],
    });

    const { result } = renderHook(() => useMyEntriesFilters({ entries: [partiallyScored] }));

    expect(result.current.tabCounts.completed).toBe(0);
    expect(result.current.tabCounts.upcoming).toBe(1);

    act(() => result.current.setSelectedTab('upcoming'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['partially-scored']);
  });

  it('completes an order once every class is scored', () => {
    const fullyScored = makeEntry({
      id: 'fully-scored',
      showId: 'fully-scored-show',
      showDate: new Date(2026, 7, 29),
      showEndDate: new Date(2026, 7, 30),
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [makeClass('a', true), makeClass('b', true)],
    });

    const { result } = renderHook(() => useMyEntriesFilters({ entries: [fullyScored] }));

    expect(result.current.tabCounts.completed).toBe(1);
    expect(result.current.tabCounts.upcoming).toBe(0);
  });

  // A class the exhibitor will not run must not hold the order open.
  it('ignores scratched classes when deciding an order is done', () => {
    const scratchedSibling = makeEntry({
      id: 'scratched-sibling',
      showId: 'scratched-sibling-show',
      showDate: new Date(2026, 7, 29),
      showEndDate: new Date(2026, 7, 30),
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [makeClass('a', true), { ...makeClass('b', false), status: 'scratched' }],
    });

    const { result } = renderHook(() => useMyEntriesFilters({ entries: [scratchedSibling] }));

    expect(result.current.tabCounts.completed).toBe(1);
  });
});
