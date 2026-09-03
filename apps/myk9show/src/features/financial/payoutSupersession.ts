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

/**
 * The fields the supersession rule reads, whatever the row shape is.
 *
 * The ordering key is the COMPOSITE `(createdAt, id)`, matching the RPC's
 * `(newer.created_at, newer.id) > (sp.created_at, sp.id)` exactly. Comparing
 * timestamps alone is not the same rule: rows inserted in one transaction, or
 * imported, can share a `created_at`, and a timestamp-only comparison then
 * finds NEITHER row newer -- so two attempts for one show both survive as
 * outstanding and the treasurer sees two "Needs attention" badges for one
 * transfer. A near-miss worth stating plainly, since the point of this module
 * is that the rule exists in exactly one place.
 */
export interface PayoutOrderingFacts {
  status: string;
  /** ISO creation timestamp. */
  createdAt: string;
  /** Tiebreaker, and the second half of the server's ordering tuple. */
  id: string;
}

/** `(createdAt, id) > (createdAt, id)`, the RPC's comparison. */
function isNewer(a: PayoutOrderingFacts, b: PayoutOrderingFacts): boolean {
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  return a.id > b.id;
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
      if (!live || isNewer(facts, read(live))) live = row;
    } else if (!latestFailed || isNewer(facts, read(latestFailed))) {
      latestFailed = row;
    }
  }

  return live ?? latestFailed;
}
