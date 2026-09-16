/**
 * The ONE account-level own-entry read, and the query key every consumer of it
 * shares (MYK9-563 item 3).
 *
 * `getUserEntries` pages the whole account out of
 * `view_authenticated_entry_results`. Four hooks want different slices of that
 * one answer — "am I entered in this show", "which shows are coming up", "which
 * show ids have I entered", "what do I owe" — and each used to hold its own
 * React Query key. Distinct keys mean distinct cache entries, so a surface
 * mounting two of them paid two full paged reads of identical rows, and every
 * `refetchOnReconnect` wifi flap at a venue fired all four.
 *
 * One key, one cache entry, one in-flight request; the differences move into
 * `select`, which React Query runs per observer over the shared data. Because
 * the key is shared, the query OPTIONS are shared too and live here rather than
 * being restated (and drifting) in four places — a second `staleTime` for the
 * same cache entry is not a second policy, it is a race.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { viewerScope } from '@/lib/viewerScopedQueryKey';
import { getUserEntries } from '@/services/database/entries';

/**
 * What the shared read hands its consumers.
 *
 * `degraded` is the one flag surfaces read, and it is the OR of the two
 * distinct reasons `getUserEntries` has to distrust its own answer:
 *
 *  - `stale` — the rows came from the per-show replication snapshot without the
 *    authoritative view confirming them (it failed, timed out, or came back
 *    empty against a populated snapshot). They are real rows, but they may
 *    describe a world the server no longer agrees with: a hard-deleted entry, a
 *    reassigned dog.
 *  - `enrichmentMissing` — the replica path could not read the `enrollments`
 *    enrichment. With no order `payment_status`,
 *    `resolveEffectivePaymentStatus` falls back to "the entry row stands", so a
 *    pending order over a paid-looking row UNDER-claims the amount due, and the
 *    rows carry no confirmation number at all.
 *
 * Both end in the same place for a consumer — a figure that must not be stated
 * as fact — so both are folded here rather than asking every surface to
 * remember the second one. `error` is `null` on both paths by design, which is
 * exactly why this flag has to travel separately.
 */
export interface AccountEntriesRead {
  rows: Record<string, unknown>[];
  degraded: boolean;
}

/** What a consumer sees before there is an identity to read for. */
export const EMPTY_ACCOUNT_ENTRIES: AccountEntriesRead = { rows: [], degraded: false };

/**
 * The shared key. Viewer-scoped under the `exhibitor` namespace so
 * `viewerScopeGuard` can see the scoping (MYK9-429): the cache is a module
 * singleton, and a key naming only WHAT was read would serve one account's
 * entries to the next person signing in on the same tab.
 *
 * `viewerScope()` takes the AUTH user id, per its own contract
 * (`lib/viewerScopedQueryKey.ts`) — `people.id` is never `auth.uid()` in this
 * project, so passing the person id there would have put a non-auth value in
 * the slot the guard reads as "who fetched this". The person id is the read's
 * actual parameter and rides alongside as a plain segment, so a change of
 * either one is a different cache entry.
 */
export function accountEntriesQueryKey(
  authUserId: string | null | undefined,
  personId: string | null | undefined
) {
  return ['exhibitor', 'account-entries', viewerScope(authUserId ?? null), personId] as const;
}

export interface UseAccountEntriesOptions {
  /**
   * An ADDITIONAL gate on top of `!!personId`, for a consumer that has its own
   * reason to stand down (no `showId` yet, say). Identity gating itself is not
   * negotiable here and is not exposed: `enabled: !!personId` is the semantics
   * every consumer already had, and making identity offline-durable is
   * MYK9-601's job, not this hook's.
   */
  enabled?: boolean;
}

/**
 * Subscribe to the shared account-entries read and project it.
 *
 * `select` must be referentially stable across renders — a module-level
 * function, or `useCallback` when it closes over a prop — or React Query re-runs
 * it every render.
 */
export function useAccountEntries<TSelected>(
  personId: string | null | undefined,
  select: (read: AccountEntriesRead) => TSelected,
  options: UseAccountEntriesOptions = {}
): UseQueryResult<TSelected, Error> {
  const { user } = useAuthContext();

  return useQuery({
    queryKey: accountEntriesQueryKey(user?.id, personId),
    queryFn: async (): Promise<AccountEntriesRead> => {
      // Unreachable while `enabled` holds, but `getUserEntries` takes a
      // non-null id and TypeScript cannot see the gate from here.
      if (!personId) return EMPTY_ACCOUNT_ENTRIES;
      const { data, error, stale, enrichmentMissing } = await getUserEntries(personId);
      // Thrown, never swallowed: a read that failed must not reach a consumer
      // as an empty list. "You have no entries", "you owe nothing" and "you are
      // not entered in this show" are all positive claims.
      if (error) throw error;
      return { rows: data ?? [], degraded: Boolean(stale || enrichmentMissing) };
    },
    enabled: !!personId && (options.enabled ?? true),
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
    // One retry, not the global default of two: each attempt pays the full
    // `getUserEntries` view deadline, so the default turns a dead network into
    // a ~46s spinner before the replica fallback is ever shown.
    retry: 1,
    // `getUserEntries` carries its own offline fallback (the replicated
    // snapshot), but React Query's default `networkMode: 'online'` parks this
    // query at `fetchStatus: 'paused'` while offline and never calls it, so the
    // fallback is unreachable exactly when it matters. Same reason as
    // `useAtShowClassList` / `RingsideShowBoundary`.
    networkMode: 'always' as const,
    select,
  });
}
