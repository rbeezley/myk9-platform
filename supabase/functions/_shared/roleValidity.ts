/** PostgREST filter for a role assignment that is currently usable. */
export const ACTIVE_ROLE_NOT_EXPIRED = 'expires_at.is.null,expires_at.gt.now()';

/**
 * Apply the role-validity contract to any Supabase query that starts from
 * `user_roles`. Keeping the predicate in one shared helper prevents service-
 * role Edge handlers from silently drifting to an `is_active`-only check.
 */
export function applyActiveRoleValidity<TQuery>(query: TQuery): TQuery {
  const builder = query as unknown as {
    eq(column: string, value: unknown): { or(filters: string): unknown };
  };

  builder.eq('is_active', true).or(ACTIVE_ROLE_NOT_EXPIRED);
  return query;
}

export interface RoleValidityRow {
  is_active: boolean | null | undefined;
  expires_at: string | null | undefined;
}

/** Pure counterpart used by unit tests and any in-memory recipient filtering. */
export function isCurrentRole(row: RoleValidityRow, now = new Date()): boolean {
  if (row.is_active !== true) return false;
  if (row.expires_at == null) return true;

  const expiresAt = Date.parse(row.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}
