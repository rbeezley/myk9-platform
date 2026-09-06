import { createElement, type ReactNode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

/**
 * The active tab is read from `?tab=` rather than local state, so the hook needs
 * a router. `at` seeds the starting URL, which is how the deep-link tests drive
 * it. Renamed from a bare `renderHook` call so every test goes through one place.
 */
function renderFilters(
  props: Parameters<typeof useMyEntriesFilters>[0],
  at = '/exhibitor/entries'
) {
  return renderHook(() => useMyEntriesFilters(props), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(MemoryRouter, { initialEntries: [at] }, children),
  });
}

describe('useMyEntriesFilters tab filtering (date-range aware)', () => {
  it('keeps a show running today in the Upcoming tab', () => {
    const { result } = renderFilters({ entries: [runningTodayShow, endedShow] });
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

    const { result } = renderFilters({ entries: [pendingFutureEntry, endedShow] });
    act(() => result.current.setSelectedTab('upcoming'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['pending-future']);
  });

  it('puts only genuinely-ended shows in the Completed tab', () => {
    const { result } = renderFilters({ entries: [runningTodayShow, endedShow] });
    act(() => result.current.setSelectedTab('completed'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['ended']);
  });

  it('derives current summary counts while retaining past outstanding balances', () => {
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

    const { result } = renderFilters({
      entries: [
        acceptedUnpaidCurrent,
        acceptedPaidCurrent,
        pendingReviewCurrent,
        waitlistCurrent,
        acceptedUnpaidPast,
      ],
    });

    expect(result.current.entryStats.currentAcceptedEntries).toBe(2);
    expect(result.current.entryStats.currentPendingEntries).toBe(1);
    expect(result.current.entryStats.currentFees).toBe(65);
    expect(result.current.entryStats.currentAmountDue).toBe(105);
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

    const { result } = renderFilters({ entries: [scored, moveUp, plainAccepted] });

    expect(result.current.entryStats.accepted).toBe(3);
    expect(result.current.entryStats.pending).toBe(0);
    // Post-Phase-A these are status-FILTER counts, not tab counts; the
    // membership rule they pin is unchanged.
    expect(result.current.statusCounts.accepted).toBe(3);
    expect(result.current.statusCounts.pending).toBe(0);

    act(() => result.current.setSelectedStatus('accepted'));
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
    // Real scored rows always carry is_scored — verified across every
    // 'completed' row on the project. The canonical accounting rules read it
    // rather than the lifecycle status, so a fixture without it is not a row
    // the app can actually produce.
    isScored: scored,
    resultStatus: scored ? 'qualified' : undefined,
  };
}

/** A row the exhibitor will not run — status and lifecycle agree, as in the DB. */
function makeScratchedClass(id: string): EntryClass {
  return {
    ...makeClass(id, false),
    status: 'scratched',
    entryStatus: EntryStatus.SCRATCHED,
    entryStatusKind: 'scratched',
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
    const { result } = renderFilters({ entries: [scoredAtFutureShow] });

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

    const { result } = renderFilters({ entries: [scoredAtFutureShow, unscoredFuture] });
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

    const { result } = renderFilters({ entries: [checkInScored] });

    expect(result.current.tabCounts.completed).toBe(1);
    expect(result.current.tabCounts.upcoming).toBe(0);
  });

  it('still counts an unscored entry at an ended show as Completed', () => {
    const { result } = renderFilters({ entries: [endedShow] });

    expect(result.current.tabCounts.completed).toBe(1);
    expect(result.current.tabCounts.upcoming).toBe(0);
  });

  it('leaves the FEE stats on the show-date axis while the counts follow the tabs', () => {
    // A scored entry at a show that has not happened yet can still owe money,
    // so folding it into Completed must not move `currentFees`/amount due.
    // The show COUNTS do move with it: their cards deep-link to the tabs.
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

    const { result } = renderFilters({ entries: [scoredUnpaidFuture] });

    // Money: unchanged, still owed.
    expect(result.current.entryStats.currentFees).toBe(35);
    expect(result.current.entryStats.currentAmountDue).toBe(35);
    // Counts: done, and agreeing with the tab the card links to.
    expect(result.current.entryStats.completedShows).toBe(1);
    expect(result.current.entryStats.upcomingShows).toBe(0);
    expect(result.current.tabCounts.completed).toBe(1);
    expect(result.current.tabCounts.upcoming).toBe(0);
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

    const { result } = renderFilters({ entries: [partiallyScored] });

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

    const { result } = renderFilters({ entries: [fullyScored] });

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
      classes: [makeClass('a', true), makeScratchedClass('b')],
    });

    const { result } = renderFilters({ entries: [scratchedSibling] });

    expect(result.current.tabCounts.completed).toBe(1);
  });

  // No runnable classes left at all — the exhibitor withdrew from everything,
  // so there is nothing still ahead of them even though no row carries a result.
  it('treats an order with only scratched classes as done', () => {
    const allScratched = makeEntry({
      id: 'all-scratched',
      showId: 'all-scratched-show',
      showDate: new Date(2026, 7, 29),
      showEndDate: new Date(2026, 7, 30),
      entryStatus: EntryStatus.SCRATCHED,
      entryStatusKind: 'scratched',
      classes: [makeScratchedClass('a'), makeScratchedClass('b')],
    });

    const { result } = renderFilters({ entries: [allScratched] });

    expect(result.current.tabCounts.completed).toBe(1);
    expect(result.current.tabCounts.upcoming).toBe(0);
  });
});

