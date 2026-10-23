// supabase/functions/_shared/pushFanout.ts
//
// In-process web-push fanout for the push-trigger-* webhooks (MYK9-1372).
//
// WHY THIS EXISTS: class-status and run-proximity used to call
// `send-push-notification` once per recipient. Each call is a function
// invocation plus a `push_subscriptions` read, so a 500-dog class start cost
// ~N invocations and ~N reads. This module reads every recipient's
// subscriptions in ceil(N / chunk) queries and sends from the calling function.
//
// PER-DEVICE DELIVERY (MYK9-777): every subscription of a user is sent to. The
// announcement trigger deliberately dedupes to one device per account; that
// choice is NOT shared here, so nothing in this module dedupes.
//
// The web-push client is a parameter so this module stays free of `npm:`
// runtime imports and unit-testable with a fake.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { assertAudienceQuerySucceeded } from './fanoutErrors.ts';

/** Chunk size for PostgREST `.in()` queries, to stay under URL length limits. */
export const PUSH_SUBSCRIPTION_CHUNK_SIZE = 100;

export interface PushSubscriptionRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The slice of the `web-push` module this fanout uses. */
export interface WebPushSender {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string
  ): Promise<unknown>;
}

/** One payload for every recipient, or a per-recipient payload (`null` skips that user). */
export type PushPayloadSource = string | ((userId: string) => string | null);

export interface PushBatchResult {
  /** Subscriptions the push service accepted. */
  sent: number;
  /** Subscriptions that rejected the push (includes the expired ones). */
  failed: number;
  /** Subscriptions rejected with 404/410 and deleted. */
  expired: number;
  /** Subscriptions not attempted because the payload function returned null. */
  skipped: number;
}

/**
 * Read the subscriptions of `userIds` in parallel chunks. Throws (HTTP 500,
 * fail-closed) when any chunk errors, because a partial audience would
 * silently drop recipients.
 */
export async function loadPushSubscriptions(
  supabase: SupabaseClient,
  userIds: readonly string[],
  { chunkSize = PUSH_SUBSCRIPTION_CHUNK_SIZE }: { chunkSize?: number } = {}
): Promise<PushSubscriptionRow[]> {
  const chunkQueries = [];
  for (let i = 0; i < userIds.length; i += chunkSize) {
    chunkQueries.push(
      supabase
        .from('push_subscriptions')
        .select('user_id, endpoint, p256dh, auth')
        .in('user_id', userIds.slice(i, i + chunkSize))
    );
  }

  const subscriptions: PushSubscriptionRow[] = [];
  for (const { data, error } of await Promise.all(chunkQueries)) {
    if (error) {
      console.error('pushFanout: subscription query failed for chunk', error.message);
      assertAudienceQuerySucceeded(error);
    }
    if (data) subscriptions.push(...(data as PushSubscriptionRow[]));
  }
  return subscriptions;
}

/**
 * Send to EVERY subscription given (no per-user dedupe), then delete the
 * endpoints the push service reported gone (404/410) in one query. Individual
 * send failures are counted, never thrown.
 */
export async function sendWebPushBatch(
  webpush: WebPushSender,
  supabase: SupabaseClient,
  subscriptions: readonly PushSubscriptionRow[],
  payload: PushPayloadSource,
  { label, quiet = false }: { label: string; quiet?: boolean }
): Promise<PushBatchResult> {
  const payloadFor = typeof payload === 'function' ? payload : () => payload;
  const result: PushBatchResult = { sent: 0, failed: 0, expired: 0, skipped: 0 };
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async sub => {
      const body = payloadFor(sub.user_id);
      if (body === null) {
        result.skipped++;
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        result.sent++;
      } catch (err: unknown) {
        result.failed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        }
        console.error(`${label}: push failed for ${sub.endpoint}:`, (err as Error).message);
      }
    })
  );

  if (expiredEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
    result.expired = expiredEndpoints.length;
  }

  if (!quiet) {
    console.log(
      `${label}: sent=${result.sent}/${subscriptions.length} failed=${result.failed} expired=${result.expired} skipped=${result.skipped}`
    );
  }
  return result;
}
