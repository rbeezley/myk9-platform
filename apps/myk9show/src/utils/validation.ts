/**
 * General-purpose validation utilities.
 *
 * Keep this module dependency-free so it can be imported from any layer
 * (routes, hooks, services) without pulling in heavy deps.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns `true` when `value` is a valid UUID-shaped identifier.
 *
 * The database also contains deterministic UUID-shaped IDs whose version and
 * variant nibbles are intentionally outside the RFC 4122 ranges (for example,
 * seeded load-test fixtures). Route validation must accept those IDs so they
 * can still reach the database query.
 *
 * Use this to validate route params extracted via `useParams()` before
 * passing them into Supabase `.eq()` or similar DB queries. Rejecting
 * malformed IDs early prevents unnecessary round-trips and avoids
 * leaking Supabase/PostgREST error details to the client.
 */
export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}