describe('useMyEntriesFilters tab is addressable via ?tab=', () => {
  // The "Past shows" stat card navigates to `/exhibitor/entries?tab=completed`
  // and the "Current entries" card to `?tab=upcoming`. Nothing read the param,
  // so both were no-ops: a chevron and a "View details" label that did nothing.
  // These pin the reader, not the card, because the card was never the broken
  // half — CompactStatsRow's own test asserted `onNavigate` was called with the
  // string and passed the whole time.
  it('opens on the tab named in the URL', () => {
    const { result } = renderFilters(
      { entries: [runningTodayShow, endedShow] },
      '/exhibitor/entries?tab=completed'
    );

    expect(result.current.selectedTab).toBe('completed');
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['ended']);
  });

  it('opens on Upcoming for the current-entries deep link', () => {
    const { result } = renderFilters(
      { entries: [runningTodayShow, endedShow] },
      '/exhibitor/entries?tab=upcoming'
    );

    expect(result.current.selectedTab).toBe('upcoming');
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['running']);
  });

  it('falls back to All for an unknown tab instead of rendering nothing', () => {
    const { result } = renderFilters(
      { entries: [runningTodayShow, endedShow] },
      '/exhibitor/entries?tab=not-a-real-tab'
    );

    expect(result.current.selectedTab).toBe('all');
    expect(result.current.filteredEntries).toHaveLength(2);
  });

  it('preserves an unrelated query param when the tab changes', () => {
    // `?waitlistOffer=` arrives from a notification deep link and is read
    // elsewhere on the page; changing tabs must not drop it.
    const { result } = renderFilters(
      { entries: [runningTodayShow, endedShow] },
      '/exhibitor/entries?waitlistOffer=offer-1'
    );

    act(() => result.current.setSelectedTab('completed'));
    expect(result.current.selectedTab).toBe('completed');

    act(() => result.current.setSelectedTab('all'));
    expect(result.current.selectedTab).toBe('all');
    expect(result.current.filteredEntries).toHaveLength(2);
  });
});

describe('useMyEntriesFilters inbound receipt scope', () => {
  const scopedClass: EntryClass = {
    id: 'e-running',
    name: 'Novice A',
    number: '1',
    fee: 30,
    status: 'entered',
  };
  const scopedEntry = makeEntry({
    ...runningTodayShow,
    classes: [scopedClass],
  });
  const otherEntry = makeEntry({
    ...endedShow,
    classes: [{ ...scopedClass, id: 'e-ended' }],
  });
  const both = [scopedEntry, otherEntry];

  it('narrows the list to the entries a receipt link named', () => {
    const { result } = renderFilters(
      { entries: both },
      '/exhibitor/entries?showId=running-show&entryIds=e-running'
    );

    expect(result.current.scopeMatch.kind).toBe('entries');
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['running']);
  });

  it('counts the tabs against the scoped list, not the full one', () => {
    // A tab label is a promise about what clicking it shows. "Completed 1"
    // above a list scoped to an upcoming entry would be the old lie relocated.
    const { result } = renderFilters(
      { entries: both },
      '/exhibitor/entries?showId=running-show&entryIds=e-running'
    );

    expect(result.current.tabCounts.all).toBe(1);
    expect(result.current.tabCounts.completed).toBe(0);
    expect(result.current.tabCounts.upcoming).toBe(1);
  });

  it('leaves the page-level stat row unscoped so money still matches My Payments', () => {
    const { result } = renderFilters(
      { entries: both },
      '/exhibitor/entries?showId=running-show&entryIds=e-running'
    );

    expect(result.current.entryStats.total).toBe(2);
  });

  it('clears the scope without disturbing the active tab', () => {
    const { result } = renderFilters(
      { entries: both },
      '/exhibitor/entries?tab=upcoming&showId=running-show&entryIds=e-running'
    );
    expect(result.current.filteredEntries).toHaveLength(1);

    act(() => result.current.clearScope());

    expect(result.current.scopeMatch.kind).toBe('none');
    expect(result.current.selectedTab).toBe('upcoming');
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['running']);
    expect(result.current.tabCounts.all).toBe(2);
  });

  it('shows every entry, flagged unmatched, when the link has gone stale', () => {
    const { result } = renderFilters(
      { entries: both },
      '/exhibitor/entries?showId=gone&entryIds=gone'
    );

    expect(result.current.scopeMatch.kind).toBe('unmatched');
    expect(result.current.filteredEntries).toHaveLength(2);
  });

  it('is inert on an ordinary unscoped visit', () => {
    const { result } = renderFilters({ entries: both });

    expect(result.current.scopeMatch.kind).toBe('none');
    expect(result.current.filteredEntries).toHaveLength(2);
  });
});

