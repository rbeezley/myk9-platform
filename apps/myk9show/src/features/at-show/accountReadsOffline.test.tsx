/**
 * The at-show account reads must still run while the device is offline.
 *
 * `getUserEntries` is network-first since MYK9-536 and carries its own offline
 * fallback (the replicated per-show snapshot). That fallback is only as
 * reachable as its CALLER: React Query's default `networkMode: 'online'` parks
 * a query at `fetchStatus: 'paused'` the moment the browser reports offline and
 * never invokes the query function at all — so the fallback would be dead code
 * exactly at a show, on venue wifi, which is the one place it has to work.
 *
 * These two hooks are show-day critical (ringside "is this my show?" and the
 * upcoming-shows list), so they pin the `networkMode: 'always'` that keeps the
 * fallback reachable. The assertion is deliberately about the CALL happening
 * offline, not about the rows: a test that only checked rows would pass with
 * the query paused and a cached value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHasAnyEntryForShow } from './useHasAnyEntryForShow';
import { useExhibitorUpcomingShows } from './useExhibitorUpcomingShows';
import { getUserEntries } from '@/services/database/entries';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useRoleBasedData', () => ({
  useCurrentUserPersonId: vi.fn(),
}));

const SHOW_ID = 'show-heartland';

/** What the replica fallback hands back when the view is unreachable. */
const replicaRows = [
  {
    id: 'entry-1',
    show_id: SHOW_ID,
    entry_status: 'accepted',
    show: {
      id: SHOW_ID,
      name: 'Heartland',
      start_date: '2099-10-10',
      end_date: '2099-10-11',
    },
  },
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue('person-1');
  (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: replicaRows,
    error: null,
  });
  // The browser says offline; `getUserEntries` still answers, from the replica.
  onlineManager.setOnline(false);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('at-show account reads while offline (MYK9-536)', () => {
  it('useHasAnyEntryForShow still calls the entry read and answers', async () => {
    const { result } = renderHook(() => useHasAnyEntryForShow(SHOW_ID), {
      wrapper,
    });

    await waitFor(() => expect(result.current.hasAnyEntryForShow).toBe(true));
    expect(getUserEntries).toHaveBeenCalledWith('person-1');
  });

  it('useExhibitorUpcomingShows still calls the entry read and answers', async () => {
    const { result } = renderHook(() => useExhibitorUpcomingShows(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getUserEntries).toHaveBeenCalledWith('person-1');
  });
});
