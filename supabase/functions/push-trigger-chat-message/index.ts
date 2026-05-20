import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';

const CHUNK_SIZE = 100;

interface ChatMessageRecord {
  id: string;
  show_id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at?: string;
}

interface WebhookPayload {
  type?: 'INSERT';
  table?: string;
  record: ChatMessageRecord;
}

handle<WebhookPayload>({ auth: 'none' }, async ({ req, body: payload, supabase }) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify caller is the Supabase service role (called by DB trigger via pg_net)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    throw new HttpError(401, 'Unauthorized');
  }

  const { record } = payload;
  const { id, show_id, thread_id, sender_id, body } = record ?? ({} as ChatMessageRecord);

  if (!id || !show_id || !thread_id || !sender_id || !body) {
    throw new HttpError(400, 'Missing required fields');
  }

  // Get the thread to find the recipient
  const { data: thread, error: threadError } = await supabase
    .from('show_message_threads')
    .select('participant_id, show_id')
    .eq('id', thread_id)
    .single();

  if (threadError || !thread) {
    throw new HttpError(404, 'Thread not found');
  }

  // Determine recipients and actionUrl based on who sent the message
  let recipientUserIds: string[] = [];
  let actionUrl: string;

  if (sender_id === thread.participant_id) {
    // Exhibitor sent message -> notify secretaries for this show -> secretary route
    actionUrl = `/secretary/messages/${show_id}`;

    const { data: show } = await supabase
      .from('shows')
      .select('club_id')
      .eq('id', show_id)
      .single();

    if (show) {
      const { data: secretaries } = await supabase
        .from('user_roles')
        .select('id, club_id, people!inner(auth_user_id), roles!inner(name)')
        .eq('club_id', show.club_id)
        .in('roles.name', ['secretary', 'trial_secretary'])
        .not('people.auth_user_id', 'is', null);

      // Also include platform admins
      const { data: admins } = await supabase
        .from('user_roles')
        .select('id, people!inner(auth_user_id), roles!inner(name)')
        .eq('roles.name', 'platform_admin')
        .not('people.auth_user_id', 'is', null);

      const allRecipients = [...(secretaries || []), ...(admins || [])];
      const authIds = allRecipients.map((r: any) => r.people?.auth_user_id).filter(Boolean);
      recipientUserIds = [...new Set(authIds)];
    }
  } else {
    // Secretary sent message -> notify the participant -> exhibitor route
    actionUrl = `/messages/${show_id}`;
    recipientUserIds = [thread.participant_id];
  }

  // Remove sender from recipients
  recipientUserIds = recipientUserIds.filter(uid => uid !== sender_id);

  if (recipientUserIds.length === 0) {
    return { sent: 0, total_subscriptions: 0, expired: 0 };
  }

  // Get sender display name
  const { data: senderPerson } = await supabase
    .from('people')
    .select('first_name, last_name')
    .eq('auth_user_id', sender_id)
    .single();

  const senderName = senderPerson
    ? `${senderPerson.first_name} ${senderPerson.last_name}`.trim()
    : 'Someone';

  // Fetch push subscriptions in chunks
  const allSubscriptions: any[] = [];
  for (let i = 0; i < recipientUserIds.length; i += CHUNK_SIZE) {
    const chunk = recipientUserIds.slice(i, i + CHUNK_SIZE);
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, keys')
      .in('user_id', chunk);
    if (subs) allSubscriptions.push(...subs);
  }

  if (allSubscriptions.length === 0) {
    return { sent: 0, total_subscriptions: 0, expired: 0 };
  }

  // Configure web-push
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@myk9.app';

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // Build push payload
  const truncatedBody = body.length > 100 ? body.substring(0, 97) + '...' : body;
  const pushPayload = JSON.stringify({
    title: `Message from ${senderName}`,
    body: truncatedBody,
    data: {
      type: 'chat_message',
      messageId: id,
      threadId: thread_id,
      showId: show_id,
      actionUrl,
    },
  });

  // Send push notifications
  const expiredEndpointIds: string[] = [];
  let sentCount = 0;

  await Promise.allSettled(
    allSubscriptions.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, pushPayload);
        sentCount++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredEndpointIds.push(sub.id);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredEndpointIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredEndpointIds);
  }

  return {
    sent: sentCount,
    total_subscriptions: allSubscriptions.length,
    expired: expiredEndpointIds.length,
  };
});
