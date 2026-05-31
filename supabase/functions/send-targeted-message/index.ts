import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import {
  buildGroupLabel,
  isPresenceSuppressed,
  normalizeTargetType,
  ringsideSessionMatchesTarget,
  targetArmbands,
  uniqueAccountRecipients,
  type EntryRecipientSource,
  type RingsideSessionSource,
  type TargetType,
} from './targeting.ts';

const PUSH_CHUNK_SIZE = 25;

interface SendTargetedMessagePayload {
  show_id?: string;
  class_id?: string;
  target_type?: TargetType;
  body?: string;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  keys?: { p256dh?: string; auth?: string } | null;
  p256dh?: string | null;
  auth?: string | null;
}

interface RingsideSessionRow {
  subscription_id: string;
  role: RingsideSessionSource['role'];
  favorited_armbands: string[] | null;
  last_seen_at: string | null;
  last_seen_route: string | null;
  push_subscriptions?: PushSubscriptionRow | PushSubscriptionRow[] | null;
}

function subscriptionFromSession(row: RingsideSessionRow): PushSubscriptionRow | null {
  const joined = Array.isArray(row.push_subscriptions)
    ? row.push_subscriptions[0]
    : row.push_subscriptions;
  return joined ?? null;
}

function subscriptionKeys(sub: PushSubscriptionRow): { p256dh: string; auth: string } | null {
  const p256dh = sub.keys?.p256dh ?? sub.p256dh;
  const auth = sub.keys?.auth ?? sub.auth;
  return p256dh && auth ? { p256dh, auth } : null;
}

async function fetchEntriesForTarget(
  supabase: any,
  showId: string,
  targetType: TargetType,
  classId: string | undefined
): Promise<EntryRecipientSource[]> {
  let query = supabase
    .from('entries')
    .select(
      'armband, dog:dogs(owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), handler:people!handler_id(auth_user_id)'
    )
    .eq('show_id', showId)
    .is('deleted_at', null);

  if (targetType === 'class') {
    if (!classId) throw new HttpError(400, 'Missing required field: class_id');
    query = query.eq('class_id', classId);
  } else if (targetType === 'checked_in') {
    query = query.in('check_in_status', ['checked-in', 'at-gate', 'come-to-gate', 'in-ring']);
  }

  const { data, error } = await query;
  if (error) throw new HttpError(500, 'Failed to resolve message recipients');

  return (data ?? []).map((entry: any) => ({
    armband: entry.armband ? String(entry.armband) : null,
    authUserIds: [
      entry.dog?.owner?.auth_user_id,
      entry.dog?.co_owner?.auth_user_id,
      entry.handler?.auth_user_id,
    ],
  }));
}

async function fetchClassInfo(supabase: any, classId: string | undefined) {
  if (!classId) return null;
  const { data } = await supabase
    .from('classes')
    .select('id, class_number, name')
    .eq('id', classId)
    .single();
  return data;
}

async function assertClassBelongsToShow(
  supabase: any,
  classId: string | undefined,
  showId: string
) {
  if (!classId) return;
  const { data: classCheck } = await supabase
    .from('classes')
    .select('id, trials!inner(show_id)')
    .eq('id', classId)
    .eq('trials.show_id', showId)
    .single();

  if (!classCheck) throw new HttpError(400, 'Class does not belong to this show');
}

async function fetchRingsidePushTargets(
  supabase: any,
  showId: string,
  targetType: TargetType,
  armbands: string[]
): Promise<Array<{ session: RingsideSessionSource; subscription: PushSubscriptionRow }>> {
  // The secretary targeted-message surface is currently exhibitor messaging.
  // Staff passcode roles need a separate operational broadcast lane before they
  // are included in "all show" notifications.
  const { data, error } = await supabase
    .from('ringside_sessions')
    .select(
      'subscription_id, role, favorited_armbands, last_seen_at, last_seen_route, push_subscriptions!inner(id, endpoint, keys, p256dh, auth)'
    )
    .eq('show_id', showId)
    .eq('role', 'exhibitor');

  if (error) throw new HttpError(500, 'Failed to resolve ringside recipients');

  const bySubscriptionId = new Map<
    string,
    { session: RingsideSessionSource; subscription: PushSubscriptionRow }
  >();

  for (const row of (data ?? []) as RingsideSessionRow[]) {
    const subscription = subscriptionFromSession(row);
    if (!subscription) continue;
    const session: RingsideSessionSource = {
      subscriptionId: row.subscription_id,
      role: row.role,
      favoritedArmbands: row.favorited_armbands ?? [],
      lastSeenAt: row.last_seen_at,
      lastSeenRoute: row.last_seen_route,
    };
    if (!ringsideSessionMatchesTarget(session, targetType, armbands)) continue;
    bySubscriptionId.set(subscription.id, { session, subscription });
  }

  return [...bySubscriptionId.values()];
}

