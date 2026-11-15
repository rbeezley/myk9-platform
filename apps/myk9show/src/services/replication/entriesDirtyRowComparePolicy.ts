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

/**
 * MYK9-2010 (owner decision 5, restructure approved 2026-11-14): an entry's day-of facts fall in
 * two groups that never conflict with each other, because they are different facts about the dog.
 *   - SCORE group: result, times, faults, `is_scored`, and the `completed` status a saved score sets.
 *   - CHECK-IN group: `check_in_status` (at gate, pulled, ...) and a day-of `entry_status`.
 * Every field below is compared on its own, so a change in one group never touches the other. The
 * only field the groups share is `check_in_status` itself (one column), so when both sides moved
 * it, the side that holds the score-group value wins, except that a pull always stays (the score
 * saves beside it and Show Desk flags the pair). A collision between two check-in-group changes, or
 * two score changes, is not resolved here: it asks, and the notice shows both values.
 * The in-ring marker is the ring's own stamp, not a check-in fact, so it never asks either.
 */
const CHECK_IN_FIELDS: ReadonlySet<string> = new Set(['check_in_status', 'checkInStatus']);

type Side = Record<string, unknown>;
type CheckInChange = 'score' | 'ring-marker' | 'check-in';

/** Which group a side's change to the status belongs to. */
function groupOf(side: Side, field: string): CheckInChange {
  const value = side[field];
  const scored = Boolean(side.is_scored ?? side.isScored);
  if (scored && value === 'completed') return 'score';
  if (!scored && value === 'in-ring') return 'ring-marker';
  return 'check-in';
}

function resolveCheckInCollision(
  field: string,
  { local, remote }: { local: Side; remote: Side }
): 'device' | 'server' | undefined {
  if (!CHECK_IN_FIELDS.has(field)) return undefined;
  const mine = groupOf(local, field);
  const theirs = groupOf(remote, field);
  if (mine === 'check-in' && theirs === 'check-in') return undefined;
  if (mine === 'ring-marker') return 'server';
  if (theirs === 'ring-marker') return 'device';
  // One side holds the score's `completed`. A pull stays; otherwise the score's status wins.
  if (mine === 'score') return remote[field] === 'pulled' ? 'server' : 'device';
  if (theirs === 'score') return local[field] === 'pulled' ? 'device' : 'server';
  return undefined;
}

export const ENTRY_DIRTY_ROW_COMPARE_POLICY: DirtyRowComparePolicy = {
  serverOwnedFields: ENTRY_SERVER_OWNED_FIELDS,
  resolveCollision: resolveCheckInCollision,
  normalizeRemoteComparison: (_field, value) => (value === null ? undefined : value),
};
