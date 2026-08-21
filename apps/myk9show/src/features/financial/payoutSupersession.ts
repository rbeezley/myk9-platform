/**
 * Which payout row speaks for a show, when a show has more than one.
 *
 * It routinely does. `cron-process-payouts` does NOT update a failed row on
 * retry: it leaves the failed row in place and INSERTs a new one. The partial
 * unique index `show_payouts_one_live_per_show` is `(show_id) WHERE status <>
 * 'failed'`, so a show has at most one non-failed ("live") row but any number
 * of failed ones.
 *
 * The reconciliation RPC already encodes the rule, in the `has_live_payout` /
 * `is_latest_failed` CTE of 20260717130000_financial_reconciliation_rpc.sql: a
 * failed row is genuinely outstanding if and only if its show has no live row
 * AND no newer failed row. The client had its own, different rule -- keep
 * `max(createdAt)` -- under a comment asserting "a club has at most one payout
 * per show", which the SQL comment in that same migration explicitly denies.
 *
 * The two rules agree in the common orderings and diverge exactly where it
 * hurts: a show that was paid and then had a later transfer attempt fail keeps
 * a live `completed` row, so the server treats it as settled while
 * `max(createdAt)` picked the failed row and the card showed a red
 * "Needs attention" beside money that had already landed.
 *
 * One rule, expressed once, so the two surfaces cannot drift again.
 */

/** The two fields the supersession rule reads, whatever the row shape is. */
export interface PayoutOrderingFacts {
  status: string;
  /** Any lexicographically comparable creation key (ISO timestamp). */
  sortKey: string;
}

/**
 * The row that speaks for a show: its live row if it has one, otherwise its
 * most recent failed attempt. Returns null for an empty list.
 */
export function selectAuthoritativePayout<T>(
  rows: readonly T[],
  read: (row: T) => PayoutOrderingFacts
): T | null {
  let live: T | null = null;
  let latestFailed: T | null = null;

  for (const row of rows) {
    const facts = read(row);
    if (facts.status !== 'failed') {
      // At most one live row per show by unique index, but compare anyway
      // rather than trust an index this code cannot see.
      if (!live || facts.sortKey > read(live).sortKey) live = row;
    } else if (!latestFailed || facts.sortKey > read(latestFailed).sortKey) {
      latestFailed = row;
    }
  }

  return live ?? latestFailed;
}

/**
 * Whether a failed row has been superseded: another attempt for the same show
 * either succeeded, is in flight, or failed later. Such a row is history, not
 * an action item, and must not be labelled "Needs attention".
 */
export function isSupersededFailure<T>(
  row: T,
  siblings: readonly T[],
  read: (row: T) => PayoutOrderingFacts
): boolean {
  const facts = read(row);
  if (facts.status !== 'failed') return false;
  return siblings.some(other => {
    if (other === row) return false;
    const otherFacts = read(other);
    if (otherFacts.status !== 'failed') return true;
    return otherFacts.sortKey > facts.sortKey;
  });
}