async function sendPasscodePushes(args: {
  supabase: any;
  body: string;
  messageId: string | null;
  showId: string;
  targets: Array<{ session: RingsideSessionSource; subscription: PushSubscriptionRow }>;
}) {
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

  const payload = JSON.stringify({
    title: 'Message from the show secretary',
    body: args.body.length > 100 ? `${args.body.slice(0, 97)}...` : args.body,
    data: {
      type: 'show_message',
      messageId: args.messageId,
      showId: args.showId,
      actionUrl: `/messages/${args.showId}`,
    },
  });

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
}

handle<SendTargetedMessagePayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body: payload, user, supabase }) => {
    if (!user) throw new HttpError(401, 'Unauthorized');

    const showId = payload.show_id;
    const targetType = normalizeTargetType(payload.target_type);
    const body = payload.body?.trim();

    if (!showId || !body) {
      throw new HttpError(400, 'Missing required fields: show_id, body');
    }

    const { data: show } = await supabase
      .from('shows')
      .select('id, club_id')
      .eq('id', showId)
      .single();

    if (!show) throw new HttpError(404, 'Show not found');

    const { data: callerRoles } = await supabase
      .from('user_roles')
      .select('id, club_id, people!inner(auth_user_id), roles!inner(name)')
      .eq('people.auth_user_id', user.id)
      .or(
        `and(roles.name.in.(secretary,trial_secretary),club_id.eq.${show.club_id}),roles.name.eq.platform_admin,roles.name.eq.site_admin`
      );

    if (!callerRoles || callerRoles.length === 0) {
      throw new HttpError(403, 'Forbidden: secretary or admin role required');
    }

    await assertClassBelongsToShow(supabase, payload.class_id, showId);
    const [entries, classInfo] = await Promise.all([
      fetchEntriesForTarget(supabase, showId, targetType, payload.class_id),
      fetchClassInfo(supabase, payload.class_id),
    ]);

    if (entries.length === 0) {
      return { sent_to: 0, total_recipients: 0, push_sent: 0 };
    }

    const accountRecipientIds = uniqueAccountRecipients(entries, user.id);
    const armbands = targetArmbands(entries);
    const groupLabel = buildGroupLabel({
      targetType,
      classNumber: classInfo?.class_number,
      className: classInfo?.name,
    });

    let insertedMessageIds: string[] = [];
    if (accountRecipientIds.length > 0) {
      const now = new Date().toISOString();
      const threadUpserts = accountRecipientIds.map(recipientId => ({
        show_id: showId,
        participant_id: recipientId,
        last_message_at: now,
      }));

      const { data: upsertedThreads, error: upsertError } = await supabase
        .from('show_message_threads')
        .upsert(threadUpserts, { onConflict: 'show_id,participant_id' })
        .select('id, participant_id');

      if (upsertError || !upsertedThreads) {
        throw new HttpError(500, 'Failed to create threads');
      }

      const messageInserts = upsertedThreads.map((thread: any) => ({
        show_id: showId,
        thread_id: thread.id,
        sender_id: user.id,
        body,
        group_label: groupLabel,
      }));

      const { data: insertedMessages, error: insertError } = await supabase
        .from('show_messages')
        .insert(messageInserts)
        .select('id');

      if (insertError) throw new HttpError(500, 'Failed to send messages');
      insertedMessageIds = (insertedMessages ?? []).map((message: { id: string }) => message.id);
    }

    const ringsideTargets = await fetchRingsidePushTargets(supabase, showId, targetType, armbands);
    const pushResult = await sendPasscodePushes({
      supabase,
      body,
      messageId: insertedMessageIds[0] ?? null,
      showId,
      targets: ringsideTargets,
    });

    return {
      sent_to: insertedMessageIds.length,
      total_recipients: accountRecipientIds.length + ringsideTargets.length,
      group_label: groupLabel,
      push_sent: pushResult.sent,
      push_suppressed: pushResult.suppressed,
      push_failed: pushResult.failed,
      dead_subs_cleaned: pushResult.dead,
    };
  }
);
