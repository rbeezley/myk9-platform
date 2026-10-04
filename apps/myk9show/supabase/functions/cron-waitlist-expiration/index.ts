/**
 * Waitlist Expiration Cron Job
 *
 * Runs every 15 minutes to:
 * 1. Expire waitlist offers that have passed their deadline
 * 2. Offer free spots to the next dog in line, in shows whose secretary left
 *    automatic offers on (offer_waitlist_spots_from_cron, MYK9-1003), in the
 *    same run as the expiry that freed them
 * 3. Send notification emails
 *
 * Trigger: Supabase cron or external scheduler (e.g., cron-job.org)
 * URL: POST /functions/v1/cron-waitlist-expiration
 * Auth: Requires CRON_SECRET header for security
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import * as Sentry from 'npm:@sentry/deno@10.62.0';
import { createSentryCronClient } from '../_shared/sentryCronClient.ts';
import { alertAdmin } from '../_shared/alertAdmin.ts';
import { findExpiredOffers, runMonitoredWaitlistCron } from './cronOutcome.ts';
import { runWaitlistOfferStep } from './offerStep.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  expireWaitlistOffer,
  type WaitlistExpirationStripe,
  type WaitlistExpirationSupabase,
} from '../_shared/waitlistExpiration.ts';
import {
  dispatchQueuedWaitlistEvents,
  enqueueWaitlistEvent,
  processHalfwayReminders,
  retryWaitlistNotificationEvents,
  type QueuedWaitlistEvent,
} from '../_shared/waitlistNotificationDispatch.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CRON_SECRET');
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const pushWebhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = stripeSecret
  ? new Stripe(stripeSecret, {
      appInfo: { name: 'myK9Show', version: '1.0.0' },
    })
  : null;
const waitlistStripe = stripe as WaitlistExpirationStripe | null;
const sentryCronClient = createSentryCronClient(Sentry, {
  dsn: Deno.env.get('SENTRY_DSN'),
  environment: Deno.env.get('SENTRY_ENVIRONMENT'),
});

// CORS configuration - restrict to known app domains
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
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

Deno.serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify cron secret for security
  const authHeader = req.headers.get('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '') ?? null;

  if (!(await secretMatches(providedSecret))) {
    console.error('Unauthorized cron request');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`[${new Date().toISOString()}] Running waitlist expiration cron`);

  return runMonitoredWaitlistCron({
    client: sentryCronClient,
    alert: alertAdmin,
    headers: corsHeaders,
    work: async () => {
      const results = {
        expiredOffers: 0,
        newOffers: 0,
        skippedPaidOffers: 0,
        skippedMailInOffers: 0,
        remindersSent: 0,
        expiryNoticesSent: 0,
        retriedNotifications: 0,
        errors: [] as string[],
        notificationErrors: [] as string[],
      };
      const queuedExpiryNotices: QueuedWaitlistEvent[] = [];

      // Step 1: Find and expire offers past their deadline
      const expiredOffers = await findExpiredOffers(
        supabase,
        new Date().toISOString(),
        results.errors
      );

      // Process each expired offer
      for (const offer of expiredOffers || []) {
        try {
          if (offer.joined_via === 'mail_in') {
            results.skippedMailInOffers++;
            continue;
          }

          const expired = await expireWaitlistOffer({
            supabase: supabase as WaitlistExpirationSupabase,
            stripe: waitlistStripe,
            offer,
            nowIso: new Date().toISOString(),
          });
          if (expired === 'paid') {
            console.log(`Offer ${offer.id} has a completed payment; leaving it for reconciliation`);
            results.skippedPaidOffers++;
            continue;
          }
          if (expired === 'error') {
            results.errors.push(`Expire ${offer.id}: failed`);
            continue;
          }

          results.expiredOffers++;
          const notice = await enqueueWaitlistEvent({
            supabase,
            waitlistEntryId: offer.id,
            eventType: 'expired',
          });
          if (notice) queuedExpiryNotices.push(notice);
          else results.errors.push(`Expiry notice ${offer.id}: enqueue failed`);
          console.log(`Expired offer ${offer.id} for class ${offer.class_id}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          results.errors.push(`Process ${offer.id}: ${errorMessage}`);
        }
      }

      // Offer every free spot, including the ones the expiries above just freed
      // (no skipped tick), and spots opened by withdrawals or pulls.
      await runWaitlistOfferStep(supabase, results);

      // Delivery is intentionally after expiry/cascade state work. Provider latency must never
      // prevent an overdue offer from expiring or the next exhibitor from being promoted.
      const expiryDelivery = await dispatchQueuedWaitlistEvents({
        events: queuedExpiryNotices,
        supabaseUrl,
        pushWebhookSecret,
      });
      results.expiryNoticesSent = expiryDelivery.dispatched;
      results.notificationErrors.push(...expiryDelivery.errors);

      const reminderResult = await processHalfwayReminders({
        supabase,
        supabaseUrl,
        pushWebhookSecret,
        now: new Date(),
      });
      results.remindersSent = reminderResult.sent;
      results.skippedMailInOffers += reminderResult.skippedMailIn;
      results.notificationErrors.push(...reminderResult.errors);

      const retryResult = await retryWaitlistNotificationEvents({
        supabase,
        supabaseUrl,
        pushWebhookSecret,
      });
      results.retriedNotifications = retryResult.dispatched;
      results.notificationErrors.push(...retryResult.errors);

      console.log(
        `[${new Date().toISOString()}] Cron complete: ${results.expiredOffers} expired, ${results.newOffers} new offers`
      );

      return results;
    },
  });
});
