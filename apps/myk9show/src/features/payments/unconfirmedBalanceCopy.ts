/**
 * The one sentence every exhibitor money surface uses to say "this figure came
 * from saved rows the server never confirmed" (MYK9-563 item 2).
 *
 * `getUserEntries` serves the per-show replication snapshot when the
 * authoritative view fails, times out, or comes back empty against a populated
 * snapshot, and it returns `error: null` on those paths — the rows are real.
 * What is NOT real is their standing: a hard-deleted entry still in the
 * snapshot renders as a live debt. My Payments (`AmountDueSection`) and My
 * Shows (`CompactStatsRow`) both have to say so, and saying it in two
 * different voices is how one surface ends up reassuring the exhibitor about
 * the number the other one is hedging.
 */

/** Sits under a kept figure whose standing is unconfirmed. */
export const UNCONFIRMED_BALANCE_NOTE =
  "Showing saved data — we couldn't reach the server to confirm it.";

/**
 * Replaces the figure entirely when it is ZERO and unconfirmed. At zero,
 * "saved data" and "paid up" are the same pixels, so the number has to go:
 * "we could not ask" must never be drawn as "you owe nothing".
 */
export const UNCONFIRMED_ZERO_BALANCE_LABEL = 'Balance unavailable';
