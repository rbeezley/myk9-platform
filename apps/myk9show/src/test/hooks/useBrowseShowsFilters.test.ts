import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { useBrowseShowsFilters, disciplineMatchesEvent } from '@/hooks/useBrowseShowsFilters';
import type { Show } from '@/types/show-types';

// The browse filter hooks read their state from the query string
// (MYK9-221, `useUrlFilters`), so they need a router in scope.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(MemoryRouter, null, children);

// ISO date-only string built from local calendar components — mirrors how DB values arrive
// and avoids the UTC-midnight-vs-local-midnight ambiguity that caused the original bug.
function localISODate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Relative dates so the default fixture stays "upcoming" forever — a hardcoded
// future date (e.g. 2026-10-01) silently turns "past" once the wall clock passes
// it, which would drop the default show from the upcoming-filtered results that
// the non-date tests (discipline, etc.) rely on.
function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Test Show',
    organization: 'AKC',
    startDate: localISODate(60),
    endDate: localISODate(61),
    location: 'Test City, CA',
    status: 'Upcoming',
    events: ['Scent Work'],
    source: 'myK9Show',
    entryOpenDate: localISODate(30),
    entryCloseDate: localISODate(55),
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
  // LOCAL components, not toISOString(). The hook compares local date parts
  // (see the "UTC/local boundary regression" test below), so a UTC-formatted
  // fixture describes a different day than the one intended: at 19:00 local on
  // the 31st in UTC-5, toISOString() yields the 1st of the NEXT month, and the
  // show labelled "this month" genuinely belongs to next month.
  //
  // Fires only in the evening of a month's last day in a negative-offset zone —
  // never on CI, which runs in UTC — so it reads as an unreproducible local
  // flake. Found 2026-07-31.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Far-future anchor show — gives applyFilters a stable "I've run" signal when
// included alongside boundary-case shows whose presence/absence we're testing.
const ANCHOR = makeShow({ id: 'anchor', startDate: '2099-01-01', endDate: '2099-01-02' });

describe('useBrowseShowsFilters — upcoming filter (UTC/local boundary regression)', () => {
  it('skips a show with no usable dates instead of throwing', async () => {
    const malformedShow = {
      ...makeShow({ id: 'malformed' }),
      startDate: undefined,
      endDate: undefined,
    } as unknown as Show;
    const impossibleDateShow = makeShow({
      id: 'impossible-date',
      startDate: '2099-02-31',
      endDate: '2099-02-31',
    });

    const { result } = renderHook(
      () =>
        useBrowseShowsFilters({
          shows: [ANCHOR, malformedShow, impossibleDateShow],
          entries: [],
          userContext: null,
          selectedTab: 'all',
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.filteredShows.map(show => show.id)).toEqual(['anchor']);
    });
  });

  it('includes a show whose startDate is today', async () => {
    const todayShow = makeShow({
      id: 'today',
      startDate: localISODate(0),
      endDate: localISODate(0),
    });

    const { result } = renderHook(
      () =>
        useBrowseShowsFilters({
          shows: [ANCHOR, todayShow],
          entries: [],
          userContext: null,
          selectedTab: 'all',
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.filteredShows.some(s => s.id === 'anchor')).toBe(true);
    });
    expect(result.current.filteredShows.some(s => s.id === 'today')).toBe(true);
  });

  it('excludes a show whose startDate is yesterday', async () => {
    const pastShow = makeShow({
      id: 'yesterday',
      startDate: localISODate(-1),
      endDate: localISODate(-1),
    });

    const { result } = renderHook(
      () =>
        useBrowseShowsFilters({
          shows: [ANCHOR, pastShow],
          entries: [],
          userContext: null,
          selectedTab: 'all',
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.filteredShows.some(s => s.id === 'anchor')).toBe(true);
    });
    expect(result.current.filteredShows.some(s => s.id === 'yesterday')).toBe(false);
  });

  it('includes an in-progress show whose startDate has passed and endDate is future', async () => {
    const inProgressShow = makeShow({
      id: 'in-progress',
      startDate: localISODate(-5),
      endDate: localISODate(5),
    });

    const { result } = renderHook(
      () =>
        useBrowseShowsFilters({
          shows: [ANCHOR, inProgressShow],
          entries: [],
          userContext: null,
          selectedTab: 'all',
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.filteredShows.some(s => s.id === 'anchor')).toBe(true);
      expect(result.current.filteredShows.some(s => s.id === 'in-progress')).toBe(true);
    });
  });
});

