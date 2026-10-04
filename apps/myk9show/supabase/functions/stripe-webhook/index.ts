import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { extractPaymentIntentId } from '../_shared/entryFromCartItem.ts';
import { accountToRowPatch } from '../_shared/connectAccountMapper.ts';
import { parsePremiumPriceIds, priceIdToTier } from '../_shared/premiumPrices.ts';
import { sessionMatchesCart } from '../_shared/sessionCartGuard.ts';
import {
  INACTIVE_ENTRY_STATUSES,
  reconcileEntryPaymentRequest,
} from '../_shared/entryPaymentReconcile.ts';
import { reconcileEntryPaymentUpdateOutcome } from '../_shared/entryPaymentUpdateReconcile.ts';
import { alertAdmin } from '../_shared/alertAdmin.ts';
import { loadStoredEntryJunior, priceCartItems } from '../_shared/cartItemPricing.ts';
import { recordChargedEntryFee, recordChargedFeesForStamped } from '../_shared/entryFeeRecord.ts';
import {
  calculatePlatformFeeCents,
  decodeStampedPlatformFeeRates,
} from '../_shared/platformFee.ts';
import {
  buildOrderSnapshotFields,
  extractProcessingFeeCents,
  resolveAcceptedEntrySnapshot,
  refundIsClubFunded,
  refundKindFromMetadata,
} from '../_shared/orderSnapshot.ts';
import { loadEntryPaymentLineItemFeesFromStripe } from '../_shared/entryPaymentLineItems.ts';
import {
  resolveWithdrawalPolicy,
  type ShowWithdrawalColumns,
  type ClubWithdrawalColumns,
} from '../_shared/withdrawalPolicy.ts';
import {
  decideCartOverflowRefund,
  type CartOverflowRefundDecision,
} from '../_shared/cartOverflowRefund.ts';
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
import { routePaidSession } from './paidSessionEntry.ts';
import { buildPaymentLinkOrder } from './paymentLinkOrder.ts';
import { renderStripeEntryConfirmationEmail } from './entryConfirmationEmail.ts';
import { persistNoSubscription } from './noSubscription.ts';
import {
  loadPaymentReconciliationEntries as loadPaymentReconciliationEntriesFrom,
  PAYMENT_RECONCILIATION_ENTRY_COLUMNS,
  type PaymentReconciliationEntry,
} from './paymentReconciliationLoader.ts';
import { listAllChargeRefunds } from '../_shared/refundLifecycle.ts';
import {
  claimAbandonedCartRefund,
  ensurePaymentLinkRefundAlert,
  ensureSessionRefundAlerts,
  noLinkRecordObligation,
  REFUNDABLE_ABANDONED_CART_STATUSES,
  RESOLVE_INSTEAD_HTML,
  settlePaymentLinkObligation,
  type RefundQueueDeps,
  type SessionRefundRequest,
  type SettlingRefund,
} from '../_shared/refundRequests.ts';
import { paymentLinkNeedsManualAmountAlert } from '../_shared/refundAlertCopy.ts';
import {
  beginCartFulfillment,
  CART_FULFILLMENT_LINE_COLUMNS,
  workCartLines,
  type CartFulfillmentLine,
  type FinishPaymentResult,
} from './cartFulfillment.ts';
import {
  closeCartThenConfirm,
  replayCartConfirmation,
  type CartConfirmationReplayDeps,
} from './cartConfirmationReplay.ts';
import {
  routeRefundByCurrentState,
  type RefundLedgerContext,
  type SettleDeps,
} from '../_shared/refundSettlement.ts';

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

// Refunds are never automatic (MYK9-876): charges this webhook cannot honor are
// queued in refund_requests for a site admin to approve, each in the same
// transaction as its fulfillment latch (Codex round 13 on #2689).
const refundQueueDeps: RefundQueueDeps = {
  rpc: (fn, args) => supabase.rpc(fn, args),
  alertAdmin,
};

/**
 * The session's refund requests (any kind), read at the entry before any
 * first-time validation (Codex round 15 on #2689). Throws (5xx) when they
 * cannot be read.
 */
async function refundRequestsForSession(sessionId: string): Promise<SessionRefundRequest[]> {
  const { data, error } = await supabase
    .from('refund_requests')
    .select('id, kind, status, amount_cents, reason, stripe_payment_intent_id')
    .eq('stripe_checkout_session_id', sessionId);
  if (error) {
    throw new Error(`Could not read the refund requests for ${sessionId}: ${error.message}`);
  }
  return (data ?? []) as SessionRefundRequest[];
}

