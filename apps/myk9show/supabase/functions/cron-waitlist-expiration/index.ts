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
  DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS,
  expireWaitlistOffer,
  type ExpiredWaitlistOffer,
  type WaitlistExpirationStripe,
  type WaitlistExpirationSupabase,
} from '../_shared/waitlistExpiration.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CRON_SECRET');
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');

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

interface ClassInfo {
  id: string;
  name: string;
  trial: {
    id: string;
    name: string;
    show: {
      id: string;
      name: string;
    };
  };
}

interface ExhibitorInfo {
  id: string;
  person: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

Deno.serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Verify cron secret for security
  const authHeader = req.headers.get('Authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (!cronSecret || providedSecret !== cronSecret) {
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
      errors: [] as string[],
    };
    const classesExpiredThisRun = new Set<string>();

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
        console.log(`Expired offer ${offer.id} for class ${offer.class_id}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Process ${offer.id}: ${errorMessage}`);
      }
    }

    // Also check for any classes with available spots but no current offers
    // This handles cases where spots opened up (cancellations) but no one was auto-offered
    await processClassesWithOpenSpots(results, classesExpiredThisRun);

    console.log(
      `[${new Date().toISOString()}] Cron complete: ${results.expiredOffers} expired, ${results.newOffers} new offers`
    );

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        results,
      }),
      {
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

  const { data: offeredEntry, error: fetchError } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('id', entry.id)
    .single();

  if (fetchError) {
    console.error(`Promoted waitlist spot ${entry.id}, but could not reload it:`, fetchError);
  }

  console.log(`Offered spot to ${entry.exhibitor_id} for class ${entry.class_id}`);

  // Try to send notification email
  try {
    await sendOfferNotification((offeredEntry as WaitlistEntry | null) ?? entry);
  } catch (err) {
    console.error('Failed to send notification (non-blocking):', err);
  }

  return true;
}

/**
 * Send notification email about waitlist offer
 */
async function sendOfferNotification(entry: WaitlistEntry): Promise<void> {
  // Get class info
  const { data: classInfo } = (await supabase
    .from('classes')
    .select(
      `
      id,
      name,
      trial:trial_id (
        id,
        name,
        show:show_id (
          id,
          name
        )
      )
    `
    )
    .eq('id', entry.class_id)
    .single()) as { data: ClassInfo | null };

  // Get exhibitor info
  const { data: exhibitorInfo } = (await supabase
    .from('exhibitor_profiles')
    .select(
      `
      id,
      person:person_id (
        id,
        first_name,
        last_name,
        email
      )
    `
    )
    .eq('id', entry.exhibitor_id)
    .single()) as { data: ExhibitorInfo | null };

  if (!classInfo || !exhibitorInfo?.person?.email) {
    console.log('Missing info for notification, skipping email');
    return;
  }

  // Get dog name
  const { data: dog } = await supabase
    .from('dogs')
    .select('name, call_name')
    .eq('id', entry.dog_id)
    .single();

  const dogName = dog?.call_name || dog?.name || 'your dog';
  const showName = classInfo.trial?.show?.name || 'the show';
  const showId = classInfo.trial?.show?.id || '';
  const className = classInfo.name || 'the class';
  const expiresAt = entry.offer_expires_at
    ? new Date(entry.offer_expires_at)
    : new Date(new Date().getTime() + DEFAULT_WAITLIST_PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000);
  const paymentUrl =
    entry.joined_via !== 'mail_in' && entry.promoted_entry_id && showId
      ? await createWaitlistPaymentLink(entry.promoted_entry_id, showId)
      : null;

  // Call send-email function
  const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      type: 'waitlist_offer',
      to: exhibitorInfo.person.email,
      name: exhibitorInfo.person.first_name,
      showName,
      className,
      dogName,
      expiresAt: expiresAt.toLocaleString(),
      paymentUrl,
    }),
  });

  if (!emailResponse.ok) {
    console.error('Email send failed:', await emailResponse.text());
  }
}

async function createWaitlistPaymentLink(entryId: string, showId: string): Promise<string | null> {
  if (!cronSecret) {
    console.error('CRON_SECRET is missing; cannot create waitlist payment link');
    return null;
  }

  const body = {
    entry_ids: [entryId],
    success_url: `https://myk9show.com/shows/${showId}?payment=success`,
    cancel_url: `https://myk9show.com/shows/${showId}?payment=cancelled`,
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/stripe-payment-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-function-secret': cronSecret,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error('Waitlist payment link creation failed:', await response.text());
    return null;
  }

  const data = await response.json();
  return typeof data?.url === 'string' ? data.url : null;
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
