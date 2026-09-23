import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { extractPaymentIntentId } from '../_shared/entryFromCartItem.ts';
import { accountToRowPatch } from '../_shared/connectAccountMapper.ts';
import { parsePremiumPriceIds, priceIdToTier } from '../_shared/premiumPrices.ts';
import { alertAdmin } from '../_shared/alertAdmin.ts';
import { decodeStampedPlatformFeeRates } from '../_shared/platformFee.ts';
import {
  extractProcessingFeeCents,
  refundKindFromMetadata,
  MAKE_WHOLE_METADATA_KEY,
} from '../_shared/orderSnapshot.ts';
import { loadEntrySettlementLinePricesFromStripe } from '../_shared/entryPaymentLineItems.ts';
import {
  isTransientSettlementSqlError,
  retryTransientSettlement,
} from '../_shared/transientSettlementRetry.ts';
import {
  mapAcceptedEntryFees,
  normalizeEntryOrderSettlement,
  type EntryOrderSettlement,
} from '../_shared/entryOrderSettlement.ts';
import {
  resolveWithdrawalPolicy,
  type ShowWithdrawalColumns,
  type ClubWithdrawalColumns,
} from '../_shared/withdrawalPolicy.ts';
import type { CartOverflowRefundDecision } from '../_shared/cartOverflowRefund.ts';
import { isStripeLiveMode } from '../_shared/stripeMode.ts';
import {
  allRefundsAppOriginated,
  buildUnmatchedRefundAlert,
  decideShowRefundStampAlert,
  findShowRefundId,
} from '../_shared/chargeRefundedDecision.ts';
import { decideFreshSessionGate } from '../_shared/freshSessionGate.ts';
import { buildConfirmationStampPayload } from '../_shared/entryConfirmationStamp.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { createWebhookRequestHandler } from './webhookHandler.ts';
import { renderStripeEntryConfirmationEmail } from './entryConfirmationEmail.ts';
import { persistNoSubscription } from './noSubscription.ts';
import { listAllChargeRefunds, resolveRefundLedgerAction } from '../_shared/refundLifecycle.ts';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
// Connect-scoped event destination signs with its OWN secret; optional until
// the Connected-accounts destination exists in the dashboard.
const stripeConnectWebhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

if (!stripeSecret || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables');
}

const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'myK9Show',
    version: '1.0.0',
  },
});
const stripeLivemode = isStripeLiveMode(stripeSecret);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(
  createWebhookRequestHandler({
    verifyEvent: (body, signature, secret) =>
      stripe.webhooks.constructEventAsync(body, signature, secret),
    platformSecret: stripeWebhookSecret,
    connectSecret: stripeConnectWebhookSecret,
    dispatch: handleEvent,
    alertAdmin,
  })
);

/**
 * Retrieve Stripe's actual processing fee (cents) for a charge by expanding the
 * payment intent's latest charge balance transaction. Returns null when the fee
 * is not yet available (delayed balance-transaction data) or on any retrieve
 * error — the snapshot then records it as PENDING (never an estimated zero), per
 * the financial-reconciliation contract. Never throws; a committed payment must
 * not be disturbed by a missing fee lookup.
 */
async function fetchProcessingFeeCents(paymentIntentId: string | null): Promise<number | null> {
  if (!paymentIntentId) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    });
    const charge = pi.latest_charge;
    if (!charge || typeof charge === 'string') return null;
    return extractProcessingFeeCents(charge as { balance_transaction?: string | { fee?: number } });
  } catch (e) {
    console.error(`Could not retrieve processing fee for intent ${paymentIntentId}:`, e);
    return null;
  }
}

/**
 * Log (and, once per intent, alert) when a succeeded charge's Stripe processing
 * fee could not be captured. The missing fee is recorded as NULL (pending),
 * never treated as zero.
 *
 * NOT self-healing — verified, do not soften this. Nothing retries: no later
 * webhook event re-reads the balance transaction, there is no backfill job, and
 * no reconciliation action writes stripe_processing_fee_cents. The order's net
 * platform income stays pending FOREVER until an operator fills the fee in by
 * hand. The alert below must therefore ask for manual action; if a real
 * backfill path is ever added, update this comment and the alert together.
 */
async function warnMissingProcessingFee(
  paymentIntentId: string | null,
  context: string
): Promise<void> {
  console.error(
    `Processing fee PENDING for ${context} (intent ${paymentIntentId ?? 'unknown'}) — ` +
      `net income cannot be finalized until the balance-transaction fee is captured. ` +
      `Nothing retries this automatically; it needs a manual backfill.`
  );
  await alertAdmin(
    'Stripe processing fee not captured — MANUAL BACKFILL REQUIRED',
    `<p>The Stripe balance-transaction processing fee for ${context} (payment intent
     <code>${paymentIntentId ?? 'unknown'}</code>) was not available when the order was
     recorded (usually delayed balance-transaction data). The charge facts are stored
     and net platform income is marked pending.</p>
     <p><strong>This does NOT resolve on its own.</strong> No webhook, job, or
     reconciliation run ever retries the fee lookup — the order stays pending
     indefinitely until someone acts.</p>
     <p>Recovery: read the fee from the payment intent's latest charge balance
     transaction in the Stripe dashboard, then set
     <code>stripe_orders.stripe_processing_fee_cents</code> for that payment intent.</p>`,
    {
      source: 'stripe-webhook',
      severity: 'warn',
      dedupeKey: `processing-fee-pending-${paymentIntentId ?? context}`,
    }
  );
}

