import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { calculatePlatformFeeCents, resolvePlatformFeePercent } from '../_shared/platformFee.ts';
import { authoritativeEntryFeeCents } from '../_shared/authoritativeFee.ts';
import { buildEntryPaymentLinkSession } from '../_shared/entryPaymentLink.ts';
import { isStripeLiveMode } from '../_shared/stripeMode.ts';
import {
  resolveWithdrawalPolicy,
  describeWithdrawalPolicyText,
  type ShowWithdrawalColumns,
  type ClubWithdrawalColumns,
} from '../_shared/withdrawalPolicy.ts';
import { INACTIVE_ENTRY_STATUSES } from '../_shared/entryPaymentReconcile.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const cronSecret = Deno.env.get('CRON_SECRET');

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !stripeSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'myK9Show', version: '1.0.0' },
});
const stripeLivemode = isStripeLiveMode(stripeSecret);

// Stripe Checkout Sessions live at most 24h (min 30 min). A secretary's "pay
// within N days" intent is tracked by the entry's own deadline, NOT the link —
// an expired link is re-requested (Task 4 Step 5). 23h stays safely under the
// cap (an exact 24h computed before the network hop can be rejected, same
// lesson as the 30-min floor in stripe-checkout).
const LINK_LIFETIME_SECONDS = 23 * 60 * 60;

const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-function-secret',
  };
}

let _corsHeaders: Record<string, string> = getCorsHeaders(null);

