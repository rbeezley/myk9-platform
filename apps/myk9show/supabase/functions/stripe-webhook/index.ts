import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { buildEntryInsert, extractPaymentIntentId } from '../_shared/entryFromCartItem.ts';
import { accountToRowPatch } from '../_shared/connectAccountMapper.ts';
import { parsePremiumPriceIds, priceIdToTier } from '../_shared/premiumPrices.ts';
import { sessionMatchesCart } from '../_shared/sessionCartGuard.ts';
import { alertAdmin } from '../_shared/alertAdmin.ts';
import { authoritativeEntryFeeCents } from '../_shared/authoritativeFee.ts';
import { calculatePlatformFeeCents, resolvePlatformFeePercent } from '../_shared/platformFee.ts';

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

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async req => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('No signature found', { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await verifyWithEitherSecret(body, signature);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Webhook signature verification failed: ${errorMessage}`);
      return new Response(`Webhook signature verification failed: ${errorMessage}`, {
        status: 400,
      });
    }

    // Process event asynchronously. Stripe already has its 200, so an
    // uncaught throw in any handler (e.g. a transient failure syncing a
    // subscription) would otherwise vanish with no retry and no signal —
    // the catch-all alert is the floor under every handler (round-13).
    EdgeRuntime.waitUntil(
      handleEvent(event).catch(async err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`CRITICAL: unhandled error processing ${event.type} (${event.id}):`, err);
        await alertAdmin(
          `Webhook handler crashed: ${event.type}`,
          `<p>Processing event <code>${event.id}</code> (<code>${event.type}</code>) threw
           after Stripe already received its 200 — Stripe will NOT retry.</p>
           <pre>${message}</pre>
           <p>Recovery: open the event in the Stripe dashboard (Developers → Events),
           inspect the object, and apply the corresponding state manually (the runbook's
           Manual reconciliation section has the service-role SQL wrapper).</p>`
        );
      })
    );

    return Response.json({ received: true });
  } catch (error: unknown) {
    console.error('Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errorMessage }, { status: 500 });
  }
});

// Platform-scoped and Connect-scoped destinations sign with different secrets;
// try the platform secret first, then the Connect secret when configured.
async function verifyWithEitherSecret(body: string, signature: string): Promise<Stripe.Event> {
  try {
    return await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
  } catch (platformError) {
    if (!stripeConnectWebhookSecret) throw platformError;
    // Log the platform-secret failure so a misconfigured PRIMARY secret isn't
    // masked by the Connect-secret error when both verifications fail.
    console.log(
      `Platform-secret verification failed (${platformError instanceof Error ? platformError.message : 'unknown'}); trying Connect secret`
    );
    return await stripe.webhooks.constructEventAsync(body, signature, stripeConnectWebhookSecret);
  }
}

async function handleEvent(event: Stripe.Event) {
  console.log(`Processing event: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
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
      await handleChargeRefunded(event.data.object as Stripe.Charge);
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
     page. The refund function ignores dead refunds, so re-issuing is safe.</p>`
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
     <p>Respond in the Stripe dashboard: Payments → Disputes.</p>`
  );
}