async function handleEvent(event: Stripe.Event) {
  console.log(`Processing event: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case 'checkout.session.async_payment_failed':
      console.log(
        `Async Checkout payment failed for session ${
          (event.data.object as Stripe.Checkout.Session).id
        } — entries remain pending`
      );
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(event.data.object as Stripe.Subscription);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge, event.id);
      break;

    case 'refund.failed':
      await handleRefundFailed(event.data.object as Stripe.Refund);
      break;

    case 'refund.updated':
      await handleRefundUpdated(event.data.object as Stripe.Refund);
      break;

    case 'charge.dispute.created':
      await handleDisputeCreated(event.data.object as Stripe.Dispute);
      break;

    case 'account.updated':
      await handleAccountUpdated(event.data.object as Stripe.Account);
      break;

    case 'account.application.deauthorized':
      // data.object is the Application; the connected account id rides on event.account
      await handleAccountDeauthorized(event.account ?? undefined);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

/**
 * A refund that was created (pending) and LATER failed leaves the ORDER ledger
 * holding an amount the customer never received: `charge.refunded` already booked
 * it, and it may have stamped `status = 'refunded'`. Reconciliation then keeps
 * subtracting a refund that never happened and the club's payout stays docked.
 *
 * So this flips that refund's LEDGER ROW to `state = 'failed'` and re-derives the
 * order totals and status, via `reverse_order_refund_cents`. A failed refund is a
 * STATE CHANGE, never a subtraction: nothing can be double-subtracted, no column
 * can be driven negative, and a redelivered `charge.refunded` for the same refund
 * cannot resurrect it (failed is TERMINAL).
 *
 * IDEMPOTENT by construction — the refund id is the ledger primary key, so a
 * duplicate terminal delivery leaves the same retained audit row and recomputed
 * totals. A terminal event arriving BEFORE a booking writes the authoritative
 * tombstone immediately; it does not depend on Stripe redelivery.
 *
 * The ENTRY-level refund columns are still the operator's job — the alert stays,
 * because the entry stamp and any re-issue are manual.
 *
 * NEVER THROWS: a bookkeeping failure must not disturb a committed payment or
 * make Stripe redeliver indefinitely. A failed reversal is reported in the alert
 * and the drift stays visible rather than silently "handled".
 */
async function handleRefundFailed(refund: Stripe.Refund) {
  await handleTerminalRefund(refund, 'failed');
}

async function handleRefundUpdated(refund: Stripe.Refund) {
  const action = resolveRefundLedgerAction(refund.status);
  if (action === 'defer') {
    console.log(
      `Refund ${refund.id} remains ${refund.status ?? 'unknown'} — order ledger unchanged`
    );
    return;
  }
  if (action === 'fail' || action === 'cancel') {
    await handleTerminalRefund(refund, action === 'cancel' ? 'canceled' : 'failed');
    return;
  }

  const paymentIntentId = extractPaymentIntentId(refund.payment_intent);
  if (!paymentIntentId) {
    console.error(`Succeeded refund ${refund.id} has no payment intent — cannot book ledger`);
    return;
  }
  const rows = await recordOrderRefundCents(paymentIntentId, {
    refundId: refund.id,
    amountCents: refund.amount,
    kind: refundKindFromMetadata(refund),
  });
  if (rows?.length === 0) {
    await alertAdmin(
      'Succeeded refund arrived before its order — awaiting attachment',
      `<p>Refund <code>${refund.id}</code> for payment intent
       <code>${paymentIntentId}</code> succeeded before its
       <code>stripe_orders</code> row existed. The refund fact is retained and
       will attach automatically when the order is inserted.</p>
       <p>If the order never appears, investigate the checkout webhook for this
       payment intent; the retained refund currently contributes to no order.</p>`,
      {
        source: 'stripe-webhook',
        dedupeKey: `refund-awaiting-order-${refund.id}`,
      }
    );
  }
}

async function handleTerminalRefund(refund: Stripe.Refund, terminalState: 'failed' | 'canceled') {
  const entryId = refund.metadata?.entry_id ?? null;
  console.error(
    `CRITICAL: refund ${refund.id} (${refund.amount}¢) ${terminalState.toUpperCase()} after creation` +
      (entryId ? ` for entry ${entryId}` : '')
  );

  const paymentIntentId = extractPaymentIntentId(refund.payment_intent);
  let ledgerNote =
    '<p>The order ledger could NOT be corrected automatically: this refund carries no ' +
    'payment intent, so the reversal had nothing to key on. Clear the order refund ' +
    'columns by hand.</p>';

  if (paymentIntentId) {
    try {
      const { data, error } = await supabase.rpc('reverse_order_refund_cents', {
        p_payment_intent_id: paymentIntentId,
        p_refund_id: refund.id,
        p_amount_cents: refund.amount,
        p_kind: refundKindFromMetadata(refund),
        p_terminal_state: terminalState,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<{ order_id: string; reversed: boolean }>;
      const changed = rows.filter(r => r.reversed).length;
      if (rows.length === 0) {
        ledgerNote = `<p>The order ledger was NOT corrected: no <code>stripe_orders</code> row
           matched payment intent <code>${paymentIntentId}</code>. Nothing was booked
           against an order, so nothing needed reversing — but verify by hand.</p>`;
      } else if (changed === 0) {
        ledgerNote = `<p>The order ledger was already corrected for this refund (idempotent
           redelivery) — no change made.</p>`;
      } else {
        ledgerNote = `<p>The order ledger HAS been corrected automatically: this refund's
           ${(refund.amount / 100).toFixed(2)} USD was reversed out of ${changed}
           <code>stripe_orders</code> row(s) and the refunded status re-derived, so
           reconciliation no longer subtracts money the customer never received.</p>`;
      }
    } catch (err) {
      console.error(`Could not reverse failed refund ${refund.id} on the order ledger:`, err);
      ledgerNote = `<p>The order ledger could NOT be corrected automatically
         (<code>${err instanceof Error ? err.message : String(err)}</code>). The order still
         records a refund the customer never received — clear its refund columns by hand.</p>`;
    }
  }

  await alertAdmin(
    `Stripe refund ${terminalState.toUpperCase()} — customer was not paid`,
    `<p>Refund <code>${refund.id}</code> for ${(refund.amount / 100).toFixed(2)} USD has
     status <code>${terminalState}</code>${entryId ? ` (entry <code>${entryId}</code>)` : ''} —
     the customer was NOT paid.</p>
     ${ledgerNote}
     <p>Recovery: the ENTRY-level refund columns are still stamped — clear them (see the
     runbook's "Manual reconciliation" section), then re-issue the refund from the entries
     page. The refund function ignores dead refunds, so re-issuing is safe.</p>`,
    { source: 'stripe-webhook', dedupeKey: `refund-terminal-${refund.id}` }
  );
}

/**
 * Chargebacks pull platform funds while the payout cron would still pay the
 * club in full — silent platform loss without an operator signal (round-11
 * review). Alert-only for v1; dispute handling stays manual.
 */
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const intentId =
    typeof dispute.payment_intent === 'string'
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? 'unknown');
  console.error(`CRITICAL: dispute ${dispute.id} created on ${intentId} (${dispute.amount}¢)`);
  await alertAdmin(
    'Chargeback opened against an entry payment',
    `<p>Dispute <code>${dispute.id}</code> (${(dispute.amount / 100).toFixed(2)} USD,
     reason: ${dispute.reason}) was opened on payment intent <code>${intentId}</code>.
     Stripe has pulled the funds from the platform balance, but the show's payout
     still counts these entries — if the dispute stands, mark the entries refunded
     BEFORE the payout settles (end date + 3 days) or the club gets paid for a
     charge the platform lost.</p>
     <p>Respond in the Stripe dashboard: Payments → Disputes.</p>`,
    { source: 'stripe-webhook', dedupeKey: `dispute-created-${dispute.id}` }
  );
}

/**
 * Reconciliation backstop for refunds issued OUTSIDE stripe-refund-entry
 * (e.g. the Stripe dashboard). A payment intent can cover a whole cart, so a
 * dashboard refund can't be attributed to a single entry — mark the order and
 * log loudly for manual entry-level reconciliation. Refunds from
 * app-originated refunds carry metadata and were already recorded.
 */
/**
 * Record a refund onto every order for a payment intent, ATOMICALLY, splitting
 * it between the two economically-opposite refund columns (see the attribution
 * invariant in _shared/orderSnapshot.ts):
 *   collected = amount_cents − make_whole_refunded_cents − refunded_cents
 *
 * This is the single writer of both refund columns for the whole refund story,
 * and it runs for EVERY refund source — per-entry app refunds, make-whole
 * auto-refunds, bulk show-cancellation refunds, and dashboard refunds alike.
 * Before this, app-originated refunds returned early and never recorded a
 * refund at all, so reconciliation silently understated exactly the refunds the
 * app itself issued.
 *
 * LEDGER MODEL (MYK9-54 rework): each Stripe refund is ONE ROW in
 * `stripe_order_refunds`, keyed on the Stripe refund id, and the two order
 * columns are RECOMPUTED from those rows. Idempotency is a property of the
 * PRIMARY KEY rather than of an algorithm, so a duplicate or out-of-order
 * delivery is an upsert of the same row and the totals are unchanged. The
 * previous monotonic counters could not represent "this refund was un-done" and
 * a redelivered `charge.refunded` silently undid a `refund.failed` reversal.
 *
 * ATTRIBUTION: `kind` is recorded per refund at booking time — 'make_whole' from
 * the make-whole writers (which know their own refund's id), 'post_hoc' from the
 * `charge.refunded` sweep. The upsert never overwrites `kind`, so a make-whole
 * refund the auto-refund writer already booked is never demoted to a post-hoc
 * platform loss by a later delivery, whatever the ordering.
 *
 * NEVER pass `charge.amount_refunded`: it is a CUMULATIVE total across both
 * refund kinds, and guessing the split from it is exactly what forced the
 * monotonic hack. Stripe carries the individual refunds on `charge.refunds.data`.
 *
 * STATUS (MYK9-54 review finding 1): the recompute also owns the
 * status/`refunded_at` transition — `status = 'refunded'` IFF the order is FULLY
 * refunded — so callers must NOT stamp it themselves. Because it is re-derived
 * rather than accumulated it now DEMOTES as well as promotes.
 *
 * Returns the affected order rows, or null when nothing was PERSISTED. Callers
 * must treat null as "the refund is not recorded" and leave the drift visible
 * (finding 5). Never throws: a committed payment must not be disturbed by a
 * bookkeeping failure.
 */
interface RecordedRefundRow {
  order_id: string;
  order_type: string | null;
  order_status: string;
  order_amount_cents: number | null;
  make_whole_cents: number;
  post_hoc_cents: number;
  fully_refunded: boolean;
}

async function recordOrderRefundCents(
  paymentIntentId: string,
  refund: {
    /** Stripe refund id — the ledger PRIMARY KEY. */
    refundId: string;
    amountCents: number;
    kind: 'make_whole' | 'post_hoc';
  }
): Promise<RecordedRefundRow[] | null> {
  const amountCents = Math.max(0, Math.round(refund.amountCents ?? 0));

  const { data, error } = await supabase.rpc('record_order_refund_cents', {
    p_payment_intent_id: paymentIntentId,
    p_refund_id: refund.refundId,
    p_amount_cents: amountCents,
    p_kind: refund.kind,
  });

  if (error) {
    console.error(`Could not record refund ${refund.refundId} for ${paymentIntentId}:`, error);
    await alertAdmin(
      'Refund not recorded on the order — reconciliation understated',
      `<p>Refund <code>${refund.refundId}</code> for payment intent
       <code>${paymentIntentId}</code> (${(amountCents / 100).toFixed(2)} USD,
       kind <code>${refund.kind}</code>) could not be written to
       <code>stripe_order_refunds</code>:</p>
       <pre>${error.message}</pre>
       <p>The order was deliberately NOT marked refunded, so reconciliation still
       reports it as collected and the drift stays visible. Until the refund
       columns are set by hand, this order overstates collections.</p>`,
      {
        source: 'stripe-webhook',
        dedupeKey: `refund-write-failed-${refund.refundId}`,
      }
    );
    return null;
  }

  const rows = (data ?? []) as RecordedRefundRow[];
  if (rows.length === 0) {
    // No order matched. Not a write failure, but nothing was persisted either,
    // so the caller must not claim the order is refunded — an EMPTY array says
    // "the write ran and matched nothing", which the caller reports differently
    // from the null write failure above.
    console.error(`Refund for ${paymentIntentId} matched no stripe_orders row`);
  }
  return rows;
}

interface CreatedRefundLedgerResult {
  attemptedBooking: boolean;
  rows: RecordedRefundRow[] | null;
}

/**
 * Stripe can return an in-flight Refund from `refunds.create`. Only succeeded
 * money belongs in the order ledger; `refund.updated` owns the later outcome.
 */
async function reconcileCreatedMakeWholeRefund(
  paymentIntentId: string,
  refund: Stripe.Refund
): Promise<CreatedRefundLedgerResult> {
  const action = resolveRefundLedgerAction(refund.status);
  if (action === 'defer') {
    console.log(
      `Created refund ${refund.id} remains ${refund.status ?? 'unknown'} — waiting for refund.updated`
    );
    return { attemptedBooking: false, rows: [] };
  }
  if (action === 'fail' || action === 'cancel') {
    await handleTerminalRefund(refund, action === 'cancel' ? 'canceled' : 'failed');
    return { attemptedBooking: false, rows: [] };
  }

  return {
    attemptedBooking: true,
    rows: await recordOrderRefundCents(paymentIntentId, {
      refundId: refund.id,
      amountCents: refund.amount,
      kind: 'make_whole',
    }),
  };
}

/**
 * Resolve the INDIVIDUAL refunds on a charge. `charge.refunds` may be absent or
 * paginated on the event payload, and `charge.amount_refunded` is only a
 * cumulative total — useless for a per-refund ledger. Fall back to a list call.
 *
 * NEVER THROWS (existing hard requirement): a bookkeeping failure must not
 * disturb a committed payment or make Stripe redeliver indefinitely. On failure
 * it returns null; the caller alerts and leaves the ledger untouched.
 */
async function resolveChargeRefunds(charge: Stripe.Charge): Promise<Stripe.Refund[] | null> {
  const embedded = charge.refunds?.data ?? [];
  const complete = charge.refunds != null && charge.refunds.has_more !== true;
  if (complete && (embedded.length > 0 || (charge.amount_refunded ?? 0) === 0)) {
    return embedded;
  }
  try {
    return await listAllChargeRefunds<Stripe.Refund>(charge.id, params =>
      stripe.refunds.list(params)
    );
  } catch (err) {
    console.error(`Could not expand refunds for charge ${charge.id}:`, err);
    return null;
  }
}

async function handleChargeRefunded(charge: Stripe.Charge, eventId: string) {
  const intentIdForLedger = extractPaymentIntentId(charge.payment_intent);

  const resolvedRefunds = await resolveChargeRefunds(charge);
  if (resolvedRefunds === null) {
    // Ledger deliberately untouched — booking a guessed split from the
    // cumulative `amount_refunded` is the unsound shortcut this rework removed.
    await alertAdmin(
      'Refund list unavailable — order ledger NOT updated',
      `<p>Charge <code>${charge.id}</code> reported
       ${((charge.amount_refunded ?? 0) / 100).toFixed(2)} USD refunded, but its
       individual refunds could not be retrieved from Stripe, so nothing was
       written to <code>stripe_order_refunds</code>.</p>
       <p>The order still reports the full amount as collected; the drift stays
       visible. Stripe will redeliver this event, which self-corrects once the
       list call succeeds.</p>`,
      { source: 'stripe-webhook', dedupeKey: `refund-list-failed-${charge.id}` }
    );
    return;
  }
  const refunds = resolvedRefunds;

  // Skip only when EVERY refund came from an app flow (.some would let an app
  // refund mask a later dashboard refund on the same charge — review finding
  // #3). Mixed charges fall through to the RECONCILE log below.
  const allFromAppRefund = allRefundsAppOriginated(refunds);

  // COLLECTION INVARIANT: record the refunds BEFORE any early return, for every
  // refund source. Whether a refund needs an operator alert (below) is a
  // separate question from whether the money came back (always true here).
  //
  // ATTRIBUTION: one ledger row PER STRIPE REFUND, keyed on its id. Booked as
  // 'post_hoc' here because this handler cannot tell the kinds apart; the
  // make-whole writers book their own refund id as 'make_whole' at creation
  // time and the upsert never overwrites `kind`, so an already-booked
  // make-whole refund keeps its kind no matter which delivery lands first.
  //
  // A refund Stripe already reports as failed/canceled is skipped: it never
  // moved money, and `refund.failed` owns the terminal state flip.
  let recordedRows: RecordedRefundRow[] | null = null;
  let sawSucceededRefund = false;
  if (intentIdForLedger) {
    // Empty until a refund books rows; an all-skipped charge is "ran, matched
    // nothing", not a write failure.
    recordedRows = [];
    for (const refund of refunds) {
      const action = resolveRefundLedgerAction(refund.status);
      if (action === 'defer') continue;
      if (action === 'fail' || action === 'cancel') {
        await handleTerminalRefund(refund, action === 'cancel' ? 'canceled' : 'failed');
        continue;
      }
      sawSucceededRefund = true;
      const rows = await recordOrderRefundCents(intentIdForLedger, {
        refundId: refund.id,
        amountCents: refund.amount ?? 0,
        // Read the kind off the Stripe object rather than assuming post_hoc.
        // A make-whole auto-refund stamps MAKE_WHOLE_METADATA_KEY at creation,
        // so this sweep attributes it correctly even when it wins the race
        // against that writer. Assuming 'post_hoc' here booked make-whole money
        // as a permanent platform loss (Codex round-7 finding).
        kind: refundKindFromMetadata(refund),
      });
      if (rows === null) {
        recordedRows = null;
        break;
      }
      recordedRows = rows;
    }
  }

  if (allFromAppRefund) {
    const showRefundId = findShowRefundId(refunds);
    if (showRefundId) {
      // Bulk show-cancellation refund: don't blanket-skip (that risks an
      // unstamped intent silently overpaying the club) or blanket-alert
      // (that floods admin once per entry on a 200-entry cancellation).
      // Check whether stamp_show_refund_entries actually ran.
      await alertIfShowRefundEntriesUnstamped(charge, showRefundId);
    } else {
      console.log(
        `charge.refunded for ${charge.id} originated from app refund flow — already recorded`
      );
    }
    return;
  }

  const paymentIntentId = extractPaymentIntentId(charge.payment_intent);
  if (!paymentIntentId) {
    console.error(`charge.refunded for ${charge.id} has no payment intent — cannot reconcile`);
    return;
  }

  if (!sawSucceededRefund) {
    console.log(
      `charge.refunded for ${paymentIntentId} contained no succeeded refunds — ledger unchanged`
    );
    return;
  }

  // FAIL CLOSED (MYK9-54 review finding 5): only stamp 'refunded' when the
  // amount actually PERSISTED. Stamping it after a failed ledger write leaves an
  // order that reads refunded with 0 refunded cents — invisible to attention
  // logic precisely because the status already says refunded. Leaving the status
  // alone preserves the drift so reconciliation can still see it. The write
  // failure was already alerted inside recordOrderRefundCents; return quietly
  // rather than throwing, so a committed payment is never disturbed.
  if (recordedRows === null) {
    console.error(
      `charge.refunded for ${paymentIntentId}: refund amount not persisted — ` +
        `deliberately NOT marking the order refunded so the drift stays visible`
    );
    return;
  }

  // Idempotent: re-delivery (or a second partial refund) re-applies the same state.
  // Snapshot contract (MYK9-54): the refund path never rewrites the original
  // charge facts (entry subtotal, platform fee, rate, processing fee). The
  // refund columns AND the status transition were both written above by
  // recordOrderRefundCents (atomic, all refund sources) — a separate blanket
  // `status = 'refunded'` here would have stamped a PARTIALLY refunded order as
  // fully refunded, so the rows it returned are used for reporting only.
  const data = recordedRows.map(row => ({ id: row.order_id, order_type: row.order_type }));
  if (data.length === 0) {
    console.error(`charge.refunded for ${paymentIntentId} matched no order — alerting`);
    const alert = buildUnmatchedRefundAlert({
      paymentIntentId,
      chargeId: charge.id,
      refundedAmountCents: charge.amount_refunded,
      eventId,
    });
    await alertAdmin(alert.title, alert.html, {
      source: 'stripe-webhook',
      severity: alert.severity,
      dedupeKey: alert.dedupeKey,
      detail: alert.detail,
    });
    return;
  }
  console.error(
    `RECONCILE: dashboard refund detected for ${paymentIntentId} (order ${data[0].id}, type ${data[0].order_type}). ` +
      `Entry-level refund columns were NOT updated — reconcile manually or re-issue via the app's refund dialog.`
  );
  // Payout math reads entries.refund_amount, which a dashboard refund never
  // touches — without action the club would be paid the refunded fee too
  // (Codex round-4 P2). The end-date+3-day payout delay is the window to act.
  await alertAdmin(
    'Dashboard refund needs reconciling before payout',
    `<p>A refund for payment intent <code>${paymentIntentId}</code> (order
     <code>${data[0].id}</code>) was issued from the Stripe dashboard, not the app.</p>
     <p><strong>The payout calculation will NOT see this refund</strong> — entry-level
     refund columns were not updated. Before the show's payout runs (end date + 3
     days), either re-issue the refund through the app's entry refund dialog (then
     refund the duplicate in Stripe), or set <code>refund_amount</code> on the affected
     entries. The runbook's "Never refund from the Stripe dashboard" section covers
     this.</p>`,
    { source: 'stripe-webhook', dedupeKey: `dashboard-refund-reconcile-${paymentIntentId}` }
  );
}

// Give stripe-refund-show's synchronous stamp_show_refund_entries RPC a
// chance to finish before treating an unstamped intent as a real failure.
// It runs immediately after the Stripe refund it just created, so it
// normally beats Stripe's own webhook-delivery round trip — but that's not
// guaranteed, and a single unlucky ordering would turn a healthy show
// refund into a false CRITICAL alert (Codex review).
const SHOW_REFUND_STAMP_RECHECK_DELAY_MS = 2000;

/** Counts this intent's entries that showRefundPlan.ts's classify() would
 * consider stamp-eligible (online, charged, positive fee) and still lack a
 * refund_amount stamp. Eligibility mirrors classify() exactly so a sibling
 * entry the refund plan intentionally skips — zero-fee, offline-paid, never
 * charged — never gets counted as a missed stamp. The "still needs a stamp"
 * signal itself checks refund_amount directly, not payment_status: the
 * alert's own recovery text tells an operator to "stamp the entries
 * manually," and a manual refund_amount fix that leaves payment_status at
 * 'paid' must clear the alert on redelivery, not keep re-firing on it
 * (Codex review). payment_status is only used to admit both the pre-stamp
 * ('paid') and post-stamp ('refunded') states as "was actually charged". */
async function countUnstampedShowRefundEntries(paymentIntentId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('entries')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .eq('payment_method', 'online')
    .in('payment_status', ['paid', 'refunded'])
    .gt('entry_fee', 0)
    .is('refund_amount', null);

  if (error) {
    console.error(`Error checking show-refund stamp state for intent ${paymentIntentId}:`, error);
    return null;
  }
  return data?.length ?? 0;
}

/** Confirms stamp_show_refund_entries actually ran for this bulk
 * show-cancellation refund's intent. Unstamped entries mean the payout cron
 * will not deduct their fee — the club would be paid the refunded fee too.
 * Arriving via webhook (rather than only the synchronous stripe-refund-show
 * response) makes this the post-mortem detector for a mid-bulk process kill. */
async function alertIfShowRefundEntriesUnstamped(charge: Stripe.Charge, showId: string) {
  const paymentIntentId = extractPaymentIntentId(charge.payment_intent);
  if (!paymentIntentId) {
    console.error(
      `charge.refunded for show ${showId} charge ${charge.id} has no payment intent — cannot verify stamp state`
    );
    return;
  }

  let unstampedCount = await countUnstampedShowRefundEntries(paymentIntentId);
  if (unstampedCount === null) return;

  if (unstampedCount > 0) {
    await new Promise(resolve => setTimeout(resolve, SHOW_REFUND_STAMP_RECHECK_DELAY_MS));
    unstampedCount = await countUnstampedShowRefundEntries(paymentIntentId);
    if (unstampedCount === null) return;
  }

  const decision = decideShowRefundStampAlert(unstampedCount);
  if (decision.action === 'none') {
    console.log(
      `charge.refunded for show ${showId} (intent ${paymentIntentId}) — entries already stamped`
    );
    return;
  }

  const { unstampedEntryCount } = decision;
  console.error(
    `CRITICAL: show refund for ${showId} (intent ${paymentIntentId}) has ${unstampedEntryCount} unstamped entr${unstampedEntryCount === 1 ? 'y' : 'ies'} — payout will overpay unless corrected.`
  );
  await alertAdmin(
    'Show refund entries not stamped — payout may overpay',
    `<p>A make-whole refund for show <code>${showId}</code> (intent <code>${paymentIntentId}</code>)
     was issued, but ${unstampedEntryCount} entr${unstampedEntryCount === 1 ? 'y is' : 'ies are'}
     still missing a <code>refund_amount</code> stamp.</p>
     <p>The payout calculation will NOT deduct ${unstampedEntryCount === 1 ? 'this entry' : 'these entries'}'
     fee${unstampedEntryCount === 1 ? '' : 's'} from the club's payout unless stamped before the
     show's payout runs. Re-run the show refund (it reuses the existing Stripe refund — no double
     refund) or stamp the entries manually.</p>`,
    { source: 'stripe-webhook', dedupeKey: `show-refund-unstamped-${paymentIntentId}` }
  );
}

/**
 * Mirror a connected account's onboarding/payout flags onto club_stripe_accounts.
 */
async function handleAccountUpdated(account: Stripe.Account) {
  const patch = accountToRowPatch(account);
  const { data, error } = await supabase
    .from('club_stripe_accounts')
    .update(patch)
    .eq('stripe_account_id', account.id)
    .select('id');

  if (error) {
    console.error(`Error updating club_stripe_accounts for ${account.id}:`, error);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`account.updated for ${account.id} matched no club — ignoring`);
    return;
  }
  console.log(
    `Connect account ${account.id}: onboarding_complete=${patch.onboarding_complete}, payouts_enabled=${patch.payouts_enabled}`
  );
}

