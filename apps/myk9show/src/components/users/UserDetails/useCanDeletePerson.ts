import { useDeletePreview } from '@/features/delete/useDeletePreview';
import { personDeleteGate } from './personDeleteGate';

/**
 * The Delete person gate, with the server's answer for show staff.
 *
 * `soft_delete_person` lets staff delete only people with an entry in a show they
 * manage. The client cannot see that, so for staff it reads `delete_preview`, which
 * refuses with the same rule: Delete shows only once the counts have come back, and
 * stays hidden while pending, offline, forbidden or failed (it could not be used then
 * anyway, and a button that flashes in and vanishes is worse than none).
 */
export function useCanDeletePerson(
  person: { id: string; user_id?: string | null | undefined },
  viewer: Parameters<typeof personDeleteGate>[1],
  isRemoved: boolean
): boolean {
  const gate = personDeleteGate(person, viewer);
  const { state } = useDeletePreview('person', [person.id], gate === 'ask-server' && !isRemoved);
  if (isRemoved) return false;
  if (gate === 'allowed') return true;
  return gate === 'ask-server' && state.status === 'ready';
}
