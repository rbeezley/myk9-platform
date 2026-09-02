/**
 * Waitlist Expiration Cron Job
 *
 * Runs every 15 minutes to:
 * 1. Expire waitlist offers that have passed their deadline
 * 2. Auto-offer spots to the next person in line
 * 3. Send notification emails
 *
 * Trigger: Supabase cron or external scheduler (e.g., cron-job.org)
 * URL: POST /functions/v1/cron-waitlist-expiration
 * Auth: Requires CRON_SECRET header for security
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  expireWaitlistOffer,
  type ExpiredWaitlistOffer,
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

interface WaitlistEntry {
  id: string;
  class_id: string;
  exhibitor_id: string;
  dog_id: string;
  handler_id: string | null;
  promoted_entry_id: string | null;
  joined_via: string | null;
  position: number;
  status: string;
  offered_at: string | null;
  offer_expires_at: string | null;
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

  try {
    const results = {
      expiredOffers: 0,
      newOffers: 0,
      skippedPaidOffers: 0,
      skippedMailInOffers: 0,
      remindersSent: 0,
      expiryNoticesSent: 0,
      retriedNotifications: 0,
      errors: [] as string[],
    };
    const classesExpiredThisRun = new Set<string>();
    const queuedExpiryNotices: QueuedWaitlistEvent[] = [];

    // Step 1: Find and expire offers past their deadline
    const { data: expiredOffers, error: expiredError } = await supabase
      .from('waitlist_entries')
      .select('id, class_id, exhibitor_id, promoted_entry_id, joined_via')
      .eq('status', 'offered')
      .lt('offer_expires_at', new Date().toISOString());

    if (expiredError) {
      console.error('Error fetching expired offers:', expiredError);
      results.errors.push(`Fetch expired: ${expiredError.message}`);
    }

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
          offer: offer as ExpiredWaitlistOffer,
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
        classesExpiredThisRun.add(offer.class_id);
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

    // Also check for any classes with available spots but no current offers
    // This handles cases where spots opened up (cancellations) but no one was auto-offered
    await processClassesWithOpenSpots(results, classesExpiredThisRun);

    // Delivery is intentionally after expiry/cascade state work. Provider latency must never
    // prevent an overdue offer from expiring or the next exhibitor from being promoted.
    const expiryDelivery = await dispatchQueuedWaitlistEvents({
      events: queuedExpiryNotices,
      supabaseUrl,
      pushWebhookSecret,
    });
    results.expiryNoticesSent = expiryDelivery.dispatched;
    results.errors.push(...expiryDelivery.errors);

    const reminderResult = await processHalfwayReminders({
      supabase,
      supabaseUrl,
      pushWebhookSecret,
      now: new Date(),
    });
    results.remindersSent = reminderResult.sent;
    results.skippedMailInOffers += reminderResult.skippedMailIn;
    results.errors.push(...reminderResult.errors);

    const retryResult = await retryWaitlistNotificationEvents({
      supabase,
      supabaseUrl,
      pushWebhookSecret,
    });
    results.retriedNotifications = retryResult.dispatched;
    results.errors.push(...retryResult.errors);

    console.log(
      `[${new Date().toISOString()}] Cron complete: ${results.expiredOffers} expired, ${results.newOffers} new offers`
    );

    return new Response(
      JSON.stringify({
        success: results.errors.length === 0,
        timestamp: new Date().toISOString(),
        results,
      }),
      {
        status: results.errors.length === 0 ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Cron job error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Offer a waitlist spot to an exhibitor
 */
async function offerSpot(entry: WaitlistEntry): Promise<boolean> {
  const { data: promotedEntryId, error: promoteError } = await supabase.rpc(
    'promote_waitlist_entry_from_cron',
    {
      p_waitlist_entry_id: entry.id,
    }
  );

  if (promoteError || !promotedEntryId) {
    console.error(`Failed to promote waitlist spot ${entry.id}:`, promoteError);
    return false;
  }

  console.log(`Offered spot to ${entry.exhibitor_id} for class ${entry.class_id}`);
  return true;
}

/**
 * Process classes that have open spots and waiting entries but no current offers
 */
async function processClassesWithOpenSpots(
  results: {
    expiredOffers: number;
    newOffers: number;
    skippedPaidOffers: number;
    skippedMailInOffers: number;
    errors: string[];
  },
  skipClassIds: ReadonlySet<string> = new Set()
): Promise<void> {
  // Find classes with waiting entries but no pending offers
  const { data: classesWithWaiting, error } = await supabase
    .from('waitlist_entries')
    .select('class_id')
    .eq('status', 'waiting')
    .order('class_id');

  if (error || !classesWithWaiting) {
    return;
  }

  // Get unique class IDs
  const uniqueClassIds = [...new Set(classesWithWaiting.map(w => w.class_id))];

  for (const classId of uniqueClassIds) {
    if (skipClassIds.has(classId)) {
      continue;
    }

    // Check if there's already an active offer for this class
    const { data: activeOffer } = await supabase
      .from('waitlist_entries')
      .select('id')
      .eq('class_id', classId)
      .eq('status', 'offered')
      .limit(1)
      .single();

    if (activeOffer) {
      continue; // Already has an active offer
    }

    // Check class availability
    const { data: availability } = await supabase.rpc('check_class_availability', {
      p_class_id: classId,
    });

    if (!availability || !availability[0]?.is_available) {
      continue; // No spots available
    }

    // Get next in line
    const { data: nextInLine, error: nextError } = await supabase
      .from('waitlist_entries')
      .select('*')
      .eq('class_id', classId)
      .eq('status', 'waiting')
      .order('position', { ascending: true })
      .limit(1)
      .single();

    if (nextError || !nextInLine) {
      continue;
    }

    if (nextInLine.joined_via === 'mail_in') {
      console.log(
        `Next waitlist row ${nextInLine.id} for class ${classId} is mail-in; leaving it for secretary handling`
      );
      results.skippedMailInOffers++;
      continue;
    }

    // Offer spot
    const offered = await offerSpot(nextInLine as WaitlistEntry);
    if (offered) {
      results.newOffers++;
    }
  }
}