/** Whether the session already has a stripe_orders row. Throws (5xx) when it cannot be read. */
async function orderExistsForSession(sessionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('stripe_orders')
    .select('id')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the order for ${sessionId}: ${error.message}`);
  return data !== null;
}

// Approved queued refunds settle on their own attempt row, ONLY from the
// refund's CURRENT state at Stripe (Codex rounds 1-4 on #2689). The event
// names the attempt; its payload status is never written. If Stripe cannot be
// reached, routeRefundByCurrentState throws and this webhook answers 5xx.
const refundSettleDeps: SettleDeps = {
  ...refundQueueDeps,
  retrieveRefund: async id => (await stripe.refunds.retrieve(id)) as SettlingRefund,
  listRefundsPage: async params => {
    const page = await stripe.refunds.list(params);
    return { data: page.data as SettlingRefund[], has_more: page.has_more };
  },
};

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
    case 'refund.updated':
      await handleRefundEvent(event.data.object as Stripe.Refund);
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
 * refund.updated and refund.failed. The branch (book, reverse, or nothing for
 * pending) is chosen from the refund routeRefundByCurrentState hands back:
 * for an approved queued refund that is Stripe's CURRENT copy, after its
 * attempt was settled from it, never the event payload (Codex rounds 4-5 on
 * #2689). Every other refund keeps its event copy: its ledger row's
 * failed/canceled state is terminal, so a stale success cannot resurrect it,
 * and Stripe redelivers a refund.failed until it is acknowledged.
 */
async function handleRefundEvent(eventRefund: Stripe.Refund) {
  await routeRefundByCurrentState(refundSettleDeps, eventRefund, {
    book: bookSucceededRefund,
    terminal: handleTerminalRefund,
  });
}

async function bookSucceededRefund(refund: Stripe.Refund) {
  const paymentIntentId = extractPaymentIntentId(refund.payment_intent);
  if (!paymentIntentId) {
    console.error(`Succeeded refund ${refund.id} has no payment intent — cannot book ledger`);
    return;
  }
  const rows = await recordOrderRefundCents(paymentIntentId, {
    refundId: refund.id,
    amountCents: refund.amount,
    kind: refundKindFromMetadata(refund),
    clubFunded: refundIsClubFunded(refund),
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
 * because the entry stamp and any re-issue are manual. An APPROVED queued refund
 * stamps no entries and its failure is already announced by the settle path
 * ("back in the approval queue"), so for it this alerts only when the reversal
 * itself did not land (Codex round 7 on #2689). Approved refunds with no order
 * by design (abandoned cart, payment link without a record) never reach here:
 * routeRefundByCurrentState stops them.
 *
 * NEVER THROWS for a bookkeeping failure: it must not disturb a committed
 * payment or make Stripe redeliver indefinitely. A failed reversal is reported
 * in the alert and the drift stays visible rather than silently "handled". The
 * one exception is an APPROVED queued refund whose attempt could not be settled
 * from Stripe (Stripe unreachable): routeRefundByCurrentState throws first,
 * before any bookkeeping, so Stripe redelivers (Codex round 4 on #2689).
 */
async function handleTerminalRefund(
  refund: Stripe.Refund,
  terminalState: 'failed' | 'canceled',
  ctx: RefundLedgerContext
) {
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
  // True once the order ledger is known to be right for this refund.
  let ledgerSettled = false;

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
        ledgerSettled = true;
        ledgerNote = `<p>The order ledger was already corrected for this refund (idempotent
           redelivery) — no change made.</p>`;
      } else {
        ledgerSettled = true;
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

  if (ctx.approvedRequest) {
    if (ledgerSettled) {
      console.log(`Approved refund ${refund.id} ${terminalState}: order ledger reversed`);
      return;
    }
    await alertAdmin(
      `Approved refund ${terminalState.toUpperCase()} — order ledger needs a look`,
      `<p>Approved queued refund <code>${refund.id}</code> (request kind
       <code>${ctx.approvedRequest.kind}</code>) is <code>${terminalState}</code>; the
       customer was NOT paid and the request is back in the approval queue.</p>
       ${ledgerNote}`,
      { source: 'stripe-webhook', dedupeKey: `refund-terminal-${refund.id}` }
    );
    return;
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
 * refunds approved from the queue, bulk show-cancellation refunds, and dashboard refunds alike.
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
 * refund the approval writer already booked is never demoted to a post-hoc
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
    /** Club-funded (MYK9-997): docked from the club's payout, not a platform loss. */
    clubFunded: boolean;
  }
): Promise<RecordedRefundRow[] | null> {
  const amountCents = Math.max(0, Math.round(refund.amountCents ?? 0));

  const { data, error } = await supabase.rpc('record_order_refund_cents', {
    p_payment_intent_id: paymentIntentId,
    p_refund_id: refund.refundId,
    p_amount_cents: amountCents,
    p_kind: refund.kind,
    p_club_funded: refund.clubFunded,
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
    for (const listed of refunds) {
      // Settles an approved queued refund's attempt (covering a missed
      // refund.updated) and picks the branch from Stripe's current copy of it,
      // never from the listed copy (Codex round 5 on #2689).
      const booked: { rows: RecordedRefundRow[] | null } = { rows: null };
      const action = await routeRefundByCurrentState(refundSettleDeps, listed, {
        book: async refund => {
          booked.rows = await recordOrderRefundCents(intentIdForLedger, {
            refundId: refund.id,
            amountCents: refund.amount ?? 0,
            // Read the kind off the Stripe object rather than assuming post_hoc.
            // An approved make-whole refund stamps MAKE_WHOLE_METADATA_KEY at
            // creation, so this sweep attributes it correctly even when it wins
            // the race against that writer. Assuming 'post_hoc' here booked
            // make-whole money as a permanent platform loss (Codex round-7 finding).
            kind: refundKindFromMetadata(refund),
            // MYK9-997: a show-cancellation or secretary refund is docked
            // from the club's payout, never a platform loss.
            clubFunded: refundIsClubFunded(refund),
          });
        },
        terminal: handleTerminalRefund,
      });
      if (action !== 'book') continue;
      sawSucceededRefund = true;
      if (booked.rows === null) {
        recordedRows = null;
        break;
      }
      recordedRows = booked.rows;
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

  // An existing refund request or order means a redelivery (paidSessionEntry.ts):
  // no first-time validation runs; only the alert of an OPEN request is ensured.
  await routePaidSession<SessionRefundRequest>(
    { checkoutType, mode: session.mode ?? null },
    {
      findRequests: () => refundRequestsForSession(session.id),
      orderExists: () => orderExistsForSession(session.id),
      refundRequested: async requests => {
        console.log(
          `Session ${session.id} already has a refund request — redelivery, nothing to fulfill`
        );
        await ensureSessionRefundAlerts(refundQueueDeps, session.id, requests);
        if (checkoutType === 'entry') await sendCartConfirmationOnce(session);
      },
      alreadyFulfilled: async type => {
        console.log(`Session ${session.id} already has an order — redelivery, nothing to fulfill`);
        if (type === 'entry_payment_request') {
          await ensurePaymentLinkRefundAlert(refundQueueDeps, session.id);
        }
        if (type === 'entry') await sendCartConfirmationOnce(session);
      },
      fulfillCart: () => handleEntryPaymentCompleted(session),
      fulfillPaymentLink: () => handleEntryPaymentRequestCompleted(session),
      subscription: () => handleSubscriptionCheckoutCompleted(session),
      unexpectedPayment: () =>
        // MP-24: nothing client-facing can create a bare mode:'payment' session
        // anymore (stripe-checkout removed that mode) and the old handler here
        // recorded the UNVERIFIED payload amount_total into stripe_orders. If one
        // ever arrives it is unexpected — log loudly instead of recording it.
        console.error(
          `Unexpected untyped one-time payment session ${session.id} — no handler records it; investigate its origin`
        ),
    }
  );
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

  console.log(`Processing entry payment for cart: ${cartId}`);

  // MYK9-964: a run this session already began is REPLAYED from its snapshot;
  // none of the first-time validation below runs again.
  const run = await readCartFulfillmentRun(session.id);
  if (run) {
    await resumeCartFulfillment(session, run);
    return;
  }

  // Get cart with items
  const { data: cart, error: cartError } = await supabase
    .from('entry_carts')
    .select(
      `
      *,
      exhibitor:exhibitor_profiles(id, person_id),
      items:entry_cart_items(
        id,
        entry_id,
        dog_id,
        class_id,
        handler_id,
        entry_fee_cents,
        junior_fee_declared,
        jump_height,
        special_requests
      )
    `
    )
    .eq('id', cartId)
    .single();

  if (cartError || !cart) {
    // A PAID session whose cart row is gone (owner DELETE is allowed by RLS,
    // and Checkout tabs stay payable until they expire): charge taken, zero
    // entries, no Stripe retry — same severity as every other paid-but-broken
    // state (round-13 review).
    console.error('Cart not found:', cartError);
    await alertAdmin(
      'Paid checkout has no cart — entries NOT created',
      `<p>Checkout session <code>${session.id}</code> was PAID, but cart
       <code>${cartId}</code> no longer exists${cartError ? ' (read error below)' : ''} —
       no entries were created and Stripe will not retry.</p>
       ${cartError ? `<pre>${cartError.message}</pre>` : ''}
       <p>Recovery: verify the payment in the Stripe dashboard and refund it
       (Payments → search the session's payment intent → Refund), or recreate the
       entries manually if the exhibitor confirms what they ordered.</p>`,
      { source: 'stripe-webhook', dedupeKey: `paid-checkout-no-cart-${session.id}` }
    );
    return;
  }

  // MYK9-874: the exhibitor abandoned the cart while this Checkout page stayed
  // payable, then paid it. The fulfillment claim below needs 'active', so it
  // can never win; hold the cart for an approved refund instead (and return
  // 2xx on every re-delivery rather than failing the claim forever).
  if (
    REFUNDABLE_ABANDONED_CART_STATUSES.has(cart.status) &&
    cart.stripe_checkout_session_id === session.id
  ) {
    const abandonedSession = await stripe.checkout.sessions.retrieve(session.id);
    const abandonedGate = decideFreshSessionGate(abandonedSession);
    if (abandonedGate.action === 'skip') {
      console.log(`Checkout session ${session.id}: ${abandonedGate.reason} — waiting`);
      return;
    }
    const outcome = await claimAbandonedCartRefund(refundQueueDeps, {
      cartId,
      sessionId: session.id,
      paymentIntentId: extractPaymentIntentId(session.payment_intent),
      // The exhibitor got nothing: the request is the FULL charge, service fee
      // included (owner rule 2026-10-04, MYK9-997).
      chargedCents: abandonedGate.amountTotalCents,
    });
    if (outcome !== 'not_refundable') return;
  }

  // Refuse a paid session the cart no longer points at: the exhibitor started
  // checkout, abandoned the Stripe tab, changed the cart, then paid the OLD
  // page — entries from the CURRENT cart would not match the stale charge
  // (Codex round-3 P1). Cart mutations null stripe_checkout_session_id, which
  // is what makes this id equality decisive. The cart stays active so a fresh
  // checkout works; the operator refunds the stale charge.
  const staleGuard = sessionMatchesCart({
    sessionId: session.id,
    sessionAmountTotal: session.amount_total ?? null,
    cartSessionId: cart.stripe_checkout_session_id ?? null,
    cartTotalCents: cart.total_cents ?? null,
    cartItemCount: cart.items?.length ?? 0,
    cartExpiresAt: cart.expires_at ?? null,
    nowIso: new Date().toISOString(),
    cartSubtotalCents: cart.subtotal_cents ?? null,
    itemFeesSumCents: (cart.items ?? []).reduce(
      (sum: number, i: { entry_fee_cents: number }) => sum + (i.entry_fee_cents ?? 0),
      0
    ),
  });
  if (!staleGuard.ok) {
    const stalePiId = extractPaymentIntentId(session.payment_intent);
    console.error(`CRITICAL: stale-session payment for cart ${cartId} — ${staleGuard.reason}`);
    await alertAdmin(
      'Stale checkout payment needs a refund',
      `<p>Checkout session <code>${session.id}</code> was PAID, but cart
       <code>${cartId}</code> changed after that checkout started
       (${staleGuard.reason}).</p>
       <p>No entries were created for this charge. Refund payment intent
       <code>${stalePiId ?? 'unknown — look up the session in Stripe'}</code> from the
       Stripe dashboard. The exhibitor's cart is untouched and they can check out
       again normally.</p>`,
      { source: 'stripe-webhook', dedupeKey: `stale-checkout-refund-${session.id}` }
    );
    return;
  }

  // Round-15 P1: every number the guard above compared is OWNER-WRITABLE
  // (cart totals, item fees — migration 009's update policies have no column
  // restrictions), and the pinned webhook payload omits amount_total. A user
  // could mutate item fees AND the stored subtotal in lockstep after starting
  // checkout, pay the original Stripe amount, and get inflated paid entries
  // (which the payout cron would then pay the club for). Verify against two
  // sources the payer cannot write: a FRESH session retrieve from Stripe's
  // API (modern SDK version — amount_total always present) and authoritative
  // per-item fees recomputed from show/class pricing. Runs BEFORE the claim
  // so a rejected cart stays active.
  const freshSession = await stripe.checkout.sessions.retrieve(session.id);
  const freshGate = decideFreshSessionGate(freshSession);
  if (freshGate.action === 'skip') {
    // Delayed-notification methods (e.g. some bank debits) fire
    // checkout.session.completed before money actually lands; Stripe redrives
    // this exact handler via checkout.session.async_payment_succeeded once it
    // does (both events route to handleCheckoutCompleted — see the event
    // switch above). ACK the webhook without processing.
    console.log(`Checkout session ${session.id}: ${freshGate.reason} — waiting for a paid event`);
    return;
  }
  const freshTotalCents = freshGate.amountTotalCents;

  const { data: showFees, error: showFeesError } = await supabase
    .from('shows')
    .select('pre_entry_fee, day_of_show_fee, junior_handler_fee, organization, start_date')
    .eq('id', cart.show_id)
    .single();

  const classIds = [...new Set(cart.items.map((i: { class_id: string }) => i.class_id))];
  // Filter to only classes whose trial belongs to this show (P1b class-show
  // membership check). A class from a different show would pass the fee
  // verification only by coincidence of equal fees, but would produce an entry
  // with a trial_id from the wrong show.
  const { data: classRows, error: classesError } = await supabase
    .from('classes')
    .select('id, trial_id, entry_fee, trial:trials!inner(show_id)')
    .in('id', classIds)
    .eq('trial.show_id', cart.show_id);

  if (freshTotalCents == null || showFeesError || !showFees || classesError || !classRows) {
    console.error(
      `CRITICAL: cannot verify paid amount for cart ${cartId} — ` +
        `freshTotal=${freshTotalCents}, showFeesError=${showFeesError?.message}, classesError=${classesError?.message}`
    );
    await alertAdmin(
      'Paid checkout could not be verified — entries NOT created',
      `<p>Checkout session <code>${session.id}</code> was PAID, but the authoritative
       fee data needed to verify the amount could not be loaded, so no entries were
       created and Stripe will not retry. The cart is untouched.</p>
       <p>Recovery: check the function logs; if this was a transient database error,
       re-send the event from the Stripe dashboard (Developers → Events → Resend).</p>`,
      { source: 'stripe-webhook', dedupeKey: `checkout-verify-failed-${session.id}` }
    );
    return;
  }

  // Fail closed if any cart item's class was filtered out (cross-show class_id).
  // A missing class produces trial_id: null entries and distorts payout math.
  // !classRows above catches null; this catches a partial result (truthy array
  // with fewer rows than classIds).
  const classRowIds = new Set(classRows.map((c: { id: string }) => c.id));
  const missingClassIds = classIds.filter((id: string) => !classRowIds.has(id));
  if (missingClassIds.length > 0) {
    console.error(
      `CRITICAL: ${missingClassIds.length} class(es) not found in show ${cart.show_id} ` +
        `for cart ${cartId} — possible cross-show class_id: ${missingClassIds.join(', ')}`
    );
    await alertAdmin(
      'Cart classes do not belong to show — entries NOT created',
      `<p>Checkout session <code>${session.id}</code> was PAID, but ${missingClassIds.length}
       class(es) in cart <code>${cartId}</code> did not pass the show-membership filter.
       This may indicate a cross-show class_id was injected into the cart.</p>
       <p>Missing class IDs: <code>${missingClassIds.join(', ')}</code></p>
       <p>No entries were created. Refund payment intent from the Stripe dashboard and
       investigate the cart before manually re-entering.</p>`,
      { source: 'stripe-webhook', dedupeKey: `cart-classes-mismatch-${session.id}` }
    );
    return;
  }

  const feeByClass = new Map<string, number | string | null>(
    classRows.map((c: { id: string; entry_fee: number | string | null }) => [c.id, c.entry_fee])
  );
  const nowIso = new Date().toISOString();
  // MYK9-879: priced per LINE, not per class, because the junior-handler
  // declaration is per line. A Finish Payment line is priced from its entry's
  // stored record, a new line from the exhibitor's declaration; no date of birth
  // or dog ownership is read. The same function stripe-checkout charged from.
  const pricingItems = (
    cart.items as {
      id: string;
      dog_id: string;
      class_id: string;
      entry_id: string | null;
      junior_fee_declared: boolean | null;
    }[]
  ).map(i => ({ ...i, class_entry_fee: feeByClass.get(i.class_id) ?? null }));
  const { stored: storedJunior, error: storedJuniorError } = await loadStoredEntryJunior(
    supabase,
    pricingItems
  );
  if (storedJuniorError) {
    console.error(
      `CRITICAL: cannot read stored junior fees for cart ${cartId}: ${storedJuniorError.message}`
    );
    await alertAdmin(
      'Paid checkout could not be verified — entries NOT created',
      `<p>Checkout session <code>${session.id}</code> was PAID, but the stored entry fees
       needed to verify the amount could not be read, so no entries were created and
       Stripe will not retry. The cart is untouched.</p>
       <pre>${storedJuniorError.message}</pre>
       <p>Recovery: if this was a transient database error, re-send the event from the
       Stripe dashboard (Developers → Events → Resend).</p>`,
      { source: 'stripe-webhook', dedupeKey: `checkout-verify-failed-${session.id}` }
    );
    return;
  }
  const authoritativeByItem = priceCartItems(showFees, pricingItems, storedJunior, nowIso);
  const authoritativeSubtotal = pricingItems.reduce(
    (sum, i) => sum + (authoritativeByItem.get(i.id) ?? 0),
    0
  );
  // Validate the platform fee against the rate STAMPED on the session at
  // checkout, not a live read — stripe-checkout now charges from the
  // platform_settings row, and a site admin changing that rate between charge
  // and webhook must not make this reject a correctly-charged session (which
  // would leave the exhibitor paid with no entries). Fall back to the env var
  // for sessions created before the stamp existed.
  // The flat component and the floor read back as 0 when the stamp is ABSENT
  // (decodeStampedPlatformFeeRates), never from env or the live row: a session
  // created before those columns existed was charged percentage-only, and
  // re-validating it against a live non-zero flat would reject a correctly
  // charged payment — exhibitor paid, no entries.
  const stampedFeeRates = decodeStampedPlatformFeeRates(
    freshSession.metadata,
    Deno.env.get('PLATFORM_FEE_PERCENT')
  );
  const authoritativeTotal =
    authoritativeSubtotal + calculatePlatformFeeCents(authoritativeSubtotal, stampedFeeRates);
  if (authoritativeTotal !== freshTotalCents) {
    const piId = extractPaymentIntentId(session.payment_intent);
    console.error(
      `CRITICAL: paid total ${freshTotalCents}¢ does not match authoritative pricing ` +
        `${authoritativeTotal}¢ for cart ${cartId} — entries NOT created`
    );
    await alertAdmin(
      'Paid amount disagrees with authoritative pricing — verify, then refund',
      `<p>Checkout session <code>${session.id}</code> charged ${(freshTotalCents / 100).toFixed(2)}
       USD, but the show/class pricing says this cart is worth
       ${(authoritativeTotal / 100).toFixed(2)} USD. No entries were created; the cart
       is untouched.</p>
       <p>Benign cause: the show's fees changed (or the day-of-show fee tier started)
       between checkout and payment. Malicious cause: cart values were tampered after
       checkout started. Either way the charge doesn't match current pricing — refund
       payment intent <code>${piId ?? 'unknown'}</code> from the Stripe dashboard and
       ask the exhibitor to check out again.</p>`,
      { source: 'stripe-webhook', dedupeKey: `paid-amount-mismatch-${session.id}` }
    );
    return;
  }

  // MYK9-964: hold the cart and snapshot its lines (begin_cart_fulfillment),
  // record every line's outcome, then close the latch LAST with the order and
  // the cart-overflow refund request (cartFulfillment.ts). Expiry is already
  // enforced in pure code by sessionMatchesCart above, on the same cart read.
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  if (!paymentIntentId) {
    console.error(`CRITICAL: paid session ${session.id} for cart ${cartId} has no payment intent`);
    await alertAdmin(
      'Paid checkout has no payment intent — entries NOT created',
      `<p>Checkout session <code>${session.id}</code> was PAID for cart <code>${cartId}</code>,
       but Stripe reported no payment intent, so nothing could be recorded against it. No
       entries were created and the cart is untouched.</p>
       <p>Look the session up in the Stripe dashboard, then re-send the event (Developers →
       Events → Resend) once its payment intent is visible.</p>`,
      { source: 'stripe-webhook', dedupeKey: `paid-checkout-no-intent-${session.id}` }
    );
    return;
  }

  const lineAmounts: Record<string, number> = Object.fromEntries(
    (cart.items as { id: string; entry_fee_cents: number }[]).map(item => [
      item.id,
      authoritativeByItem.get(item.id) ?? item.entry_fee_cents,
    ])
  );
  const begun = await beginCartFulfillment(refundQueueDeps, {
    cartId,
    sessionId: session.id,
    paymentIntentId,
    lineAmounts,
  });
  if (begun.outcome === 'completed') {
    // Only a racing first delivery lands here: a redelivery after the latch is
    // replayed at the entry (handleCheckoutCompleted).
    console.log(`Cart ${cartId} already fulfilled for session ${session.id} — skipping`);
    return;
  }
  if (begun.outcome === 'not_claimable') {
    await handleUnclaimableCart({
      session,
      cartId,
      freshTotalCents,
    });
    return;
  }

  await fulfillCartRun({
    session,
    cartId,
    showId: cart.show_id,
    exhibitorPersonId: cart.exhibitor?.person_id ?? null,
    paymentIntentId,
    freshTotalCents,
    stampedFeeRates,
  });
}

/**
 * MYK9-964: THE paid-cart confirmation sender. Called on every path where the
 * session's order is known to exist (after the latch call, however it went,
 * and on both replay-first branches). It sends only while none of the order's
 * entries is stamped confirmed; the stamp is the only gate, never which call
 * closed the latch. Throws (5xx) when a read fails, so Stripe redelivers.
 */
async function sendCartConfirmationOnce(session: Stripe.Checkout.Session) {
  await replayCartConfirmation(cartConfirmationDeps(session), session.id);
}

/** The Supabase reads and the sender behind the stamp-aware confirmation. */
function cartConfirmationDeps(session: Stripe.Checkout.Session): CartConfirmationReplayDeps {
  return {
    readOrder: async sessionId => {
      const { data: order, error } = await supabase
        .from('stripe_orders')
        .select('entry_ids, show_id, metadata')
        .eq('stripe_checkout_session_id', sessionId)
        .eq('order_type', 'entry')
        .maybeSingle();
      if (error) throw new Error(`Could not read the order of ${sessionId}: ${error.message}`);
      if (!order?.show_id) return null;
      const metadata = (order.metadata ?? {}) as Record<string, unknown>;
      const subtotalCents = Number(metadata.paid_entry_subtotal_cents ?? 0);
      return {
        entryIds: (order.entry_ids as string[] | null) ?? [],
        showId: order.show_id as string,
        exhibitorPersonId: await readSessionExhibitorPersonId(
          sessionId,
          typeof metadata.cart_id === 'string' ? metadata.cart_id : null
        ),
        subtotalCents,
        totalCents: Number(metadata.paid_amount_cents ?? subtotalCents),
      };
    },
    countConfirmed: async entryIds => {
      const { count, error } = await supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .in('id', entryIds)
        .not('confirmation_email_sent_at', 'is', null);
      if (error) throw new Error(`Could not read confirmation stamps: ${error.message}`);
      return count ?? 0;
    },
    send: order =>
      sendEntryConfirmationEmail(
        { show_id: order.showId, exhibitor: { person_id: order.exhibitorPersonId ?? '' } },
        order.entryIds,
        session,
        {
          subtotalCents: order.subtotalCents,
          platformFeeCents: Math.max(0, order.totalCents - order.subtotalCents),
          totalCents: order.totalCents,
        }
      ),
  };
}

/** The paying exhibitor's person id: from the run, else the order's cart. Throws when unreadable. */
async function readSessionExhibitorPersonId(
  sessionId: string,
  cartId: string | null
): Promise<string | null> {
  const run = await readCartFulfillmentRun(sessionId);
  let exhibitorId = run?.exhibitor_id ?? null;
  if (!exhibitorId && cartId) {
    const { data: cart, error } = await supabase
      .from('entry_carts')
      .select('exhibitor_id')
      .eq('id', cartId)
      .maybeSingle();
    if (error) throw new Error(`Could not read cart ${cartId}: ${error.message}`);
    exhibitorId = (cart?.exhibitor_id as string | undefined) ?? null;
  }
  if (!exhibitorId) return null;
  const { data: exhibitor, error } = await supabase
    .from('exhibitor_profiles')
    .select('person_id')
    .eq('id', exhibitorId)
    .maybeSingle();
  if (error) throw new Error(`Could not read exhibitor ${exhibitorId}: ${error.message}`);
  return (exhibitor?.person_id as string | undefined) ?? null;
}

/** The session's fulfillment run, or null. Throws (5xx) when it cannot be read. */
async function readCartFulfillmentRun(sessionId: string) {
  const { data, error } = await supabase
    .from('cart_fulfillments')
    .select('stripe_checkout_session_id, cart_id, show_id, exhibitor_id, completed_at')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not read the fulfillment run for ${sessionId}: ${error.message}`);
  }
  return data as {
    cart_id: string | null;
    show_id: string;
    exhibitor_id: string;
    completed_at: string | null;
  } | null;
}

