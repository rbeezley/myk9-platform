import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const CHUNK_SIZE = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify caller is the Supabase service role (called by DB trigger via pg_net)
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { record } = await req.json();
    const { id, show_id, thread_id, sender_id, body, created_at } = record;

    if (!id || !show_id || !thread_id || !sender_id || !body) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get the thread to find the recipient
    const { data: thread, error: threadError } = await supabase
      .from('show_message_threads')
      .select('participant_id, show_id')
      .eq('id', thread_id)
      .single();

    if (threadError || !thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ sent: 0, total_subscriptions: 0, expired: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ sent: 0, total_subscriptions: 0, expired: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Configure web-push
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@myk9.app';

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Build push payload
    const truncatedBody = body.length > 100 ? body.substring(0, 97) + '...' : body;
    const payload = JSON.stringify({
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

    const results = await Promise.allSettled(
      allSubscriptions.map(async sub => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
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

    return new Response(
      JSON.stringify({
        sent: sentCount,
        total_subscriptions: allSubscriptions.length,
        expired: expiredEndpointIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