/**
 * A club disconnected the platform from their Stripe account: stop payouts.
 */
async function handleAccountDeauthorized(accountId: string | undefined) {
  if (!accountId) {
    console.error('account.application.deauthorized without event.account — cannot map to a club');
    return;
  }
  const { error } = await supabase
    .from('club_stripe_accounts')
    .update({ onboarding_complete: false, payouts_enabled: false })
    .eq('stripe_account_id', accountId)
    .eq('livemode', stripeLivemode);

  if (error) {
    console.error(`Error disabling deauthorized account ${accountId}:`, error);
    return;
  }
  console.log(`Connect account ${accountId} deauthorized — payouts disabled`);
}

/**
 * Handle checkout.session.completed
 * Routes to appropriate handler based on checkout type
 */
// Best-effort: freeze the show's effective withdrawal policy onto freshly-paid
// entries (D3). Runs AFTER the payment write and NEVER throws — a failure here
// (including the policy columns not existing yet, before the migration deploys)
// must not disturb a committed payment. A NULL snapshot leaves the entry's
// column NULL, which the refund flow treats as fully-manual.
async function stampWithdrawalSnapshot(entryIds: string[], showId: string | null) {
  if (!showId || entryIds.length === 0) return;
  try {
    const { data: show, error } = await supabase
      .from('shows')
      .select(
        'withdrawal_cutoff_date, withdrawal_retention_type, withdrawal_retention_value, withdrawal_policy_notes, clubs(default_withdrawal_retention_type, default_withdrawal_retention_value, default_withdrawal_policy_notes)'
      )
      .eq('id', showId)
      .single();
    if (error || !show) return;

    const rawClub = (show as Record<string, unknown>).clubs;
    const club = (Array.isArray(rawClub) ? rawClub[0] : rawClub) ?? null;
    const snapshot = resolveWithdrawalPolicy(
      show as ShowWithdrawalColumns,
      club as ClubWithdrawalColumns | null
    );
    if (!snapshot) return;

    const { error: stampError } = await supabase
      .from('entries')
      .update({ withdrawal_policy_snapshot: snapshot })
      .in('id', entryIds);
    if (stampError) {
      console.error('withdrawal snapshot stamp failed (non-fatal):', stampError.message);
    }
  } catch (e) {
    console.error('withdrawal snapshot stamp threw (non-fatal):', e);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const checkoutType = session.metadata?.type;
  console.log(`Checkout completed: ${session.id}, type: ${checkoutType}`);

  if (checkoutType === 'entry') {
    await handleEntryPaymentCompleted(session);
  } else if (checkoutType === 'entry_payment_request') {
    await handleEntryPaymentRequestCompleted(session);
  } else if (session.mode === 'subscription') {
    await handleSubscriptionCheckoutCompleted(session);
  } else if (session.mode === 'payment') {
    // MP-24: nothing client-facing can create a bare mode:'payment' session
    // anymore (stripe-checkout removed that mode) and the old handler here
    // recorded the UNVERIFIED payload amount_total into stripe_orders. If one
    // ever arrives it is unexpected — log loudly instead of recording it.
    console.error(
      `Unexpected untyped one-time payment session ${session.id} — no handler records it; investigate its origin`
    );
  }
}

/**
 * Handle entry payment completion
 * - Updates cart status
 * - Creates actual entries from cart items
 * - Creates stripe_orders record
 */
async function handleEntryPaymentCompleted(session: Stripe.Checkout.Session) {
  const cartId = session.metadata?.cart_id;
  if (!cartId) {
    console.error('No cart_id in session metadata');
    return;
  }

  const { data: cart, error: cartError } = await supabase
    .from('entry_carts')
    .select(
      `
      *,
      exhibitor:exhibitor_profiles(id, person_id),
      items:entry_cart_items(
        id, entry_id, dog_id, class_id, handler_id, entry_fee_cents,
        jump_height, special_requests
      )
    `
    )
    .eq('id', cartId)
    .single();
  if (cartError || !cart) {
    console.error('Paid entry checkout cart could not be loaded:', cartError);
    const missingCartSession = await stripe.checkout.sessions.retrieve(session.id);
    const missingCartGate = decideFreshSessionGate(missingCartSession);
    if (missingCartGate.action === 'skip') {
      console.log(
        `Checkout session ${session.id}: ${missingCartGate.reason} — waiting for a paid event`
      );
      return;
    }
    const paymentIntentId = extractPaymentIntentId(missingCartSession.payment_intent);
    await alertAdmin(
      'Paid checkout has no cart — entries NOT created',
      `<p>Checkout session <code>${session.id}</code> is paid, but cart <code>${cartId}</code> could not be read. No entries were created; the full charge will be refunded automatically if Stripe accepts the refund.</p>`,
      { source: 'stripe-webhook', dedupeKey: `paid-checkout-no-cart-${session.id}` }
    );
    await issueCartOverflowAutoRefund({
      session: missingCartSession,
      paymentIntentId,
      decision: fullCartRefundDecision(missingCartGate.amountTotalCents, paymentIntentId),
      invalidCartItemIds: [],
      waitlistedCartItemIds: [],
      deniedCartItemIds: [],
      failedCartItemIds: [],
    });
    return;
  }

  const freshSession = await stripe.checkout.sessions.retrieve(session.id);
  const freshGate = decideFreshSessionGate(freshSession);
  if (freshGate.action === 'skip') {
    console.log(`Checkout session ${session.id}: ${freshGate.reason} — waiting for a paid event`);
    return;
  }
  const paymentIntentId = extractPaymentIntentId(freshSession.payment_intent);
  const grossCents = freshGate.amountTotalCents;
  let linePrices;
  try {
    linePrices = await loadEntrySettlementLinePricesFromStripe(
      stripe.checkout.sessions,
      session.id,
      'cart_item_id'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await alertAdmin(
      'Paid cart has incomplete Stripe line evidence',
      `<p>Session <code>${session.id}</code> was paid, but its entry lines could not be matched to cart items. No entries were settled.</p><pre>${message}</pre>`,
      { source: 'stripe-webhook', dedupeKey: `cart-lines-invalid-${session.id}` }
    );
    await issueCartOverflowAutoRefund({
      session: freshSession,
      paymentIntentId,
      decision: fullCartRefundDecision(grossCents, paymentIntentId),
      invalidCartItemIds: cart.items.map((item: { id: string }) => item.id),
      waitlistedCartItemIds: [],
      deniedCartItemIds: [],
      failedCartItemIds: [],
    });
    return;
  }

  const { data: stripeCustomer } = await supabase
    .from('stripe_customers')
    .select('id')
    .eq('person_id', cart.exhibitor.person_id)
    .eq('livemode', stripeLivemode)
    .maybeSingle();
  const rates = decodeStampedPlatformFeeRates(
    freshSession.metadata,
    Deno.env.get('PLATFORM_FEE_PERCENT')
  );
  const processingFeeCents = await fetchProcessingFeeCents(paymentIntentId);
  const { data: settlementData, error: settlementError } = await retryTransientSettlement(() =>
    supabase.rpc('settle_entry_order', {
      p_source_kind: 'cart',
      p_source_id: cartId,
      p_order_facts: {
        customer_id: stripeCustomer?.id ?? null,
        currency: freshSession.currency || 'usd',
        paid_at: new Date().toISOString(),
        stripe_processing_fee_cents: processingFeeCents,
        platform_fee_rate: rates.percent,
        platform_fee_flat_cents: rates.flatCents,
        platform_fee_min_cents: rates.minCents,
      },
      p_verified_gross_cents: grossCents!,
      p_verified_session_id: freshSession.id,
      p_verified_payment_intent_id: paymentIntentId!,
      p_verified_line_prices: linePrices,
    })
  );
  const settlement = normalizeEntryOrderSettlement(settlementData);
  if (settlementError || !settlement) {
    console.error('Authoritative cart settlement failed:', settlementError);
    const transientFailure = isTransientSettlementSqlError(settlementError?.code);
    await alertAdmin(
      transientFailure
        ? 'Paid cart settlement retries exhausted'
        : 'Paid cart could not be settled',
      `<p>Session <code>${session.id}</code> was paid, but the authoritative settlement did not complete. No partial settlement was committed.${transientFailure ? ' Replay the same Stripe event after checking for an existing order, or refund manually; no automatic refund was attempted.' : ''}</p><pre>${settlementError?.message ?? 'Malformed settlement response'}</pre>`,
      { source: 'stripe-webhook', dedupeKey: `cart-settlement-failed-${session.id}` }
    );
    if (isDeterministicSettlementRejection(settlementError?.code)) {
      await issueCartOverflowAutoRefund({
        session: freshSession,
        paymentIntentId,
        decision: fullCartRefundDecision(grossCents, paymentIntentId),
        invalidCartItemIds: cart.items.map((item: { id: string }) => item.id),
        waitlistedCartItemIds: [],
        deniedCartItemIds: [],
        failedCartItemIds: [],
      });
    }
    return;
  }

  const acceptedLines = settlement.lineResults.filter(line => line.outcome === 'accepted');
  const waitlistedLines = settlement.lineResults.filter(line => line.outcome === 'waitlisted');
  const deniedLines = settlement.lineResults.filter(line => line.outcome === 'denied');
  const invalidCartItemIds = settlement.lineResults
    .filter(line => line.outcome !== 'accepted')
    .map(line => line.lineId);
  const waitlistEntryIds = waitlistedLines
    .map(line => line.waitlistEntryId)
    .filter((id): id is string => Boolean(id));

  await completeEntrySettlementSideEffects(settlement, freshSession, cart.show_id, true);

  if (settlement.expectedMakeWholeRefundCents > 0) {
    await issueCartOverflowAutoRefund({
      session: freshSession,
      paymentIntentId,
      decision: {
        action: 'refund',
        amountCents: settlement.expectedMakeWholeRefundCents,
        paidAmountCents: Math.max(0, grossCents! - settlement.expectedMakeWholeRefundCents),
        reason: acceptedLines.length === 0 ? 'full_make_whole' : 'partial_no_service_lines',
      },
      invalidCartItemIds,
      waitlistedCartItemIds: waitlistedLines.map(line => line.lineId),
      deniedCartItemIds: deniedLines.map(line => line.lineId),
      failedCartItemIds: [],
    });
  }

  const { data: orderSnapshot, error: orderSnapshotError } = await supabase
    .from('stripe_orders')
    .select('entry_subtotal_cents, platform_fee_cents, amount_cents')
    .eq('id', settlement.orderId)
    .single();
  if (orderSnapshotError || !orderSnapshot) {
    await alertAdmin(
      'Paid cart receipt totals could not be loaded',
      `<p>Settlement order <code>${settlement.orderId}</code> exists for session <code>${session.id}</code>, but its stored receipt totals could not be read.</p>`,
      { source: 'stripe-webhook', dedupeKey: `cart-receipt-snapshot-read-${session.id}` }
    );
    return;
  }
  if (processingFeeCents === null)
    await warnMissingProcessingFee(paymentIntentId, `cart ${cartId}`);
  const entryFeesById = mapAcceptedEntryFees(acceptedLines, linePrices);
  if (settlement.canonicalEntryIds.some(entryId => !entryFeesById.has(entryId))) {
    await alertAdmin(
      'Paid cart receipt line prices could not be reconciled',
      `<p>Settlement order <code>${settlement.orderId}</code> exists for session <code>${session.id}</code>, but at least one accepted entry has no verified Stripe line amount. No confirmation email was sent.</p>`,
      { source: 'stripe-webhook', dedupeKey: `cart-receipt-line-price-${session.id}` }
    );
    return;
  }
  await sendEntryConfirmationEmail(cart, settlement.canonicalEntryIds, freshSession, {
    subtotalCents: orderSnapshot.entry_subtotal_cents ?? 0,
    platformFeeCents: orderSnapshot.platform_fee_cents ?? 0,
    totalCents: Math.max(0, orderSnapshot.amount_cents - settlement.expectedMakeWholeRefundCents),
    entryFeesById,
  });
  console.log(
    `Cart ${cartId} settled by SQL order ${settlement.orderId} (${settlement.canonicalEntryIds.length} entries, ${waitlistEntryIds.length} waitlisted)`
  );
}

async function handleEntryPaymentRequestCompleted(session: Stripe.Checkout.Session) {
  const freshSession = await stripe.checkout.sessions.retrieve(session.id);
  const freshGate = decideFreshSessionGate(freshSession);
  if (freshGate.action === 'skip') {
    console.log(
      `Payment link session ${session.id}: ${freshGate.reason} — waiting for a paid event`
    );
    return;
  }
  const paymentIntentId = extractPaymentIntentId(freshSession.payment_intent);
  const grossCents = freshGate.amountTotalCents;
  const { data: link, error: linkError } = await supabase
    .from('entry_payment_links')
    .select('id, show_id, entry_ids, status')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();

  if (linkError || !link) {
    await alertAdmin(
      'Paid payment link has no record — entries NOT marked paid',
      `<p>Paid session <code>${session.id}</code> has no persisted entry-payment link. No entries were settled.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-no-record-${session.id}` }
    );
    await issueEntryPaymentAutoRefund({
      session: freshSession,
      paymentIntentId,
      amountCents: grossCents,
      reason: 'no_link_record',
      invalidEntryIds: [],
      linkId: null,
    });
    return;
  }

  let linePrices;
  try {
    linePrices = await loadEntrySettlementLinePricesFromStripe(
      stripe.checkout.sessions,
      session.id,
      'entry_id'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await alertAdmin(
      'Paid payment link has incomplete Stripe line evidence',
      `<p>Session <code>${session.id}</code> could not be matched to its persisted entry lines. No entries were settled.</p><pre>${message}</pre>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-lines-invalid-${session.id}` }
    );
    await issueEntryPaymentAutoRefund({
      session: freshSession,
      paymentIntentId,
      amountCents: grossCents,
      reason: 'full_make_whole',
      invalidEntryIds: link.entry_ids,
      linkId: link.id,
    });
    return;
  }

  const rates = decodeStampedPlatformFeeRates(
    freshSession.metadata,
    Deno.env.get('PLATFORM_FEE_PERCENT')
  );
  const processingFeeCents = await fetchProcessingFeeCents(paymentIntentId);
  const { data: settlementData, error: settlementError } = await retryTransientSettlement(() =>
    supabase.rpc('settle_entry_order', {
      p_source_kind: 'payment_link',
      p_source_id: link.id,
      p_order_facts: {
        customer_id: null,
        currency: freshSession.currency || 'usd',
        paid_at: new Date().toISOString(),
        stripe_processing_fee_cents: processingFeeCents,
        platform_fee_rate: rates.percent,
        platform_fee_flat_cents: rates.flatCents,
        platform_fee_min_cents: rates.minCents,
      },
      p_verified_gross_cents: grossCents!,
      p_verified_session_id: freshSession.id,
      p_verified_payment_intent_id: paymentIntentId!,
      p_verified_line_prices: linePrices,
    })
  );
  const settlement = normalizeEntryOrderSettlement(settlementData);
  if (settlementError || !settlement) {
    console.error('Authoritative payment-link settlement failed:', settlementError);
    const transientFailure = isTransientSettlementSqlError(settlementError?.code);
    await alertAdmin(
      transientFailure
        ? 'Paid payment-link settlement retries exhausted'
        : 'Paid payment link could not be settled',
      `<p>Session <code>${session.id}</code> was paid, but authoritative settlement did not complete. No partial settlement was committed.${transientFailure ? ' Replay the same Stripe event after checking for an existing order, or refund manually; no automatic refund was attempted.' : ''}</p><pre>${settlementError?.message ?? 'Malformed settlement response'}</pre>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-settlement-failed-${session.id}` }
    );
    if (isDeterministicSettlementRejection(settlementError?.code)) {
      await issueEntryPaymentAutoRefund({
        session: freshSession,
        paymentIntentId,
        amountCents: grossCents,
        reason: 'full_make_whole',
        invalidEntryIds: link.entry_ids,
        linkId: link.id,
      });
    }
    return;
  }

  await completeEntrySettlementSideEffects(settlement, freshSession, link.show_id, false);
  if (processingFeeCents === null) {
    await warnMissingProcessingFee(paymentIntentId, `payment link ${link.id}`);
  }
  const invalidEntryIds = settlement.lineResults
    .filter(line => line.outcome !== 'accepted')
    .map(line => line.lineId);
  if (settlement.expectedMakeWholeRefundCents > 0) {
    await issueEntryPaymentAutoRefund({
      session: freshSession,
      paymentIntentId,
      amountCents: settlement.expectedMakeWholeRefundCents,
      reason:
        settlement.canonicalEntryIds.length === 0 ? 'full_make_whole' : 'partial_invalid_entries',
      invalidEntryIds,
      linkId: link.id,
    });
  }
  console.log(
    `Payment link ${session.id} settled by SQL order ${settlement.orderId} (${settlement.canonicalEntryIds.length} entries)`
  );
}

