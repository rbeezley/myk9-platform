import type { DirtyRowComparePolicy } from '@myk9/replication';

/**
 * MYK9-1236: base `null` against remote `undefined` is one server value read
 * through two mappers: the optimistic ringside write stores `null`, `rowToEntry`
 * maps the same null column to `undefined`. So the server did not change it, and a
 * dirty correction made on top must not be held behind a conflict nobody caused.
 *
 * Server side only. The device's own value is compared raw: writing `null` over an
 * `undefined` base is a real write, and a no-op reading of it would let a stale
 * clear overwrite another device's value. A real difference between two non-null
 * values still conflicts.
 */
/**
 * MYK9-1757: columns only a SERVER trigger writes. `check_in_pulled_by` says who flagged the
 * current pull; a device never writes it, so its copy differing from the server's (null vs
 * undefined vs 'staff') is staleness and must neither hold a dirty row for manual resolution nor
 * survive a reconcile. Both spellings the local row carries are listed.
 */
export const ENTRY_SERVER_OWNED_FIELDS = ['check_in_pulled_by', 'checkInPulledBy'] as const;

/** The fields the check-in desk and the ring write; both spellings the local row carries. */
const CHECK_IN_FIELDS: ReadonlySet<string> = new Set(['check_in_status', 'checkInStatus']);

/**
 * MYK9-2010 (owner decision 5): a check-in change and a score are different facts about the dog,
 * so the app keeps both and never asks. When both sides moved the check-in status:
 *   - the device saved a score: the dog is `completed`, unless the other side PULLED it, in which
 *     case the pull stays (the score saves beside it, and Show Desk flags the dog as scored after
 *     being pulled; nothing is written to say so, the pair is the flag);
 *   - the device did not score and its change is only the in-ring marker: the other side wins.
 *   - the other device saved the score: its status comes with that score, so it wins.
 *   - anything else (two staff devices moved an unscored dog's status) is a real collision and
 *     still asks, so no staff member's check-in or pull is dropped silently.
 * Scores themselves are untouched: two devices scoring one dog differently still collide.
 */
function resolveCheckInCollision(
  field: string,
  { local, remote }: { local: Record<string, unknown>; remote: Record<string, unknown> }
): 'device' | 'server' | undefined {
  if (!CHECK_IN_FIELDS.has(field)) return undefined;
  if (local.is_scored ?? local.isScored) return remote[field] !== 'pulled' ? 'device' : 'server';
  // Another device saved the score: its status is the outcome of that score, so take it.
  if (remote.is_scored ?? remote.isScored) return 'server';
  return local[field] === 'in-ring' ? 'server' : undefined;
}

export const ENTRY_DIRTY_ROW_COMPARE_POLICY: DirtyRowComparePolicy = {
  serverOwnedFields: ENTRY_SERVER_OWNED_FIELDS,
  resolveCollision: resolveCheckInCollision,
  normalizeRemoteComparison: (_field, value) => (value === null ? undefined : value),
};
