import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
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

// Chunk size for PostgREST .in() queries to avoid URL length limits
const CHUNK_SIZE = 100;

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();
    const announcement = payload.record;

    if (
      !announcement?.id ||
      !announcement?.show_id ||
      !announcement?.priority ||
      !announcement?.title ||
      !announcement?.content
    ) {
      console.error('push-trigger-announcement: invalid payload', JSON.stringify(payload));
      return new Response('Invalid payload', { status: 400 });
    }

    if (announcement.priority === 'normal') {
      return new Response('Normal priority — no push needed', { status: 200 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Run both audience queries in parallel — they're independent
    const [{ data: exhibitors, error: exhibitorError }, { data: officials, error: officialError }] =
      await Promise.all([
        supabase
          .from('entries')
          .select('dog:dogs(owner:people!owner_id(auth_user_id))')
          .eq('show_id', announcement.show_id)
          .is('deleted_at', null)
          .not('entry_status', 'in', '("withdrawn","scratched","absent")'),
        supabase
          .from('user_roles')
          .select('person:people!user_id(auth_user_id)')
          .eq('show_id', announcement.show_id)
          .or('expires_at.is.null,expires_at.gt.now()'),
      ]);

    if (exhibitorError) {
      console.error('push-trigger-announcement: exhibitor query failed', exhibitorError.message);
    }
    if (officialError) {
      console.error('push-trigger-announcement: official query failed', officialError.message);
    }
    if (exhibitorError && officialError) {
      return new Response('Audience resolution failed', { status: 500 });
    }

    const audienceIds = new Set<string>();
    if (exhibitors) {
      for (const entry of exhibitors) {
        const authUserId = entry.dog?.owner?.auth_user_id;
        if (authUserId) audienceIds.add(authUserId);
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
      return new Response('No users to notify', { status: 200 });
    }

    const allUserIds = [...audienceIds];

    // Fetch subscriptions in parallel chunks to avoid PostgREST URL length limits
    const chunkPromises = [];
    for (let i = 0; i < allUserIds.length; i += CHUNK_SIZE) {
      chunkPromises.push(
        supabase
          .from('push_subscriptions')
          .select('user_id, endpoint, keys')
          .in('user_id', allUserIds.slice(i, i + CHUNK_SIZE))
      );
    }

    const chunkResults = await Promise.all(chunkPromises);
    const allSubscriptions: { user_id: string; endpoint: string; keys: Record<string, string> }[] =
      [];
    for (const { data: subs, error: subError } of chunkResults) {
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

    let sent = 0;
    const expiredEndpoints: string[] = [];

    await Promise.allSettled(
      allSubscriptions.map(async sub => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, pushPayload);
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