/**
 * Reconciliation backstop for refunds issued OUTSIDE stripe-refund-entry
 * (e.g. the Stripe dashboard). A payment intent can cover a whole cart, so a
 * dashboard refund can't be attributed to a single entry — mark the order and
 * log loudly for manual entry-level reconciliation. Refunds from
 * stripe-refund-entry carry entry_id metadata and were already recorded.
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const refunds = charge.refunds?.data ?? [];
  // Skip only when EVERY refund came from stripe-refund-entry (.some would let
  // an app refund mask a later dashboard refund on the same charge — review
  // finding #3). Mixed charges fall through to the RECONCILE log below.
  const allFromRefundEntry = refunds.length > 0 && refunds.every(r => r.metadata?.entry_id);
  if (allFromRefundEntry) {
    console.log(`charge.refunded for ${charge.id} originated from stripe-refund-entry — already recorded`);
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
    console.log(`charge.refunded for ${paymentIntentId} matched no order — ignoring`);
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
     this.</p>`
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
    .eq('stripe_account_id', accountId);

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
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const checkoutType = session.metadata?.type;
  console.log(`Checkout completed: ${session.id}, type: ${checkoutType}`);

  if (checkoutType === 'entry') {
    await handleEntryPaymentCompleted(session);
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
       entries manually if the exhibitor confirms what they ordered.</p>`
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
       again normally.</p>`
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
  const freshTotalCents = freshSession.amount_total ?? null;

  const { data: showFees, error: showFeesError } = await supabase
    .from('shows')
    .select('pre_entry_fee, day_of_show_fee, start_date')
    .eq('id', cart.show_id)
    .single();

  const classIds = [...new Set(cart.items.map((i: { class_id: string }) => i.class_id))];
  const { data: classRows, error: classesError } = await supabase
    .from('classes')
    .select('id, trial_id, entry_fee')
    .in('id', classIds);

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
       re-send the event from the Stripe dashboard (Developers → Events → Resend).</p>`
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
  const authoritativeTotal =
    authoritativeSubtotal +
    calculatePlatformFeeCents(
      authoritativeSubtotal,
      resolvePlatformFeePercent(Deno.env.get('PLATFORM_FEE_PERCENT'))
    );
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
       ask the exhibitor to check out again.</p>`
    );
    return;
  }

  // Idempotency latch: atomically claim the cart by flipping active → submitted.
  // Stripe gets a 200 before this handler runs (EdgeRuntime.waitUntil), so a
  // re-delivered event would otherwise create duplicate paid entries — which
  // the payout cron would then pay the club for twice.
  const { data: claimed, error: claimError } = await supabase
    .from('entry_carts')
    .update({ status: 'submitted' })
    .eq('id', cartId)
    .eq('status', 'active')
    // Belt-and-suspenders for the guard's expiry check above: closes the
    // seconds-wide TOCTOU between the cart read and this claim. NULL expiry
    // (legacy rows) is tolerated, matching sessionMatchesCart.
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .select('id');

  if (claimError) {
    // Stripe already got its 200 (waitUntil), so this event will NOT retry:
    // the exhibitor paid but no entries exist. Same severity as the
    // entries-shortfall below — email, don't just log.
    console.error(`CRITICAL: failed to claim cart ${cartId} after payment:`, claimError);
    await alertAdmin(
      'Paid cart could not be claimed — entries NOT created',
      `<p>Checkout session <code>${session.id}</code> was PAID, but claiming cart
       <code>${cartId}</code> failed with a database error, so no entries were created
       and Stripe will not retry the event.</p>
       <pre>${claimError.message}</pre>
       <p>Recovery: verify the payment in the Stripe dashboard, then create the
       entries manually from the cart items (or refund the payment).</p>`
    );
    return;
  }
  if (!claimed || claimed.length === 0) {
    // Already-claimed cart: benign for a RE-DELIVERED event (same payment
    // intent that created the entries), but a SECOND paid session on the same
    // cart is a real duplicate CHARGE with nothing to show for it (Codex P1).
    // Distinguish them by whether this intent created any entries.
    const dupIntentId = extractPaymentIntentId(session.payment_intent);
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
           fix.</p>`
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
  for (const item of cart.items) {
    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .insert(
        buildEntryInsert(
          { ...item, entry_fee_cents: authoritativeByClass.get(item.class_id) ?? item.entry_fee_cents },
          paymentIntentId,
          new Date().toISOString(),
          {
            showId: cart.show_id,
            trialId: trialByClass.get(item.class_id) ?? null,
          }
        )
      )
      .select('id')
      .single();

    if (entryError) {
      console.error(`Error creating entry for cart item ${item.id}:`, entryError);
      continue;
    }

    if (entry) {
      entryIds.push(entry.id);
    }
  }

  if (entryIds.length !== cart.items.length) {
    // Stripe already received its 200, so it will NOT retry this event: the
    // exhibitor has paid for entries that do not exist. Surface loudly.
    console.error(
      `CRITICAL: cart ${cartId} paid (${paymentIntentId ?? 'no intent'}) but only ` +
        `${entryIds.length}/${cart.items.length} entries were created — manual reconciliation required`
    );
    await alertAdmin(
      'Paid entries missing — manual reconciliation needed',
      `<p>Cart <code>${cartId}</code> was PAID (payment intent
       <code>${paymentIntentId ?? 'unknown'}</code>), but only
       ${entryIds.length} of ${cart.items.length} entries were created. Stripe will
       not retry this event.</p>
       <p>Recovery: compare the cart's items against the show's entries and create
       the missing ones manually, or refund the difference from the Stripe
       dashboard (Payments → search the intent id → Refund).</p>`
    );
  }

  console.log(`Created ${entryIds.length} entries from cart ${cartId}`);

  // Create stripe_orders record
  const { error: orderError } = await supabase.from('stripe_orders').insert({
    customer_id: stripeCustomer?.id || null,
    stripe_payment_intent_id: paymentIntentId,
    stripe_checkout_session_id: session.id,
    // freshTotalCents was verified against both the Stripe API and
    // authoritative pricing above — use it as the source of record.
    // cart.total_cents is owner-writable and must not drive payment history.
    amount_cents: freshTotalCents ?? 0,
    currency: session.currency || 'usd',
    status: 'succeeded',
    order_type: 'entry',
    metadata: {
      cart_id: cartId,
      entry_count: entryIds.length,
    },
    show_id: cart.show_id,
    entry_ids: entryIds,
    paid_at: new Date().toISOString(),
  });

  if (orderError) {
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
       so payment history and reconciliation stay complete.</p>`
    );
  }

  console.log(`Entry payment completed for cart ${cartId}, created order`);

  // Send confirmation email. Pass authoritative totals — cart snapshot totals
  // are owner-writable and must not appear on a payment receipt.
  await sendEntryConfirmationEmail(cart, entryIds, session, {
    subtotalCents: authoritativeSubtotal,
    platformFeeCents: authoritativeTotal - authoritativeSubtotal,
    totalCents: authoritativeTotal,
  });
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
    } else {
      console.log(`Confirmation email sent to ${person.email}`);
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

  // Sync subscription from Stripe
  await syncSubscriptionFromStripe(customerId);
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

  await syncSubscriptionFromStripe(customerId);
}

/**
 * Handle successful invoice payment (subscription renewal)
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  console.log(`Invoice paid for customer: ${customerId}`);
  await syncSubscriptionFromStripe(customerId);
}

/**
 * Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  console.log(`Invoice payment failed for customer: ${customerId}`);
  await syncSubscriptionFromStripe(customerId);
}

/**
 * Sync subscription data from Stripe to database
 * Updates both stripe_subscriptions and exhibitor_profiles
 */
async function syncSubscriptionFromStripe(stripeCustomerId: string) {
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

    // Fetch subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

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
