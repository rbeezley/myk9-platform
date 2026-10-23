import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { useEntriesReplicaInvalidation } from './useEntriesReplicaInvalidation';

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

/** The settled places plus when that answer landed (`null` = no confirmed answer). */
export interface QueuePlacesWithFreshness {
  places: QueuePlaces;
  /** `dataUpdatedAt` of the settled answer; null whenever `places` is the empty fallback. */
  updatedAt: number | null;
}

/**
 * `settledQueuePlaces` plus the moment the answer landed, so a surface can say
 * how fresh a place in line is. A place offered with no timestamp is a number
 * with no freshness, so an unsettled query (offline, paused, placeholder,
 * failed, unanswered) reports `null`, and so does a timestamp of 0.
 */
export function settledQueuePlacesWithFreshness(
  query: QueuePlacesQueryState & { dataUpdatedAt: number },
  isOnline: boolean
): QueuePlacesWithFreshness {
  const places = settledQueuePlaces(query, isOnline);
  const settled = places !== NO_PLACES && query.dataUpdatedAt > 0;
  return { places: settled ? places : NO_PLACES, updatedAt: settled ? query.dataUpdatedAt : null };
}

/** Poll cadence for the RPC; replica changes refresh it sooner. */
export const QUEUE_PLACES_REFETCH_MS = 60_000;
/** Folds the replica's leading + trailing notices (and a sync burst) into one RPC. */
export const QUEUE_PLACES_REPLICA_COALESCE_MS = 1_000;
/** Query key prefix shared by every queue-places query (see the key in the hook). */
const QUEUE_PLACES_KEY = 'my-entry-queue-places';

export function useMyEntryQueuePlacesWithFreshness(
  entryIds: readonly string[]
): QueuePlacesWithFreshness {
  const { user } = useAuthContext();
  const isOnline = useIsOnline();
  const ids = useMemo(() => [...new Set(entryIds)].sort(), [entryIds]);
  const key = ids.join(',');

  const query = useQuery({
    queryKey: [QUEUE_PLACES_KEY, user?.id ?? 'anonymous', key] as const,
    queryFn: () => fetchMyEntryQueuePlaces(ids),
    enabled: !!user && ids.length > 0 && isOnline,
    ...cacheStrategies.realtime,
    // Server-only on purpose (MYK9-1368): the RPC is authoritative for OTHER
    // exhibitors' positions, which the replica cannot count. The ring moves on
    // its own, so re-count each minute while the page is visible, and at once
    // (below) when a score or check-in reaches this device.
    refetchInterval: QUEUE_PLACES_REFETCH_MS,
  });

  useEntriesReplicaInvalidation(
    [[QUEUE_PLACES_KEY, user?.id ?? 'anonymous']],
    QUEUE_PLACES_REPLICA_COALESCE_MS
  );

  return settledQueuePlacesWithFreshness(query, isOnline);
}

export function useMyEntryQueuePlaces(entryIds: readonly string[]): QueuePlaces {
  return useMyEntryQueuePlacesWithFreshness(entryIds).places;
}
