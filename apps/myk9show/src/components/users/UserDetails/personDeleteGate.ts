import { UserRole } from '@/types/auth-types';

/**
 * Who sees "Delete person" (CRUD standard Phase 3). The server's rule,
 * `soft_delete_person` (migration 20261001235300), refuses everyone except
 *
 *   is_site_admin()
 *   OR can_manage_show_person(person)   -- manages a show this person has an entry in
 *   OR the person's own account         -- people.auth_user_id = auth.uid()
 *
 * DELIBERATE EXCEPTION, owner-visible: the middle clause depends on the person's entries
 * across shows, which no replica here holds. Three rounds of review showed that asking the
 * server first (a separate authorization read, then a latch, then a retry) is more
 * machinery than the case deserves, so this gate is STATIC and slightly wider than the
 * server: a global secretary or club admin sees Delete on any person, and on a stranger
 * the server refuses it. The shared delete dialog already says so in plain words and
 * offers no Delete button (`unknownReason('person', 'forbidden')`). Everyone the server
 * would refuse outright (an exhibitor, judge or steward looking at someone else) never
 * sees the control.
 */
const SHOW_STAFF_ROLES: readonly UserRole[] = [UserRole.SECRETARY, UserRole.CLUB_ADMIN];

export function canDeletePerson(
  person: { id: string; user_id?: string | null | undefined },
  viewer: { id?: string | undefined; roles?: readonly UserRole[] | undefined } | null | undefined
): boolean {
  if (!viewer) return false;
  const roles = viewer.roles ?? [];
  if (roles.includes(UserRole.SITE_ADMIN)) return true;
  // Self is matched on the person's mapped auth account only. `person.id` is a people.id,
  // never an auth uid, so comparing it with the viewer's id would match nothing real.
  if (person.user_id && viewer.id === person.user_id) return true;
  return SHOW_STAFF_ROLES.some(role => roles.includes(role));
}
