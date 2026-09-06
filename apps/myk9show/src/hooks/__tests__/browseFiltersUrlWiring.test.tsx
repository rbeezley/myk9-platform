import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Dog } from '@/types/dog-types';

/**
 * MYK9-221 — proves each browse-page filter hook is actually wired to the URL,
 * not just that `useUrlFilters` works in isolation. Every assertion here is on
 * the hook's own filter state or on `location.search`, never on rendered output.
 */

// ── Mocked data sources ─────────────────────────────────────────────────────

const DOGS: Dog[] = [
  {
    id: 'dog-1',
    name: 'Goldenworth Max',
    callName: 'Max',
    breed: 'Golden Retriever',
    sex: 'male',
    ownerId: 'owner-1',
    ownerName: 'Jane Doe',
    registrations: [
      {
        id: 'reg-1',
        organization: 'AKC',
        registeredName: 'Goldenworth Max',
        breed: 'Golden Retriever',
        registrationNumber: 'AKC-1',
        status: 'Active',
      },
    ],
  } as unknown as Dog,
  {
    id: 'dog-2',
    name: 'Blackwood Bella',
    callName: 'Bella',
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-2',
    ownerName: 'John Roe',
    registrations: [
      {
        id: 'reg-2',
        organization: 'AKC',
        registeredName: 'Blackwood Bella',
        breed: 'Border Collie',
        registrationNumber: 'AKC-2',
        status: 'Active',
      },
    ],
  } as unknown as Dog,
];

const PEOPLE = [
  { id: 'p-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', roles: ['judge'] },
  {
    id: 'p-2',
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roles: ['exhibitor'],
  },
];

vi.mock('@/hooks/useRoleBasedData', () => ({
  useRoleBasedDogs: () => DOGS,
  useRoleBasedPeople: () => ({ people: PEOPLE, isLoading: false, error: null }),
  useCurrentUserPersonId: () => 'person-1',
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ isLoading: false, error: null, refetch: vi.fn() }),
}));

const ensureClubsReady = vi.fn();

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ clubs: [], clubReadiness: 'ready', ensureClubsReady }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: Record<string, unknown>) => unknown) => selector({ shows: [] }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { id: 'user-1', roles: ['secretary'] } }),
}));

// Imported after the mocks so the hooks pick them up.
const { useBrowseDogsData } = await import('@/hooks/useBrowseDogsData');
const { useBrowsePeopleData } = await import('@/hooks/useBrowsePeopleData');
const { useBrowseClubsData } = await import('@/hooks/useBrowseClubsData');
const { useBrowseShowsFilters } = await import('@/hooks/useBrowseShowsFilters');

// ── Router harness ──────────────────────────────────────────────────────────

function setupWrapper(initialEntry: string) {
  const probe = { search: '' };

  // Written from an effect, not during render — `react-hooks/immutability`
  // rejects assigning to a captured object from a component body.
  const Probe: React.FC = () => {
    const search = useLocation().search;
    React.useEffect(() => {
      probe.search = search;
    });
    return null;
  };

  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      {children}
      <Probe />
    </MemoryRouter>
  );

  return { probe, wrapper };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── /dogs ───────────────────────────────────────────────────────────────────

describe('useBrowseDogsData URL filters', () => {
  it('seeds search, breed, and sex from the query string', () => {
    const { wrapper } = setupWrapper('/dogs?search=bell&breed=Border%20Collie&sex=female');
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });

    expect(result.current.filters).toEqual({
      search: 'bell',
      breed: 'Border Collie',
      sex: 'female',
    });
  });

  it('applies the URL-seeded filter to the roster on the very first render', () => {
    const { wrapper } = setupWrapper('/dogs?breed=Border%20Collie');
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });

    expect(result.current.filteredDogs.map(d => d.id)).toEqual(['dog-2']);
    // Drives the "No dogs match your filters" branch instead of "No dogs yet".
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('writes a chip filter to the URL while preserving ?add=true', () => {
    const { wrapper, probe } = setupWrapper('/dogs?add=true');
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });

    act(() => {
      result.current.setFilters(prev => ({ ...prev, sex: 'female' }));
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('sex')).toBe('female');
    expect(params.get('add')).toBe('true');
  });

  it('writes debounced search text to the URL while preserving ?add=true', () => {
    const { wrapper, probe } = setupWrapper('/dogs?add=true');
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });

    act(() => {
      result.current.setFilters(prev => ({ ...prev, search: 'max' }));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('search')).toBe('max');
    expect(params.get('add')).toBe('true');
  });

  it('clears every filter param — and nothing else — via clearAllFilters', () => {
    const { wrapper, probe } = setupWrapper('/dogs?add=true&breed=Border%20Collie&sex=female');
    const { result } = renderHook(() => useBrowseDogsData(), { wrapper });

    act(() => {
      result.current.clearAllFilters();
    });

    const params = new URLSearchParams(probe.search);
    expect(params.has('breed')).toBe(false);
    expect(params.has('sex')).toBe(false);
    expect(params.get('add')).toBe('true');
    expect(result.current.hasActiveFilters).toBe(false);
  });
});

// ── /people ─────────────────────────────────────────────────────────────────

