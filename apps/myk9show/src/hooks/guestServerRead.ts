import { useSyncExternalStore } from 'react';
import { onlineManager, type UseQueryResult } from '@tanstack/react-query';

/**
 * MYK9-747: query options for a guest club read. A cached result is never an
 * authoritative answer (a club may have been revoked since), so every mount
 * refetches and nothing is ever considered fresh.
 */
export const GUEST_READ_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: 'always',
} as const;

/** React Query's own online signal, so it agrees with query pausing. */
export function useQueryOnlineStatus(): boolean {
  return useSyncExternalStore(
    onStoreChange => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
    () => true
  );
}

export type GuestReadState<T> =
  { kind: 'loading' } | { kind: 'offline' } | { kind: 'error' } | { kind: 'ready'; data: T };

/**
 * What a guest may be shown from a server read. Online-only means:
 * - offline (browser offline, or the query paused) always wins, even over
 *   data read earlier in the session;
 * - data counts only once a fetch has completed since THIS mount
 *   (`isFetchedAfterMount`) and the latest fetch succeeded, so cached rows
 *   from an earlier visit never render while the mount refetch is in flight;
 *   a later refetch within the mount keeps showing that mount's result.
 */
export function resolveGuestRead<T>(
  query: Pick<UseQueryResult<T>, 'data' | 'fetchStatus' | 'isError' | 'isFetchedAfterMount'>,
  isOnline: boolean
): GuestReadState<T> {
  if (!isOnline || query.fetchStatus === 'paused') return { kind: 'offline' };
  if (!query.isFetchedAfterMount) return { kind: 'loading' };
  // A failed fetch is an error even when older data is still cached; a retry
  // in flight after one is loading.
  if (query.isError)
    return query.fetchStatus === 'fetching' ? { kind: 'loading' } : { kind: 'error' };
  if (query.data === undefined) return { kind: 'loading' };
  return { kind: 'ready', data: query.data };
}
