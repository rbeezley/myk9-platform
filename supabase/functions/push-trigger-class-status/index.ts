import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';

import type { EntryAudienceRow } from '../_shared/entryAudience.ts';
import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import {
  isTruncatedPushBatch,
  loadPushSubscriptions,
  sendWebPushBatch,
} from '../_shared/pushFanout.ts';
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

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@myk9show.com';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

handle<WebhookPayload>(
  { auth: 'none', beforeBody: requirePushWebhookSecret },
  async ({ body: payload, supabase }) => {
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
      .not('entry_status', 'in', '("withdrawn","scratched","absent")')
      .not('check_in_status', 'eq', 'pulled')
      .returns<EntryAudienceRow[]>();

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

    // One batched subscription read, then an in-process send to every device of
    // every affected user (MYK9-1372). This used to invoke send-push-notification
    // once per recipient, which cost a function invocation and a subscription
    // read each.
    const subscriptions = await loadPushSubscriptions(supabase, [...audienceIds]);
    const pushPayload = JSON.stringify({
      type: 'class_starting',
      title: 'Class Starting',
      body: `${payload.record.name} is now in progress`,
      priority: 'high',
    });
    const outcome = await sendWebPushBatch(webpush, supabase, subscriptions, pushPayload, {
      label: 'push-trigger-class-status',
    });

    if (isTruncatedPushBatch(outcome, subscriptions.length)) {
      console.error(
        `push-trigger-class-status: class ${payload.record.id} fanout incomplete: sent=${outcome.sent} failed=${outcome.failed} skipped=${outcome.skipped} truncated=${outcome.truncated} of ${subscriptions.length}`
      );
    }

    return {
      status: 'push_sent',
      recipients: audienceIds.size,
      sent: outcome.sent,
      expired: outcome.expired,
      truncated: outcome.truncated,
    };
  }
);