describe('useBrowsePeopleData URL filters', () => {
  it('seeds search and role from the query string', () => {
    const { wrapper } = setupWrapper('/people?search=ada&role=judge');
    const { result } = renderHook(() => useBrowsePeopleData(), { wrapper });

    expect(result.current.filters).toEqual({ search: 'ada', role: 'judge' });
    expect(result.current.filteredPeople.map(p => p.id)).toEqual(['p-1']);
  });

  it('writes the role filter to the URL while preserving ?add=true', () => {
    const { wrapper, probe } = setupWrapper('/people?add=true');
    const { result } = renderHook(() => useBrowsePeopleData(), { wrapper });

    act(() => {
      result.current.setFilters(prev => ({ ...prev, role: 'exhibitor' }));
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('role')).toBe('exhibitor');
    expect(params.get('add')).toBe('true');
  });
});

// ── /clubs ──────────────────────────────────────────────────────────────────

describe('useBrowseClubsData URL filters', () => {
  it('seeds search and clubType from the query string', () => {
    const { wrapper } = setupWrapper('/clubs?search=retriever&clubType=all-breed');
    const { result } = renderHook(() => useBrowseClubsData(), { wrapper });

    expect(result.current.filters).toEqual({ search: 'retriever', clubType: 'all-breed' });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('falls back to the default for a clubType outside CLUB_TYPES', () => {
    const { wrapper } = setupWrapper('/clubs?clubType=notathing');
    const { result } = renderHook(() => useBrowseClubsData(), { wrapper });

    expect(result.current.filters.clubType).toBe('all');
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('writes the clubType filter to the URL', () => {
    const { wrapper, probe } = setupWrapper('/clubs');
    const { result } = renderHook(() => useBrowseClubsData(), { wrapper });

    act(() => {
      result.current.setFilters(prev => ({ ...prev, clubType: 'specialty' }));
    });

    expect(new URLSearchParams(probe.search).get('clubType')).toBe('specialty');
  });
});

// ── /shows ──────────────────────────────────────────────────────────────────

describe('useBrowseShowsFilters URL filters', () => {
  const props: Parameters<typeof useBrowseShowsFilters>[0] = {
    shows: [],
    entries: [],
    userContext: null,
    selectedTab: 'all',
  };

  it('seeds every show filter from the query string, including the sidebar ?club= deep link', () => {
    const { wrapper } = setupWrapper('/shows?tab=managing&club=club-1&discipline=agility');
    const { result } = renderHook(() => useBrowseShowsFilters({ ...props }), { wrapper });

    expect(result.current.filters.club).toBe('club-1');
    expect(result.current.filters.discipline).toBe('agility');
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('writes a filter to the URL without disturbing ?tab= or ?view=', () => {
    const { wrapper, probe } = setupWrapper('/shows?tab=managing&view=cards');
    const { result } = renderHook(() => useBrowseShowsFilters({ ...props }), { wrapper });

    act(() => {
      result.current.setFilters(prev => ({ ...prev, entryStatus: 'open' }));
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('entryStatus')).toBe('open');
    expect(params.get('tab')).toBe('managing');
    expect(params.get('view')).toBe('cards');
  });

  it('falls back to the default for a month the app cannot act on', () => {
    // The dangerous one: `garbage` would pass the `!== 'all'` test in
    // applyFilters and match no show, so the list would read as empty — or,
    // worse, skip the upcoming rule and leak past shows onto the default view.
    // `month` is open-ended (any YYYY-MM), so the hook shape-checks it.
    const { wrapper } = setupWrapper('/shows?month=garbage');
    const { result } = renderHook(() => useBrowseShowsFilters({ ...props }), { wrapper });

    expect(result.current.filters.month).toBe('all');
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('ignores a stale ?dateRange= link from before the month scrubber', () => {
    const { wrapper } = setupWrapper('/shows?dateRange=next_month');
    const { result } = renderHook(() => useBrowseShowsFilters({ ...props }), { wrapper });

    expect(result.current.filters.month).toBe('all');
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('falls back to the default for a discipline outside the known set', () => {
    // Otherwise FilterChips renders an active-toned chip with a clear-X and no
    // label, counted in activeFilterCount, filtering nothing.
    const { wrapper } = setupWrapper('/shows?discipline=notathing');
    const { result } = renderHook(() => useBrowseShowsFilters({ ...props }), { wrapper });

    expect(result.current.filters.discipline).toBe('all');
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('still accepts a club id, which has no static list to validate against', () => {
    const { wrapper } = setupWrapper('/shows?club=any-uuid-here');
    const { result } = renderHook(() => useBrowseShowsFilters({ ...props }), { wrapper });

    expect(result.current.filters.club).toBe('any-uuid-here');
  });

  it('keeps month out of the URL at its default of "all"', () => {
    const { wrapper, probe } = setupWrapper('/shows');
    const { result } = renderHook(() => useBrowseShowsFilters({ ...props }), { wrapper });

    act(() => {
      result.current.setFilters(prev => ({ ...prev, month: '2026-10' }));
    });
    expect(new URLSearchParams(probe.search).get('month')).toBe('2026-10');

    act(() => {
      result.current.setFilters(prev => ({ ...prev, month: 'all' }));
    });
    expect(new URLSearchParams(probe.search).has('month')).toBe(false);
  });
});
