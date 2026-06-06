import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useBrowseShowsFilters } from '@/hooks/useBrowseShowsFilters';
import type { Show } from '@/types/show-types';

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Test Show',
    organization: 'AKC',
    startDate: '2026-10-01',
    endDate: '2026-10-02',
    location: 'Test City, CA',
    status: 'Upcoming',
    events: ['Scent Work'],
    source: 'myK9Show',
    entryOpenDate: '2026-08-01',
    entryCloseDate: '2026-09-15',
    preEntryFee: '25',
    clubId: 'club-1',
    clubName: 'Test Club',
    clubAddress: '123 Main St',
    clubEmail: 'club@example.com',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    ...overrides,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe('useBrowseShowsFilters — date range filter', () => {
  it('next_month returns only shows starting in the next calendar month', async () => {
    const now = new Date();
    const midNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const midMonthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 15);

    const shows = [
      makeShow({ id: 'this-month', startDate: isoDate(now), endDate: isoDate(now) }),
      makeShow({ id: 'next-month', startDate: isoDate(midNextMonth), endDate: isoDate(midNextMonth) }),
      makeShow({ id: 'month-after', startDate: isoDate(midMonthAfter), endDate: isoDate(midMonthAfter) }),
    ];

    const { result } = renderHook(() =>
      useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' })
    );

    await waitFor(() => expect(result.current.filteredShows.length).toBeGreaterThan(0));

    act(() => {
      result.current.setFilters(prev => ({ ...prev, dateRange: 'next_month' }));
    });

    await waitFor(() => {
      expect(result.current.filteredShows.map(s => s.id)).toEqual(['next-month']);
    });
  });

  it('next_month includes the 1st of next month (UTC/local boundary regression)', async () => {
    const now = new Date();
    // Day 1 of next month as an ISO string — historically parsed as UTC midnight,
    // which falls before local midnight in US time zones and was excluded.
    const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstOfMonthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    const shows = [
      makeShow({ id: 'first-of-next', startDate: isoDate(firstOfNextMonth) }),
      makeShow({ id: 'first-of-after', startDate: isoDate(firstOfMonthAfter) }),
    ];

    const { result } = renderHook(() =>
      useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' })
    );

    await waitFor(() => expect(result.current.filteredShows.length).toBeGreaterThan(0));

    act(() => {
      result.current.setFilters(prev => ({ ...prev, dateRange: 'next_month' }));
    });

    await waitFor(() => {
      const ids = result.current.filteredShows.map(s => s.id);
      expect(ids).toContain('first-of-next');
      expect(ids).not.toContain('first-of-after');
    });
  });
});

describe('useBrowseShowsFilters — discipline filter', () => {
  it('includes shows whose events array contains the mapped discipline', async () => {
    const shows = [
      makeShow({ id: 'sw-1', events: ['Scent Work'] }),
      makeShow({ id: 'ag-1', events: ['Agility'], organization: 'AKC' }),
    ];

    const { result } = renderHook(() =>
      useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' })
    );

    await waitFor(() => expect(result.current.filteredShows.length).toBeGreaterThan(0));

    act(() => {
      result.current.setFilters(prev => ({ ...prev, discipline: 'scent_work' }));
    });

    await waitFor(() => {
      expect(result.current.filteredShows.map(s => s.id)).toEqual(['sw-1']);
    });
  });

  it('does not match discipline against show.organization (the sanctioning body)', async () => {
    // organization is "AKC" — should never match "Scent Work"
    const shows = [makeShow({ id: 'sw-1', events: ['Scent Work'], organization: 'AKC' })];

    const { result } = renderHook(() =>
      useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' })
    );

    await waitFor(() => expect(result.current.filteredShows.length).toBeGreaterThan(0));

    act(() => {
      result.current.setFilters(prev => ({ ...prev, discipline: 'scent_work' }));
    });

    await waitFor(() => {
      // show has Scent Work in events — must be included even though organization is "AKC"
      expect(result.current.filteredShows.map(s => s.id)).toContain('sw-1');
    });
  });
});
