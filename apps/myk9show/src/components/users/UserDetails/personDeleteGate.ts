import { UserRole } from '@/types/auth-types';

/**
 * Who sees "Delete person" (CRUD standard Phase 3). It is exactly the server's rule,
 * `soft_delete_person` (MYK9-934, migration 20261002143717):
 *
 *   is_site_admin()
 *   OR the person's own account         -- people.auth_user_id = auth.uid()
 *
 * Owner decision (MYK9-934): secretaries and club admins never delete a person, not even one
 * entered in a show they manage. `people` has no creator column, so "delete only what you
 * added" cannot be expressed; a secretary who needs a person gone asks a site admin.
 */
export function canDeletePerson(
  person: { id: string; user_id?: string | null | undefined },
  viewer: { id?: string | undefined; roles?: readonly UserRole[] | undefined } | null | undefined
): boolean {
  if (!viewer) return false;
  if ((viewer.roles ?? []).includes(UserRole.SITE_ADMIN)) return true;
  // Self is matched on the person's mapped auth account only. `person.id` is a people.id,
  // never an auth uid, so comparing it with the viewer's id would match nothing real.
  return Boolean(person.user_id) && viewer.id === person.user_id;
}
