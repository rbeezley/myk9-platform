// Who may ask for a registration's receipt besides its owner (MYK9-1999): a show official keying
// a mail-in entry, or a site admin. The same rule send-lifecycle-email applies
// (callerRoleAuthorizesLifecycleShow), so a club admin or show-scoped secretary who can key the
// entry can also have its receipt sent. Deno-free so vitest can import it.

export interface CallerRoleRow {
  club_id: string | null;
  show_id?: string | null;
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
  return role.show_id === show.id || (!!show.club_id && role.club_id === show.club_id);
}
