/**
 * General-purpose validation utilities.
 *
 * Keep this module dependency-free so it can be imported from any layer
 * (routes, hooks, services) without pulling in heavy deps.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns `true` when `value` is a valid UUID (v1-v5).
 *
 * Use this to validate route params extracted via `useParams()` before
 * passing them into Supabase `.eq()` or similar DB queries. Rejecting
 * malformed IDs early prevents unnecessary round-trips and avoids
 * leaking Supabase/PostgREST error details to the client.
 */
export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}