/**
 * MYK9-964: a redelivery of a session whose run began (and did not latch).
 * Every first-time check passed when the run began, and the snapshot is the
 * truth now: the cart, which its owner may since have edited or deleted, is
 * not read. Stripe's own facts (amount, stamped fee rates) are read again.
 */
async function resumeCartFulfillment(
  session: Stripe.Checkout.Session,
  run: NonNullable<Awaited<ReturnType<typeof readCartFulfillmentRun>>>
) {
  if (run.completed_at) {
    console.log(`Session ${session.id}: cart fulfillment already latched — nothing to replay`);
    return;
  }
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  const freshSession = await stripe.checkout.sessions.retrieve(session.id);
  const gate = decideFreshSessionGate(freshSession);
  if (gate.action === 'skip' || gate.amountTotalCents == null || !paymentIntentId) {
    throw new Error(`Session ${session.id}: cannot resume its cart fulfillment yet`);
  }
  const { data: exhibitor, error } = await supabase
    .from('exhibitor_profiles')
    .select('person_id')
    .eq('id', run.exhibitor_id)
    .maybeSingle();
  if (error) throw new Error(`Could not read the exhibitor of ${session.id}: ${error.message}`);

  console.log(`Session ${session.id}: replaying its cart fulfillment run`);
  await fulfillCartRun({
    session,
    cartId: run.cart_id,
    showId: run.show_id,
    exhibitorPersonId: (exhibitor?.person_id as string | undefined) ?? null,
    paymentIntentId,
    freshTotalCents: gate.amountTotalCents,
    stampedFeeRates: decodeStampedPlatformFeeRates(
      freshSession.metadata,
      Deno.env.get('PLATFORM_FEE_PERCENT')
    ),
  });
}

