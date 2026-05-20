// supabase/functions/push-trigger-scoring/index.ts
// Database webhook fired when an entry's scoring_completed_at flips from
// null to a value. Sends a push notification via send-push-notification.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';

interface WebhookPayload {
  type: 'UPDATE';
  table: string;
  record: {
    id: string;
    dog_id: string;
    class_id: string;
    user_id: string;
    scoring_completed_at: string | null;
  };
  old_record: {
    id: string;
    scoring_completed_at: string | null;
  };
}

handle<WebhookPayload>({ auth: 'none' }, async ({ body, supabase }) => {
  // Only fire when scoring_completed_at transitions from null to a value
  if (
    body.old_record.scoring_completed_at !== null ||
    body.record.scoring_completed_at === null
  ) {
    return { status: 'no_action' };
  }

  // Look up dog name and class name for the notification body
  const { data: entry } = await supabase
    .from('entries')
    .select('dog:dogs(call_name), class:classes(name)')
    .eq('id', body.record.id)
    .single();

  const dogName =
    (entry as { dog?: { call_name?: string } | null } | null)?.dog?.call_name ?? 'Your dog';
  const className =
    (entry as { class?: { name?: string } | null } | null)?.class?.name ?? 'a class';

  // Call the send-push-notification function
  await supabase.functions.invoke('send-push-notification', {
    body: {
      user_id: body.record.user_id,
      payload: {
        type: 'results_posted',
        title: 'Results Posted',
        body: `${dogName} — ${className}`,
        priority: 'normal',
      },
    },
  });

  return { status: 'push_sent' };
});
