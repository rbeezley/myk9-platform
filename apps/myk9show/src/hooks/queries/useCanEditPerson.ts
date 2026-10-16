/**
 * May the signed-in viewer edit this person? Asks the server's `can_edit_person()`, which
 * applies the exact rule `people_update` and `update_person_details` enforce
 * (20261013143900), so the app only offers Edit on a person whose save the server accepts.
 *
 * Without this, a secretary (who can READ every person) was offered Edit Details on a
 * person the server would refuse, and the save failed with "Permission denied" (MYK9-1134).
 *
 * The person counterpart of `useCanEditDog`, and decided the same way
 * (`canEditFromCheck`): fail open only before the server has answered. The caller passes
 * `knownAllowed` when it can decide locally (the viewer's own record, a site admin, a
 * person created in this flow), so those viewers never wait on the network.
 */
import { useQuery } from '@tanstack/react-query';
import { withTimeout } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import { canEditFromCheck } from './useCanEditDog';

/** A stalled venue connection must not hold up an edit for longer than this. */
const CHECK_TIMEOUT_MS = 5_000;

/** `null` when the server has no such person yet (created on this device, not uploaded). */
async function fetchCanEditPerson(personId: string): Promise<boolean | null> {
  const { data, error } = await withTimeout(
    supabase.rpc('can_edit_person', { p_person_id: personId }),
    CHECK_TIMEOUT_MS,
    'can_edit_person'
  );
  if (error) throw error;
  return typeof data === 'boolean' ? data : null;
}

export function useCanEditPerson(personId: string, knownAllowed: boolean): boolean {
  const query = useQuery({
    queryKey: queryKeys.users.canEdit(personId),
    queryFn: () => fetchCanEditPerson(personId),
    enabled: !knownAllowed && Boolean(personId),
    staleTime: 60_000,
    retry: false,
  });
  return canEditFromCheck({ knownAllowed, data: query.data });
}
