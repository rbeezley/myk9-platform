/**
 * The admin roster as the React Query cache holds it RIGHT NOW. The cache
 * outlives every component — unlike a ref owned by the bulk bar, which stops
 * updating the moment a run clears the selection and unmounts the bar. A toast's
 * "Retry failed" fires after that, so it must read here (MYK9-835, Codex P1 on
 * 794a83820).
 *
 * The roster query is keyed `[...users.all, 'admin', { showDeleted }]`; the page
 * keeps exactly one variant active, so the active query IS the visible roster.
 */

import type { QueryClient, QueryFunction } from '@tanstack/react-query';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { queryKeys } from '@/lib/queryClient';

const ROSTER_KEY = [...queryKeys.users.all, 'admin'] as const;

function activeRosterQueries(queryClient: QueryClient) {
  return queryClient.getQueryCache().findAll({ queryKey: ROSTER_KEY, type: 'active' });
}

/** The cached roster by person id, or null when no roster query is mounted. */
export function readLiveRoster(queryClient: QueryClient): Map<string, AdminUser> | null {
  const queries = activeRosterQueries(queryClient);
  if (queries.length === 0) return null;
  const roster = new Map<string, AdminUser>();
  for (const query of queries) {
    for (const person of (query.state.data as AdminUser[] | undefined) ?? []) {
      roster.set(person.id, person);
    }
  }
  return roster;
}

/**
 * Refetches the mounted roster, then returns it. Concurrent callers share one
 * in-flight fetch (Query#fetch dedupes). Returns null when there is no mounted
 * roster or the refresh failed — the caller cannot confirm anyone's current
 * state and must not act on a guess.
 */
export async function refreshLiveRoster(
  queryClient: QueryClient
): Promise<Map<string, AdminUser> | null> {
  const queries = activeRosterQueries(queryClient);
  if (queries.length === 0) return null;
  // Fail fast: no retry/backoff, and networkMode 'always' so an offline fetch
  // rejects immediately instead of pausing and holding the dispatch latch. A
  // failed refresh is "could not verify"; the next retry issues a NEW fetch. A
  // fetch already in flight is awaited as-is (it is live, not hung by us).
  try {
    await Promise.all(
      queries.map(query =>
        queryClient.fetchQuery({
          queryKey: query.queryKey,
          // Passed explicitly: without a queryFn, Query#fetch re-adopts the
          // OBSERVER's options (networkMode 'online', default retry) and
          // silently discards the fail-fast settings below.
          queryFn: query.options.queryFn as QueryFunction<AdminUser[]>,
          retry: false,
          staleTime: 0,
          networkMode: 'always',
        })
      )
    );
  } catch {
    return null;
  }
  return readLiveRoster(queryClient);
}
