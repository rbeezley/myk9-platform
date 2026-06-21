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
  /** Stripe session.payment_status — only 'paid' should mark entries paid.
   * checkout.session.completed can fire 'unpaid' for async/delayed methods. */
  sessionPaymentStatus: string | null;
  /** The ids the link was created for — to detect entries deleted since. */
  expectedEntryIds: string[];
  /** Entries actually loaded now (may be a subset if some were deleted). */
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
  /** 'skip' = do nothing (replay/expired link, or the session isn't actually paid). */
  action: 'apply' | 'skip';
  /** Why we skipped — for logging; absent when action is 'apply'. */
  skipReason?: 'link_not_open' | 'not_paid';
  /** Entries to flip to paid (were unpaid). */
  patches: EntryPaymentPatch[];
  /** Entries already paid before this event — duplicate-charge candidates for
   *  the Task 3.5 Step 2 auto-refund; empty on the happy path. */
  alreadyPaidEntryIds: string[];
  /** Expected entries no longer present (deleted since the link was created) —
   *  paid-for-nothing; the caller alerts (Task 3.5 Step 3 refund). */
  missingEntryIds: string[];
}

const UNPAID = 'pending';
const WAITLIST_PENDING = 'pending-payment';

export function reconcileEntryPaymentRequest(input: ReconcileInput): ReconcileResult {
  const empty = { patches: [], alreadyPaidEntryIds: [], missingEntryIds: [] };

  // The link row is the idempotency latch: once it leaves 'open' (we marked it
  // 'paid'/'expired'), a re-delivered event must not touch entries again.
  if (input.linkStatus !== 'open') {
    return { action: 'skip', skipReason: 'link_not_open', ...empty };
  }
  // checkout.session.completed can fire for an unpaid async method — never mark
  // entries paid on a session that didn't actually collect money.
  if (input.sessionPaymentStatus !== 'paid') {
    return { action: 'skip', skipReason: 'not_paid', ...empty };
  }

  const presentIds = new Set(input.entries.map(e => e.id));
  const missingEntryIds = input.expectedEntryIds.filter(id => !presentIds.has(id));

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

  return { action: 'apply', patches, alreadyPaidEntryIds, missingEntryIds };
}