async function completeEntrySettlementSideEffects(
  settlement: EntryOrderSettlement,
  session: Stripe.Checkout.Session,
  showId: string,
  expireOtherLinks: boolean
) {
  const accepted = settlement.lineResults.filter(line => line.outcome === 'accepted');
  const paidIds = [
    ...new Set(
      accepted.flatMap(line =>
        [line.entryId, line.moneyRootEntryId].filter((id): id is string => Boolean(id))
      )
    ),
  ];
  await stampWithdrawalSnapshot(paidIds, showId);

  for (const line of accepted) {
    if (!line.entryId) continue;
    if (expireOtherLinks) {
      if (line.moneyRootEntryId)
        await expireRecoveredEntryPaymentLinks(line.moneyRootEntryId, session.id);
      if (line.moneyRootEntryId !== line.entryId) {
        await expireRecoveredEntryPaymentLinks(line.entryId, session.id);
      }
    }
  }
}

function fullCartRefundDecision(
  grossCents: number | null,
  paymentIntentId: string | null
): CartOverflowRefundDecision {
  if (grossCents == null || grossCents <= 0) {
    return { action: 'cannot_refund', reason: 'missing_amount', paidAmountCents: null };
  }
  if (!paymentIntentId) {
    return { action: 'cannot_refund', reason: 'missing_payment_intent', paidAmountCents: 0 };
  }
  return {
    action: 'refund',
    amountCents: grossCents,
    paidAmountCents: 0,
    reason: 'full_make_whole',
  };
}

