import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';

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

handle<WebhookPayload>({ auth: 'none' }, async ({ body: payload, supabase }) => {
  // Only fire when status transitions to 'in_progress'
  if (payload.record.status !== 'in_progress' || payload.old_record.status === 'in_progress') {
    return { status: 'no_action' };
  }

  // Find all exhibitors entered in this class
  const { data: entries } = await supabase
    .from('entries')
    .select('user_id')
    .eq('class_id', payload.record.id)
    .not('entry_status', 'eq', 'pulled');

  if (!entries || entries.length === 0) {
    return { status: 'no_exhibitors' };
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

  return { status: 'push_sent', recipients: userIds.length };
});
