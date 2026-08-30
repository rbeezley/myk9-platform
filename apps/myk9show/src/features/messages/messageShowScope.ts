import { UserRole, type UserWithRoles } from '@/types/auth-types';
import { hasScopedClubRole } from '@/utils/roleScopes';

/**
 * Which shows a staff member may read message threads for.
 *
 * This mirrors the `threads_select` policy on `show_message_threads`:
 *
 *   participant_id = auth.uid()
 *   OR is_platform_admin()
 *   OR EXISTS (SELECT 1 FROM shows s
 *              WHERE s.id = show_id
 *                AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id)))
 *
 * so it is deliberately narrower than the ringside staff predicate next door:
 *
 * - **Club-scoped, not global.** `hasRole(SECRETARY)` answers "a secretary anywhere",
 *   which is not what the server asks. `is_trial_secretary(club_id)` requires a role row
 *   for THAT club (and active membership in it), so a global secretary row with a null
 *   club matches no specific club.
 * - **Secretary and club admin only.** Chairman and steward carry ringside access but no
 *   message grant. Including them would list shows whose threads the server will never
 *   return — a filter option that is permanently, inexplicably empty.
 * - **No show-scoped role.** `is_trial_secretary` requires `ur.show_id IS NULL`, so a
 *   show-level secretary grant does not confer message access.
 *
 * F24: the Communication History filter was built from the global show store, which
 * holds every show the app has loaded for public browsing, so it listed other clubs'
 * shows by name. Message CONTENT was never exposed — RLS held, and
 * `supabase/tests/show_message_tenant_isolation_test.sql` now proves it — but the page
 * both advertised those shows and subscribed to them, asking the server for data it
 * could not have.
 */
export interface MessageShowScope {
  id: string;
  clubId?: string | undefined;
}

export function canReadShowMessages(
  userWithRoles: UserWithRoles | null | undefined,
  hasRole: (role: UserRole) => boolean,
  show: MessageShowScope
): boolean {
  if (hasRole(UserRole.SITE_ADMIN)) return true;

  return (
    hasScopedClubRole(userWithRoles, UserRole.SECRETARY, show.clubId) ||
    hasScopedClubRole(userWithRoles, UserRole.CLUB_ADMIN, show.clubId)
  );
}

/** The shows whose message threads this user may read, in the order given. */
export function selectMessageShows<T extends MessageShowScope>(
  shows: readonly T[] | null | undefined,
  userWithRoles: UserWithRoles | null | undefined,
  hasRole: (role: UserRole) => boolean
): T[] {
  return (shows ?? []).filter(show => canReadShowMessages(userWithRoles, hasRole, show));
}