function isDeterministicSettlementRejection(code: string | undefined): boolean {
  return code === '22023' || code === '23514' || code === '23505';
}

async function expireRecoveredEntryPaymentLinks(entryId: string, sessionId: string) {
  const { data: links, error: linksError } = await supabase
    .from('entry_payment_links')
    .select('id, stripe_checkout_session_id, entry_ids')
    .eq('status', 'open')
    .overlaps('entry_ids', [entryId]);

  if (linksError) {
    await alertAdmin(
      'Recovered entry payment links could not be checked',
      `<p>Entry <code>${entryId}</code> was paid from cart session <code>${sessionId}</code>,
       but its open payment links could not be checked:</p><pre>${linksError.message}</pre>`,
      { source: 'stripe-webhook', dedupeKey: `recovered-entry-link-check-${entryId}` }
    );
    return;
  }

  for (const link of links ?? []) {
    try {
      const { count: unpaidEntryCount, error: unpaidEntriesError } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .in('id', link.entry_ids)
        .eq('payment_status', 'pending')
        .is('deleted_at', null);

      if (unpaidEntriesError) {
        await alertAdmin(
          'Recovered entry payment link status could not be verified',
          `<p>Entry <code>${entryId}</code> was paid from cart session <code>${sessionId}</code>,
           but unpaid entries on link <code>${link.id}</code> could not be checked:</p>
           <pre>${unpaidEntriesError.message}</pre>`,
          { source: 'stripe-webhook', dedupeKey: `recovered-entry-link-unpaid-check-${link.id}` }
        );
        continue;
      }

      // Keep a multi-entry link open while any sibling entry is unpaid.
      if ((unpaidEntryCount ?? 0) > 0) continue;

      const linkSession = await stripe.checkout.sessions.retrieve(link.stripe_checkout_session_id);
      if (linkSession.payment_status === 'paid') {
        await alertAdmin(
          'Recovered entry was paid by more than one checkout',
          `<p>Entry <code>${entryId}</code> was paid by cart session <code>${sessionId}</code>
           while payment-link session <code>${link.stripe_checkout_session_id}</code> was also paid.
           The payment-link webhook must reconcile and refund the duplicate.</p>`,
          { source: 'stripe-webhook', dedupeKey: `recovered-entry-double-payment-${entryId}` }
        );
        continue;
      }

      if (linkSession.status === 'open') {
        await stripe.checkout.sessions.expire(link.stripe_checkout_session_id);
      }

      await supabase
        .from('entry_payment_links')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', link.id)
        .eq('status', 'open');
    } catch (error) {
      console.error(`Could not expire recovered entry payment link ${link.id}:`, error);
      await alertAdmin(
        'Recovered entry payment link could not be expired',
        `<p>Entry <code>${entryId}</code> was paid from cart session <code>${sessionId}</code>,
         but payment-link session <code>${link.stripe_checkout_session_id}</code> could not be expired.</p>
         <pre>${error instanceof Error ? error.message : String(error)}</pre>`,
        { source: 'stripe-webhook', dedupeKey: `recovered-entry-link-expire-${link.id}` }
      );
    }
  }
}

