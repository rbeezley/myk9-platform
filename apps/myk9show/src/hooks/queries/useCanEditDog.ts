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

export function useCanEditDog(dogId: string, knownAllowed: boolean): boolean {
  const query = useQuery({
    queryKey: queryKeys.dogCanEdit(dogId),
    queryFn: () => fetchCanEditDog(dogId),
    enabled: !knownAllowed,
    staleTime: 60_000,
    retry: false,
  });
  // INTENT: only a definite "no" from the server withholds editing. Loading, offline (a
  // paused query), a failed check and a dog the server does not have yet all keep editing
  // available: on show day a secretary must not lose Edit to a flaky connection, and the
  // server still decides, with Discard putting a refused edit back.
  return knownAllowed || query.data !== false;
}
