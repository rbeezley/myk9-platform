/** A role assignment counts only while it is active and not past `expires_at`. */
export function isRoleAssignmentCurrent(
  assignment: { is_active: boolean; expires_at?: string | null },
  now: number = Date.now()
): boolean {
  if (!assignment.is_active) return false;
  if (!assignment.expires_at) return true;
  const expiry = Date.parse(assignment.expires_at);
  return Number.isNaN(expiry) || expiry > now;
}
