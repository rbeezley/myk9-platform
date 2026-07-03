import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';

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

handle<WebhookPayload>({ auth: 'none' }, async ({ req, body: payload, supabase }) => {
  requirePushWebhookSecret(req);

  // Only fire when status transitions to 'in_progress'
  if (payload.record.status !== 'in_progress' || payload.old_record.status === 'in_progress') {
    return { status: 'no_action' };
  }

  // Resolve owner, co-owner, and handler accounts for active entries in this class.
  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select(
      'dog:dogs(owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), handler:people!handler_id(auth_user_id)'
    )
    .eq('class_id', payload.record.id)
    .is('deleted_at', null)
    .not('entry_status', 'eq', 'pulled');

  if (entriesError) {
    console.error('push-trigger-class-status: entry audience query failed', entriesError.message);
    throw new HttpError(500, 'Audience resolution failed');
  }

  if (!entries || entries.length === 0) {
    return { status: 'no_exhibitors' };
  }

  const audienceIds = new Set<string>();
  for (const entry of entries) {
    for (const authUserId of [
      entry.dog?.owner?.auth_user_id,
      entry.dog?.co_owner?.auth_user_id,
      entry.handler?.auth_user_id,
    ]) {
      if (authUserId) audienceIds.add(authUserId);
    }
  }

  if (audienceIds.size === 0) {
    return { status: 'no_users_to_notify' };
  }

  // Send push to each affected user
  await Promise.allSettled(
    [...audienceIds].map(userId =>
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

  return { status: 'push_sent', recipients: audienceIds.size };
});
