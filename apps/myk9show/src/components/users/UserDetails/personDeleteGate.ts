import { UserRole } from '@/types/auth-types';

/**
 * Who sees "Delete person" (CRUD standard Phase 3). Mirrors `soft_delete_person`
 * (migration 20261001235300), which refuses everyone except
 *
 *   is_site_admin()
 *   OR can_manage_show_person(person)   -- manages a show this person has an entry in
 *   OR the person's own account         -- people.auth_user_id = auth.uid()
 *
 * The middle clause depends on the person's entries, which no replica here holds across
 * shows. So the client answers three ways: `allowed` (site admin, own account), `denied`
 * (an exhibitor, judge or steward looking at someone else: the server refuses outright)
 * and `ask-server` (show staff, whose answer is the server's own `delete_preview`; see
 * `useCanDeletePerson`). A staff member with no show in common with the person never sees
 * the button.
 */
export type PersonDeleteGate = 'allowed' | 'ask-server' | 'denied';

const SHOW_STAFF_ROLES: readonly UserRole[] = [UserRole.SECRETARY, UserRole.CLUB_ADMIN];

export function personDeleteGate(
  person: { id: string; user_id?: string | null | undefined },
  viewer: { id?: string | undefined; roles?: readonly UserRole[] | undefined } | null | undefined
): PersonDeleteGate {
  if (!viewer) return 'denied';
  const roles = viewer.roles ?? [];
  if (roles.includes(UserRole.SITE_ADMIN)) return 'allowed';
  // Self is matched on the person's mapped auth account only. `person.id` is a people.id,
  // never an auth uid, so comparing it with the viewer's id would match nothing real.
  if (person.user_id && viewer.id === person.user_id) return 'allowed';
  if (SHOW_STAFF_ROLES.some(role => roles.includes(role))) return 'ask-server';
  return 'denied';
}
