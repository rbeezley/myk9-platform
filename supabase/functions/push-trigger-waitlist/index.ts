import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { requireEmailLogWrite } from '../_shared/emailLog.ts';
import {
  buildWaitlistNotificationContent,
  parseWaitlistNotificationPayload,
  redactWaitlistDeliveryError,
  runWaitlistDeliveryChannels,
  shouldDeliverWaitlistEvent,
  type WaitlistDeliveryChannel,
  type WaitlistNotificationEventType,
} from './waitlistNotification.ts';

interface WebhookPayload {
  event_id: string;
  waitlist_entry_id: string;
  event_type: 'offered' | 'reminder' | 'expired';
}

interface ClaimedEvent {
  event_id: string;
  waitlist_entry_id: string;
  event_type: WaitlistNotificationEventType;
  offer_cycle_at: string;
  claim_token: string;
  email_sent_at: string | null;
  push_sent_at: string | null;
  push_delivered_endpoint_hashes: string[];
}

interface WaitlistEntry {
  id: string;
  class_id: string;
  exhibitor_id: string;
  dog_id: string;
  offered_at: string | null;
  offer_expires_at: string | null;
  status: string | null;
  joined_via: string | null;
  promoted_entry: {
    entry_status: string | null;
    payment_status: string | null;
  } | null;
}

interface ExhibitorProfile {
  person: {
    first_name: string | null;
    email: string | null;
    auth_user_id: string | null;
  } | null;
}

interface ClassContext {
  name: string | null;
  trial: {
    timezone: string | null;
    show: { id: string; name: string | null } | null;
  } | null;
}

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
const CHUNK_SIZE = 100;

handle<WebhookPayload>(
  { auth: 'none', beforeBody: requirePushWebhookSecret },
  async ({ body, supabase }) => {
    let payload: WebhookPayload;
    try {
      payload = parseWaitlistNotificationPayload(body);
    } catch {
      throw new HttpError(400, 'Invalid payload');
    }

    const claimed = await claimEvent(supabase, payload.event_id);
    if (!claimed) return { status: 'already_processed' };
    if (
      claimed.waitlist_entry_id !== payload.waitlist_entry_id ||
      claimed.event_type !== payload.event_type
    ) {
      await markFailed(supabase, payload.event_id, claimed.claim_token, 'payload_mismatch');
      throw new HttpError(409, 'Event payload does not match durable event');
    }

    try {
      const context = await loadContext(supabase, payload.waitlist_entry_id);
      if (
        !shouldDeliverWaitlistEvent({
          eventType: claimed.event_type,
          eventOfferCycleAt: claimed.offer_cycle_at,
          currentOfferCycleAt: context.waitlist.offered_at,
          waitlistStatus: context.waitlist.status,
          joinedVia: context.waitlist.joined_via,
          entryStatus: context.waitlist.promoted_entry?.entry_status ?? null,
          paymentStatus: context.waitlist.promoted_entry?.payment_status ?? null,
          expiresAt: context.waitlist.offer_expires_at,
          nowMs: Date.now(),
        })
      ) {
        await updateEvent(supabase, payload.event_id, claimed.claim_token, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          processing_started_at: null,
          claim_token: null,
          last_error: null,
        });
        return { status: 'not_applicable', event_type: payload.event_type };
      }

      const content = buildWaitlistNotificationContent({
        eventType: payload.event_type,
        waitlistEntryId: payload.waitlist_entry_id,
        recipientName: context.exhibitor.person?.first_name || 'there',
        dogName: context.dogName,
        className: context.entryClass.name || 'your class',
        showName: context.entryClass.trial?.show?.name || 'your show',
        expiresAt: context.waitlist.offer_expires_at,
        timezone: context.entryClass.trial?.timezone ?? null,
        appOrigin: Deno.env.get('MYK9SHOW_APP_URL') || 'https://myk9show.com',
      });

      const channels: WaitlistDeliveryChannel[] = [];
      if (!claimed.email_sent_at) {
        channels.push({
          name: 'email' as const,
          deliver: () =>
            deliverEmail({
              eventId: payload.event_id,
              claimToken: claimed.claim_token,
              recipient: context.exhibitor.person?.email ?? null,
              showId: context.entryClass.trial?.show?.id ?? null,
              content,
              supabase,
            }),
        });
      }
      if (!claimed.push_sent_at) {
        channels.push({
          name: 'push' as const,
          deliver: () =>
            deliverPush({
              eventId: payload.event_id,
              claimToken: claimed.claim_token,
              deliveredEndpointHashes: claimed.push_delivered_endpoint_hashes,
              authUserId: context.exhibitor.person?.auth_user_id ?? null,
              content,
              eventType: payload.event_type,
              waitlistEntryId: payload.waitlist_entry_id,
              supabase,
            }),
        });
      }
      const channelFailures = await runWaitlistDeliveryChannels(channels);

      if (channelFailures.length > 0) {
        const category = channelFailures.sort().join('+').slice(0, 120);
        await markFailed(supabase, payload.event_id, claimed.claim_token, category);
        console.error(`push-trigger-waitlist: event ${payload.event_id} failed (${category})`);
        throw new HttpError(502, 'Waitlist notification delivery failed');
      }

      await updateEvent(supabase, payload.event_id, claimed.claim_token, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        processing_started_at: null,
        claim_token: null,
        last_error: null,
      });

      return { status: 'sent', event_type: payload.event_type };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const category = redactWaitlistDeliveryError(error);
      await markFailed(supabase, payload.event_id, claimed.claim_token, category);
      console.error(`push-trigger-waitlist: event ${payload.event_id} failed (${category})`);
      throw new HttpError(502, 'Waitlist notification delivery failed');
    }
  }
);

