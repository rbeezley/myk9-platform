import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useIsOnline } from '@/hooks/useNetworkStatus';

/**
 * MYK9-995: the caller's place in line for their own entries, counted on the
 * server by `get_my_entry_queue_places`.
 *
 * Exhibitor surfaces hold only their own rows, so they cannot count a place
 * (see `ownEntryQueueState`); the RPC counts it against the same waiting queue
 * ringside uses and returns a number per OWN entry, nothing about anyone else.
 *
 * Online-only, and a place is a claim about right now: it is offered only from
 * a settled answer for exactly these entries while online. Offline, paused,
 * loading, placeholder (the previous key's rows) or failed all yield an empty
 * map, and the caller keeps its state label ("Waiting"). A stale "Next up" is
 * worse than no place at all.
 */

/** Entry id -> 1-based place. Only waiting entries with a set run order appear. */
export type QueuePlaces = ReadonlyMap<string, number>;

const NO_PLACES: QueuePlaces = new Map();

// The generated Database types gain this RPC at the post-push types regen; a
// narrow client keeps the call typed until then (premiumPublishCoordinator).
interface QueuePlacesRpcClient {
  rpc: (
    functionName: 'get_my_entry_queue_places',
    args: { p_entry_ids: string[] }
  ) => Promise<{ data: unknown; error: unknown }>;
}

export async function fetchMyEntryQueuePlaces(entryIds: readonly string[]): Promise<QueuePlaces> {
  const { data, error } = await (supabase as unknown as QueuePlacesRpcClient).rpc(
    'get_my_entry_queue_places',
    { p_entry_ids: [...entryIds] }
  );
  if (error) throw error;
  const places = new Map<string, number>();
  for (const row of Array.isArray(data) ? data : []) {
    const { entry_id: entryId, place } = (row ?? {}) as { entry_id?: unknown; place?: unknown };
    if (typeof entryId === 'string' && typeof place === 'number' && place >= 1) {
      places.set(entryId, place);
    }
  }
  return places;
}

/** What the query may honestly say, given its state. */
export interface QueuePlacesQueryState {
  data: QueuePlaces | undefined;
  isPlaceholderData: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isError: boolean;
}

export function settledQueuePlaces(query: QueuePlacesQueryState, isOnline: boolean): QueuePlaces {
  if (!isOnline || query.isError || query.isPlaceholderData) return NO_PLACES;
  if (query.fetchStatus === 'paused') return NO_PLACES;
  return query.data ?? NO_PLACES;
}

/** The settled places and when the server last counted them (null = no settled answer). */
export interface QueuePlacesWithFreshness {
  places: QueuePlaces;
  /** `Date.now()`-style ms of the last good count; null while nothing is offered. */
  updatedAt: number | null;
}

/**
 * Same answer as `useMyEntryQueuePlaces`, plus when it was counted, so a
 * surface that shows a place can say how old it is (MYK9-1046).
 */
export function useMyEntryQueuePlacesWithFreshness(
  entryIds: readonly string[]
): QueuePlacesWithFreshness {
  const { user } = useAuthContext();
  const isOnline = useIsOnline();
  const ids = useMemo(() => [...new Set(entryIds)].sort(), [entryIds]);
  const key = ids.join(',');

  const query = useQuery({
    queryKey: ['my-entry-queue-places', user?.id ?? 'anonymous', key] as const,
    queryFn: () => fetchMyEntryQueuePlaces(ids),
    enabled: !!user && ids.length > 0 && isOnline,
    ...cacheStrategies.realtime,
    // The ring moves on its own; re-count while the page is visible.
    refetchInterval: 30_000,
  });

  const places = settledQueuePlaces(query, isOnline);
  return {
    places,
    updatedAt: places.size > 0 && query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
  };
}

export function useMyEntryQueuePlaces(entryIds: readonly string[]): QueuePlaces {
  return useMyEntryQueuePlacesWithFreshness(entryIds).places;
}
