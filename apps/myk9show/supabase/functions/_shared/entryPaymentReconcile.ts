// Pure decision logic for reconciling a PAID entry_payment_request Checkout
// Session back onto its entries. Deno-free (colocated vitest) — the webhook does
// the DB I/O; this decides WHAT to write, so the rules are unit-testable.
//
// Both link subjects are existing entries (Task 1): a mail-in entry sits at
// payment_status='pending'; a promoted waitlist entry also sits at
// payment_status='pending' (column default) AND entry_status='pending-payment'.

export interface ReconcileEntryRow {
  id: string;
  payment_status: string | null;
  entry_status: string | null;
}

export interface ReconcileInput {
  /** entry_payment_links.status — the idempotency / anti-replay latch. */
  linkStatus: string;
  entries: ReconcileEntryRow[];
  paymentIntentId: string | null;
}

export interface EntryPaymentPatch {
  id: string;
  payment_status: 'paid';
  // MUST be 'online' — cron-process-payouts only pays out entries with
  // payment_method='online' AND payment_status in ('paid','refunded'). Omitting
  // it would charge the exhibitor but never pay the club (silent, weeks later).
  payment_method: 'online';
  stripe_payment_intent_id: string | null;
  /** Set only when advancing a promoted waitlist entry's lifecycle. */
  entry_status?: 'confirmed';
}

export interface ReconcileResult {
  /** 'noop' when the link is not open (replay / already processed / expired). */
  action: 'apply' | 'noop';
  /** Entries to flip to paid (were unpaid). */
  patches: EntryPaymentPatch[];
  /** Entries already paid before this event — duplicate-charge candidates for
   *  the Task 3.5 Step 2 auto-refund; empty on the happy path. */
  alreadyPaidEntryIds: string[];
}

const UNPAID = 'pending';
const WAITLIST_PENDING = 'pending-payment';

export function reconcileEntryPaymentRequest(input: ReconcileInput): ReconcileResult {
  // The link row is the idempotency latch: once it leaves 'open' (we marked it
  // 'paid'/'expired'), a re-delivered event must not touch entries again.
  if (input.linkStatus !== 'open') {
    return { action: 'noop', patches: [], alreadyPaidEntryIds: [] };
  }

  const patches: EntryPaymentPatch[] = [];
  const alreadyPaidEntryIds: string[] = [];

  for (const e of input.entries) {
    if (e.payment_status === UNPAID) {
      const patch: EntryPaymentPatch = {
        id: e.id,
        payment_status: 'paid',
        payment_method: 'online',
        stripe_payment_intent_id: input.paymentIntentId,
      };
      // A promoted waitlist entry pays its way from pending-payment → confirmed.
      // A mail-in entry's lifecycle status is untouched; only the money moves.
      if (e.entry_status === WAITLIST_PENDING) {
        patch.entry_status = 'confirmed';
      }
      patches.push(patch);
    } else {
      // Already paid before this event — a second link was paid for the same
      // entry. The caller refunds it (make-whole) rather than keep an overcharge.
      alreadyPaidEntryIds.push(e.id);
    }
  }

  return { action: 'apply', patches, alreadyPaidEntryIds };
}
