// Who may ask for a registration's receipt besides its owner (MYK9-1999): a show official keying
// a mail-in entry, or a site admin. Access is club-derived, as can_manage_show_lifecycle_email
// is: a show-scoped user_roles row records paperwork and grants nothing since the
// label/permission split, so only a secretary or club admin of the show's club passes.
// Deno-free so vitest can import it.

export interface CallerRoleRow {
  club_id: string | null;
  roles?: { name?: string | null } | null;
}

const ADMIN_ROLES = new Set(['platform_admin', 'site_admin']);
const SHOW_OFFICIAL_ROLES = new Set(['secretary', 'trial_secretary', 'club_admin']);

export function roleManagesShow(
  role: CallerRoleRow,
  show: { id: string; club_id: string | null }
): boolean {
  const name = role.roles?.name ?? '';
  if (ADMIN_ROLES.has(name)) return true;
  if (!SHOW_OFFICIAL_ROLES.has(name)) return false;
  return !!show.club_id && role.club_id === show.club_id;
}
