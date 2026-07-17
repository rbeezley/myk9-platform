import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { buildEntryInsert, extractPaymentIntentId } from '../_shared/entryFromCartItem.ts';
import { accountToRowPatch } from '../_shared/connectAccountMapper.ts';
import { parsePremiumPriceIds, priceIdToTier } from '../_shared/premiumPrices.ts';
import { sessionMatchesCart } from '../_shared/sessionCartGuard.ts';
import {
  INACTIVE_ENTRY_STATUSES,
  reconcileEntryPaymentRequest,
} from '../_shared/entryPaymentReconcile.ts';
import { reconcileEntryPaymentUpdateOutcome } from '../_shared/entryPaymentUpdateReconcile.ts';
import { alertAdmin } from '../_shared/alertAdmin.ts';
import { authoritativeEntryFeeCents } from '../_shared/authoritativeFee.ts';
import { calculatePlatformFeeCents, resolvePlatformFeePercent } from '../_shared/platformFee.ts';
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
import { createWebhookRequestHandler } from './webhookHandler.ts';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
// Connect-scoped event destination signs with its OWN secret; optional until
// the Connected-accounts destination exists in the dashboard.
const stripeConnectWebhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

type OnlinePaidEntryCapacityOutcome = {
  outcome: 'created_entry' | 'waitlisted' | 'denied';
  entry_id: string | null;
  waitlist_entry_id: string | null;
};