async function issueEntryPaymentAutoRefund(input: {
  session: Stripe.Checkout.Session;
  paymentIntentId: string | null;
  amountCents: number | null;
  reason: 'no_link_record' | 'full_make_whole' | 'partial_invalid_entries';
  invalidEntryIds: string[];
  linkId: string | null;
}) {
  if (!input.paymentIntentId || !input.amountCents || input.amountCents <= 0) {
    await alertAdmin(
      'Payment link auto-refund could not be created',
      `<p>Session <code>${input.session.id}</code> needs an auto-refund, but the
       payment intent or amount was missing (payment intent
       <code>${input.paymentIntentId ?? 'unknown'}</code>, amount
       <code>${input.amountCents ?? 'unknown'}</code>).</p>`,
      {
        source: 'stripe-webhook',
        dedupeKey: `payment-link-refund-missing-inputs-${input.session.id}`,
      }
    );
    return;
  }

  try {
    // Safe with reason in the key: callers first close the payment-link row, so
    // later webhook deliveries return before they can issue a second refund.
    const refund = await stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountCents,
        metadata: {
          type: 'entry_payment_request_auto_refund',
          // RACE-PROOF ATTRIBUTION: `charge.refunded` can arrive BEFORE this
          // writer books its own ledger row, and the ledger upsert deliberately
          // never overwrites `kind`. Without a marker ON THE STRIPE OBJECT the
          // sweep would book this make-whole refund as 'post_hoc' and it would
          // stay a permanent (wrong) platform loss. Stripe carries this metadata
          // on every delivery, so the kind is knowable regardless of order.
          [MAKE_WHOLE_METADATA_KEY]: 'true',
          checkout_session_id: input.session.id,
          entry_payment_link_id: input.linkId ?? '',
          reason: input.reason,
          invalid_entry_ids: JSON.stringify(input.invalidEntryIds),
        },
      },
      { idempotencyKey: `entry-payment-request-auto-refund-${input.session.id}-${input.reason}` }
    );
    console.error(
      `AUTO-REFUND: ${refund.id} refunded ${refund.amount}¢ for payment-link session ${input.session.id} (${input.reason})`
    );
    await alertAdmin(
      'Payment link charge auto-refunded',
      `<p>Auto-refund <code>${refund.id}</code> refunded
       ${(refund.amount / 100).toFixed(2)} USD for Checkout Session
       <code>${input.session.id}</code> (payment intent
       <code>${input.paymentIntentId}</code>).</p>
       <p>Reason: <code>${input.reason}</code>${
         input.invalidEntryIds.length > 0
           ? `; invalid entries: <code>${input.invalidEntryIds.join(', ')}</code>`
           : ''
       }.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-refund-issued-${refund.id}` }
    );

    // COLLECTION INVARIANT + ATTRIBUTION: a payment-link auto-refund returns
    // money for entries that were never accepted (no link record / invalid
    // entries), so it is a MAKE-WHOLE refund, not a platform loss. Record it
    // here rather than waiting for charge.refunded: that handler treats this
    // refund as app-originated and a missed delivery would leave the order
    // looking collected in full.
    //
    // The Stripe refund id is the ledger PRIMARY KEY, so a duplicate delivery is
    // an upsert of the same row and two make-whole refunds on one intent are two
    // rows that simply sum. Booking `kind: 'make_whole'` HERE, at creation time,
    // is what lets the later `charge.refunded` sweep leave the kind alone. The
    // recompute owns the status transition — 'refunded' IFF FULLY refunded — so
    // there is deliberately no status update here.
    const ledgerResult = await reconcileCreatedMakeWholeRefund(input.paymentIntentId, refund);

    // FAIL CLOSED (finding 5): a failed or unmatched ledger write leaves the
    // order looking collected in full. Alert instead of silently continuing.
    if (
      ledgerResult.attemptedBooking &&
      (ledgerResult.rows === null || ledgerResult.rows.length === 0)
    ) {
      await alertAdmin(
        'Payment link auto-refund issued but not recorded on the order',
        `<p>Auto-refund <code>${refund.id}</code> succeeded for session
         <code>${input.session.id}</code> (payment intent
         <code>${input.paymentIntentId}</code>), but the refund could not be
         written to <code>stripe_orders</code>.</p>
         <p>The order still reports the full amount as collected. Set
         <code>make_whole_refunded_cents</code> by hand to clear the drift.</p>`,
        {
          source: 'stripe-webhook',
          dedupeKey: `payment-link-refund-order-update-failed-${refund.id}`,
        }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `CRITICAL: auto-refund failed for payment-link session ${input.session.id}:`,
      err
    );
    await alertAdmin(
      'Payment link auto-refund FAILED',
      `<p>Session <code>${input.session.id}</code> needs an auto-refund of
       ${(input.amountCents / 100).toFixed(2)} USD, but Stripe refund creation failed:</p>
       <pre>${message}</pre>
       <p>Recovery: refund payment intent <code>${input.paymentIntentId}</code> manually.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-refund-failed-${input.session.id}` }
    );
  }
}