// --- Phase A: time leads, status filters (docs/plan-ia-exhibitor-surface.md) ---
//
// The strip used to carry six tabs across two orthogonal axes — status
// (Pending/Accepted/Waitlist) and time (Upcoming/Completed) — so each axis
// independently accounted for every entry and the counts summed to double the
// total. Selecting a status tab then a time tab replaced the filter instead of
// refining it, making "accepted AND still ahead" unexpressable.
describe('My Shows filters on one axis (time) with status composed', () => {
  const mixed = [
    makeEntry({ id: 'up-accepted', showId: 's1', showDate: new Date(2026, 5, 20) }),
    makeEntry({
      id: 'up-pending',
      showId: 's2',
      showDate: new Date(2026, 5, 21),
      entryStatus: EntryStatus.PENDING,
    }),
    makeEntry({
      id: 'up-waitlist',
      showId: 's3',
      showDate: new Date(2026, 5, 22),
      entryStatus: EntryStatus.WAITLIST,
    }),
    makeEntry({
      id: 'done-accepted',
      showId: 's4',
      showDate: new Date(2026, 4, 14),
      showEndDate: new Date(2026, 4, 16),
    }),
  ];

  it('offers exactly three tabs: All, Upcoming, Completed', () => {
    const { result } = renderFilters({ entries: mixed });
    expect(Object.keys(result.current.tabCounts).sort()).toEqual(['all', 'completed', 'upcoming']);
  });

  // THE invariant this phase exists to create: Upcoming and Completed partition
  // All. Two axes rendered as siblings is what made the counts sum to 136 for
  // 68 entries on the live page.
  it('partitions All into Upcoming + Completed', () => {
    const { result } = renderFilters({ entries: mixed });
    const { all, upcoming, completed } = result.current.tabCounts;
    expect(all).toBe(mixed.length);
    expect(upcoming + completed).toBe(all);
  });

  it('keeps the partition intact under a status filter', () => {
    const { result } = renderFilters({ entries: mixed }, '/exhibitor/entries?status=accepted');
    const { all, upcoming, completed } = result.current.tabCounts;
    expect(upcoming + completed).toBe(all);
    expect(all).toBe(2); // up-accepted + done-accepted
  });

  // The combination the old strip could not express.
  it('composes status with time instead of replacing it', () => {
    const { result } = renderFilters({ entries: mixed }, '/exhibitor/entries?status=accepted');
    act(() => result.current.setSelectedTab('upcoming'));

    expect(result.current.selectedStatus).toBe('accepted');
    expect(result.current.selectedTab).toBe('upcoming');
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['up-accepted']);
  });

  // Regression: react-router's functional `setSearchParams` is NOT an atomic
  // read-modify-write. It passes the params memoized from the LAST RENDER
  // (react-router 7.18.2, useSearchParams ~line 736), so two updates in the
  // same tick both start from the same stale value and the second silently
  // discards the first. An exhibitor clicking two filter chips quickly lost
  // the first one — reproduced in a real browser before this guard existed.
  it('keeps both filters when they are set in the same tick', () => {
    const { result } = renderFilters({ entries: mixed });

    act(() => {
      result.current.setSelectedStatus('accepted');
      result.current.setSelectedTab('upcoming');
    });

    expect(result.current.selectedStatus).toBe('accepted');
    expect(result.current.selectedTab).toBe('upcoming');
  });

  it('keeps both filters when set in the same tick in the other order', () => {
    const { result } = renderFilters({ entries: mixed });

    act(() => {
      result.current.setSelectedTab('completed');
      result.current.setSelectedStatus('pending');
    });

    expect(result.current.selectedTab).toBe('completed');
    expect(result.current.selectedStatus).toBe('pending');
  });

  it('changing the tab preserves the status filter', () => {
    const { result } = renderFilters({ entries: mixed }, '/exhibitor/entries?status=pending');
    act(() => result.current.setSelectedTab('completed'));
    expect(result.current.selectedStatus).toBe('pending');

    act(() => result.current.setSelectedTab('upcoming'));
    expect(result.current.selectedStatus).toBe('pending');
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['up-pending']);
  });

  it('status chip counts describe the CURRENT tab, so a chip never promises rows the tab will not show', () => {
    const { result } = renderFilters({ entries: mixed }, '/exhibitor/entries?tab=completed');
    expect(result.current.statusCounts.accepted).toBe(1); // done-accepted only
    expect(result.current.statusCounts.pending).toBe(0);
  });

  // Retired tab ids still arrive from bookmarks, the stat cards, and
  // EntriesEmptyState's CTAs. They must land on the equivalent view, not on a
  // silent fallback to All that quietly drops the filter.
  it.each([
    ['pending', 'up-pending'],
    ['accepted', 'up-accepted'],
    ['waitlist', 'up-waitlist'],
  ] as const)('migrates a legacy ?tab=%s link to the status filter', (legacy, expectedId) => {
    const { result } = renderFilters({ entries: mixed }, `/exhibitor/entries?tab=${legacy}`);

    expect(result.current.selectedStatus).toBe(legacy);
    expect(result.current.selectedTab).toBe('all');
    expect(result.current.filteredEntries.map(e => e.id)).toContain(expectedId);
  });

  it('clears the status filter back to every status', () => {
    const { result } = renderFilters({ entries: mixed }, '/exhibitor/entries?status=accepted');
    act(() => result.current.setSelectedStatus('any'));

    expect(result.current.selectedStatus).toBe('any');
    expect(result.current.filteredEntries).toHaveLength(mixed.length);
  });

  it('falls back to every status for an unknown ?status value', () => {
    const { result } = renderFilters({ entries: mixed }, '/exhibitor/entries?status=not-a-status');
    expect(result.current.selectedStatus).toBe('any');
    expect(result.current.filteredEntries).toHaveLength(mixed.length);
  });
});

