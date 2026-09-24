/**
 * MYK9-649. A show with no entry window was reported by `getEntryStatus` as
 * `not_yet_open`, so every consumer that branches on the enum (rather than the
 * honest "Entry status unavailable" label) advertised it as a show whose
 * entries open later. This walks the Browse Shows surfaces with a show built
 * by the REAL store mapper (`replicatedToShow`) from a replicated row whose
 * entry dates are null, which is the shape a signed-in visitor's browse list
 * actually carries: empty-string dates and no `trials`.
 *
 * Mutation check: make `getEntryStatus` return `not_yet_open` again for the
 * windowless branch and the status and both card (badge icon) cases go red.
 */

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { replicatedToShow } from '@/store/showStore';
import type { ReplicatedShow } from '@/services/replication';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { ShowCardHorizontal } from '../ShowCardHorizontal';
import { ShowCardVertical } from '@/components/shows/ShowCardVertical';
import { buildMonthTiles } from '../monthScrubber.helpers';
import { deriveShowMarkerStatus } from '@/features/maps/markerStatus';
import { useBrowseShowsFilters } from '@/hooks/useBrowseShowsFilters';
import type { Show } from '@/types/show-types';

const NOW = new Date('2026-09-23T15:00:00.000Z');

function windowlessShow(): Show {
  const row = {
    id: 'show-windowless',
    name: 'Windowless Scent Work Trial',
    organization: 'AKC',
    startDate: '2026-11-14',
    endDate: '2026-11-15',
    location: 'Tulsa, OK',
    status: 'published',
    entryOpenDate: null,
    entryCloseDate: null,
    clubId: 'club-1',
  } as unknown as ReplicatedShow;
  // `replicatedToShow` returns a StoreShow (no `trials`). The browse surfaces
  // take `Show`, and it is exactly this trial-less shape they receive for a
  // signed-in visitor, so it is passed through unchanged rather than padded.
  return replicatedToShow(row) as Show;
}

// Any wording that tells the visitor entries are, or will soon be, open.
const OPEN_WORDING = /entries open|opens? (soon|in)|accepting|closes in|closes today/i;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a windowless show on Browse Shows (MYK9-649)', () => {
  it('is built by the real mapper with no window and no trials', () => {
    const show = windowlessShow();
    expect(show.entryOpenDate).toBe('');
    expect(show.entryCloseDate).toBe('');
    expect('trials' in show).toBe(false);
  });

  it('has its own status, not "not yet open"', () => {
    expect(getEntryStatus(windowlessShow())).toMatchObject({
      status: 'window_unknown',
      canEnter: false,
    });
  });

  it.each([
    ['horizontal card', (show: Show) => <ShowCardHorizontal show={show} />],
    ['vertical card', (show: Show) => <ShowCardVertical show={show} />],
  ])('the %s says the status is unavailable and never that entries open', (_name, card) => {
    const { container } = render(<MemoryRouter>{card(windowlessShow())}</MemoryRouter>);

    expect(screen.getByText('Entry status unavailable')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(OPEN_WORDING);
    // The calendar-clock icon is the "opens on a date" glyph; a window nobody
    // set must not wear it.
    expect(container.querySelector('.lucide-calendar-clock')).toBeNull();
  });

  it('gets a muted month-scrubber dot, not an open one', () => {
    const show = windowlessShow();
    const tiles = buildMonthTiles([show], NOW);
    const november = tiles.find(tile => tile.key === '2026-11');
    expect(november?.dots).toEqual(['muted']);
  });

  it('is not an open pin on the map', () => {
    expect(deriveShowMarkerStatus(windowlessShow())).toBe('closed');
  });

  it.each(['open', 'closing_soon', 'closed'])(
    'is not bucketed under the "%s" entry-status filter',
    async entryStatus => {
      const show = windowlessShow();
      const { result } = renderHook(
        () =>
          useBrowseShowsFilters({
            shows: [show],
            entries: [],
            userContext: null,
            selectedTab: 'all',
          }),
        {
          wrapper: ({ children }: { children: React.ReactNode }) => (
            <MemoryRouter initialEntries={[`/shows?entryStatus=${entryStatus}`]}>
              {children}
            </MemoryRouter>
          ),
        }
      );

      expect(result.current.filters.entryStatus).toBe(entryStatus);
      await waitFor(() => expect(result.current.filteredShows).toEqual([]));
    }
  );
});