/**
 * The cart could not be held for this session (begin_cart_fulfillment said
 * not_claimable): a racing abandonment (MYK9-874), a second paid session on a
 * cart already fulfilled (a duplicate charge), or a concurrent first delivery.
 */
async function handleUnclaimableCart(input: {
  session: Stripe.Checkout.Session;
  cartId: string;
  freshTotalCents: number;
}) {
  const { session, cartId } = input;
  const dupIntentId = extractPaymentIntentId(session.payment_intent);
  if (await orderExistsForSession(session.id)) {
    console.log(`Cart ${cartId} already processed for session ${session.id} — skipping`);
    return;
  }
  // MYK9-874: the cart was abandoned after the read above. The RPC claims it
  // for refund only if it is abandoned/expired and still on this session.
  if (dupIntentId) {
    const abandonedOutcome = await claimAbandonedCartRefund(refundQueueDeps, {
      cartId,
      sessionId: session.id,
      paymentIntentId: dupIntentId,
      // The full charge, service fee included (MYK9-997).
      chargedCents: input.freshTotalCents,
    });
    if (abandonedOutcome !== 'not_refundable') return;

    const { data: intentEntries } = await supabase
      .from('entries')
      .select('id')
      .eq('stripe_payment_intent_id', dupIntentId)
      .limit(1);
    if (!intentEntries || intentEntries.length === 0) {
      console.error(
        `CRITICAL: paid session ${session.id} (${dupIntentId}) hit already-claimed cart ${cartId} — duplicate charge, needs manual refund`
      );
      await alertAdmin(
        'Possible duplicate entry payment — verify, then refund',
        `<p>Checkout session <code>${session.id}</code> was PAID for cart
         <code>${cartId}</code>, but that cart was already claimed and this payment
         intent owns no entries — most likely the exhibitor was charged twice.</p>
         <p>VERIFY FIRST (a racing duplicate webhook delivery can trip this while
         the winner's entries are still inserting): in the Stripe dashboard confirm
         TWO separate successful payments exist for this cart, and in the entries
         page confirm the cart's entries exist once. Then refund payment intent
         <code>${dupIntentId}</code> (Payments → search the id → Refund). No entries
         or orders were created for it, so the dashboard refund is the complete
         fix.</p>`,
        { source: 'stripe-webhook', dedupeKey: `duplicate-entry-payment-${session.id}` }
      );
      return;
    }
  }
  console.log(`Cart ${cartId} already processed (duplicate event delivery) — skipping`);
}

/**
 * Work the session's snapshotted lines (recording each outcome), then close
 * the latch with the order and any cart-overflow refund request, and send the
 * confirmation from the delivery that closed it. Throws (5xx) on any write it
 * cannot confirm; the redelivery replays the recorded outcomes.
 */
