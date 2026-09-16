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
 * Replaces the figure entirely whenever the read is degraded — at any amount,
 * not only at zero.
 *
 * Zero is the obvious case: "we could not ask" drawn as "$0.00, paid up" is a
 * positive claim about what the exhibitor owes. But a NON-zero unconfirmed
 * total is the worse one. A hard-deleted entry still sitting in the per-show
 * snapshot produces a real-looking "$60.00 due" for a debt the server no longer
 * has, and — before MYK9-563 — a live "Pay $60.00 online" button beside it.
 * Charging someone for an entry that does not exist is not a display bug.
 *
 * So no amount renders and no pay affordance renders while degraded. The
 * entries themselves stay on screen: it is the CLAIM that is withheld, never
 * the exhibitor's own data.
 */
export const UNCONFIRMED_AMOUNT_LABEL = 'Amount unavailable';

/**
 * The calm next step under a withheld figure. INTENT.md's error-state test is
 * "would this stress someone out on show day" — so it says what is missing,
 * that it is temporary, and that nothing of theirs is gone.
 */
export const UNCONFIRMED_AMOUNT_EXPLANATION =
  "We'll show what you owe as soon as we can reach the server. Your entries below are the ones we last saved.";

/**
 * Shown on any receipt or order list still rendering amounts while the account
 * read is degraded.
 *
 * The card-level "Receipt" affordance is withheld outright
 * (`deriveMyEntryCardState`), but the same dialogs are reachable from a show
 * header's orders list and from a `?orderId=` deep link. A receipt is a
 * financial document; if it must render at all, it has to say the figures on
 * it were never confirmed.
 */
export const UNCONFIRMED_RECEIPT_NOTICE =
  "We couldn't reach the server to confirm these amounts, so this shows your saved entry fees rather than what was charged.";
