// supabase/functions/push-trigger-scoring/index.ts
// Database webhook fired when an entry's scoring_completed_at flips from
// null to a value. Sends a push notification via send-push-notification.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';

interface WebhookPayload {
  type: 'UPDATE';
  table: string;
  record: {
    id: string;
    dog_id: string;
    class_id: string;
    show_id: string;
    handler_id: string | null;
    scoring_completed_at: string | null;
  };
  old_record: {
    id: string;
    scoring_completed_at: string | null;
  };
}

handle<WebhookPayload>({ auth: 'none' }, async ({ req, body, supabase }) => {
  requirePushWebhookSecret(req);

  // Only fire when scoring_completed_at transitions from null to a value
  if (
    body.old_record.scoring_completed_at !== null ||
    body.record.scoring_completed_at === null
  ) {
    return { status: 'no_action' };
  }

  // Resolve the attached exhibitor accounts from the entry relationships.
  const { data: entry, error: entryError } = await supabase
    .from('entries')
    .select(
      'dog:dogs(call_name, owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), class:classes(name), handler:people!handler_id(auth_user_id)'
    )
    .eq('id', body.record.id)
    .single();

  if (entryError) {
    console.error('push-trigger-scoring: entry audience query failed', entryError.message);
    throw new HttpError(500, 'Audience resolution failed');
  }

  const audienceIds = new Set<string>();
  for (const authUserId of [
    entry?.dog?.owner?.auth_user_id,
    entry?.dog?.co_owner?.auth_user_id,
    entry?.handler?.auth_user_id,
  ]) {
    if (authUserId) audienceIds.add(authUserId);
  }

  if (audienceIds.size === 0) {
    return { status: 'no_users_to_notify' };
  }

  const dogName = entry?.dog?.call_name ?? 'Your dog';
  const className =
    (entry as { class?: { name?: string } | null } | null)?.class?.name ?? 'a class';

  await Promise.allSettled(
    [...audienceIds].map(userId =>
      supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: userId,
          payload: {
            type: 'results_posted',
            title: 'Results Posted',
            body: `${dogName} — ${className}`,
            priority: 'normal',
          },
        },
      })
    )
  );

  return { status: 'push_sent', recipients: audienceIds.size };
});