async function fulfillCartRun(ctx: {
  session: Stripe.Checkout.Session;
  cartId: string | null;
  showId: string;
  exhibitorPersonId: string | null;
  paymentIntentId: string;
  freshTotalCents: number;
  stampedFeeRates: ReturnType<typeof decodeStampedPlatformFeeRates>;
}) {
  const { session, showId, paymentIntentId, freshTotalCents, stampedFeeRates } = ctx;
  const cartLabel = ctx.cartId ?? `(deleted cart of ${session.id})`;
  const lines = await workCartLines(
    {
      ...refundQueueDeps,
      readLines: readCartFulfillmentLines,
      payFinishPaymentLine: line =>
        payFinishPaymentLine(line, { showId, paymentIntentId, sessionId: session.id }),
    },
    session.id
  );
  const { entryIds, paidLineIds, noServiceLineIds, lineAmountsById } = lines;

  await resolvePaidWaitlistOffers(paidLineIds, session.id);

  // Freeze the withdrawal policy these entries were paid under (best-effort).
  await stampWithdrawalSnapshot([...new Set([...entryIds, ...paidLineIds])], showId);

  const overflowRefundDecision = decideCartOverflowRefund({
    paymentIntentId,
    sessionAmountTotalCents: freshTotalCents,
    paidLineIds,
    noServiceLineIds,
    lineAmountsById,
    // The STAMPED rates, so the flat per-checkout component and the floor stay
    // with the served lines instead of being refunded away (MYK9-197 B1).
    platformFeeRates: stampedFeeRates,
  });
  const paidEntrySubtotalCents = paidLineIds.reduce(
    (sum, id) => sum + (lineAmountsById.get(id) ?? 0),
    0
  );
  const paidOrderAmountCents = overflowRefundDecision.paidAmountCents ?? paidEntrySubtotalCents;

  if (noServiceLineIds.length > 0) {
    console.error(
      `Cart ${cartLabel} paid (${paymentIntentId}) with ${entryIds.length} paid entries, ` +
        `${lines.waitlisted.length} waitlisted, ${lines.denied.length} denied, ` +
        `${lines.failed.length} failed`
    );
  }

  const { data: stripeCustomer } = ctx.exhibitorPersonId
    ? await supabase
        .from('stripe_customers')
        .select('id')
        .eq('person_id', ctx.exhibitorPersonId)
        .eq('livemode', stripeLivemode)
        .maybeSingle()
    : { data: null };

  // Immutable financial snapshot (MYK9-54): the FULL service fee charged on
  // every line, served or not, at the stamped rate — the platform keeps it
  // (MYK9-966) — plus Stripe's actual processing fee. A missing processing fee
  // stays NULL (pending), never an estimated zero.
  const snapshotProcessingFeeCents = await fetchProcessingFeeCents(paymentIntentId);
  const snapshotPlatformFeeCents = calculatePlatformFeeCents(
    [...paidLineIds, ...noServiceLineIds].reduce(
      (sum, id) => sum + (lineAmountsById.get(id) ?? 0),
      0
    ),
    stampedFeeRates
  );

  // The stripe_orders row, inserted by complete_cart_fulfillment in the SAME
  // transaction as the latch and the refund request.
  const order = {
    customer_id: stripeCustomer?.id ?? null,
    stripe_payment_intent_id: paymentIntentId,
    stripe_checkout_session_id: session.id,
    // COLLECTION INVARIANT (see _shared/orderSnapshot.ts): amount_cents is the
    // GROSS amount the customer was actually charged — the full session total,
    // NOT pre-netted by the cart-overflow refund. The overflow share is queued
    // for approval (MYK9-964) and, once refunded, booked make_whole on this
    // order, so collected = amount_cents − refunds subtracts it EXACTLY ONCE.
    // Denied/waitlisted/no-service cart lines remain explicit metadata and never
    // masquerade as paid entry_ids; the paid-only service amount lives in
    // metadata.paid_amount_cents and in entry_subtotal_cents below.
    amount_cents: freshTotalCents,
    ...buildOrderSnapshotFields({
      entrySubtotalCents: paidEntrySubtotalCents,
      platformFeeCents: snapshotPlatformFeeCents,
      platformFeeRate: stampedFeeRates.percent,
      stripeProcessingFeeCents: snapshotProcessingFeeCents,
    }),
    currency: session.currency || 'usd',
    status: 'succeeded',
    order_type: 'entry',
    metadata: {
      cart_id: ctx.cartId,
      entry_count: entryIds.length,
      paid_entry_count: entryIds.length,
      collected_amount_cents: freshTotalCents,
      paid_amount_cents: paidOrderAmountCents,
      paid_entry_subtotal_cents: paidEntrySubtotalCents,
      overflow_refund: serializeCartOverflowRefundDecision(overflowRefundDecision),
      waitlisted_cart_item_ids: lines.waitlisted.map(line => line.cartItemId),
      waitlist_entry_ids: lines.waitlisted
        .map(line => line.waitlistEntryId)
        .filter((id): id is string => Boolean(id)),
      denied_cart_item_ids: lines.denied.map(line => line.cartItemId),
      failed_cart_item_ids: lines.failed.map(line => line.cartItemId),
    },
    show_id: showId,
    entry_ids: entryIds,
    paid_at: new Date().toISOString(),
  };

  // Close the latch, then confirm. The order exists afterwards whichever call
  // closed the latch (this one, its own retry after a lost response, or a
  // concurrent delivery), so the confirmation goes through the ONE
  // stamp-aware sender, as on both replay-first branches; the stamp alone
  // decides whether an email is sent (MYK9-964). Its totals come from the
  // order row, never the owner-writable cart.
  await closeCartThenConfirm(
    refundQueueDeps,
    {
      sessionId: session.id,
      cartId: cartLabel,
      paymentIntentId,
      order,
      decision: overflowRefundDecision,
      lines,
    },
    cartConfirmationDeps(session)
  );

  if (snapshotProcessingFeeCents === null) {
    await warnMissingProcessingFee(paymentIntentId, `cart ${cartLabel}`);
  }

  console.log(`Entry payment completed for cart ${cartLabel}: ${entryIds.length} entries`);
}

/** The session's snapshotted cart lines, in line order. Throws (5xx) when unreadable. */
async function readCartFulfillmentLines(sessionId: string): Promise<CartFulfillmentLine[]> {
  const { data, error } = await supabase
    .from('cart_fulfillment_lines')
    .select(CART_FULFILLMENT_LINE_COLUMNS)
    .eq('stripe_checkout_session_id', sessionId)
    .order('line_no');
  if (error) throw new Error(`Could not read the cart lines of ${sessionId}: ${error.message}`);
  return (data ?? []) as CartFulfillmentLine[];
}

/**
 * Pay a Finish Payment line's existing entry in place (its row already
 * exists; create_online_paid_entry would collide with
 * entries_dog_class_unique_idx). An entry this checkout's intent already paid
 * is RECOGNIZED, not paid again: the run is being replayed and its follow-ups
 * (fee record, destination, links) are idempotent. A line that cannot be
 * honored is 'failed' (recorded, and refunded with the overflow); a read or
 * write that cannot be confirmed THROWS, so the redelivery decides it again.
 */
async function payFinishPaymentLine(
  line: CartFulfillmentLine,
  ctx: { showId: string; paymentIntentId: string; sessionId: string }
): Promise<FinishPaymentResult> {
  const failed = (errorMessage: string): FinishPaymentResult => {
    console.error(`Recovered cart line ${line.cart_item_id} not paid:`, errorMessage);
    return { outcome: 'failed', errorMessage };
  };
  const { data: existingEntry, error: existingEntryError } = await supabase
    .from('entries')
    .select(
      'id, dog_id, class_id, show_id, payment_status, entry_status, entry_fee, moved_from_entry_id, stripe_payment_intent_id'
    )
    .eq('id', line.existing_entry_id)
    .eq('dog_id', line.dog_id)
    .eq('class_id', line.class_id)
    .eq('show_id', ctx.showId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existingEntryError) {
    throw new Error(
      `Could not read recovered entry for cart line ${line.cart_item_id}: ${existingEntryError.message}`
    );
  }
  if (!existingEntry) return failed('Recovered entry was not found in this show');

  const loadedMoneyRoot = await loadPaymentReconciliationEntries([existingEntry.id]);
  if (loadedMoneyRoot.error) {
    throw new Error(
      `Could not reconcile recovered entry ${existingEntry.id}: ${loadedMoneyRoot.error.message}`
    );
  }
  const moneyRootId = loadedMoneyRoot.reconciliationEntryIds[0] ?? existingEntry.id;
  const moneyRoot =
    loadedMoneyRoot.entries.find(entry => entry.id === moneyRootId) ?? existingEntry;
  const paidByThisCheckout =
    moneyRoot.payment_status === 'paid' &&
    moneyRoot.stripe_payment_intent_id === ctx.paymentIntentId;

  if (!paidByThisCheckout) {
    if (existingEntry.payment_status !== 'pending') {
      return failed('Recovered entry is no longer unpaid');
    }
    if (INACTIVE_ENTRY_STATUSES.has(existingEntry.entry_status ?? '')) {
      return failed('Recovered entry is no longer active');
    }
    if (loadedMoneyRoot.blockedEntryIds.includes(existingEntry.id)) {
      return failed('Recovered entry money root could not be reconciled safely');
    }
    if (moneyRoot.payment_status !== 'pending') {
      return failed('Recovered entry money root is no longer unpaid');
    }

    const { data: updatedEntryRows, error: updateEntryError } = await supabase
      .from('entries')
      .update({
        payment_status: 'paid',
        payment_method: 'online',
        stripe_payment_intent_id: ctx.paymentIntentId,
        // entry_fee is NOT written here: a positive fee was frozen at creation and
        // this line was charged exactly that. A NULL/0 fee is recorded below
        // (recordChargedEntryFee), or the paid entry could never be refunded.
        ...(moneyRoot.id === existingEntry.id && existingEntry.entry_status === 'pending-payment'
          ? { entry_status: 'confirmed' }
          : {}),
      })
      .eq('id', moneyRoot.id)
      .eq('payment_status', 'pending')
      .not('entry_status', 'in', `(${[...INACTIVE_ENTRY_STATUSES].join(',')})`)
      .select('id');
    if (updateEntryError || !updatedEntryRows || updatedEntryRows.length === 0) {
      // Unconfirmed (or the row changed under us): the redelivery re-reads it,
      // and either recognizes it paid by this intent or records why not.
      throw new Error(
        `Recovered entry ${moneyRoot.id} payment update unconfirmed: ${
          updateEntryError?.message ?? 'no row updated'
        }`
      );
    }
  }

  // The ONE entry_fee write rule (_shared/entryFeeRecord): record the charged
  // amount only where the stored fee is NULL or 0; never overwrite a positive fee.
  const feeRecord = await recordChargedEntryFee(supabase, moneyRoot.id, line.line_amount_cents);
  if (feeRecord.error) {
    console.error(`Could not record the charged fee on entry ${moneyRoot.id}:`, feeRecord.error);
    await alertAdmin(
      'Paid entry fee could not be recorded',
      `<p>Entry <code>${moneyRoot.id}</code> was paid ${(line.line_amount_cents / 100).toFixed(2)} USD
       (session <code>${ctx.sessionId}</code>) but its entry_fee could not be recorded:</p>
       <pre>${feeRecord.error.message}</pre>
       <p>Until it is set, the entry's refundable amount reads as zero. Recovery: set
       entry_fee to ${(line.line_amount_cents / 100).toFixed(2)} on that entry.</p>`,
      { source: 'stripe-webhook', dedupeKey: `entry-fee-record-failed-${moneyRoot.id}` }
    );
  }

  // The live entry carrying this run: the destination the cart named, or
  // (MYK9-639) the one live descendant of a moved root the cart named.
  const liveEntryId =
    moneyRoot.id !== existingEntry.id
      ? existingEntry.id
      : (loadedMoneyRoot.liveEntryIdByRoot[moneyRoot.id] ?? existingEntry.id);
  const liveEntry = loadedMoneyRoot.entries.find(entry => entry.id === liveEntryId);
  if (liveEntryId !== moneyRoot.id && liveEntry?.entry_status === 'pending-payment') {
    const { error: destinationStatusError } = await supabase
      .from('entries')
      .update({ entry_status: 'confirmed' })
      .eq('id', liveEntryId)
      .eq('entry_status', 'pending-payment');
    if (destinationStatusError) {
      console.error(
        `Failed to advance recovered move-up destination ${liveEntryId}:`,
        destinationStatusError
      );
    }
  }

  for (const linkedEntryId of new Set([existingEntry.id, moneyRoot.id, liveEntryId])) {
    await expireRecoveredEntryPaymentLinks(linkedEntryId, ctx.sessionId);
  }

  // Receipts and order history name the live destination the exhibitor
  // bought; the original root remains the payment-bearing row.
  return { outcome: 'paid_existing', entryId: liveEntryId, paidEntryId: moneyRoot.id };
}