/**
 * MYK9-417. `waitlist_entries` is a second source of waitlist truth, and the
 * hook is where the two are joined. The rule itself is pinned in
 * waitlistSurface.test.ts and its effect on screen in MyEntriesPage.test.tsx;
 * these cover the wiring in between — which inputs the hook actually hands the
 * resolver, and that the chip reads the joined answer rather than half of it.
 */
describe('useMyEntriesFilters wait-list positions', () => {
  const oneEntry = [makeEntry({ id: 'submitted', showId: 's1', showDate: new Date(2026, 5, 20) })];

  it('adds positions to the Waitlist chip count', () => {
    const { result } = renderFilters({ entries: oneEntry, activeWaitlistPositionCount: 1 });

    // No entry here is waitlisted; the position is the whole count.
    expect(result.current.statusCounts.waitlist).toBe(1);
    expect(result.current.waitlistSurface.showPositions).toBe(true);
  });

  it('reads zero positions the same as before the fix', () => {
    const { result } = renderFilters({ entries: oneEntry });

    expect(result.current.statusCounts.waitlist).toBe(0);
    expect(result.current.waitlistSurface.showPositions).toBe(false);
    expect(result.current.waitlistSurface.allowEmptyState).toBe(true);
  });

  it('keeps a deep-linked dead offer off the chip while still showing it', () => {
    const { result } = renderFilters({
      entries: oneEntry,
      activeWaitlistPositionCount: 0,
      displayedWaitlistPositionCount: 1,
    });

    expect(result.current.statusCounts.waitlist).toBe(0);
    expect(result.current.waitlistSurface.showPositions).toBe(true);
  });

  it('leaves positions out of a receipt-scoped list', () => {
    // The scope names entry rows; a position is not one, and the banner has
    // just promised the list is narrowed to that payment.
    const { result } = renderFilters(
      { entries: oneEntry, activeWaitlistPositionCount: 1 },
      '/exhibitor/entries?showId=s1&entryIds=submitted'
    );

    expect(result.current.scopeMatch.kind).not.toBe('none');
    expect(result.current.statusCounts.waitlist).toBe(0);
    expect(result.current.waitlistSurface.showPositions).toBe(false);
  });

  it('still counts positions when the scope link matched nothing', () => {
    // 'unmatched' shows the full list rather than an empty page, so it is not
    // a narrowing and must not suppress the positions either.
    const { result } = renderFilters(
      { entries: oneEntry, activeWaitlistPositionCount: 1 },
      '/exhibitor/entries?showId=gone&entryIds=gone'
    );

    expect(result.current.scopeMatch.kind).toBe('unmatched');
    expect(result.current.statusCounts.waitlist).toBe(1);
  });
});