async function claimEvent(supabase: SupabaseClient, eventId: string): Promise<ClaimedEvent | null> {
  const { data, error } = await supabase.rpc('claim_waitlist_notification_event', {
    p_event_id: eventId,
  });
  if (error) throw new Error('event_claim_failed');
  return ((data as ClaimedEvent[] | null) ?? [])[0] ?? null;
}

async function loadContext(supabase: SupabaseClient, waitlistEntryId: string) {
  const { data: waitlist, error: waitlistError } = await supabase
    .from('waitlist_entries')
    .select(
      'id, class_id, exhibitor_id, dog_id, offered_at, offer_expires_at, status, joined_via, promoted_entry:promoted_entry_id(entry_status, payment_status)'
    )
    .eq('id', waitlistEntryId)
    .single();
  if (waitlistError || !waitlist) throw new Error('waitlist_context_missing');

  const typedWaitlist = waitlist as WaitlistEntry;
  const [classResult, exhibitorResult, dogResult] = await Promise.all([
    supabase
      .from('classes')
      .select('name, trial:trial_id(timezone, show:show_id(id, name))')
      .eq('id', typedWaitlist.class_id)
      .single(),
    supabase
      .from('exhibitor_profiles')
      .select('person:person_id(first_name, email, auth_user_id)')
      .eq('id', typedWaitlist.exhibitor_id)
      .single(),
    supabase.from('dogs').select('name, call_name').eq('id', typedWaitlist.dog_id).single(),
  ]);

  if (classResult.error || exhibitorResult.error || dogResult.error) {
    throw new Error('notification_audience_resolution_failed');
  }
  const exhibitor = exhibitorResult.data as unknown as ExhibitorProfile;
  return {
    waitlist: typedWaitlist,
    entryClass: classResult.data as unknown as ClassContext,
    exhibitor,
    dogName: dogResult.data?.call_name || dogResult.data?.name || 'your dog',
  };
}

