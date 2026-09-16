/**
 * The account-level entry read is ONE read, shared (MYK9-563 items 3 and 5).
 *
 * `getUserEntries` pages `view_authenticated_entry_results` for the whole
 * account. Four hooks consume it, and each used to own a distinct React Query
 * key — so a surface that mounted two of them paid two full paged reads of the
 * same rows, and a `refetchOnReconnect` wifi flap fired all four. One key with
 * per-consumer `select` is the fix: React Query dedupes on the key, so the
 * second observer reads the first one's cache entry.
 *
 * The error case is the other half. `useHasAnyEntryForShow` used to discard
 * `error` entirely and carry no `retry`, so a non-offline view failure over an
 * unreadable replica became `hasAnyEntryForShow: false` — "you are not entered
 * in this show", stated as fact at ringside, from a read that failed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHasAnyEntryForShow } from '@/features/at-show/useHasAnyEntryForShow';
import { useExhibitorUpcomingShows } from '@/features/at-show/useExhibitorUpcomingShows';
import { useAccountEnteredShowIds } from './useAccountEnteredShowIds';
import { useMyEntryBalanceSummary } from '@/features/payments/useMyEntryBalanceSummary';
import { getUserEntries } from '@/services/database/entries';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useRoleBasedData', () => ({
  useCurrentUserPersonId: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

const SHOW_ID = 'show-heartland';
const PERSON_ID = 'person-1';

const rows = [
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

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  // A fresh client per test: `retry: 1` means a failing case leaves a retry
  // scheduled, and a shared client would carry it into the next test.
  queryClient = new QueryClient();
  (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue(PERSON_ID);
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-1' },
    userWithRoles: { databaseUserId: PERSON_ID },
    isAuthenticated: true,
  });
  (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: rows,
    error: null,
  });
});

afterEach(() => {
  queryClient.clear();
});

describe('one shared account-entries read', () => {
  it('issues ONE getUserEntries call for two hooks mounted together', async () => {
    const both = renderHook(
      () => ({
        entered: useAccountEnteredShowIds(PERSON_ID),
        upcoming: useExhibitorUpcomingShows(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(both.result.current.entered.isLoading).toBe(false));
    await waitFor(() => expect(both.result.current.upcoming.isLoading).toBe(false));

    // Both answered from the SAME paged account read.
    expect(both.result.current.entered.all).toContain(SHOW_ID);
    expect(both.result.current.upcoming.upcomingShows).toHaveLength(1);
    expect(getUserEntries).toHaveBeenCalledTimes(1);
  });

  it('issues ONE call for all four consumers mounted together', async () => {
    const all = renderHook(
      () => ({
        hasAny: useHasAnyEntryForShow(SHOW_ID),
        upcoming: useExhibitorUpcomingShows(),
        entered: useAccountEnteredShowIds(PERSON_ID),
        balance: useMyEntryBalanceSummary(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(all.result.current.hasAny.hasAnyEntryForShow).toBe(true));
    await waitFor(() => expect(all.result.current.balance.data).toBeDefined());

    expect(getUserEntries).toHaveBeenCalledTimes(1);
    expect(getUserEntries).toHaveBeenCalledWith(PERSON_ID);
  });
});

describe('useHasAnyEntryForShow on a failed read', () => {
  it('surfaces the error instead of a confident "not entered"', async () => {
    // The view failed for a non-offline reason and the replica could not be
    // read, so `getUserEntries` returns the error rather than rows.
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: { message: 'RLS policy denied' },
    });

    const { result } = renderHook(() => useHasAnyEntryForShow(SHOW_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    // `false` is still what a boolean must be, but it now travels with the fact
    // that nobody could answer — no caller can read it as "not entered".
    expect(result.current.hasAnyEntryForShow).toBe(false);
    // `retry: 1`, not the global default of two: each attempt pays the full
    // account-read deadline.
    expect(getUserEntries).toHaveBeenCalledTimes(2);
  });
});

describe('the degraded signal reaches every consumer', () => {
  beforeEach(() => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: rows,
      error: null,
      stale: true,
    });
  });

  it('marks all four consumers degraded when the view never confirmed the rows', async () => {
    const all = renderHook(
      () => ({
        hasAny: useHasAnyEntryForShow(SHOW_ID),
        upcoming: useExhibitorUpcomingShows(),
        entered: useAccountEnteredShowIds(PERSON_ID),
        balance: useMyEntryBalanceSummary(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(all.result.current.balance.data).toBeDefined());
    await waitFor(() => expect(all.result.current.entered.isLoading).toBe(false));

    expect(all.result.current.hasAny.degraded).toBe(true);
    expect(all.result.current.upcoming.degraded).toBe(true);
    expect(all.result.current.entered.degraded).toBe(true);
    expect(all.result.current.balance.data?.stale).toBe(true);
  });

  it('reports NOT degraded when the authoritative view answered', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: rows,
      error: null,
    });

    const all = renderHook(
      () => ({
        upcoming: useExhibitorUpcomingShows(),
        entered: useAccountEnteredShowIds(PERSON_ID),
        balance: useMyEntryBalanceSummary(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(all.result.current.balance.data).toBeDefined());
    await waitFor(() => expect(all.result.current.entered.isLoading).toBe(false));

    expect(all.result.current.upcoming.degraded).toBe(false);
    expect(all.result.current.entered.degraded).toBe(false);
    expect(all.result.current.balance.data?.stale).toBeUndefined();
  });
});
