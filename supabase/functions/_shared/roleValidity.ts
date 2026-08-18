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

/**
 * True when any row of a `select('role:roles(name)')` result names `roleName`.
 *
 * `user_roles.role_id` is a to-one FK, so PostgREST returns the embed as a
 * single object. supabase-js cannot infer that cardinality without generated
 * `Database` types and widens every embed to an array, so annotating the
 * `.some()` callback at each call site produced a type that fought the client's
 * inference. Narrowing from `unknown` here puts the four privileged Edge
 * handlers on one shape check instead.
 *
 * Deliberately matches ONLY the object embed, not an array one: this gates
 * site_admin, so an unexpected response shape must fall through to `false`
 * (deny) rather than be interpreted generously.
 */
export function rolesInclude(rows: unknown, roleName: string): boolean {
  if (!Array.isArray(rows)) return false;

  return rows.some(
    row => (row as { role?: { name?: unknown } | null } | null)?.role?.name === roleName
  );
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
