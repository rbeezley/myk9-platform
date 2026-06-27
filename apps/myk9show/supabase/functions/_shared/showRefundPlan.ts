// Pure planning for the bulk show-cancellation MAKE-WHOLE refund. Deno-free
// (colocated vitest) — the edge fn (stripe-refund-show) does the Stripe I/O and
// DB writes; this decides WHICH entries are refundable, groups them by the
// PaymentIntent that paid them, and computes the per-entry refund_amount stamp.
//
// Make-whole model (verified against the charge architecture): charges are
// plain platform PaymentIntents and the club is paid later via a separate
// cron-process-payouts transfer — so refunding an intent IN FULL returns the
// exhibitor's gross from the platform balance (no Connect clawback). Each entry
// is then stamped refund_amount = its OWN entry_fee; calculateShowPayoutCents
// deducts that per entry, zeroing the club's share for the cancelled show. The
// platform-fee slice of the refund is absorbed by platform revenue (the correct
// party on a club cancellation).
//
// See docs/plan-refund-policy-withdrawal.md (Phase 4 — Show cancellation).

export interface ShowRefundEntry {
  id: string;
  /** entries.entry_fee — DECIMAL dollars. */
  entry_fee: number | null;
  /** 'online' is the only Stripe-refundable method. */
  payment_method: string | null;
  payment_status: string | null;
  /** entries.refund_amount — DECIMAL dollars; >0 means a refund already exists. */
  refund_amount: number | null;
  stripe_payment_intent_id: string | null;
}

export type ShowRefundSkipReason =
  | 'offline_paid'
  | 'already_refunded'
  | 'not_paid'
  | 'no_payment_intent'
  | 'zero_fee'
  // An otherwise-refundable entry whose PaymentIntent ALSO paid for an entry
  // that was already (partially or fully) refunded. Refunding the full intent
  // here would be correct for the customer but the already-refunded sibling's
  // stamp can't be safely reconciled in bulk — hand the whole intent to the
  // secretary so the club is never overpaid. (Review #974, finding 1.)
  | 'intent_partially_refunded';

export interface ShowRefundIntentGroup {
  paymentIntentId: string;
  entryIds: string[];
  /** entryId → refund_amount to stamp (its own entry_fee, DECIMAL dollars). */
  stampByEntry: Record<string, number>;
  /** Sum of entry fees in this group, in cents — for display only. */
  entryFeeSubtotalCents: number;
}

export interface ShowRefundPlan {
  intents: ShowRefundIntentGroup[];
  skipped: Array<{ entryId: string; reason: ShowRefundSkipReason }>;
}

function isAlreadyRefunded(entry: ShowRefundEntry): boolean {
  return entry.payment_status === 'refunded' || (entry.refund_amount ?? 0) > 0;
}

/**
 * Per-entry base classification: a skip reason (clearest-first), or null when
 * the entry is a clean refund CANDIDATE (online, paid, has an intent, fee > 0,
 * not itself refunded). Intent-level tainting is applied afterward.
 */
function classify(entry: ShowRefundEntry): ShowRefundSkipReason | null {
  if (entry.payment_method !== 'online') return 'offline_paid';
  if (isAlreadyRefunded(entry)) return 'already_refunded';
  if (entry.payment_status !== 'paid') return 'not_paid';
  if (!entry.stripe_payment_intent_id) return 'no_payment_intent';
  if ((entry.entry_fee ?? 0) <= 0) return 'zero_fee';
  return null;
}

export function buildShowRefundPlan(entries: ShowRefundEntry[]): ShowRefundPlan {
  // First pass: which intents already have a (partially/fully) refunded entry?
  // A full-intent make-whole refund on such an intent can't be reconciled in
  // bulk without overpaying the club, so the whole intent is handed off.
  const taintedIntents = new Set<string>();
  for (const entry of entries) {
    if (
      entry.payment_method === 'online' &&
      entry.stripe_payment_intent_id &&
      isAlreadyRefunded(entry)
    ) {
      taintedIntents.add(entry.stripe_payment_intent_id);
    }
  }

  const groups = new Map<string, ShowRefundIntentGroup>();
  const skipped: ShowRefundPlan['skipped'] = [];

  for (const entry of entries) {
    const reason = classify(entry);
    if (reason) {
      skipped.push({ entryId: entry.id, reason });
      continue;
    }

    // classify() guarantees a non-null intent id and a positive fee here.
    const intentId = entry.stripe_payment_intent_id as string;
    if (taintedIntents.has(intentId)) {
      skipped.push({ entryId: entry.id, reason: 'intent_partially_refunded' });
      continue;
    }

    const fee = entry.entry_fee as number;
    let group = groups.get(intentId);
    if (!group) {
      group = {
        paymentIntentId: intentId,
        entryIds: [],
        stampByEntry: {},
        entryFeeSubtotalCents: 0,
      };
      groups.set(intentId, group);
    }
    group.entryIds.push(entry.id);
    group.stampByEntry[entry.id] = fee;
    group.entryFeeSubtotalCents += Math.round(fee * 100);
  }

  return { intents: [...groups.values()], skipped };
}