// Service-role fetcher for the pure loader in ./paymentReconciliationLoader.ts.
function loadPaymentReconciliationEntries(entryIds: string[]) {
  return loadPaymentReconciliationEntriesFrom(entryIds, async (column, ids) => {
    const { data, error } = await supabase
      .from('entries')
      .select(PAYMENT_RECONCILIATION_ENTRY_COLUMNS)
      .in(column, ids);
    return { data: (data ?? null) as PaymentReconciliationEntry[] | null, error };
  });
}

/**
 * Handle a secretary-initiated entry payment-link completion
 * (metadata.type='entry_payment_request' from the stripe-payment-link fn).
 *
 * Unlike the cart flow, the entries ALREADY EXIST — a mail-in entry sitting at
 * payment_status='pending', or a promoted waitlist entry at 'pending-payment'.
 * We MARK them paid (not create them); see _shared/entryPaymentReconcile.ts.
 * The persisted entry_payment_links row is both the anti-tamper anchor (a paid
 * session must have one) and the idempotency latch (once it leaves 'open', a
 * re-delivered event is a no-op).
 */
async function handleEntryPaymentRequestCompleted(session: Stripe.Checkout.Session) {
  // MP-07: the webhook payload's payment_status/amount_total are untrusted
  // (same reasoning as the cart path's fresh retrieve above) — a payment
  // link's payload could carry a stale/tampered amount_total, and delayed
  // payment methods can deliver checkout.session.completed before money
  // actually lands. Retrieve fresh and use ONLY the fresh values for every
  // downstream write; never the payload's.
  const freshSession = await stripe.checkout.sessions.retrieve(session.id);
  const freshGate = decideFreshSessionGate(freshSession);
  if (freshGate.action === 'skip') {
    console.log(
      `Payment link session ${session.id}: ${freshGate.reason} — waiting for a paid event`
    );
    return;
  }
  const freshAmountTotalCents = freshGate.amountTotalCents;

  const paymentIntentId = extractPaymentIntentId(session.payment_intent);

  const { data: link, error: linkError } = await supabase
    .from('entry_payment_links')
    .select('id, show_id, entry_ids, status')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();

  if (linkError || !link) {
    // A PAID session with no link row: tampering, or the row was lost. Charge
    // taken, nothing marked paid, no Stripe retry — alert (Task 3.5 refund).
    console.error('Paid payment-link session has no link row:', linkError);
    await alertAdmin(
      'Paid payment link has no record — entries NOT marked paid',
      `<p>Checkout session <code>${session.id}</code> (entry_payment_request) was PAID,
       but no <code>entry_payment_links</code> row matches it. No entries were marked
       paid and Stripe will not retry.</p>
       <p>The full charge, service fee included, is queued for refund approval
       (MYK9-997: the exhibitor got nothing). ${RESOLVE_INSTEAD_HTML}</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-no-record-${session.id}` }
    );
    // No link row, so no latch: the refund request is the only write, and a
    // redelivery takes this same path to the same idempotent call.
    await settlePaymentLinkObligation(refundQueueDeps, {
      sessionId: session.id,
      paymentIntentId,
      linkId: null,
      closeLinkFrom: null,
      // Nothing was served: the full charge, service fee included (MYK9-997).
      owed: noLinkRecordObligation(freshAmountTotalCents),
      showId: null,
      paidEntryIds: [],
    });
    return;
  }

  const entryIds = (link.entry_ids as string[] | null) ?? [];
  const loadedEntries = await loadPaymentReconciliationEntries(entryIds);
  const entriesError = loadedEntries.error;
  if (entriesError) {
    console.error('Failed to load entries for payment link:', entriesError);
    await alertAdmin(
      'Payment link paid but entries could not be read',
      `<p>Session <code>${session.id}</code> was PAID but loading its entries failed:</p>
       <pre>${entriesError.message}</pre>
       <p>Recovery: mark entries <code>${entryIds.join(', ')}</code> paid manually.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-entries-unreadable-${session.id}` }
    );
    return;
  }

  const {
    entries,
    reconciliationEntryIds,
    duplicateEntryIds,
    lifecycleEntryIdsByRoot,
    blockedEntryIds,
  } = loadedEntries;

  const result = reconcileEntryPaymentRequest({
    linkStatus: link.status,
    sessionPaymentStatus: freshSession.payment_status ?? null,
    expectedEntryIds: entryIds,
    entries,
    reconciliationEntryIds,
    duplicateEntryIds,
    lifecycleEntryIdsByRoot,
    blockedEntryIds,
    paymentIntentId,
  });

  if (result.action === 'skip') {
    console.log(
      `Payment link ${session.id} skipped (${result.skipReason}; link status: ${link.status}, payment_status: ${freshSession.payment_status})`
    );
    // A closed latch has its refund request beside it (written in the same
    // transaction): a redelivery after a lost response ensures its alert.
    if (link.status === 'paid') await ensurePaymentLinkRefundAlert(refundQueueDeps, session.id);
    return;
  }

  // Entries the link was created for that no longer exist/in-show, or that were
  // already paid by another link. The valid subset is still marked paid; the
  // invalid subset is refunded below after the stripe_orders row is recorded.
  if (result.missingEntryIds.length > 0) {
    console.error(`Payment link ${session.id} references missing entries:`, result.missingEntryIds);
    await alertAdmin(
      'Payment link paid for entries that no longer exist',
      `<p>Session <code>${session.id}</code> was PAID, but these entries it was created for
       are gone (deleted/withdrawn since): <code>${result.missingEntryIds.join(', ')}</code>
       (payment intent <code>${paymentIntentId ?? 'unknown'}</code>).</p>
       <p>The invalid portion is queued for refund approval after recording payment history.
       ${RESOLVE_INSTEAD_HTML}</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-missing-entries-${session.id}` }
    );
  }
  if (result.inactiveEntryIds.length > 0) {
    console.error(
      `Payment link ${session.id} references inactive entries:`,
      result.inactiveEntryIds
    );
    await alertAdmin(
      'Payment link paid for inactive entries',
      `<p>Session <code>${session.id}</code> was PAID, but these entries are no longer
       active in the show: <code>${result.inactiveEntryIds.join(', ')}</code>
       (payment intent <code>${paymentIntentId ?? 'unknown'}</code>).</p>
       <p>The invalid portion is queued for refund approval after recording payment history.
       ${RESOLVE_INSTEAD_HTML}</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-inactive-entries-${session.id}` }
    );
  }

  // Apply per-entry patches. The payment + active-status guards make each
  // update a no-op if something already paid/removed it after the pre-read.
  // Marks payment_method='online' so cron-process-payouts actually pays the
  // club for these entries (Task 1 / Task 3 Step 4).
  const plannedPatchIds = result.patches.map(p => p.id);
  const updatedEntryIds: string[] = [];
  const inactiveEntryStatusFilter = `(${[...INACTIVE_ENTRY_STATUSES].join(',')})`;
  for (const patch of result.patches) {
    if (patch.allowExpiredPromotionClaim) {
      const collided = await paidExpiredClaimHasReplacementOffer(patch.id, session.id);
      if (collided) continue;
    }

    const update: Record<string, unknown> = {
      payment_status: patch.payment_status,
      payment_method: patch.payment_method,
      stripe_payment_intent_id: patch.stripe_payment_intent_id,
    };
    if (
      patch.entry_status &&
      (!patch.entryStatusEntryId || patch.entryStatusEntryId === patch.id)
    ) {
      update.entry_status = patch.entry_status;
    }
    let updateQuery = supabase
      .from('entries')
      .update(update)
      .eq('id', patch.id)
      .eq('payment_status', 'pending');
    updateQuery = patch.allowExpiredPromotionClaim
      ? updateQuery.eq('entry_status', 'promotion-expired')
      : updateQuery.not('entry_status', 'in', inactiveEntryStatusFilter);

    const { data: updatedRows, error } = await updateQuery.select('id');
    if (error) {
      console.error(`Failed to mark entry ${patch.id} paid:`, error);
      await alertAdmin(
        'Payment link paid but an entry could not be stamped',
        `<p>Session <code>${session.id}</code> was PAID but stamping entry
         <code>${patch.id}</code> failed:</p><pre>${error.message}</pre>
         <p>Until it is stamped paid+online, cron-process-payouts will NOT pay the
         club for it. Recovery: stamp the entry manually.</p>`,
        { source: 'stripe-webhook', dedupeKey: `payment-link-stamp-failed-${patch.id}` }
      );
    }
    updatedEntryIds.push(...((updatedRows ?? []) as { id: string }[]).map(row => row.id));

    if (
      updatedRows?.length &&
      patch.entry_status &&
      patch.entryStatusEntryId &&
      patch.entryStatusEntryId !== patch.id
    ) {
      const { error: lifecycleError } = await supabase
        .from('entries')
        .update({ entry_status: patch.entry_status })
        .eq('id', patch.entryStatusEntryId)
        .eq('entry_status', 'pending-payment')
        .not('entry_status', 'in', inactiveEntryStatusFilter);
      if (lifecycleError) {
        console.error(
          `Failed to advance move-up destination ${patch.entryStatusEntryId}:`,
          lifecycleError
        );
      }
    }
  }

  // Freeze the withdrawal policy these entries were paid under (best-effort).
  const withdrawalSnapshotEntryIds = [
    ...updatedEntryIds,
    ...result.patches
      .map(patch => patch.entryStatusEntryId)
      .filter((id): id is string => Boolean(id)),
  ];
  await stampWithdrawalSnapshot(
    [...new Set(withdrawalSnapshotEntryIds)],
    link.show_id as string | null
  );

  const noOpPatchIds = plannedPatchIds.filter(id => !updatedEntryIds.includes(id));
  let rereadNoOpEntries: {
    id: string;
    payment_status: string | null;
    entry_status: string | null;
    stripe_payment_intent_id: string | null;
  }[] = [];
  if (noOpPatchIds.length > 0) {
    const { data: noOpEntriesData, error: noOpEntriesError } = await supabase
      .from('entries')
      .select('id, payment_status, entry_status, stripe_payment_intent_id')
      .in('id', noOpPatchIds);
    if (noOpEntriesError) {
      console.error('Failed to re-read no-op entry payment patches:', noOpEntriesError);
      await alertAdmin(
        'Payment link paid but no-op entries could not be re-read',
        `<p>Session <code>${session.id}</code> was PAID but these planned entry
         stamps did not update and could not be re-read:
         <code>${noOpPatchIds.join(', ')}</code>.</p>
         <pre>${noOpEntriesError.message}</pre>
         <p>The webhook will treat them as invalid for refund safety.</p>`,
        { source: 'stripe-webhook', dedupeKey: `payment-link-noop-reread-failed-${session.id}` }
      );
    } else {
      rereadNoOpEntries = (noOpEntriesData ?? []) as {
        id: string;
        payment_status: string | null;
        entry_status: string | null;
        stripe_payment_intent_id: string | null;
      }[];
    }
  }

  // Loaded UNCONDITIONALLY (MYK9-54 review finding 2): these authoritative
  // per-entry line-item fees are what the financial snapshot below is built
  // from, not just the refund amount. Deriving the snapshot from the session
  // total instead overstated the platform fee on every partial-invalid order.
  const entryFeesById = await loadEntryPaymentLineItemFees(session.id);
  // Checkout lines point at the live move-up destination, while the payment
  // stamp is applied to its original money root. Keep the destination's
  // authoritative line fee available under the root id for refund arithmetic.
  for (let index = 0; index < entryIds.length; index += 1) {
    const destinationId = entryIds[index];
    const rootId = reconciliationEntryIds[index];
    const destinationFee = entryFeesById.get(destinationId);
    if (rootId && destinationFee != null && !entryFeesById.has(rootId)) {
      entryFeesById.set(rootId, destinationFee);
    }
  }
  // The ONE entry_fee write rule (_shared/entryFeeRecord), run ONCE per stamped
  // entry after the root mapping above: a stamped entry whose stored fee is NULL or
  // 0 records the amount actually charged, so stripe-refund-entry can compute its
  // refundable amount; a positive fee (known from the entries already loaded) costs
  // no request and is never overwritten.
  {
    const storedFeeById = new Map(entries.map(entry => [entry.id, entry.entry_fee]));
    const feeRecords = await recordChargedFeesForStamped(supabase, {
      stampedEntryIds: updatedEntryIds,
      storedFeeById,
      chargedCentsById: entryFeesById,
    });
    for (const { id: stampedId, error } of feeRecords.failed) {
      const chargedCents = entryFeesById.get(stampedId) ?? 0;
      console.error(`Could not record the charged fee on entry ${stampedId}:`, error);
      await alertAdmin(
        'Paid entry fee could not be recorded',
        `<p>Entry <code>${stampedId}</code> was paid ${(chargedCents / 100).toFixed(2)} USD
         (session <code>${session.id}</code>) but its entry_fee could not be recorded:</p>
         <pre>${error.message}</pre>
         <p>Recovery: set entry_fee to ${(chargedCents / 100).toFixed(2)} on that entry.</p>`,
        { source: 'stripe-webhook', dedupeKey: `entry-fee-record-failed-${stampedId}` }
      );
    }
  }
  // Declared here rather than beside the snapshot below because the make-whole
  // refund needs them too: the flat per-checkout component and the floor are
  // earned once per CHARGE, so splitting them across the invalid entries
  // refunded fee income the platform had genuinely retained (MYK9-197 B1).
  // Absent stamps read as 0 — see decodeStampedPlatformFeeRates.
  const linkFeeRates = decodeStampedPlatformFeeRates(
    freshSession.metadata,
    Deno.env.get('PLATFORM_FEE_PERCENT')
  );
  const updateOutcome = reconcileEntryPaymentUpdateOutcome({
    plannedPatchIds,
    updatedEntryIds,
    rereadNoOpEntries,
    initialMissingEntryIds: result.missingEntryIds,
    initialInactiveEntryIds: result.inactiveEntryIds,
    initialUnresolvedEntryIds: result.unresolvedEntryIds,
    initialAlreadyPaidEntryIds: result.alreadyPaidEntryIds,
    initialSameIntentPaidEntryIds: result.sameIntentPaidEntryIds,
    paymentIntentId,
    sessionAmountTotalCents: freshAmountTotalCents,
    entryFeesById,
    platformFeeRates: linkFeeRates,
  });

  const paidIds = updateOutcome.paidEntryIds;

  // Immutable financial snapshot (MYK9-54 review finding 2). Built from the
  // ACCEPTED entries and their authoritative Checkout line-item fees — the same
  // way the cart path uses paidEntrySubtotalCents — NOT by back-deriving the
  // split from the session total. The session total includes lines that were
  // never accepted (missing/inactive/already-paid entries, queued for refund below),
  // so deriving from it overstated platform_fee_cents on every partial-invalid
  // order AND forced `amount == subtotal + fee` to hold by construction, which
  // made the tie-out `amount == subtotal + fee + make_whole` fail by exactly the
  // refund. Capture Stripe's actual processing fee (NULL = pending, never zero).
  const linkFeeSplit = resolveAcceptedEntrySnapshot(
    paidIds,
    entryFeesById,
    linkFeeRates,
    updateOutcome.invalidEntryIds
  );
  if (linkFeeSplit.status === 'unverifiable') {
    // Columns stay NULL (rate-unverifiable), never a guessed number that would
    // silently enter platform income reporting.
    await alertAdmin(
      'Payment-link order recorded without a fee snapshot',
      `<p>Session <code>${session.id}</code> was PAID, but Stripe reported no
       line-item fee for accepted entries
       <code>${linkFeeSplit.missingFeeEntryIds.join(', ')}</code>.</p>
       <p><code>entry_subtotal_cents</code> / <code>platform_fee_cents</code> were
       left NULL rather than estimated, so this order reports as
       rate-unverifiable in reconciliation until the values are set by hand.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-fee-unverifiable-${session.id}` }
    );
  }
  // Fetched BEFORE the latch: the order is written in the same transaction.
  const linkProcessingFeeCents = await fetchProcessingFeeCents(paymentIntentId);

  // Close the link (idempotency latch) after reconciliation, record the order
  // (payment history), resolve the paid entries' waitlist offers (MYK9-968)
  // AND write what the invalid entries are owed, in ONE transaction
  // (queue_payment_link_refund; Codex rounds 13-14 on #2689). A lost response
  // therefore leaves nothing for the replay-first redelivery to repair. A
  // closed latch always has its order and its request; an existing
  // order is left as it is (ON CONFLICT DO NOTHING). Same-intent paid rows make
  // concurrent Stripe deliveries idempotent without closing the retry path
  // before entries are stamped. Expired promotion claims revive only when at
  // least one entry was actually stamped paid. Throws (5xx) when it cannot be
  // confirmed; the latch is then still open and the redelivery runs this again.
  const shouldCloseLink =
    link.status === 'open' || (link.status === 'expired' && paidIds.length > 0);
  const invalidEntryIds = updateOutcome.invalidEntryIds;
  const decision = updateOutcome.refundDecision;
  const owesRefund = invalidEntryIds.length > 0 && decision.action === 'refund';
  const invalidList = invalidEntryIds.length
    ? ` Invalid entries: <code>${invalidEntryIds.join(', ')}</code>.`
    : '';
  await settlePaymentLinkObligation(refundQueueDeps, {
    sessionId: session.id,
    paymentIntentId,
    linkId: link.id,
    closeLinkFrom: shouldCloseLink ? (link.status === 'expired' ? 'expired' : 'open') : null,
    owed: owesRefund
      ? {
          amountCents: decision.amountCents,
          reason: decision.reason,
          detail: { invalid_entry_ids: invalidEntryIds },
          summaryHtml: `A payment-link charge could not be honored in full.${invalidList}`,
        }
      : null,
    showId: (link.show_id as string | null) ?? null,
    order: buildPaymentLinkOrder({
      sessionId: session.id,
      paymentIntentId,
      amountTotalCents: freshAmountTotalCents,
      currency: session.currency ?? null,
      linkId: link.id,
      showId: (link.show_id as string | null) ?? null,
      paidEntryIds: paidIds,
      entrySubtotalCents: linkFeeSplit.entrySubtotalCents,
      platformFeeCents: linkFeeSplit.platformFeeCents,
      platformFeeRate: linkFeeRates.percent,
      stripeProcessingFeeCents: linkProcessingFeeCents,
      paidAt: new Date().toISOString(),
    }),
    paidEntryIds: paidIds,
  });
  if (linkProcessingFeeCents === null) {
    await warnMissingProcessingFee(paymentIntentId, `payment link ${link.id}`);
  }

  if (updateOutcome.alreadyPaidEntryIds.length > 0) {
    await alertAdmin(
      'Payment link paid for already-paid entries',
      `<p>Session <code>${session.id}</code> paid for entries that were already paid:
       <code>${updateOutcome.alreadyPaidEntryIds.join(', ')}</code> (payment intent
       <code>${paymentIntentId ?? 'unknown'}</code>).</p>
       <p>The invalid entries' fees are queued for refund approval; the service fee is
       never refunded (MYK9-966). ${RESOLVE_INSTEAD_HTML}</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-already-paid-${session.id}` }
    );
  }

  if (updateOutcome.unknownNoOpEntryIds.length > 0) {
    await alertAdmin(
      'Payment link paid but entries did not stamp',
      `<p>Session <code>${session.id}</code> was PAID but these entries did not update
       despite still being present and not clearly paid/inactive:
       <code>${updateOutcome.unknownNoOpEntryIds.join(', ')}</code>.</p>
       <p>The webhook will treat them as invalid for refund safety.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-unknown-noop-${session.id}` }
    );
  }

  if (updateOutcome.unresolvedEntryIds.length > 0) {
    await alertAdmin(
      'Payment link move-up root could not be reconciled',
      `<p>Session <code>${session.id}</code> was PAID, but these live destination
       entries could not be safely matched to their money roots:
       <code>${updateOutcome.unresolvedEntryIds.join(', ')}</code>.</p>
       <p>The affected lines will be refunded; verify the move-up history before
       restoring or reissuing any payment link.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-unresolved-root-${session.id}` }
    );
  }

  // The refund itself (decision.action === 'refund') was written with the
  // latch above; these are the cases where no amount could be queued.
  if (invalidEntryIds.length > 0) {
    if (decision.action === 'needs_manual_amount') {
      const copy = paymentLinkNeedsManualAmountAlert({
        sessionId: session.id,
        invalidEntryIds,
        missingFeeEntryIds: decision.missingFeeEntryIds,
      });
      await alertAdmin(copy.title, copy.html, {
        source: 'stripe-webhook',
        dedupeKey: `payment-link-refund-manual-amount-${session.id}`,
      });
    } else if (decision.action === 'cannot_refund') {
      await alertAdmin(
        'Payment link refund could not be queued',
        `<p>Session <code>${session.id}</code> was PAID and has invalid entries
         <code>${invalidEntryIds.join(', ')}</code>, but no refund could be queued:
         <code>${decision.reason}</code>.</p>`,
        { source: 'stripe-webhook', dedupeKey: `payment-link-refund-cannot-refund-${session.id}` }
      );
    }
  }

  console.log(
    `Payment link ${session.id} reconciled: ${paidIds.length} entr${
      paidIds.length === 1 ? 'y' : 'ies'
    } marked paid (show ${link.show_id})`
  );
}