async function deliverEmail(input: {
  eventId: string;
  claimToken: string;
  recipient: string | null;
  showId: string | null;
  content: ReturnType<typeof buildWaitlistNotificationContent>;
  supabase: SupabaseClient;
}): Promise<void> {
  await requireCurrentClaim(input.supabase, input.eventId, input.claimToken);
  if (!input.recipient) {
    const { error: logError } = await input.supabase.from('email_log').insert({
      recipient_email: null,
      email_type: 'waitlist_notification',
      related_id: input.eventId,
      status: 'failed',
      error_message: 'recipient_unavailable',
      show_id: input.showId,
    });
    requireEmailLogWrite(logError, 'push-trigger-waitlist');
    await updateEvent(input.supabase, input.eventId, input.claimToken, {
      email_sent_at: new Date().toISOString(),
    });
    return;
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    await recordWaitlistEmailFailure(input, 'email_not_configured');
    throw new Error('email_not_configured');
  }

  let response: Response;
  try {
    response = await sendResendEmailWithRetry({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
        'Idempotency-Key': `waitlist-${input.eventId}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: input.recipient,
        subject: input.content.subject,
        html: input.content.emailHtml,
      }),
    });
  } catch {
    await recordWaitlistEmailFailure(input, 'email_delivery_error');
    throw new Error('email_delivery_error');
  }

  if (!response.ok) {
    await recordWaitlistEmailFailure(input, `provider_http_${response.status}`);
    throw { channel: 'email', statusCode: response.status };
  }
  const result = (await response.json()) as { id?: string };
  const { error: logError } = await input.supabase.from('email_log').insert({
    recipient_email: input.recipient,
    email_type: 'waitlist_notification',
    related_id: input.eventId,
    resend_message_id: result.id ?? null,
    status: 'sent',
    show_id: input.showId,
  });
  requireEmailLogWrite(logError, 'push-trigger-waitlist');
  await updateEvent(input.supabase, input.eventId, input.claimToken, {
    email_sent_at: new Date().toISOString(),
  });
}

async function recordWaitlistEmailFailure(
  input: {
    eventId: string;
    recipient: string | null;
    showId: string | null;
    supabase: SupabaseClient;
  },
  errorMessage: string
): Promise<void> {
  const { error: logError } = await input.supabase.from('email_log').insert({
    recipient_email: input.recipient,
    email_type: 'waitlist_notification',
    related_id: input.eventId,
    status: 'failed',
    error_message: errorMessage,
    show_id: input.showId,
  });
  requireEmailLogWrite(logError, 'push-trigger-waitlist');
}

async function deliverPush(input: {
  eventId: string;
  claimToken: string;
  deliveredEndpointHashes: string[];
  authUserId: string | null;
  content: ReturnType<typeof buildWaitlistNotificationContent>;
  eventType: WaitlistNotificationEventType;
  waitlistEntryId: string;
  supabase: SupabaseClient;
}): Promise<void> {
  await requireCurrentClaim(input.supabase, input.eventId, input.claimToken);
  if (!input.authUserId) {
    await updateEvent(input.supabase, input.eventId, input.claimToken, {
      push_sent_at: new Date().toISOString(),
    });
    return;
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!vapidPublicKey || !vapidPrivateKey) throw new Error('push_not_configured');
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:support@myk9show.com',
    vapidPublicKey,
    vapidPrivateKey
  );

  const subscriptions = await fetchSubscriptions(input.supabase, [input.authUserId]);
  const deliveredHashes = new Set(input.deliveredEndpointHashes);
  const failures: number[] = [];
  const pushPayload = JSON.stringify({
    type: `waitlist_${input.eventType}`,
    title: input.content.title,
    body: input.content.body,
    actionUrl: input.content.actionUrl,
    priority: input.eventType === 'expired' ? 'normal' : 'high',
    data: { waitlistEntryId: input.waitlistEntryId },
  });

  for (const subscription of subscriptions) {
    const endpointHash = await sha256(subscription.endpoint);
    if (deliveredHashes.has(endpointHash)) continue;

    try {
      await requireCurrentClaim(input.supabase, input.eventId, input.claimToken);
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        pushPayload
      );
      await recordPushDelivery(input.supabase, input.eventId, input.claimToken, endpointHash);
      deliveredHashes.add(endpointHash);
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      if (statusCode === 404 || statusCode === 410) {
        await input.supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);
        await recordPushDelivery(input.supabase, input.eventId, input.claimToken, endpointHash);
        deliveredHashes.add(endpointHash);
      } else {
        failures.push(statusCode);
      }
    }
  }
  if (failures.length > 0) throw { channel: 'push', statusCode: failures[0] };
  await updateEvent(input.supabase, input.eventId, input.claimToken, {
    push_sent_at: new Date().toISOString(),
  });
}

async function fetchSubscriptions(
  supabase: SupabaseClient,
  authUserIds: string[]
): Promise<PushSubscription[]> {
  const subscriptions: PushSubscription[] = [];
  for (let index = 0; index < authUserIds.length; index += CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', authUserIds.slice(index, index + CHUNK_SIZE));
    if (error) throw new Error('push_subscription_query_failed');
    subscriptions.push(...((data as PushSubscription[] | null) ?? []));
  }
  return subscriptions;
}

async function updateEvent(
  supabase: SupabaseClient,
  eventId: string,
  claimToken: string,
  values: Record<string, unknown>
): Promise<void> {
  const { data, error } = await supabase
    .from('waitlist_notification_events')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('status', 'processing')
    .eq('claim_token', claimToken)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('event_update_failed');
  if (!data) throw new Error('stale_event_claim');
}

async function markFailed(
  supabase: SupabaseClient,
  eventId: string,
  claimToken: string,
  category: string
): Promise<void> {
  await supabase
    .from('waitlist_notification_events')
    .update({
      status: 'failed',
      processing_started_at: null,
      claim_token: null,
      last_error: category.slice(0, 120),
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('status', 'processing')
    .eq('claim_token', claimToken);
}

async function requireCurrentClaim(
  supabase: SupabaseClient,
  eventId: string,
  claimToken: string
): Promise<void> {
  const { data, error } = await supabase.rpc('renew_waitlist_notification_claim', {
    p_event_id: eventId,
    p_claim_token: claimToken,
  });
  if (error || data !== true) throw new Error('stale_event_claim');
}

async function recordPushDelivery(
  supabase: SupabaseClient,
  eventId: string,
  claimToken: string,
  endpointHash: string
): Promise<void> {
  const { data, error } = await supabase.rpc('record_waitlist_push_delivery', {
    p_event_id: eventId,
    p_claim_token: claimToken,
    p_endpoint_hash: endpointHash,
  });
  if (error || data !== true) throw new Error('push_delivery_record_failed');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