function corsResponse(body: string | object | null, status = 200) {
  if (status === 204) {
    return new Response(null, { status, headers: _corsHeaders });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ..._corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function secretMatches(provided: string | null): Promise<boolean> {
  if (!provided || !cronSecret) return false;

  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(cronSecret)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

/** Prevent open-redirect: success/cancel must point at one of our origins. */
function isAllowedRedirectUrl(url: string): boolean {
  try {
    return ALLOWED_ORIGINS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

interface PaymentLinkRequest {
  entry_ids: string[];
  success_url: string;
  cancel_url: string;
}

interface EntryRow {
  id: string;
  payment_status: string | null;
  entry_status: string | null;
  dog: { call_name: string | null } | null;
  class: { name: string | null; entry_fee: number | string | null } | null;
  show: {
    id: string;
    club_id: string | null;
    name: string | null;
    pre_entry_fee: number | string | null;
    day_of_show_fee: number | string | null;
    start_date: string | null;
  } | null;
}

interface OfferedWaitlistRow {
  promoted_entry_id: string | null;
}

Deno.serve(async req => {
  _corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    if (req.method === 'OPTIONS') return corsResponse({}, 204);
    if (req.method !== 'POST') return corsResponse({ error: 'Method not allowed' }, 405);

    const isInternalCall = await secretMatches(req.headers.get('x-function-secret'));

    // Authenticate the caller (the secretary/admin issuing the link). Cron may
    // call with x-function-secret after it creates a waitlist promotion.
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (!isInternalCall) {
      if (!authHeader) return corsResponse({ error: 'Missing Authorization header' }, 401);
      const token = authHeader.replace('Bearer ', '');
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (authError || !user) {
        console.error('Authentication failed:', authError);
        return corsResponse({ error: 'Authentication failed' }, 401);
      }
      userId = user.id;
    }

    const body: PaymentLinkRequest = await req.json();
    const { entry_ids, success_url, cancel_url } = body;
    if (!Array.isArray(entry_ids) || entry_ids.length === 0) {
      return corsResponse({ error: 'Missing required parameter: entry_ids' }, 400);
    }
    if (!success_url || !cancel_url) {
      return corsResponse({ error: 'Missing required parameters: success_url, cancel_url' }, 400);
    }
    // The link is shareable to an unauthenticated payer — the redirect targets
    // must be public-safe routes (Task 3a). Open-redirect guard here.
    if (!isAllowedRedirectUrl(success_url) || !isAllowedRedirectUrl(cancel_url)) {
      return corsResponse({ error: 'Invalid redirect URL' }, 400);
    }

    // Load the entries with everything needed to price authoritatively.
    const { data: entriesData, error: entriesError } = await supabase
      .from('entries')
      .select(
        `
        id,
        payment_status,
        entry_status,
        dog:dog_id(call_name),
        class:class_id(name, entry_fee),
        show:show_id(id, club_id, name, pre_entry_fee, day_of_show_fee, start_date)
      `
      )
      .in('id', entry_ids);

    if (entriesError) {
      console.error('Entry lookup failed:', entriesError);
      return corsResponse({ error: 'Could not load entries' }, 500);
    }
    const entries = (entriesData ?? []) as unknown as EntryRow[];
    if (entries.length !== entry_ids.length) {
      return corsResponse({ error: 'One or more entries were not found' }, 404);
    }

    // One link, one show — keeps authz + the club payout account unambiguous.
    const showIds = new Set(entries.map(e => e.show?.id).filter(Boolean));
    if (showIds.size !== 1 || !entries[0].show) {
      return corsResponse({ error: 'All entries must belong to the same show' }, 400);
    }
    const show = entries[0].show;

    if (!isInternalCall) {
      // Authorize AS THE CALLER via the canonical SQL predicates (mirror
      // stripe-refund-entry): show-scoped secretary, the club's admin, or site
      // admin. No club → no club-admin path (is_club_admin(NULL) = any club).
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const [secretaryRes, clubAdminRes, siteAdminRes] = await Promise.all([
        userClient.rpc('is_show_secretary', { check_show_id: show.id }),
        show.club_id
          ? userClient.rpc('is_club_admin', { check_club_id: show.club_id })
          : Promise.resolve({ data: false }),
        userClient.rpc('is_site_admin'),
      ]);
      const authorized =
        secretaryRes.data === true || clubAdminRes.data === true || siteAdminRes.data === true;
      if (!authorized) {
        // An exhibitor may claim only their own active promotion. This is a
        // deliberately narrow fallback, not generic entry-owner checkout:
        // every requested entry must match an unexpired offered row owned by
        // the caller's exhibitor profile.
        const { data: exhibitorProfile, error: exhibitorError } = await supabase
          .from('exhibitor_profiles')
          .select('id')
          .eq('auth_user_id', userId)
          .maybeSingle();
        if (exhibitorError) {
          console.error('Could not load exhibitor profile for waitlist payment:', exhibitorError);
          return corsResponse({ error: 'Could not verify this waitlist offer' }, 500);
        }
        if (!exhibitorProfile) {
          return corsResponse({ error: 'Not authorized to request payment for this show' }, 403);
        }

        const { data: activeOffers, error: offersError } = await supabase
          .from('waitlist_entries')
          .select('promoted_entry_id')
          .in('promoted_entry_id', entry_ids)
          .eq('exhibitor_id', exhibitorProfile.id)
          .eq('status', 'offered')
          .gt('offer_expires_at', new Date().toISOString());
        if (offersError) {
          console.error('Could not load active waitlist offers:', offersError);
          return corsResponse({ error: 'Could not verify this waitlist offer' }, 500);
        }

        const activeOfferEntryIds = new Set(
          ((activeOffers ?? []) as OfferedWaitlistRow[])
            .map(offer => offer.promoted_entry_id)
            .filter((entryId): entryId is string => Boolean(entryId))
        );
        if (activeOfferEntryIds.size !== entry_ids.length) {
          return corsResponse({
            error: 'Not authorized to request payment for these waitlist offers',
          }, 403);
        }
      }
    }

    // The club must be able to receive online entry fees (the charge lands in
    // the platform account and is transferred out by cron-process-payouts; no
    // payout account = the money would be stuck).
    if (!show.club_id) {
      return corsResponse({ error: 'This show is not linked to a club payment account.' }, 403);
    }
    const { data: connect } = await supabase
      .from('club_stripe_accounts')
      .select('payouts_enabled')
      .eq('club_id', show.club_id)
      .eq('livemode', stripeLivemode)
      .maybeSingle();
    if (connect?.payouts_enabled !== true) {
      return corsResponse(
        { error: "This club's payment account is not set up to receive online entry fees." },
        403
      );
    }

    // Only unpaid entries are requestable. Both channels converge on
    // payment_status='pending' (mail-in sets it; waitlist promotion takes the
    // column default), so this one predicate covers both (Task 1 finding).
    const alreadyPaid = entries.filter(e => e.payment_status !== 'pending');
    if (alreadyPaid.length > 0) {
      return corsResponse(
        { error: 'One or more entries are already paid or not awaiting payment' },
        422
      );
    }

    // Don't collect money for an entry that isn't in the show (withdrawn,
    // scratched, rejected, expired) even if its payment is still pending.
    const inactive = entries.filter(e => INACTIVE_ENTRY_STATUSES.has(e.entry_status ?? ''));
    if (inactive.length > 0) {
      return corsResponse(
        { error: 'One or more entries are withdrawn, scratched, or no longer active' },
        422
      );
    }

    // Authoritative fee percent: platform_settings row, else env, else default.
    const { data: feeRow } = await supabase
      .from('platform_settings')
      .select('platform_fee_percent')
      .eq('id', true)
      .maybeSingle();
    const platformFeePercent =
      feeRow && feeRow.platform_fee_percent != null
        ? resolvePlatformFeePercent(String(feeRow.platform_fee_percent))
        : resolvePlatformFeePercent(Deno.env.get('PLATFORM_FEE_PERCENT'));

    // Recompute each fee from the authority chain — never trust a client value.
    const nowIso = new Date().toISOString();
    const linkEntries = entries.map(e => ({
      entryId: e.id,
      authoritativeFeeCents: authoritativeEntryFeeCents({
        showPreEntryFee: show.pre_entry_fee,
        showDayOfShowFee: show.day_of_show_fee,
        showStartDate: show.start_date,
        classEntryFee: e.class?.entry_fee ?? null,
        nowIso,
      }),
      dogName: e.dog?.call_name || 'Dog',
      className: e.class?.name || 'Class',
      showName: show.name || 'Show Entry',
    }));

    // Re-request safety: expire any prior OPEN links covering these entries so
    // two live links can't both be paid (full handling in Task 3.5 Step 2).
    const { data: priorLinks, error: priorLinksError } = await supabase
      .from('entry_payment_links')
      .select('id, stripe_checkout_session_id')
      .eq('status', 'open')
      .overlaps('entry_ids', entry_ids);
    if (priorLinksError) {
      console.error('Could not load existing payment links:', priorLinksError);
      return corsResponse(
        { error: 'Could not check an existing payment link. Please try again.' },
        503
      );
    }
    for (const prior of priorLinks ?? []) {
      // A prior link that was JUST paid (webhook not yet processed) still reads
      // 'open'. Inspect first: only payment_status='paid' blocks re-request.
      // A completed-but-unpaid async session should be closed locally so the
      // secretary can issue a fresh card-only link.
      let priorStatus: string | null = null;
      let priorPaymentStatus: string | null = null;
      try {
        const priorSession = await stripe.checkout.sessions.retrieve(
          prior.stripe_checkout_session_id
        );
        priorStatus = priorSession.status ?? null;
        priorPaymentStatus = priorSession.payment_status ?? null;
      } catch (err) {
        console.log(`Could not inspect prior session ${prior.stripe_checkout_session_id}:`, err);
        return corsResponse(
          { error: 'Could not verify an existing payment link. Please try again.' },
          503
        );
      }
      const justCompleted =
        'A payment for one of these entries just completed — refresh to see it before requesting again.';
      if (priorPaymentStatus === 'paid') {
        return corsResponse({ error: justCompleted }, 409);
      }
      if (priorStatus && priorStatus !== 'open') {
        await supabase
          .from('entry_payment_links')
          .update({ status: 'expired', updated_at: nowIso })
          .eq('id', prior.id);
        continue;
      }
      if (priorStatus !== 'open') {
        return corsResponse(
          { error: 'Could not verify an existing payment link. Please try again.' },
          503
        );
      }
      try {
        await stripe.checkout.sessions.expire(prior.stripe_checkout_session_id);
      } catch (err) {
        // expire() can fail because the session was paid in the gap between our
        // retrieve and now. Re-check payment_status: if paid, abort and let the
        // webhook reconcile the real payment; if it completed unpaid, close the
        // app-side link so this re-request can proceed.
        let recheckStatus: string | null = null;
        let recheckPaymentStatus: string | null = null;
        try {
          const recheck = await stripe.checkout.sessions.retrieve(prior.stripe_checkout_session_id);
          recheckStatus = recheck.status ?? null;
          recheckPaymentStatus = recheck.payment_status ?? null;
        } catch (recheckError) {
          console.log(
            `Could not recheck prior session ${prior.stripe_checkout_session_id}:`,
            recheckError
          );
          return corsResponse(
            { error: 'Could not safely replace an existing payment link. Please try again.' },
            503
          );
        }
        if (recheckPaymentStatus === 'paid') {
          return corsResponse({ error: justCompleted }, 409);
        }
        if (recheckStatus && recheckStatus !== 'open') {
          await supabase
            .from('entry_payment_links')
            .update({ status: 'expired', updated_at: nowIso })
            .eq('id', prior.id);
          continue;
        }
        console.log(
          `Could not expire prior session ${prior.stripe_checkout_session_id} — refusing replacement:`,
          err
        );
        return corsResponse(
          { error: 'Could not safely replace an existing payment link. Please try again.' },
          503
        );
      }
      // Only NOW that Stripe has confirmed the session is expired is it safe to
      // mark the link expired — the webhook will never see a paid-but-expired row.
      await supabase
        .from('entry_payment_links')
        .update({ status: 'expired', updated_at: nowIso })
        .eq('id', prior.id);
    }

    // Best-effort: resolve the show's effective withdrawal policy so the PAYER
    // sees it on the Stripe page (custom_text) — the secretary dialog disclosure
    // never reaches the mail-in/waitlist payer. A failure here (incl. columns
    // not yet migrated) must not block link generation, so it's try/caught.
    let withdrawalPolicyText: string | undefined;
    try {
      const { data: policyRow } = await supabase
        .from('shows')
        .select(
          'withdrawal_cutoff_date, withdrawal_retention_type, withdrawal_retention_value, withdrawal_policy_notes, clubs(default_withdrawal_cutoff_date, default_withdrawal_retention_type, default_withdrawal_retention_value, default_withdrawal_policy_notes)'
        )
        .eq('id', show.id)
        .single();
      if (policyRow) {
        const rawClub = (policyRow as Record<string, unknown>).clubs;
        const club = (Array.isArray(rawClub) ? rawClub[0] : rawClub) ?? null;
        withdrawalPolicyText = describeWithdrawalPolicyText(
          resolveWithdrawalPolicy(
            policyRow as ShowWithdrawalColumns,
            club as ClubWithdrawalColumns | null
          )
        );
      }
    } catch (err) {
      console.log('Could not resolve withdrawal policy for custom_text — skipping disclosure:', err);
    }

    const sessionParams = buildEntryPaymentLinkSession({
      entries: linkEntries,
      platformFeePercent,
      successUrl: success_url,
      cancelUrl: cancel_url,
      expiresAtEpoch: Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS,
      ...(withdrawalPolicyText ? { withdrawalPolicyText } : {}),
    });

    const session = await stripe.checkout.sessions.create(
      sessionParams as unknown as Stripe.Checkout.SessionCreateParams
    );

    const amountCents = linkEntries.reduce((s, e) => s + e.authoritativeFeeCents, 0);
    const { error: insertError } = await supabase.from('entry_payment_links').insert({
      show_id: show.id,
      entry_ids,
      stripe_checkout_session_id: session.id,
      status: 'open',
      amount_cents: amountCents,
      created_by: userId,
    });
    if (insertError) {
      // Without the persisted row the webhook can still reconcile from session
      // metadata, but re-request expiry + status visibility break. Expire the
      // orphaned session and fail rather than hand out an untracked link.
      console.error('Failed to persist entry_payment_links row — expiring session:', insertError);
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireErr) {
        console.error(`CRITICAL: could not expire orphaned session ${session.id}:`, expireErr);
      }
      return corsResponse({ error: 'Could not create the payment link. Please try again.' }, 500);
    }

    console.log(
      `Created entry payment link ${session.id} for ${entry_ids.length} entr${
        entry_ids.length === 1 ? 'y' : 'ies'
      } (show ${show.id}) by ${userId ?? 'cron'}`
    );
    // Return the exact breakdown so the dialog can disclose entry fee + platform
    // fee = total (fee-on-top) without re-deriving fee math on the client.
    const platformFeeCents = calculatePlatformFeeCents(amountCents, platformFeePercent);
    return corsResponse({
      url: session.url,
      session_id: session.id,
      subtotal_cents: amountCents,
      platform_fee_cents: platformFeeCents,
      total_cents: amountCents + platformFeeCents,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stripe-payment-link error:', message);
    return corsResponse({ error: message }, 500);
  }
});
