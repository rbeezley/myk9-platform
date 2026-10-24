// The web-push port for the ring-proximity trigger (MYK9-1372).
//
// Subscriptions for every push recipient are read ONCE, before dispatch, and
// each recipient is then sent to in-process on every one of their devices
// (MYK9-777: per-device, no dedupe). This replaces one `send-push-notification`
// invocation, and one subscription read, per recipient.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import {
  loadPushSubscriptions,
  sendWebPushBatch,
  type PushSubscriptionRow,
  type WebPushSender,
} from '../_shared/pushFanout.ts';
import { buildProximityPayload, type ProximityRecipient } from './runProximity.ts';
import type { ProximityAlertContext } from './proximitySms.ts';

type LoadedSubscriptions = { ok: true; byUser: Map<string, PushSubscriptionRow[]> } | { ok: false };

export function createProximityPushPort(options: {
  webpush: WebPushSender;
  supabase: SupabaseClient;
  classId: string;
  pushUserIds: readonly string[];
}): (recipient: ProximityRecipient, context: ProximityAlertContext) => Promise<void> {
  const { webpush, supabase, classId, pushUserIds } = options;

  // A failed read must not throw here: SMS dispatch is independent of push, so
  // the failure is surfaced per recipient (counted as pushFailed) instead of
  // aborting the whole trigger the way an audience-resolution error would
  // (loadPushSubscriptions has already logged the cause).
  const loaded: Promise<LoadedSubscriptions> = loadPushSubscriptions(supabase, pushUserIds).then(
    (rows): LoadedSubscriptions => {
      const byUser = new Map<string, PushSubscriptionRow[]>();
      for (const row of rows) {
        const forUser = byUser.get(row.user_id) ?? [];
        forUser.push(row);
        byUser.set(row.user_id, forUser);
      }
      return { ok: true, byUser };
    },
    (): LoadedSubscriptions => ({ ok: false })
  );

  return async (recipient, context) => {
    const result = await loaded;
    if (!result.ok) throw new Error('push subscription lookup failed');

    // No subscription is not a failure: send-push-notification answered
    // `{ sent: 0 }` for this and the dispatcher counted it as sent.
    const subscriptions = result.byUser.get(recipient.authUserId);
    if (!subscriptions?.length) return;

    const payload = buildProximityPayload({
      dogName: context.dogName,
      className: context.className,
      dogsAhead: recipient.dogsAhead,
      armband: context.armband,
    });
    const outcome = await sendWebPushBatch(
      webpush,
      supabase,
      subscriptions,
      JSON.stringify({ ...payload, actionUrl: `/classes/${classId}` }),
      { label: 'push-trigger-run-proximity', quiet: true }
    );

    // Delivered to at least one device counts as sent. Throwing when none
    // accepted it keeps the dispatcher's pushFailed counter honest.
    if (outcome.sent === 0 && outcome.failed > 0) {
      throw new Error(`push rejected on all ${outcome.failed} device(s)`);
    }
  };
}