describe('useBrowseShowsFilters — month filter (scrubber)', () => {
  function monthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  it('a chosen month keeps only shows starting in that month, including the 1st', async () => {
    const now = new Date();
    const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const midNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const firstOfMonthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    const shows = [
      makeShow({ id: 'this-month', startDate: isoDate(now), endDate: isoDate(now) }),
      makeShow({ id: 'first-of-next', startDate: isoDate(firstOfNextMonth) }),
      makeShow({
        id: 'mid-next',
        startDate: isoDate(midNextMonth),
        endDate: isoDate(midNextMonth),
      }),
      makeShow({ id: 'first-of-after', startDate: isoDate(firstOfMonthAfter) }),
    ];

    const { result } = renderHook(
      () => useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.filteredShows.length).toBeGreaterThan(0));

    act(() => {
      result.current.setFilters(prev => ({ ...prev, month: monthKey(firstOfNextMonth) }));
    });

    await waitFor(() => {
      expect(result.current.filteredShows.map(s => s.id)).toEqual(['first-of-next', 'mid-next']);
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('a past month shows past shows — the scrubber replaced the Past Shows tab', async () => {
    const now = new Date();
    const midLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const shows = [
      makeShow({
        id: 'last-month',
        startDate: isoDate(midLastMonth),
        endDate: isoDate(midLastMonth),
      }),
      ANCHOR,
    ];

    const { result } = renderHook(
      () => useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' }),
      { wrapper }
    );

    // Default (All upcoming) hides it …
    await waitFor(() => expect(result.current.filteredShows.map(s => s.id)).toEqual(['anchor']));
    // … but the scrubber still counts it on its month.
    expect(result.current.monthScopedShows.map(s => s.id)).toEqual(['last-month', 'anchor']);

    act(() => {
      result.current.setFilters(prev => ({ ...prev, month: monthKey(midLastMonth) }));
    });

    await waitFor(() => {
      expect(result.current.filteredShows.map(s => s.id)).toEqual(['last-month']);
    });
  });

  it('a malformed ?month= reads as All upcoming instead of leaking past shows', async () => {
    const now = new Date();
    const midLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const shows = [
      makeShow({
        id: 'last-month',
        startDate: isoDate(midLastMonth),
        endDate: isoDate(midLastMonth),
      }),
      ANCHOR,
    ];
    const routed = ({ children }: { children: ReactNode }) =>
      createElement(MemoryRouter, { initialEntries: ['/shows?month=garbage'] }, children);

    const { result } = renderHook(
      () => useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' }),
      { wrapper: routed }
    );

    await waitFor(() => expect(result.current.filteredShows.map(s => s.id)).toEqual(['anchor']));
    expect(result.current.filters.month).toBe('all');
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('monthScopedShows reflects the other filters so the tiles count what the list shows', async () => {
    const now = new Date();
    const midNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const shows = [
      makeShow({ id: 'scent', startDate: isoDate(midNextMonth), events: ['Scent Work'] }),
      makeShow({ id: 'agility', startDate: isoDate(midNextMonth), events: ['Agility'] }),
    ];

    const { result } = renderHook(
      () => useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.monthScopedShows).toHaveLength(2));

    act(() => {
      result.current.setFilters(prev => ({ ...prev, discipline: 'agility' }));
    });

    await waitFor(() => {
      expect(result.current.monthScopedShows.map(s => s.id)).toEqual(['agility']);
    });
  });
});

describe('disciplineMatchesEvent — trial-type variant normalization', () => {
  it.each(['Scent Work', 'Scentwork', 'scent_work', 'AKC Scent Work'])(
    'matches "Scent Work" discipline against event %s',
    event => {
      expect(disciplineMatchesEvent('Scent Work', event)).toBe(true);
    }
  );

  it('does not match an unrelated discipline', () => {
    expect(disciplineMatchesEvent('Scent Work', 'Agility')).toBe(false);
  });
});

describe('useBrowseShowsFilters — discipline filter', () => {
  it('includes shows whose events array contains the mapped discipline', async () => {
    const shows = [
      makeShow({ id: 'sw-1', events: ['Scent Work'] }),
      makeShow({ id: 'ag-1', events: ['Agility'], organization: 'AKC' }),
    ];

    const { result } = renderHook(
      () => useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' }),
      { wrapper }
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

    const { result } = renderHook(
      () => useBrowseShowsFilters({ shows, entries: [], userContext: null, selectedTab: 'all' }),
      { wrapper }
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