async function issueCartOverflowAutoRefund(input: {
  session: Stripe.Checkout.Session;
  paymentIntentId: string | null;
  decision: CartOverflowRefundDecision;
  invalidCartItemIds: string[];
  waitlistedCartItemIds: string[];
  deniedCartItemIds: string[];
  failedCartItemIds: string[];
}) {
  if (input.decision.action === 'none') return;

  if (input.decision.action === 'needs_manual_amount') {
    await alertAdmin(
      'Cart overflow auto-refund needs manual amount',
      `<p>Session <code>${input.session.id}</code> has no-service cart items
       <code>${input.invalidCartItemIds.join(', ')}</code>, but the webhook could not
       derive collected line amounts for:
       <code>${input.decision.missingLineIds.join(', ')}</code>.</p>
       <p>Recovery: refund the no-service portion from Stripe, including the matching
       platform fee share.</p>`,
      {
        source: 'stripe-webhook',
        dedupeKey: `cart-overflow-refund-manual-amount-${input.session.id}`,
      }
    );
    return;
  }

  if (input.decision.action === 'cannot_refund') {
    await alertAdmin(
      'Cart overflow auto-refund could not be created',
      `<p>Session <code>${input.session.id}</code> has no-service cart items
       <code>${input.invalidCartItemIds.join(', ')}</code>, but auto-refund could not
       run: <code>${input.decision.reason}</code>.</p>`,
      {
        source: 'stripe-webhook',
        dedupeKey: `cart-overflow-refund-cannot-refund-${input.session.id}`,
      }
    );
    return;
  }

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId!,
        amount: input.decision.amountCents,
        metadata: {
          type: 'entry_cart_overflow_auto_refund',
          // Race-proof attribution — see MAKE_WHOLE_METADATA_KEY.
          [MAKE_WHOLE_METADATA_KEY]: 'true',
          checkout_session_id: input.session.id,
          reason: input.decision.reason,
          invalid_cart_item_ids: JSON.stringify(input.invalidCartItemIds),
          waitlisted_cart_item_ids: JSON.stringify(input.waitlistedCartItemIds),
          denied_cart_item_ids: JSON.stringify(input.deniedCartItemIds),
          failed_cart_item_ids: JSON.stringify(input.failedCartItemIds),
        },
      },
      {
        idempotencyKey: `entry-cart-overflow-auto-refund-${input.session.id}-${input.decision.reason}`,
      }
    );
    console.error(
      `AUTO-REFUND: ${refund.id} refunded ${refund.amount}¢ for cart overflow session ${input.session.id} (${input.decision.reason})`
    );
    await alertAdmin(
      'Cart overflow charge auto-refunded',
      `<p>Auto-refund <code>${refund.id}</code> refunded
       ${(refund.amount / 100).toFixed(2)} USD for Checkout Session
       <code>${input.session.id}</code>.</p>
       <p>Reason: <code>${input.decision.reason}</code>; no-service cart items:
       <code>${input.invalidCartItemIds.join(', ')}</code>.</p>`,
      { source: 'stripe-webhook', dedupeKey: `cart-overflow-refund-issued-${refund.id}` }
    );

    // COLLECTION INVARIANT: amount_cents on the order we just inserted is the
    // GROSS charge, so this refund must be recorded to keep
    // `collected = amount_cents − make_whole_refunded_cents − refunded_cents`
    // right. Write it here rather than waiting for charge.refunded: that handler
    // treats this refund as app-originated, and a missed/late delivery would
    // leave the order looking collected in full.
    //
    // ATTRIBUTION: cart overflow refunds lines that were NEVER accepted, so this
    // is a MAKE-WHOLE refund, not a platform loss — the platform earned no fee
    // and made no club transfer on those lines. Recorded as makeWholeCents so
    // the later cumulative charge.refunded delivery nets it out of the post-hoc
    // figure instead of double counting it.
    //
    // The Stripe refund id is the ledger PRIMARY KEY (a duplicate delivery is an
    // upsert of the same row), `kind: 'make_whole'` is booked HERE at creation
    // time so the later charge.refunded sweep cannot demote it to a post-hoc
    // loss, and the recompute owns the status transition ('refunded' IFF FULLY
    // refunded), so no status is stamped here.
    const ledgerResult = await reconcileCreatedMakeWholeRefund(input.paymentIntentId!, refund);

    // FAIL CLOSED (finding 5): don't leave a refunded charge reading as collected
    // in full without saying so.
    if (
      ledgerResult.attemptedBooking &&
      (ledgerResult.rows === null || ledgerResult.rows.length === 0)
    ) {
      await alertAdmin(
        'Cart overflow auto-refund issued but not recorded on the order',
        `<p>Auto-refund <code>${refund.id}</code> succeeded for session
         <code>${input.session.id}</code>, but the refund could not be written to
         <code>stripe_orders</code>.</p>
         <p>The order still reports the full amount as collected. Set
         <code>make_whole_refunded_cents</code> by hand to clear the drift.</p>`,
        {
          source: 'stripe-webhook',
          dedupeKey: `cart-overflow-refund-order-update-failed-${refund.id}`,
        }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`CRITICAL: cart overflow auto-refund failed for ${input.session.id}:`, err);
    await alertAdmin(
      'Cart overflow auto-refund FAILED',
      `<p>Session <code>${input.session.id}</code> needs an auto-refund of
       ${(input.decision.amountCents / 100).toFixed(2)} USD, but Stripe refund
       creation failed:</p><pre>${message}</pre>
       <p>Recovery: refund payment intent <code>${input.paymentIntentId}</code>
       manually.</p>`,
      { source: 'stripe-webhook', dedupeKey: `cart-overflow-refund-failed-${input.session.id}` }
    );
  }
}

/**
 * Send entry confirmation email via send-email function
 */