async function paidExpiredClaimHasReplacementOffer(
  entryId: string,
  sessionId: string
): Promise<boolean> {
  const { data: linkedOffer, error: linkedOfferError } = await supabase
    .from('waitlist_entries')
    .select('id, class_id, status, promoted_entry_id')
    .eq('promoted_entry_id', entryId)
    .maybeSingle();

  if (linkedOfferError || !linkedOffer) {
    console.error(
      `Paid expired waitlist claim ${entryId} has no resolvable waitlist row:`,
      linkedOfferError
    );
    await alertAdmin(
      'Paid expired waitlist claim could not be verified',
      `<p>Session <code>${sessionId}</code> paid expired promotion entry
       <code>${entryId}</code>, but the linked waitlist row could not be loaded.
       The webhook left the entry unpaid so the charge can be refunded.</p>
       ${linkedOfferError ? `<pre>${linkedOfferError.message}</pre>` : ''}`,
      { source: 'stripe-webhook', dedupeKey: `expired-claim-unverified-${entryId}` }
    );
    return true;
  }

  const { data: replacementOffer, error: replacementError } = await supabase
    .from('waitlist_entries')
    .select('id, promoted_entry_id')
    .eq('class_id', linkedOffer.class_id)
    .eq('status', 'offered')
    .neq('promoted_entry_id', entryId)
    .limit(1)
    .maybeSingle();

  if (replacementError) {
    console.error(
      `Could not check replacement waitlist offers before reviving ${entryId}:`,
      replacementError
    );
    await alertAdmin(
      'Paid expired waitlist claim collision check failed',
      `<p>Session <code>${sessionId}</code> paid expired promotion entry
       <code>${entryId}</code>, but checking for a replacement offer failed.
       The webhook left the entry unpaid so the charge can be refunded.</p>
       <pre>${replacementError.message}</pre>`,
      { source: 'stripe-webhook', dedupeKey: `expired-claim-collision-check-failed-${entryId}` }
    );
    return true;
  }

  if (replacementOffer) {
    console.error(
      `Paid expired waitlist claim ${entryId} collided with replacement waitlist offer ${replacementOffer.id}`
    );
    await alertAdmin(
      'Paid expired waitlist claim collided with a replacement offer',
      `<p>Session <code>${sessionId}</code> paid expired promotion entry
       <code>${entryId}</code>, but waitlist offer <code>${replacementOffer.id}</code>
       is already active for the same class. The webhook left the expired entry
       unpaid so the charge can be refunded instead of double-selling the spot.</p>`,
      { source: 'stripe-webhook', dedupeKey: `expired-claim-collision-${entryId}` }
    );
    return true;
  }

  return false;
}

