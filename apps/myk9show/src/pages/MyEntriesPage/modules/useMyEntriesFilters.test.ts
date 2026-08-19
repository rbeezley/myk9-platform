import { createElement, type ReactNode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
function renderFilters(props: Parameters<typeof useMyEntriesFilters>[0], at = '/exhibitor/entries') {
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

    const { result } = renderFilters({ entries: [scored, moveUp, plainAccepted] });

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
