import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'UPDATE';
  table: string;
  record: {
    id: string;
    name: string;
    status: string;
  };
  old_record: {
    id: string;
    status: string;
  };
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();

    // Only fire when status transitions to 'in_progress'
    if (payload.record.status !== 'in_progress' || payload.old_record.status === 'in_progress') {
      return new Response('No action needed', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find all exhibitors entered in this class
    const { data: entries } = await supabase
      .from('entries')
      .select('user_id')
      .eq('class_id', payload.record.id)
      .not('entry_status', 'eq', 'pulled');

    if (!entries || entries.length === 0) {
      return new Response('No exhibitors to notify', { status: 200 });
    }

    // Deduplicate user_ids (one user may have multiple dogs in the class)
    const userIds = [...new Set(entries.map(e => e.user_id))];

    // Send push to each affected user
    await Promise.allSettled(
      userIds.map(userId =>
        supabase.functions.invoke('send-push-notification', {
          body: {
            user_id: userId,
            payload: {
              type: 'class_starting',
              title: 'Class Starting',
              body: `${payload.record.name} is now in progress`,
              priority: 'high',
            },
          },
        })
      )
    );

    return new Response(`Push sent to ${userIds.length} users`, { status: 200 });
  } catch (error) {
    console.error('push-trigger-class-status error:', error);
    return new Response('Error', { status: 500 });
  }
});
