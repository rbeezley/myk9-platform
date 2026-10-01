import { canManageShowSurface } from '@/utils/roleScopes';
import { UserRole, type UserWithRoles } from '@/types/auth-types';

export interface EntryEligibleViewer {
  hasRole: (role: UserRole) => boolean;
  userWithRoles: UserWithRoles | null | undefined;
}

/**
 * The shows where the show page's "Add entry for someone else" action is live:
 * `/secretary/register/:showId`, i.e. the trial-secretary-only gate.
 *
 * Restates `useShowManageScope`'s `canOperate` (hooks/useShowManageScope.ts)
 * for a LIST of shows, where calling the per-show hook is not possible: a site
 * admin operates every show; otherwise the viewer needs the global SECRETARY
 * role AND club-scoped management of the show's owning club. A club admin who
 * is not a secretary is excluded, as the action is greyed "Trial secretary
 * access only" for them (features/actions/actionRegistry.ts).
 *
 * Callers pass shows already narrowed to the live phases (today / upcoming):
 * a draft cannot take entries and a finished show has none to key.
 */
export function filterEntryEligibleShows<T extends { clubId?: string | null | undefined }>(
  shows: readonly T[],
  { hasRole, userWithRoles }: EntryEligibleViewer
): T[] {
  const isAdmin = hasRole(UserRole.SITE_ADMIN);
  if (isAdmin) return [...shows];
  const isSecretary = hasRole(UserRole.SECRETARY);
  if (!isSecretary) return [];
  return shows.filter(
    show =>
      !!show.clubId &&
      canManageShowSurface({ isSecretary, isAdmin, hasRole, userWithRoles, clubId: show.clubId })
  );
}
