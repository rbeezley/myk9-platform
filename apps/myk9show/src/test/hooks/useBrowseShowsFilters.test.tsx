import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useBrowseShowsFilters } from '@/hooks/useBrowseShowsFilters';
import type { Show } from '@/types/show-types';

function buildShow(month: string): Show {
  return {
    id: `show-${month}`,
    name: `${month} Bookmarked Show`,
    organization: 'Agility',
    startDate: `${month}-15T12:00:00.000Z`,
    endDate: `${month}-16T12:00:00.000Z`,
    location: 'Test Location',
    status: 'Upcoming',
    events: ['Agility'],
    source: 'myK9Show',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    entryOpenDate: `${month}-01T12:00:00.000Z`,
    entryCloseDate: `${month}-14T12:00:00.000Z`,
    preEntryFee: '$25',
    dayOfShowFee: '$35',
    clubId: 'club-1',
    clubName: 'Test Club',
    clubAddress: 'Test Address',
    clubEmail: 'test@example.com',
    assignedJudges: [],
    stats: [],
    trials: [],
  };
}

function createWrapper(route: string) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  };
}

describe('useBrowseShowsFilters month URL deep links', () => {
  it.each(['2026-01', '2028-01'])(
    'keeps a valid bookmarked month from the URL and applies it to the results (%s)',
    async month => {
      const show = buildShow(month);
      const { result } = renderHook(
        () =>
          useBrowseShowsFilters({
            shows: [show],
            entries: [],
            userContext: null,
            selectedTab: 'all',
          }),
        { wrapper: createWrapper(`/shows?month=${month}`) }
      );

      expect(result.current.filters.month).toBe(month);
      await waitFor(() => {
        expect(result.current.filteredShows).toEqual([show]);
      });
    }
  );
});
