import { useQuery } from '@tanstack/react-query';
import { fetchDeletePreview } from '@/features/delete/deletePreview';
import { personDeleteGate } from './personDeleteGate';

/** Its own key: never the dialog's `delete_preview` key, whose observers refetch on mount. */
export const personDeleteAuthKey = (personId: string) => ['person-delete-auth', personId] as const;

/**
 * The Delete person gate, with the server's answer for show staff.
 *
 * `soft_delete_person` lets staff delete only people with an entry in a show they
 * manage. The client cannot see that, so for staff it asks the server once, through
 * `delete_preview` (which refuses with the same rule), under a key of its own.
 *
 * Structurally stable: the read is made once per person per page view
 * (`staleTime: Infinity`, no refetch on mount or focus), so a success can never go
 * back to pending when the delete dialog opens and mounts its own preview observer
 * (production `refetchOnMount: true` did exactly that and unmounted the confirmation).
 * Only an error (the server refusing: forbidden, offline, failed) leaves it false, and
 * navigating to another person starts a fresh read. Hidden while the first read is
 * pending: a button that flashes in and vanishes is worse than none.
 */
export function useCanDeletePerson(
  person: { id: string; user_id?: string | null | undefined },
  viewer: Parameters<typeof personDeleteGate>[1],
  isRemoved: boolean
): boolean {
  const gate = personDeleteGate(person, viewer);
  const { isSuccess } = useQuery({
    queryKey: personDeleteAuthKey(person.id),
    queryFn: () => fetchDeletePreview('person', person.id),
    enabled: gate === 'ask-server' && !isRemoved,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  if (isRemoved) return false;
  if (gate === 'allowed') return true;
  return gate === 'ask-server' && isSuccess;
}
