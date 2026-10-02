import { UserRole } from '@/types/auth-types';

/**
 * Who sees "Delete person" (CRUD standard Phase 3). Mirrors `soft_delete_person`
 * (migration 20261001235300), which refuses everyone except
 *
 *   is_site_admin()
 *   OR can_manage_show_person(person)   -- manages a show this person has an entry in
 *   OR the person's own account         -- people.auth_user_id = auth.uid()
 *
 * The middle clause depends on the person's entries, which the page does not load.
 * Staff who can manage shows (secretary, club admin) therefore pass here, and the
 * delete dialog's server preview reports a person outside their shows as forbidden
 * before Delete is ever enabled. Everyone the server would refuse outright (an
 * exhibitor, judge or steward looking at someone else) never sees the control.
 */
const SHOW_STAFF_ROLES: readonly UserRole[] = [UserRole.SECRETARY, UserRole.CLUB_ADMIN];

export function canDeletePerson(
  person: { id: string; user_id?: string | null | undefined },
  viewer: { id?: string | undefined; roles?: readonly UserRole[] | undefined } | null | undefined
): boolean {
  if (!viewer) return false;
  const roles = viewer.roles ?? [];
  if (roles.includes(UserRole.SITE_ADMIN)) return true;
  if (SHOW_STAFF_ROLES.some(role => roles.includes(role))) return true;
  // Self is matched on the person's mapped auth account only. `person.id` is a people.id,
  // never an auth uid, so comparing it with the viewer's id would match nothing real.
  return Boolean(person.user_id) && viewer.id === person.user_id;
}