type CartOverflowLine = {
  cartItemId: string;
  classId: string;
  dogId: string;
  waitlistEntryId?: string;
  errorMessage?: string;
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
 * A refund that was created (pending) and LATER failed leaves the entry
 * stamped refunded — customer unpaid, club's payout still docked — with no
 * signal anywhere (round-11 review). Alert-only: the operator clears the
 * entry's refund columns (runbook "Manual reconciliation") and re-issues.
 */
async function handleRefundFailed(refund: Stripe.Refund) {
  const entryId = refund.metadata?.entry_id ?? null;
  console.error(
    `CRITICAL: refund ${refund.id} (${refund.amount}¢) FAILED after creation` +
      (entryId ? ` for entry ${entryId}` : '')
  );
  await alertAdmin(
    'Stripe refund FAILED after it was issued',
    `<p>Refund <code>${refund.id}</code> for ${(refund.amount / 100).toFixed(2)} USD has
     status <code>failed</code>${entryId ? ` (entry <code>${entryId}</code>)` : ''} —
     the customer was NOT paid, but the entry was already stamped refunded, so the
     payout math is docking the club for money that never left.</p>
     <p>Recovery: clear the entry's refund columns (see the runbook's
     "Manual reconciliation" section), then re-issue the refund from the entries
     page. The refund function ignores dead refunds, so re-issuing is safe.</p>`,
    { source: 'stripe-webhook', dedupeKey: `refund-failed-${refund.id}` }
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
async function handleChargeRefunded(charge: Stripe.Charge, eventId: string) {
  const refunds = charge.refunds?.data ?? [];
  // Skip only when EVERY refund came from an app flow (.some would let an app
  // refund mask a later dashboard refund on the same charge — review finding
  // #3). Mixed charges fall through to the RECONCILE log below.
  const allFromAppRefund = allRefundsAppOriginated(refunds);
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

  // Idempotent: re-delivery (or a second partial refund) re-applies the same state.
  const { data, error } = await supabase
    .from('stripe_orders')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .select('id, order_type');

  if (error) {
    console.error(`Error marking order refunded for ${paymentIntentId}:`, error);
    return;
  }
  if (!data || data.length === 0) {
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
        'withdrawal_cutoff_date, withdrawal_retention_type, withdrawal_retention_value, withdrawal_policy_notes, clubs(default_withdrawal_cutoff_date, default_withdrawal_retention_type, default_withdrawal_retention_value, default_withdrawal_policy_notes)'
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
    await handleOneTimePaymentCompleted(session);
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

  console.log(`Processing entry payment for cart: ${cartId}`);

  // Get cart with items
  const { data: cart, error: cartError } = await supabase
    .from('entry_carts')
    .select(
      `
      *,
      exhibitor:exhibitor_profiles(id, person_id),
      items:entry_cart_items(
        id,
        dog_id,
        class_id,
        handler_id,
        entry_fee_cents,
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
    .select('pre_entry_fee, day_of_show_fee, start_date')
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
  const authoritativeByClass = new Map<string, number>(
    classIds.map((classId: string) => [
      classId,
      authoritativeEntryFeeCents({
        showPreEntryFee: showFees.pre_entry_fee,
        showDayOfShowFee: showFees.day_of_show_fee,
        showStartDate: showFees.start_date,
        classEntryFee: feeByClass.get(classId) ?? null,
        nowIso,
      }),
    ])
  );
  const authoritativeSubtotal = (cart.items as { class_id: string }[]).reduce(
    (sum, i) => sum + (authoritativeByClass.get(i.class_id) ?? 0),
    0
  );
  // Validate the platform fee against the rate STAMPED on the session at
  // checkout, not a live read — stripe-checkout now charges from the
  // platform_settings row, and a site admin changing that rate between charge
  // and webhook must not make this reject a correctly-charged session (which
  // would leave the exhibitor paid with no entries). Fall back to the env var
  // for sessions created before the stamp existed.
  const stampedFeePercent = resolvePlatformFeePercent(
    freshSession.metadata?.platform_fee_percent ?? Deno.env.get('PLATFORM_FEE_PERCENT')
  );
  const authoritativeTotal =
    authoritativeSubtotal + calculatePlatformFeeCents(authoritativeSubtotal, stampedFeePercent);
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

  // Idempotency latch: atomically claim the cart by flipping active → submitted.
  // A re-delivered event would otherwise create duplicate paid entries — which
  // the payout cron would then pay the club for twice.
  // Expiry is already enforced in pure code by sessionMatchesCart above (the
  // cartExpiresAt < now check on the SAME cart.expires_at read), so the claim
  // only needs the status latch for idempotency. We deliberately do NOT
  // re-filter on expires_at here: a raw ISO timestamp inside PostgREST's .or()
  // mini-language misparses the dotted/colon'd value and the whole UPDATE
  // fails with `column entry_carts.expires_at does not exist`. The TOCTOU window
  // the .or() guarded is sub-millisecond and fully covered by the read-time
  // check, so dropping it is safe.
  const { data: claimed, error: claimError } = await supabase
    .from('entry_carts')
    .update({ status: 'submitted' })
    .eq('id', cartId)
    .eq('status', 'active')
    .select('id');

  if (claimError) {
    // Same severity as the entries-shortfall below — email, don't just log.
    console.error(`CRITICAL: failed to claim cart ${cartId} after payment:`, claimError);
    await alertAdmin(
      'Paid cart could not be claimed — entries NOT created',
      `<p>Checkout session <code>${session.id}</code> was PAID, but claiming cart
       <code>${cartId}</code> failed with a database error, so no entries were created
       and Stripe will not retry the event.</p>
       <pre>${claimError.message}</pre>
       <p>Recovery: verify the payment in the Stripe dashboard, then create the
       entries manually from the cart items (or refund the payment).</p>`,
      { source: 'stripe-webhook', dedupeKey: `cart-claim-failed-${session.id}` }
    );
    return;
  }
  if (!claimed || claimed.length === 0) {
    // Already-claimed cart: benign for a RE-DELIVERED event (same payment
    // intent that created the entries), but a SECOND paid session on the same
    // cart is a real duplicate CHARGE with nothing to show for it (Codex P1).
    // Distinguish them by whether this intent created any entries.
    const dupIntentId = extractPaymentIntentId(session.payment_intent);
    const { data: existingOrder } = await supabase
      .from('stripe_orders')
      .select('id')
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle();
    if (existingOrder) {
      console.log(`Cart ${cartId} already processed with order ${existingOrder.id} — skipping`);
      return;
    }
    if (dupIntentId) {
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
    return;
  }

  // Get stripe_customers record for this person
  const { data: stripeCustomer } = await supabase
    .from('stripe_customers')
    .select('id')
    .eq('person_id', cart.exhibitor.person_id)
    .eq('livemode', stripeLivemode)
    .single();

  // Resolve each class's trial: entries carry denormalized show_id/trial_id
  // FKs that nothing else populates, and the payout calc + refund join +
  // secretary entries list all filter on show_id. classRows was loaded (and
  // error-gated) by the verification block above.
  const trialByClass = new Map<string, string | null>(
    classRows.map((c: { id: string; trial_id: string | null }) => [c.id, c.trial_id])
  );

  // Create entries from cart items, stamping the payment intent as the
  // per-entry refund key for stripe-refund-entry. Fees come from the
  // AUTHORITATIVE map (verified against the paid amount above), never from
  // the owner-writable item rows.
  const paymentIntentId = extractPaymentIntentId(session.payment_intent);
  const entryIds: string[] = [];
  const paidLineIds: string[] = [];
  const noServiceLineIds: string[] = [];
  const lineAmountsById = new Map<string, number>();
  const waitlistedLines: CartOverflowLine[] = [];
  const deniedLines: CartOverflowLine[] = [];
  const failedLines: CartOverflowLine[] = [];
  for (const item of cart.items) {
    const lineAmountCents = authoritativeByClass.get(item.class_id) ?? item.entry_fee_cents;
    const entryInsert = buildEntryInsert(
      {
        ...item,
        entry_fee_cents: lineAmountCents,
      },
      paymentIntentId,
      new Date().toISOString(),
      {
        showId: cart.show_id,
        trialId: trialByClass.get(item.class_id) ?? null,
      }
    );
    const { data: entry, error: entryError } = await supabase.rpc('create_online_paid_entry', {
      p_dog_id: entryInsert.dog_id,
      p_class_id: entryInsert.class_id,
      p_handler_id: entryInsert.handler_id,
      p_entry_fee: entryInsert.entry_fee,
      p_jump_height: entryInsert.jump_height,
      p_special_requests: entryInsert.special_requests,
      p_payment_intent_id: entryInsert.stripe_payment_intent_id,
      p_submitted_at: entryInsert.submitted_at,
      p_show_id: entryInsert.show_id,
      p_trial_id: entryInsert.trial_id,
      p_exhibitor_id: cart.exhibitor.id,
    });

    if (entryError) {
      console.error(`Error creating entry for cart item ${item.id}:`, entryError);
      noServiceLineIds.push(item.id);
      lineAmountsById.set(item.id, lineAmountCents);
      failedLines.push({
        cartItemId: item.id,
        classId: item.class_id,
        dogId: item.dog_id,
        errorMessage: entryError.message,
      });
      continue;
    }

    const outcome = normalizeCapacityOutcome(entry);
    if (!outcome) {
      console.error(`Capacity RPC returned no outcome for cart item ${item.id}`);
      noServiceLineIds.push(item.id);
      lineAmountsById.set(item.id, lineAmountCents);
      failedLines.push({
        cartItemId: item.id,
        classId: item.class_id,
        dogId: item.dog_id,
        errorMessage: 'Capacity RPC returned no outcome',
      });
    } else if (outcome.outcome === 'created_entry' && outcome.entry_id) {
      entryIds.push(outcome.entry_id);
      paidLineIds.push(outcome.entry_id);
      lineAmountsById.set(outcome.entry_id, lineAmountCents);
    } else if (outcome.outcome === 'waitlisted' && outcome.waitlist_entry_id) {
      noServiceLineIds.push(item.id);
      lineAmountsById.set(item.id, lineAmountCents);
      waitlistedLines.push({
        cartItemId: item.id,
        classId: item.class_id,
        dogId: item.dog_id,
        waitlistEntryId: outcome.waitlist_entry_id,
      });
    } else {
      noServiceLineIds.push(item.id);
      lineAmountsById.set(item.id, lineAmountCents);
      deniedLines.push({ cartItemId: item.id, classId: item.class_id, dogId: item.dog_id });
    }
  }

  // Freeze the withdrawal policy these entries were paid under (best-effort).
  await stampWithdrawalSnapshot(entryIds, cart.show_id);

  const overflowRefundDecision = decideCartOverflowRefund({
    paymentIntentId,
    sessionAmountTotalCents: freshTotalCents,
    paidLineIds,
    noServiceLineIds,
    lineAmountsById,
  });
  const paidOrderAmountCents =
    overflowRefundDecision.paidAmountCents ??
    paidLineIds.reduce((sum, id) => sum + (lineAmountsById.get(id) ?? 0), 0);
  const paidEntrySubtotalCents = paidLineIds.reduce(
    (sum, id) => sum + (lineAmountsById.get(id) ?? 0),
    0
  );

  if (noServiceLineIds.length > 0) {
    console.error(
      `Cart ${cartId} paid (${paymentIntentId ?? 'no intent'}) with ` +
        `${entryIds.length}/${cart.items.length} paid entries, ` +
        `${waitlistedLines.length} waitlisted, ${deniedLines.length} denied, ` +
        `${failedLines.length} failed`
    );
    await alertAdmin(
      'Paid cart had overflow lines',
      `<p>Cart <code>${cartId}</code> was PAID (payment intent
       <code>${paymentIntentId ?? 'unknown'}</code>) and the server capacity gate
       created ${entryIds.length} paid entries, ${waitlistedLines.length} waitlist rows,
       and ${deniedLines.length} denied lines. Failed no-service lines:
       ${failedLines.length}.</p>
       <p>The webhook will auto-refund the denied/waitlisted/no-service share when
       it can derive the amount.</p>`,
      { source: 'stripe-webhook', dedupeKey: `cart-overflow-${session.id}` }
    );
  }

  console.log(`Created ${entryIds.length} entries from cart ${cartId}`);

  // Create stripe_orders record
  const { error: orderError } = await supabase.from('stripe_orders').insert({
    customer_id: stripeCustomer?.id || null,
    stripe_payment_intent_id: paymentIntentId,
    stripe_checkout_session_id: session.id,
    // Record only the paid-entry service amount. Denied/waitlisted/no-service
    // cart lines are explicit metadata and never masquerade as paid entry_ids.
    amount_cents: paidOrderAmountCents,
    currency: session.currency || 'usd',
    status: 'succeeded',
    order_type: 'entry',
    metadata: {
      cart_id: cartId,
      entry_count: entryIds.length,
      paid_entry_count: entryIds.length,
      collected_amount_cents: freshTotalCents ?? 0,
      paid_amount_cents: paidOrderAmountCents,
      paid_entry_subtotal_cents: paidEntrySubtotalCents,
      overflow_refund: serializeCartOverflowRefundDecision(overflowRefundDecision),
      waitlisted_cart_item_ids: waitlistedLines.map(line => line.cartItemId),
      waitlist_entry_ids: waitlistedLines
        .map(line => line.waitlistEntryId)
        .filter((id): id is string => Boolean(id)),
      denied_cart_item_ids: deniedLines.map(line => line.cartItemId),
      failed_cart_item_ids: failedLines.map(line => line.cartItemId),
    },
    show_id: cart.show_id,
    entry_ids: entryIds,
    paid_at: new Date().toISOString(),
  });

  if (orderError && orderError.code === '23505') {
    // unique_violation on the stripe_checkout_session_id index. We only reach
    // this line AFTER winning the cart-claim latch and inserting a fresh entry
    // set (entryIds) — genuine re-deliveries short-circuit earlier at the cart
    // claim. So a conflicting order row already exists for this session, and
    // the ONLY benign explanation is a network retry of THIS invocation's own
    // insert (silent success, error surfaced to the client): in that case the
    // existing row's entry_ids equal the set we just built. Any other case
    // means a second entry set was created for one payment — duplicate entries
    // and payout drift — which must alert, not be suppressed.
    const { data: existingOrder } = await supabase
      .from('stripe_orders')
      .select('entry_ids')
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle();
    const existingEntryIds = ((existingOrder?.entry_ids as string[] | null) ?? []).slice().sort();
    const sortedEntryIds = entryIds.slice().sort();
    const sameEntrySet =
      existingEntryIds.length === sortedEntryIds.length &&
      existingEntryIds.every((id, i) => id === sortedEntryIds[i]);

    if (sameEntrySet) {
      console.log(
        `stripe_orders row already recorded for session ${session.id} with matching entries (idempotent retry)`
      );
    } else {
      console.error('Duplicate stripe_orders session with mismatched entry set:', orderError);
      await alertAdmin(
        'Duplicate Stripe order — possible duplicate entries',
        `<p>A <code>stripe_orders</code> row already exists for Checkout Session
         <code>${session.id}</code>, but this webhook run created a different entry
         set:</p>
         <p>existing: <code>${existingEntryIds.join(', ') || '(none)'}</code><br/>
         this run: <code>${sortedEntryIds.join(', ') || '(none)'}</code></p>
         <p>This likely means duplicate entries were created for a single payment.
         Reconcile: remove the extra entries created by this run and verify payout
         math (payment intent <code>${paymentIntentId ?? 'unknown'}</code>).</p>`,
        { source: 'stripe-webhook', dedupeKey: `duplicate-stripe-order-${session.id}` }
      );
      // Do NOT fall through to the success log + confirmation email: the order
      // insert failed and these duplicate entries are slated for removal.
      // Emailing the exhibitor would confirm entries that the alert says to
      // delete, and logging "created order" would be false.
      return;
    }
  } else if (orderError) {
    // Entries exist and the exhibitor is fine, but the order row drives the
    // payment-history surfaces and reconciliation — losing it silently makes
    // the charge invisible to every dashboard.
    console.error('Error creating stripe_orders record:', orderError);
    await alertAdmin(
      'Entry payment recorded without a stripe_orders row',
      `<p>Entries for cart <code>${cartId}</code> were created and the exhibitor is
       unaffected, but inserting the <code>stripe_orders</code> record failed:</p>
       <pre>${orderError.message}</pre>
       <p>Recovery: insert the order row manually (payment intent
       <code>${paymentIntentId ?? 'unknown'}</code>, session <code>${session.id}</code>)
       so payment history and reconciliation stay complete.</p>`,
      { source: 'stripe-webhook', dedupeKey: `order-insert-failed-${session.id}` }
    );
  }

  if (noServiceLineIds.length > 0) {
    await issueCartOverflowAutoRefund({
      session,
      paymentIntentId,
      decision: overflowRefundDecision,
      invalidCartItemIds: noServiceLineIds,
      waitlistedCartItemIds: waitlistedLines.map(line => line.cartItemId),
      deniedCartItemIds: deniedLines.map(line => line.cartItemId),
      failedCartItemIds: failedLines.map(line => line.cartItemId),
    });
  }

  console.log(`Entry payment completed for cart ${cartId}, created order`);

  // Send confirmation email. Pass authoritative totals — cart snapshot totals
  // are owner-writable and must not appear on a payment receipt.
  await sendEntryConfirmationEmail(cart, entryIds, session, {
    subtotalCents: paidEntrySubtotalCents,
    platformFeeCents: Math.max(0, paidOrderAmountCents - paidEntrySubtotalCents),
    totalCents: paidOrderAmountCents,
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
       <p>Recovery: verify the payment in Stripe and refund it, or stamp the entries
       manually.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-no-record-${session.id}` }
    );
    await issueEntryPaymentAutoRefund({
      session,
      paymentIntentId,
      amountCents: freshAmountTotalCents,
      reason: 'no_link_record',
      invalidEntryIds: [],
      linkId: null,
    });
    return;
  }

  const entryIds = (link.entry_ids as string[] | null) ?? [];
  const { data: entriesData, error: entriesError } = await supabase
    .from('entries')
    .select('id, payment_status, entry_status, stripe_payment_intent_id')
    .in('id', entryIds);
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

  const result = reconcileEntryPaymentRequest({
    linkStatus: link.status,
    sessionPaymentStatus: freshSession.payment_status ?? null,
    expectedEntryIds: entryIds,
    entries: (entriesData ?? []) as {
      id: string;
      payment_status: string | null;
      entry_status: string | null;
      stripe_payment_intent_id: string | null;
    }[],
    paymentIntentId,
  });

  if (result.action === 'skip') {
    console.log(
      `Payment link ${session.id} skipped (${result.skipReason}; link status: ${link.status}, payment_status: ${freshSession.payment_status})`
    );
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
       <p>The webhook will auto-refund the invalid portion after recording payment history.</p>`,
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
       <p>The webhook will auto-refund the invalid portion after recording payment history.</p>`,
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
    if (patch.entry_status) update.entry_status = patch.entry_status;
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
  }

  // Freeze the withdrawal policy these entries were paid under (best-effort).
  await stampWithdrawalSnapshot(updatedEntryIds, link.show_id as string | null);

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

  const hasPotentialInvalidEntries =
    result.missingEntryIds.length > 0 ||
    result.inactiveEntryIds.length > 0 ||
    result.alreadyPaidEntryIds.length > 0 ||
    noOpPatchIds.length > 0;
  const entryFeesById = hasPotentialInvalidEntries
    ? await loadEntryPaymentLineItemFees(session.id)
    : new Map<string, number>();
  const updateOutcome = reconcileEntryPaymentUpdateOutcome({
    plannedPatchIds,
    updatedEntryIds,
    rereadNoOpEntries,
    initialMissingEntryIds: result.missingEntryIds,
    initialInactiveEntryIds: result.inactiveEntryIds,
    initialAlreadyPaidEntryIds: result.alreadyPaidEntryIds,
    initialSameIntentPaidEntryIds: result.sameIntentPaidEntryIds,
    paymentIntentId,
    sessionAmountTotalCents: freshAmountTotalCents,
    entryFeesById,
  });

  // Payment history. Idempotent via the UNIQUE stripe_payment_intent_id /
  // stripe_checkout_session_id; a benign retry hits 23505 and is ignored.
  const paidIds = updateOutcome.paidEntryIds;
  // Close the link (idempotency latch) after reconciliation. Same-intent paid
  // rows make concurrent Stripe deliveries idempotent without closing the retry
  // path before entries are stamped. Expired promotion claims are allowed to
  // revive only when at least one entry was actually stamped paid.
  const shouldCloseLink =
    link.status === 'open' || (link.status === 'expired' && paidIds.length > 0);
  if (shouldCloseLink) {
    const linkCloseStatus = link.status === 'expired' ? 'expired' : 'open';
    const { data: closedLinks, error: linkCloseError } = await supabase
      .from('entry_payment_links')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', link.id)
      .eq('status', linkCloseStatus)
      .select('id');

    if (linkCloseError) {
      console.error(`Payment link ${session.id} could not be closed:`, linkCloseError);
      await alertAdmin(
        'Payment link paid but the link could not be latched',
        `<p>Session <code>${session.id}</code> reconciled entries, but updating
         the <code>entry_payment_links</code> row to <code>paid</code> failed:</p>
         <pre>${linkCloseError.message}</pre>
         <p>Recovery: set the link row to paid after verifying the entry stamps.</p>`,
        { source: 'stripe-webhook', dedupeKey: `payment-link-latch-failed-${session.id}` }
      );
    } else if ((closedLinks ?? []).length === 0) {
      console.log(`Payment link ${session.id} was already closed by another webhook handler`);
    }
  }

  await resolvePaidWaitlistOffers(paidIds, session.id);

  const { error: orderError } = await supabase.from('stripe_orders').insert({
    // customer_id is a UUID FK to stripe_customers(id) — NOT Stripe's cus_… id.
    // A link payer may have no stripe_customers row at all, so leave it null
    // (writing session.customer here threw an invalid-uuid error every time).
    customer_id: null,
    stripe_payment_intent_id: paymentIntentId,
    stripe_checkout_session_id: session.id,
    amount_cents: freshAmountTotalCents ?? 0,
    currency: session.currency || 'usd',
    status: 'succeeded',
    order_type: 'entry',
    metadata: { entry_payment_link_id: link.id, entry_count: paidIds.length },
    show_id: link.show_id,
    entry_ids: paidIds,
    paid_at: new Date().toISOString(),
  });
  if (orderError && orderError.code !== '23505') {
    console.error('Error creating stripe_orders for payment link:', orderError);
    await alertAdmin(
      'Entry payment-link recorded without a stripe_orders row',
      `<p>Entries for session <code>${session.id}</code> were marked paid, but
       inserting the <code>stripe_orders</code> record failed:</p>
       <pre>${orderError.message}</pre>
       <p>Recovery: insert the order row manually (payment intent
       <code>${paymentIntentId ?? 'unknown'}</code>) so payment history stays complete.</p>`,
      { source: 'stripe-webhook', dedupeKey: `payment-link-order-insert-failed-${session.id}` }
    );
  }

  if (updateOutcome.alreadyPaidEntryIds.length > 0) {
    await alertAdmin(
      'Payment link paid for already-paid entries',
      `<p>Session <code>${session.id}</code> paid for entries that were already paid:
       <code>${updateOutcome.alreadyPaidEntryIds.join(', ')}</code> (payment intent
       <code>${paymentIntentId ?? 'unknown'}</code>).</p>
       <p>The webhook will auto-refund the invalid portion; if the exhibitor received
       no new paid entries, it refunds the full charge including platform fee.</p>`,
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

  const invalidEntryIds = updateOutcome.invalidEntryIds;
  if (invalidEntryIds.length > 0) {
    const decision = updateOutcome.refundDecision;

    if (decision.action === 'refund') {
      await issueEntryPaymentAutoRefund({
        session,
        paymentIntentId,
        amountCents: decision.amountCents,
        reason: decision.reason,
        invalidEntryIds,
        linkId: link.id,
      });
    } else if (decision.action === 'needs_manual_amount') {
      await alertAdmin(
        'Payment link auto-refund needs manual amount',
        `<p>Session <code>${session.id}</code> was PAID and has invalid entries
         <code>${invalidEntryIds.join(', ')}</code>, but the webhook could not derive
         fees for: <code>${decision.missingFeeEntryIds.join(', ')}</code>.</p>
         <p>Recovery: refund the invalid portion from Stripe, including the matching
         share of the platform fee.</p>`,
        { source: 'stripe-webhook', dedupeKey: `payment-link-refund-manual-amount-${session.id}` }
      );
    } else if (decision.action === 'cannot_refund') {
      await alertAdmin(
        'Payment link auto-refund could not be created',
        `<p>Session <code>${session.id}</code> was PAID and has invalid entries
         <code>${invalidEntryIds.join(', ')}</code>, but auto-refund could not run:
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

async function resolvePaidWaitlistOffers(entryIds: string[], sessionId: string) {
  if (entryIds.length === 0) return;

  const { error } = await supabase
    .from('waitlist_entries')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .in('promoted_entry_id', entryIds)
    .in('status', ['offered', 'expired']);

  if (error) {
    console.error('Payment link paid but waitlist row could not be resolved:', error);
    await alertAdmin(
      'Payment link paid but waitlist offer stayed open',
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

async function loadEntryPaymentLineItemFees(sessionId: string): Promise<Map<string, number>> {
  try {
    return await loadEntryPaymentLineItemFeesFromStripe(stripe.checkout.sessions, sessionId);
  } catch (err) {
    console.error(`Could not load line items for payment-link session ${sessionId}:`, err);
  }
  return new Map<string, number>();
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
    if (input.reason === 'full_make_whole') {
      const { error: orderUpdateError } = await supabase
        .from('stripe_orders')
        .update({ status: 'refunded', refunded_at: new Date().toISOString() })
        .eq('stripe_checkout_session_id', input.session.id);
      if (orderUpdateError) {
        console.error(
          `CRITICAL: auto-refund ${refund.id} succeeded but stripe_orders update failed:`,
          orderUpdateError
        );
        await alertAdmin(
          'Payment link auto-refund issued but order not marked refunded',
          `<p>Auto-refund <code>${refund.id}</code> succeeded for session
           <code>${input.session.id}</code>, but updating <code>stripe_orders</code>
           failed:</p><pre>${orderUpdateError.message}</pre>`,
          {
            source: 'stripe-webhook',
            dedupeKey: `payment-link-refund-order-update-failed-${refund.id}`,
          }
        );
      }
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

function normalizeCapacityOutcome(data: unknown): OnlinePaidEntryCapacityOutcome | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;

  const candidate = row as {
    outcome?: unknown;
    entry_id?: unknown;
    waitlist_entry_id?: unknown;
  };
  if (
    candidate.outcome !== 'created_entry' &&
    candidate.outcome !== 'waitlisted' &&
    candidate.outcome !== 'denied'
  ) {
    return null;
  }

  return {
    outcome: candidate.outcome,
    entry_id: typeof candidate.entry_id === 'string' ? candidate.entry_id : null,
    waitlist_entry_id:
      typeof candidate.waitlist_entry_id === 'string' ? candidate.waitlist_entry_id : null,
  };
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

    if (input.decision.reason === 'full_make_whole') {
      const { error: orderUpdateError } = await supabase
        .from('stripe_orders')
        .update({ status: 'refunded', refunded_at: new Date().toISOString() })
        .eq('stripe_checkout_session_id', input.session.id);
      if (orderUpdateError) {
        console.error(
          `CRITICAL: cart overflow refund ${refund.id} succeeded but stripe_orders update failed:`,
          orderUpdateError
        );
        await alertAdmin(
          'Cart overflow auto-refund issued but order not marked refunded',
          `<p>Auto-refund <code>${refund.id}</code> succeeded for session
           <code>${input.session.id}</code>, but updating <code>stripe_orders</code>
           failed:</p><pre>${orderUpdateError.message}</pre>`,
          {
            source: 'stripe-webhook',
            dedupeKey: `cart-overflow-refund-order-update-failed-${refund.id}`,
          }
        );
      }
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
  authoritative: { subtotalCents: number; platformFeeCents: number; totalCents: number }
) {
  try {
    // Get exhibitor email and name
    const { data: person } = await supabase
      .from('people')
      .select('email, first_name, last_name')
      .eq('id', cart.exhibitor.person_id)
      .single();

    if (!person?.email) {
      console.error('No email found for exhibitor');
      return;
    }

    // Get show details
    const { data: show } = await supabase
      .from('shows')
      .select('name, start_date, end_date, venue_name, city, state')
      .eq('id', cart.show_id)
      .single();

    if (!show) {
      console.error('Show not found');
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
      return;
    }

    if (!entries || entries.length === 0) {
      console.error('No entries found for confirmation email');
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
      type: 'entry_confirmation',
      to: person.email,
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

    // Call send-email function
    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send confirmation email:', error);
      // MP-13: no stamp on a failed send — the entry stays eligible for the
      // scheduled send-confirmation-email sender's audience query
      // (confirmation_email_sent_at IS NULL / status IN pending,failed).
      return;
    }

    console.log(`Confirmation email sent to ${person.email}`);

    // MP-13: stamp every entry this email covered with the SAME send-state
    // semantics the scheduled sender uses, so its audience query excludes
    // this entry and no second confirmation email is sent. send-email
    // returns { success: true, id } where `id` is the Resend message id;
    // fall back to null if the body is missing/unparseable rather than
    // failing the whole webhook over a non-critical read.
    let messageId: string | null = null;
    try {
      const result = (await response.json()) as { id?: string };
      messageId = result?.id ?? null;
    } catch (parseError) {
      console.error('Could not parse send-email response for message id:', parseError);
    }

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
 * Handle one-time payment completion
 */
async function handleOneTimePaymentCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;

  // Get stripe_customers record
  const { data: stripeCustomer } = await supabase
    .from('stripe_customers')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  // Create stripe_orders record
  const { error: orderError } = await supabase.from('stripe_orders').insert({
    customer_id: stripeCustomer?.id || null,
    stripe_payment_intent_id:
      typeof session.payment_intent === 'string' ? session.payment_intent : null,
    stripe_checkout_session_id: session.id,
    amount_cents: session.amount_total || 0,
    currency: session.currency || 'usd',
    status: 'succeeded',
    order_type: 'payment',
    metadata: session.metadata || {},
    paid_at: new Date().toISOString(),
  });

  if (orderError) {
    console.error('Error creating stripe_orders record:', orderError);
  }

  console.log(`One-time payment completed: ${session.id}`);
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

      // Update to no subscription state
      await supabase.from('stripe_subscriptions').upsert(
        {
          customer_id: stripeCustomer.id,
          stripe_subscription_id: `none_${stripeCustomerId}`,
          status: 'none',
        },
        {
          onConflict: 'customer_id',
        }
      );

      // Reset exhibitor profile subscription
      await supabase
        .from('exhibitor_profiles')
        .update({
          subscription_tier: 'free',
          subscription_expires_at: null,
        })
        .eq('person_id', stripeCustomer.person_id);

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
