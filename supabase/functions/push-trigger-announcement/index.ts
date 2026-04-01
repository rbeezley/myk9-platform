// supabase/functions/push-trigger-announcement/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

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

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@myk9show.com';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();
    const announcement = payload.record;

    // Validate payload shape
    if (!announcement?.id || !announcement?.show_id || !announcement?.priority) {
      console.error('push-trigger-announcement: invalid payload', JSON.stringify(payload));
      return new Response('Invalid payload', { status: 400 });
    }

    // Only push for high/urgent — normal is in-app only
    if (announcement.priority === 'normal') {
      return new Response('Normal priority — no push needed', { status: 200 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Audience Resolution ---

    // 1. Exhibitors: entries → dogs (owner_id) → people (auth_user_id)
    // Filter out soft-deleted and non-active entries
    const { data: exhibitors, error: exhibitorError } = await supabase
      .from('entries')
      .select('dog:dogs(owner:people!owner_id(auth_user_id))')
      .eq('show_id', announcement.show_id)
      .is('deleted_at', null)
      .not('entry_status', 'in', '("withdrawn","scratched","absent")');

    // Log and handle query errors explicitly
    if (exhibitorError) {
      console.error('push-trigger-announcement: exhibitor query failed', exhibitorError.message);
    }

    const exhibitorUserIds = new Set<string>();
    if (exhibitors) {
      for (const entry of exhibitors) {
        const authUserId = entry.dog?.owner?.auth_user_id;
        if (authUserId) exhibitorUserIds.add(authUserId);
      }
    }

    // 2. Officials: user_roles (show_id) → people (auth_user_id)
    // Filter expired roles
    const { data: officials, error: officialError } = await supabase
      .from('user_roles')
      .select('person:people!user_id(auth_user_id)')
      .eq('show_id', announcement.show_id)
      .or('expires_at.is.null,expires_at.gt.now()');

    // Log and handle query errors explicitly
    if (officialError) {
      console.error('push-trigger-announcement: official query failed', officialError.message);
    }

    // If BOTH queries failed, abort rather than silently sending to no one
    if (exhibitorError && officialError) {
      console.error('push-trigger-announcement: all audience queries failed, aborting');
      return new Response('Audience resolution failed', { status: 500 });
    }

    const officialUserIds = new Set<string>();
    if (officials) {
      for (const role of officials) {
        const authUserId = role.person?.auth_user_id;
        if (authUserId) officialUserIds.add(authUserId);
      }
    }

    // Union and exclude the author
    const allUserIds = [...new Set([...exhibitorUserIds, ...officialUserIds])].filter(
      id => id !== announcement.author_id
    );

    // Structured logging for debugging
    console.log(
      `push-trigger-announcement: show=${announcement.show_id} priority=${announcement.priority} audience=${allUserIds.length} (${exhibitorUserIds.size} exhibitors, ${officialUserIds.size} officials)`
    );

    if (allUserIds.length === 0) {
      return new Response('No users to notify', { status: 200 });
    }

    // --- Fetch Push Subscriptions ---
    // Batch user IDs in chunks of 100 to avoid PostgREST URL length limits
    const CHUNK_SIZE = 100;
    const allSubscriptions: { user_id: string; endpoint: string; keys: Record<string, string> }[] =
      [];

    for (let i = 0; i < allUserIds.length; i += CHUNK_SIZE) {
      const chunk = allUserIds.slice(i, i + CHUNK_SIZE);
      const { data: subs, error: subError } = await supabase
        .from('push_subscriptions')
        .select('user_id, endpoint, keys')
        .in('user_id', chunk);

      if (subError) {
        console.error(
          'push-trigger-announcement: subscription query failed for chunk',
          subError.message
        );
        continue;
      }
      if (subs) allSubscriptions.push(...subs);
    }

    if (allSubscriptions.length === 0) {
      return new Response('No push subscriptions found', { status: 200 });
    }

    // --- Build Payload ---
    const pushPayload = JSON.stringify({
      type: 'announcement',
      title: announcement.title,
      body: truncate(announcement.content, 200),
      priority: announcement.priority,
      actionUrl: `/shows/${announcement.show_id}`,
      timestamp: Date.now(),
      data: {
        announcementId: announcement.id,
        showId: announcement.show_id,
        authorRole: announcement.author_role,
      },
    });

    // --- Send Push Notifications ---
    let sent = 0;
    const expiredEndpoints: { user_id: string; endpoint: string }[] = [];

    await Promise.allSettled(
      allSubscriptions.map(async sub => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, pushPayload);
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            expiredEndpoints.push({ user_id: sub.user_id, endpoint: sub.endpoint });
          }
          console.error(`Push failed for ${sub.endpoint}:`, (err as Error).message);
        }
      })
    );

    // --- Cleanup Expired Subscriptions ---
    if (expiredEndpoints.length > 0) {
      await Promise.allSettled(
        expiredEndpoints.map(({ user_id, endpoint }) =>
          supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user_id)
            .eq('endpoint', endpoint)
        )
      );
    }

    console.log(
      `push-trigger-announcement: sent=${sent}/${allSubscriptions.length} expired=${expiredEndpoints.length}`
    );

    return new Response(
      JSON.stringify({
        sent,
        total_subscriptions: allSubscriptions.length,
        expired: expiredEndpoints.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('push-trigger-announcement error:', error);
    return new Response('Error', { status: 500 });
  }
});
