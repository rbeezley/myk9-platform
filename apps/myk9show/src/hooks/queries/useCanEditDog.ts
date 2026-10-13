/**
 * May the signed-in viewer edit this dog? Asks the server's `can_edit_dog()`, which
 * applies the exact rule `dogs_update` enforces (20261012224900), so the app only offers
 * Edit, Change Photo and Change status on a dog whose save the server will accept.
 *
 * Without this, a secretary (who can READ every dog, MYK9-854) was offered Edit on any
 * dog; the edit saved locally, then the server refused it on every upload and Retry.
 *
 * Online-only by design: a permission check, like the other `can_*` RPCs. The caller
 * passes `knownAllowed` when it can decide locally (owner, co-owner, site admin, a dog
 * created in this session), so those viewers never wait on, or depend on, the network.
 */
import { onlineManager, useQuery } from '@tanstack/react-query';
import { withTimeout } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';

/** A stalled venue connection must not hold up an edit for longer than this. */
const CHECK_TIMEOUT_MS = 5_000;

/** `null` when the server has no such dog yet (created on this device, not uploaded). */
async function fetchCanEditDog(dogId: string): Promise<boolean | null> {
  const { data, error } = await withTimeout(
    supabase.rpc('can_edit_dog', { p_dog_id: dogId }),
    CHECK_TIMEOUT_MS,
    'can_edit_dog'
  );
  if (error) throw error;
  return typeof data === 'boolean' ? data : null;
}

/**
 * The same question outside React (bulk actions): `false` only when the server said no,
 * `null` when it could not answer (offline, failed, timed out, dog not uploaded yet), which
 * callers treat as "go ahead", so a local queued save is never held up waiting on it.
 */
export async function askCanEditDog(dogId: string): Promise<boolean | null> {
  if (!onlineManager.isOnline()) return null;
  try {
    return await fetchCanEditDog(dogId);
  } catch {
    return null;
  }
}

/** What the decision reads: the local verdict and the server's last answer. */
export interface CanEditCheck {
  /** Decided locally (owner, co-owner, site admin, a dog made in this session). */
  knownAllowed: boolean;
  /**
   * The last answer the server gave: false = no, null = it has no such dog yet, undefined =
   * no answer yet. React Query keeps it through a failed refresh and while offline.
   */
  data: boolean | null | undefined;
}

/**
 * INTENT: fail open only BEFORE the server has answered. Loading, offline from the start,
 * a first check that failed or timed out, and a dog the server does not have yet all keep
 * editing available, so on show day a secretary never loses Edit to a flaky connection.
 * A "no" the server actually gave STANDS until a newer successful answer replaces it: a
 * failed refresh or going offline does not erase it, because offering Edit there only
 * produces a save the server refuses (the bug this check exists to prevent). The answer is
 * cached for 60s, so once connected a dog that has since become editable (its first entry
 * submitted) is asked again on the next visit.
 */
export function canEditFromCheck({ knownAllowed, data }: CanEditCheck): boolean {
  return knownAllowed || data !== false;
}

export function useCanEditDog(dogId: string, knownAllowed: boolean): boolean {
  const query = useQuery({
    queryKey: queryKeys.dogCanEdit(dogId),
    queryFn: () => fetchCanEditDog(dogId),
    enabled: !knownAllowed,
    staleTime: 60_000,
    retry: false,
  });
  return canEditFromCheck({ knownAllowed, data: query.data });
}