/**
 * The CART path's offer resolution. A payment link resolves its offers inside
 * queue_payment_link_refund instead, atomic with its latch (MYK9-968).
 */
async function resolvePaidWaitlistOffers(entryIds: string[], sessionId: string) {
  if (entryIds.length === 0) return;

  const { error } = await supabase
    .from('waitlist_entries')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .in('promoted_entry_id', entryIds)
    .in('status', ['offered', 'expired']);

  if (error) {
    console.error('Cart paid but waitlist row could not be resolved:', error);
    await alertAdmin(
      'Cart paid but waitlist offer stayed open',
      `<p>Session <code>${sessionId}</code> paid entries
       <code>${entryIds.join(', ')}</code>, but resolving the linked
       <code>waitlist_entries.promoted_entry_id</code> rows failed:</p>
       <pre>${error.message}</pre>
       <p>Recovery: mark the matching waitlist row accepted manually so the
       cascade does not offer the spot again.</p>`,
      { source: 'stripe-webhook', dedupeKey: `waitlist-offer-not-resolved-${sessionId}` }
    );
  }
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

async function loadEntryPaymentLineItemFees(sessionId: string): Promise<Map<string, number>> {
  try {
    return await loadEntryPaymentLineItemFeesFromStripe(stripe.checkout.sessions, sessionId);
  } catch (err) {
    console.error(`Could not load line items for payment-link session ${sessionId}:`, err);
  }
  return new Map<string, number>();
}

function serializeCartOverflowRefundDecision(decision: CartOverflowRefundDecision) {
  if (decision.action === 'none') {
    return {
      action: decision.action,
      paid_amount_cents: decision.paidAmountCents,
    };
  }
  if (decision.action === 'refund') {
    return {
      action: decision.action,
      amount_cents: decision.amountCents,
      paid_amount_cents: decision.paidAmountCents,
      reason: decision.reason,
    };
  }
  if (decision.action === 'needs_manual_amount') {
    return {
      action: decision.action,
      missing_line_ids: decision.missingLineIds,
      paid_amount_cents: decision.paidAmountCents,
    };
  }
  return {
    action: decision.action,
    reason: decision.reason,
    paid_amount_cents: decision.paidAmountCents,
  };
}

/**
 * Send entry confirmation email via send-email function
 */
async function sendEntryConfirmationEmail(
  cart: { show_id: string; exhibitor: { person_id: string } },
  entryIds: string[],
  session: Stripe.Checkout.Session,
  authoritative: { subtotalCents: number; platformFeeCents: number; totalCents: number }
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

    // Get entry details with dog and class info. entries has entry_fee in
    // DOLLARS — there is no entry_fee_cents column; selecting it errors the
    // whole query and silently skipped every confirmation email (Codex P1).
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select(
        `
        id,
        entry_fee,
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
        // cents, matching subtotal/platformFee/total below
        entryFee: Math.round(Number(e.entry_fee ?? 0) * 100),
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
