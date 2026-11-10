/** "club_admin" -> "Club Admin". Every underscore, not just the first. */
export function formatRoleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
