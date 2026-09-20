/**
 * The account-level reads must still run while the device is offline.
 *
 * `getUserEntries` is network-first since MYK9-536 and carries its own offline
 * fallback (the replicated per-show snapshot). That fallback is only as
 * reachable as its CALLER: React Query's default `networkMode: 'online'` parks
 * a query at `fetchStatus: 'paused'` the moment the browser reports offline and
 * never invokes the query function at all — so the fallback would be dead code
 * exactly at a show, on venue wifi, which is the one place it has to work.
 *
 * WHAT THIS GUARANTEES, PRECISELY: the fallback is reachable offline *once
 * identity has resolved*. It is not reachable before that, and these tests pin
 * that boundary rather than papering over it — see the last case. All four
 * hooks are gated on `personId`, which now comes from the AuthContext's
 * account-scoped identity cache while the `people` lookup is paused offline.
 * A cold boot without that cache remains unresolved and keeps the queries
 * disabled; a restored pairing unlocks the replica-backed reads immediately.
 *
 * The assertion is deliberately about the CALL happening offline, not about the
 * rows: a test that only checked rows would pass with the query paused and a
 * cached value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHasAnyEntryForShow } from './useHasAnyEntryForShow';
import { useExhibitorUpcomingShows } from './useExhibitorUpcomingShows';
import { useAccountEnteredShowIds } from '@/hooks/queries/useAccountEnteredShowIds';
import { useMyEntryBalanceSummary } from '@/features/payments/useMyEntryBalanceSummary';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { savePersonIdentityCache } from '@/context/personIdentityCache';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

const SHOW_ID = 'show-heartland';

/** What the replica fallback hands back when the view is unreachable. */
const replicaRows = [
  {
    id: 'entry-1',
    show_id: SHOW_ID,
    entry_status: 'accepted',
    entry_fee: 30,
    payment_status: 'pending',
    show: {
      id: SHOW_ID,
      name: 'Heartland',
      start_date: '2099-10-10',
      end_date: '2099-10-11',
    },
  },
];

// One client for the whole file, created once. Building it inside the wrapper
// component made a NEW client on every render, which silently discards the
// in-flight query and its cache between renders.
const queryClient = new QueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-1' },
    userWithRoles: { databaseUserId: 'person-1' },
    personId: 'person-1',
    isAuthenticated: true,
  });
  (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: replicaRows,
    error: null,
    source: 'replica-offline',
  });
  // The browser says offline; `getUserEntries` still answers, from the replica.
  onlineManager.setOnline(false);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('account reads while offline, with identity resolved (MYK9-536)', () => {
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

  it('keeps an unconfirmed empty read distinct from a confirmed empty show list', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
      source: 'replica-offline',
    });

    const { result } = renderHook(() => useExhibitorUpcomingShows(), { wrapper });

    await waitFor(() => expect(result.current.readState).toBe('unconfirmed'));
    expect(result.current.upcomingShows).toEqual([]);
  });

  it('surfaces an upcoming-show read error instead of rendering an empty claim', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('entries unavailable')
    );

    const { result } = renderHook(() => useExhibitorUpcomingShows(), { wrapper });

    await waitFor(() => expect(result.current.readState).toBe('error'), { timeout: 5000 });
    expect(result.current.upcomingShows).toEqual([]);
  });

  it('useAccountEnteredShowIds still calls the entry read and answers', async () => {
    const { result } = renderHook(() => useAccountEnteredShowIds(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getUserEntries).toHaveBeenCalledWith('person-1');
    expect(result.current.all).toContain(SHOW_ID);
  });

  it('useMyEntryBalanceSummary calls the entry read and withholds the unconfirmed figure', async () => {
    const { result } = renderHook(() => useMyEntryBalanceSummary(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(getUserEntries).toHaveBeenCalledWith('person-1');
    // $30 derived from rows the server never confirmed is a figure the page is
    // not entitled to state — a hard-deleted entry still in the per-show
    // snapshot reads as a real debt for as long as the device stays offline.
    // Decision (a): the figure is withheld, the receipt stays reachable.
    expect(result.current.data?.kind).toBe('unknown');
    expect(result.current.data?.amountDueCents).toBe(0);
  });

  it('states the figure once the authoritative read confirms the rows', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: replicaRows,
      error: null,
      source: 'confirmed',
    });

    const { result } = renderHook(() => useMyEntryBalanceSummary(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.kind).toBe('known');
    expect(result.current.data?.amountDueCents).toBe(3000);
  });
});

describe('account reads on a COLD offline boot', () => {
  beforeEach(() => {
    // The `people` lookup that resolves `personId` is itself a network query and
    // pauses offline, so on a cold boot it never answers.
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1' },
      userWithRoles: {},
      personId: null,
      isAuthenticated: true,
    });
  });

  it('runs all four account reads with a restored person identity', async () => {
    savePersonIdentityCache('user-1', 'person-1');
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1' },
      userWithRoles: {},
      personId: 'person-1',
      isAuthenticated: true,
    });
    const hasAny = renderHook(() => useHasAnyEntryForShow(SHOW_ID), { wrapper });
    const upcoming = renderHook(() => useExhibitorUpcomingShows(), { wrapper });
    const entered = renderHook(() => useAccountEnteredShowIds(), { wrapper });
    const balance = renderHook(() => useMyEntryBalanceSummary(), { wrapper });

    await waitFor(() => {
      expect(getUserEntries).toHaveBeenCalledTimes(4);
      expect(hasAny.result.current.hasAnyEntryForShow).toBe(true);
      expect(upcoming.result.current.upcomingShows).toHaveLength(1);
      expect(entered.result.current.all).toContain(SHOW_ID);
      expect(balance.result.current.data?.kind).toBe('unknown');
    });
    expect(getUserEntries).toHaveBeenCalledWith('person-1');
  });

  it('reports unresolved identity rather than a confident empty list when no cache exists', async () => {
    const hasAny = renderHook(() => useHasAnyEntryForShow(SHOW_ID), { wrapper });
    const upcoming = renderHook(() => useExhibitorUpcomingShows(), { wrapper });
    const entered = renderHook(() => useAccountEnteredShowIds(), {
      wrapper,
    });

    // Never called: `enabled: !!personId` is false, so `networkMode` never gets
    // a say. This is the documented gap, pinned so it cannot be mistaken for a
    // regression in the offline fallback above.
    expect(getUserEntries).not.toHaveBeenCalled();

    // And crucially the hooks do NOT claim "no entries": they report not-loading
    // with an empty list only because there is no identity to load FOR, which
    // `isLoading: !!personId && isLoading` encodes deliberately.
    await waitFor(() => expect(upcoming.result.current.isLoading).toBe(false));
    expect(upcoming.result.current.upcomingShows).toEqual([]);
    expect(upcoming.result.current.identityState).toBe('unresolved');
    expect(hasAny.result.current.identityState).toBe('unresolved');
    expect(entered.result.current.identityState).toBe('unresolved');
    expect(entered.result.current.readState).toBe('identity-unresolved');
    expect(entered.result.current.isLoading).toBe(false);
    expect(entered.result.current.all).toEqual([]);
  });
});