async function sendEntryConfirmationEmail(
  cart: {
    show_id: string;
    exhibitor: { id: string; person_id: string };
    items: Array<{
      dog_id: string;
      class_id: string;
      entry_fee_cents: number;
    }>;
  },
  entryIds: string[],
  session: Stripe.Checkout.Session,
  authoritative: {
    subtotalCents: number;
    platformFeeCents: number;
    totalCents: number;
    entryFeesById: Map<string, number>;
  }
) {
  let deliveryAttemptRecorded = false;
  let recipientEmail: string | null = null;
  const recordDeliveryAttempt = async (args: {
    status: 'sent' | 'failed';
    messageId?: string | null;
    errorMessage?: string | null;
  }) => {
    await supabase
      .from('email_log')
      .insert({
        recipient_email: recipientEmail,
        email_type: 'registration_confirmation',
        resend_message_id: args.messageId ?? null,
        status: args.status,
        status_updated_at: new Date().toISOString(),
        error_message: args.errorMessage ?? null,
        show_id: cart.show_id,
      })
      .then(({ error }) => {
        if (error) console.error('Could not log Stripe confirmation email:', error);
      });
    deliveryAttemptRecorded = true;
  };

  try {
    // Get exhibitor email and name
    const { data: person } = await supabase
      .from('people')
      .select('email, first_name, last_name')
      .eq('id', cart.exhibitor.person_id)
      .single();

    if (!person?.email) {
      console.error('No email found for exhibitor');
      await recordDeliveryAttempt({ status: 'failed', errorMessage: 'recipient_unresolved' });
      return;
    }
    recipientEmail = person.email;

    // Get show details
    const { data: show } = await supabase
      .from('shows')
      .select('name, start_date, end_date, venue_name, city, state')
      .eq('id', cart.show_id)
      .single();

    if (!show) {
      console.error('Show not found');
      await recordDeliveryAttempt({ status: 'failed', errorMessage: 'show_unresolved' });
      return;
    }

    // Get the SQL-selected live entry details for the receipt.
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select(
        `
        id,
        dogs:dog_id (name, call_name),
        classes:class_id (name, level)
      `
      )
      .in('id', entryIds);

    if (entriesError) {
      console.error('Entries fetch for confirmation email failed:', entriesError);
      await recordDeliveryAttempt({ status: 'failed', errorMessage: 'entries_unresolved' });
      return;
    }

    if (!entries || entries.length === 0) {
      console.error('No entries found for confirmation email');
      await recordDeliveryAttempt({ status: 'failed', errorMessage: 'entries_unresolved' });
      return;
    }

    // Format show date
    const startDate = new Date(show.start_date);
    const endDate = show.end_date ? new Date(show.end_date) : null;
    let showDate = startDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (endDate && endDate.getTime() !== startDate.getTime()) {
      showDate += ` - ${endDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`;
    }

    // Format location
    const showLocation = [show.venue_name, show.city, show.state].filter(Boolean).join(', ');

    // Build email payload
    const emailData = {
      exhibitorName: `${person.first_name} ${person.last_name}`,
      showName: show.name,
      showDate,
      showLocation: showLocation || undefined,
      entries: entries.map(e => ({
        dogName:
          (e.dogs as { call_name?: string; name: string })?.call_name ||
          (e.dogs as { name: string })?.name ||
          'Unknown',
        className: (e.classes as { name: string })?.name || 'Unknown',
        classLevel: (e.classes as { level?: string })?.level || undefined,
        // Use the exact verified Stripe line amount, keyed by the SQL-returned
        // live entry. A moved destination can have a zero stored entry_fee
        // while the money-root obligation remains payable.
        entryFee: authoritative.entryFeesById.get(e.id)!,
      })),
      subtotal: authoritative.subtotalCents,
      platformFee: authoritative.platformFeeCents,
      total: authoritative.totalCents,
      orderId: session.id,
    };

    if (!resendApiKey) {
      await recordDeliveryAttempt({ status: 'failed', errorMessage: 'email_not_configured' });
      return;
    }

    // This webhook has already resolved the cart, exhibitor, show, entries,
    // and paid totals server-side. Send directly with a stable idempotency key;
    // the generic send-email endpoint intentionally rejects service-role calls.
    const response = await sendResendEmailWithRetry({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
        'Idempotency-Key': `stripe-entry-confirmation-${session.id}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: person.email,
        subject: `Entry Confirmation - ${show.name}`,
        html: renderStripeEntryConfirmationEmail(emailData),
      }),
    });

    if (!response.ok) {
      await response.text();
      console.error('Failed to send confirmation email:', response.status);
      await recordDeliveryAttempt({
        status: 'failed',
        errorMessage: `provider_http_${response.status}`,
      });
      // MP-13: no stamp on a failed send — the entry stays eligible for the
      // scheduled send-confirmation-email sender's audience query
      // (confirmation_email_sent_at IS NULL / status IN pending,failed).
      return;
    }

    console.log('Confirmation email sent');

    // MP-13: stamp every entry this email covered with the SAME send-state
    // semantics the scheduled sender uses, so its audience query excludes
    // this entry and no second confirmation email is sent. Resend returns an
    // `id` for the accepted message;
    // fall back to null if the body is missing/unparseable rather than
    // failing the whole webhook over a non-critical read.
    let messageId: string | null = null;
    try {
      const result = (await response.json()) as { id?: string };
      messageId = result?.id ?? null;
    } catch (parseError) {
      console.error('Could not parse send-email response for message id:', parseError);
    }

    await recordDeliveryAttempt({ status: 'sent', messageId });

    const stampPayload = buildConfirmationStampPayload({
      sendSucceeded: true,
      messageId,
      nowIso: new Date().toISOString(),
    });
    if (stampPayload) {
      const { error: stampError } = await supabase
        .from('entries')
        .update(stampPayload)
        .in('id', entryIds);
      if (stampError) {
        // Logged, not thrown: worst case is the pre-existing duplicate send
        // via the scheduled sender's retry, not a lost payment. Per task
        // 3.2's explicit expansion, a stamp write failure must not fail the
        // webhook.
        console.error(
          `Failed to stamp confirmation_email_* for entries [${entryIds.join(', ')}]:`,
          stampError
        );
      }
    }
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    if (!deliveryAttemptRecorded) {
      await recordDeliveryAttempt({ status: 'failed', errorMessage: 'email_delivery_error' });
    }
    // Don't throw - email failure shouldn't fail the payment processing
  }
}

/**
 * Handle subscription checkout completion
 */
async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  if (!customerId) {
    console.error('No customer ID in session');
    return;
  }

  // Use the specific subscription ID from the session instead of a customer-level
  // list (limit:1 ordering would pick the wrong sub if the user has duplicates).
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as { id?: string } | null)?.id;

  await syncSubscriptionFromStripe(customerId, subscriptionId ?? undefined);
}

/**
 * Handle subscription changes (created, updated, deleted)
 */
async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  console.log(`Subscription ${subscription.status} for customer: ${customerId}`);

  // Pass the exact subscription ID so syncSubscriptionFromStripe retrieves it
  // directly instead of listing by customer (limit:1 could return the wrong sub).
  await syncSubscriptionFromStripe(customerId, subscription.id);
}

/**
 * Handle successful invoice payment (subscription renewal)
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  console.log(`Invoice paid for customer: ${customerId}`);
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : (invoice.subscription as { id?: string } | null)?.id;
  await syncSubscriptionFromStripe(customerId, subscriptionId ?? undefined);
}

/**
 * Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  console.log(`Invoice payment failed for customer: ${customerId}`);
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : (invoice.subscription as { id?: string } | null)?.id;
  await syncSubscriptionFromStripe(customerId, subscriptionId ?? undefined);
}

/**
 * Sync subscription data from Stripe to database
 * Updates both stripe_subscriptions and exhibitor_profiles
 */
async function syncSubscriptionFromStripe(stripeCustomerId: string, knownSubscriptionId?: string) {
  try {
    // Get stripe_customers record
    const { data: stripeCustomer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('id, person_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    if (customerError || !stripeCustomer) {
      console.error('Stripe customer not found in database:', customerError);
      return;
    }

    // When the specific subscription ID is known (e.g. from checkout.session.completed),
    // retrieve it directly — avoids the limit:1 ordering ambiguity that could
    // pick a newer canceled/incomplete sub over an older active one.
    let subscriptions: { data: Stripe.Subscription[] };
    if (knownSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(knownSubscriptionId, {
        expand: ['default_payment_method'],
      });
      subscriptions = { data: [sub] };
    } else {
      subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method'],
      });
    }

    if (subscriptions.data.length === 0) {
      console.log(`No subscriptions found for customer: ${stripeCustomerId}`);

      await persistNoSubscription(supabase, stripeCustomer, stripeCustomerId);
      return;
    }

    const subscription = subscriptions.data[0];
    const priceId = subscription.items.data[0]?.price.id;

    // Map price ID to subscription tier
    const subscriptionTier = mapPriceToTier(priceId);

    // Upsert stripe_subscriptions
    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: stripeCustomer.id,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        cancelled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
      },
      {
        onConflict: 'stripe_subscription_id',
      }
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      return;
    }

    // Update exhibitor_profiles subscription tier
    const isActive = ['active', 'trialing'].includes(subscription.status);
    const { error: profileError } = await supabase
      .from('exhibitor_profiles')
      .update({
        subscription_tier: isActive ? subscriptionTier : 'free',
        subscription_expires_at: isActive
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      })
      .eq('person_id', stripeCustomer.person_id);

    if (profileError) {
      console.error('Error updating exhibitor profile:', profileError);
    }

    console.log(
      `Synced subscription for customer ${stripeCustomerId}: ${subscription.status}, tier: ${subscriptionTier}`
    );
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${stripeCustomerId}:`, error);
    throw error;
  }
}

/**
 * Map Stripe price ID to subscription tier
 */
// INTENT: Two tiers only — Free and Premium. Every configured price ID maps to
// 'premium'. Ids come from the PREMIUM_PRICE_IDS secret (comma-separated;
// sandbox + live + annual coexist) with the original live ids as fallback so a
// missing secret never downgrades a paying subscriber.
const LIVE_PREMIUM_PRICE_IDS = [
  'price_1RHz4VAtHgBcw875bF7McPNd', // Was "Excellent" (clubs) — now Premium
  'price_1RHz3bAtHgBcw875o2gdNaYW', // Was "Advanced" (exhibitors) — now Premium
];
const premiumPriceIds = parsePremiumPriceIds(
  Deno.env.get('PREMIUM_PRICE_IDS'),
  LIVE_PREMIUM_PRICE_IDS
);

function mapPriceToTier(priceId: string | undefined): 'free' | 'premium' {
  return priceIdToTier(priceId, premiumPriceIds);
}
