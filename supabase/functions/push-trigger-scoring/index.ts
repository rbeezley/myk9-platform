// supabase/functions/push-trigger-scoring/index.ts
// "Results Posted" push, once per class (MYK9-737). Called by the classes
// trigger trg_notify_class_results_push when private.claim_class_results_push
// finds the class done and its results visible under the release gate
// (public.resolve_class_result_visibility): on completion or scoring
// finalization for the default presets, on results_released_at for a class
// held for manual release. It no longer fires per scored entry.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';
import {
  buildResultsPushPayload,
  groupResultsRecipients,
  parseResultsPushPayload,
  resultsAreVisible,
  type ScoredEntryAudienceRow,
} from './resultsPush.ts';

interface WebhookPayload {
  type: 'UPDATE';
  table: string;
  record: {
    id: string;
    name: string | null;
  };
}

handle<WebhookPayload>(
  { auth: 'none', beforeBody: requirePushWebhookSecret },
  async ({ body, supabase }) => {
    const target = parseResultsPushPayload(body);
    if (!target) {
      throw new HttpError(400, 'Expected a class results payload');
    }

    // Re-check the gate at send time: the claim was taken when results became
    // visible, and a class un-released since then must stay quiet.
    const { data: visibility, error: visibilityError } = await supabase.rpc(
      'resolve_class_result_visibility',
      { p_class_id: target.classId }
    );
    if (visibilityError) {
      console.error('push-trigger-scoring: visibility check failed', visibilityError.message);
      throw new HttpError(500, 'Visibility check failed');
    }
    if (!resultsAreVisible(visibility)) {
      return { status: 'results_held' };
    }

    // Owner, co-owner and handler accounts of every scored entry in the class.
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select(
        'dog:dogs(call_name, owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), handler:people!handler_id(auth_user_id)'
      )
      .eq('class_id', target.classId)
      .is('deleted_at', null)
      .not('scoring_completed_at', 'is', null);

    if (entriesError) {
      console.error('push-trigger-scoring: entry audience query failed', entriesError.message);
      throw new HttpError(500, 'Audience resolution failed');
    }

    const recipients = groupResultsRecipients((entries ?? []) as ScoredEntryAudienceRow[]);
    if (recipients.size === 0) {
      return { status: 'no_users_to_notify' };
    }

    await Promise.allSettled(
      [...recipients].map(([userId, dogNames]) =>
        supabase.functions.invoke('send-push-notification', {
          body: {
            user_id: userId,
            payload: buildResultsPushPayload(dogNames, target.className),
          },
        })
      )
    );

    return { status: 'push_sent', recipients: recipients.size };
  }
);
