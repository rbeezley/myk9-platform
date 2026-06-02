import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import {
  buildRingsidePushActionUrl,
  isPresenceSuppressed,
  type RingsideSessionSource,
} from './targeting.ts';
import {
  createSendTargetedMessageHandler,
  type PushSubscriptionRow,
  type SendPasscodePushes,
  type SendTargetedMessagePayload,
} from './targeted-message-handler.ts';

const PUSH_CHUNK_SIZE = 25;

function subscriptionKeys(sub: PushSubscriptionRow): { p256dh: string; auth: string } | null {
  const p256dh = sub.p256dh;
  const auth = sub.auth;
  return p256dh && auth ? { p256dh, auth } : null;
}

const sendPasscodePushes: SendPasscodePushes = async args => {
  const enabled = Deno.env.get('PUSH_FANOUT_ENABLED') === 'true';
  if (!enabled || args.targets.length === 0) {
    return {
      attempted: 0,
      sent: 0,
      suppressed: enabled ? 0 : args.targets.length,
      failed: 0,
      dead: 0,
    };
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@myk9.app';
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('send-targeted-message: missing VAPID configuration');
    return { attempted: 0, sent: 0, suppressed: 0, failed: args.targets.length, dead: 0 };
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const expiredSubscriptionIds: string[] = [];
  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let attempted = 0;

  for (let i = 0; i < args.targets.length; i += PUSH_CHUNK_SIZE) {
    const chunk = args.targets.slice(i, i + PUSH_CHUNK_SIZE);
    await Promise.allSettled(
      chunk.map(async target => {
        if (isPresenceSuppressed(target.session)) {
          suppressed++;
          return;
        }

        const keys = subscriptionKeys(target.subscription);
        if (!keys) {
          failed++;
          return;
        }

        attempted++;
        const payload = JSON.stringify({
          title: 'Message from the show secretary',
          body: args.body.length > 100 ? `${args.body.slice(0, 97)}...` : args.body,
          data: {
            type: 'show_message',
            messageId: args.messageId,
            showId: args.showId,
            actionUrl: buildRingsidePushActionUrl(args.showId, target.session),
          },
        });
        try {
          await webpush.sendNotification({ endpoint: target.subscription.endpoint, keys }, payload);
          sent++;
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            expiredSubscriptionIds.push(target.subscription.id);
            return;
          }

          if (err.statusCode >= 500) {
            try {
              await new Promise(resolve => setTimeout(resolve, 250));
              await webpush.sendNotification(
                { endpoint: target.subscription.endpoint, keys },
                payload
              );
              sent++;
              return;
            } catch {
              // counted below
            }
          }
          failed++;
        }
      })
    );
  }

  if (expiredSubscriptionIds.length > 0) {
    await args.supabase.from('push_subscriptions').delete().in('id', expiredSubscriptionIds);
  }

  return {
    attempted,
    sent,
    suppressed,
    failed,
    dead: expiredSubscriptionIds.length,
  };
};

handle<SendTargetedMessagePayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  createSendTargetedMessageHandler({ sendPasscodePushes })
);
