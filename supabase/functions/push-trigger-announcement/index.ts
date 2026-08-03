import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';

interface AnnouncementRecord {
  id: string;
  show_id: string;
  author_id: string;
  author_role: string;
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
}

interface WebhookPayload {
  type: 'INSERT';
  table: 'show_announcements';
  record: AnnouncementRecord;
}

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@myk9show.com';

// Chunk size for PostgREST .in() queries to avoid URL length limits
const CHUNK_SIZE = 100;

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

handle<WebhookPayload>({ auth: 'none', beforeBody: requirePushWebhookSecret }, async ({ body: payload, supabase }) => {
    const announcement = payload.record;

    if (
      !announcement?.id ||
      !announcement?.show_id ||
      !announcement?.priority ||
      !announcement?.title ||
      !announcement?.content
    ) {
      console.error('push-trigger-announcement: invalid payload', JSON.stringify(payload));
      throw new HttpError(400, 'Invalid payload');
    }

    if (announcement.priority === 'normal') {
      return { status: 'no_push_needed', reason: 'normal_priority' };
    }

    // Run both audience queries in parallel — they're independent
    const [{ data: exhibitors, error: exhibitorError }, { data: officials, error: officialError }] =
      await Promise.all([
        supabase
          .from('entries')
          // Resolve owner + co-owner + handler, matching send-targeted-message's
          // audience — everyone attached to an entry should get show-wide pushes,
          // not just the primary owner.
          .select(
            'dog:dogs(owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), handler:people!handler_id(auth_user_id)'
          )
          .eq('show_id', announcement.show_id)
          .is('deleted_at', null)
          .not('entry_status', 'in', '("withdrawn","scratched","absent")'),
        applyActiveRoleValidity(
          supabase
            .from('user_roles')
            .select('person:people!user_id(auth_user_id)')
            .eq('show_id', announcement.show_id)
        ),
      ]);

    if (exhibitorError) {
      console.error('push-trigger-announcement: exhibitor query failed', exhibitorError.message);
    }
    if (officialError) {
      console.error('push-trigger-announcement: official query failed', officialError.message);
    }
  if (exhibitorError || officialError) {
    throw new HttpError(500, 'Audience resolution failed');
  }

    const audienceIds = new Set<string>();
    if (exhibitors) {
      for (const entry of exhibitors) {
        for (const authUserId of [
          entry.dog?.owner?.auth_user_id,
          entry.dog?.co_owner?.auth_user_id,
          entry.handler?.auth_user_id,
        ]) {
          if (authUserId) audienceIds.add(authUserId);
        }
      }
    }
    if (officials) {
      for (const role of officials) {
        const authUserId = role.person?.auth_user_id;
        if (authUserId) audienceIds.add(authUserId);
      }
    }
    audienceIds.delete(announcement.author_id);

    console.log(
      `push-trigger-announcement: show=${announcement.show_id} priority=${announcement.priority} audience=${audienceIds.size}`
    );

    if (audienceIds.size === 0) {
      return { status: 'no_users_to_notify' };
    }

    const allUserIds = [...audienceIds];

    // Fetch subscriptions in parallel chunks to avoid PostgREST URL length limits
    const chunkPromises = [];
    for (let i = 0; i < allUserIds.length; i += CHUNK_SIZE) {
      chunkPromises.push(
        supabase
          .from('push_subscriptions')
          .select('user_id, endpoint, p256dh, auth')
          .in('user_id', allUserIds.slice(i, i + CHUNK_SIZE))
      );
    }

    const chunkResults = await Promise.all(chunkPromises);
    const allSubscriptions: {
      user_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }[] = [];
    for (const { data: subs, error: subError } of chunkResults) {
      if (subError) {
        console.error(
          'push-trigger-announcement: subscription query failed for chunk',
          subError.message
        );
        throw new HttpError(500, 'Audience resolution failed');
      }
      if (subs) allSubscriptions.push(...subs);
    }

    if (allSubscriptions.length === 0) {
      return { status: 'no_subscriptions_found' };
    }

    // One notification per account — dedupe by user_id to avoid hitting the same
    // person twice when they have multiple push subscriptions (e.g. Chrome browser
    // + installed PWA both registered on the same device).
    const seenUserIds = new Set<string>();
    const dedupedSubscriptions = allSubscriptions.filter(sub => {
      if (seenUserIds.has(sub.user_id)) return false;
      seenUserIds.add(sub.user_id);
      return true;
    });

    const pushPayload = JSON.stringify({
      type: 'announcement',
      title: announcement.title,
      body: truncate(announcement.content, 200),
      priority: announcement.priority,
      actionUrl: `/at-show/${announcement.show_id}`,
      timestamp: Date.now(),
      data: {
        announcementId: announcement.id,
        showId: announcement.show_id,
        authorRole: announcement.author_role,
      },
    });

    let sent = 0;
    const expiredEndpoints: string[] = [];

    await Promise.allSettled(
      dedupedSubscriptions.map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload
          );
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          }
          console.error(`Push failed for ${sub.endpoint}:`, (err as Error).message);
        }
      })
    );

    // Batch-delete expired subscriptions in a single query
    if (expiredEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
    }

    console.log(
      `push-trigger-announcement: sent=${sent}/${dedupedSubscriptions.length} (deduped from ${allSubscriptions.length}) expired=${expiredEndpoints.length}`
    );

    return {
      sent,
      total_subscriptions: allSubscriptions.length,
      expired: expiredEndpoints.length,
    };
});
