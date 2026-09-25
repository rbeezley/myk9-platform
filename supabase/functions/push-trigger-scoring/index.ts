// supabase/functions/push-trigger-scoring/index.ts
// "Results Posted" push, once per class (MYK9-737). Posted by the classes
// trigger trg_notify_class_results_push when the class is done and its results
// are visible under the release gate, and re-posted by the
// class-results-push-retry cron while its private.class_results_push row is
// still pending. This function records the outcome: 'sent' only after the
// sends succeeded, 'error' (still pending, retried) otherwise. See
// resultsPush.ts for the ordering and migration 20260925194700 for the SQL.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';
import {
  parseLease,
  parseResultsPushPayload,
  runResultsPush,
  type ResultsPushDeps,
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

    const deps: ResultsPushDeps = {
      async begin(classId) {
        const { data, error } = await supabase.rpc('begin_class_results_push', {
          p_class_id: classId,
        });
        if (error) {
          console.error('push-trigger-scoring: lease failed', error.message);
          throw new HttpError(500, 'Lease failed');
        }
        return parseLease(data);
      },

      // Owner, co-owner and handler accounts of every scored entry in the class.
      async readScoredEntries(classId) {
        const { data, error } = await supabase
          .from('entries')
          .select(
            'dog:dogs(call_name, owner:people!owner_id(auth_user_id), co_owner:people!co_owner_id(auth_user_id)), handler:people!handler_id(auth_user_id)'
          )
          .eq('class_id', classId)
          .is('deleted_at', null)
          .not('scoring_completed_at', 'is', null);
        if (error) throw new Error(error.message);
        return (data ?? []) as ScoredEntryAudienceRow[];
      },

      async sendPush(userId, payload) {
        const { error } = await supabase.functions.invoke('send-push-notification', {
          body: { user_id: userId, payload },
        });
        if (error) {
          console.error('push-trigger-scoring: send failed', userId, error.message);
          return false;
        }
        return true;
      },

      async finish(classId, claimToken, outcome, deliveredTo, errorText) {
        const { error } = await supabase.rpc('finish_class_results_push', {
          p_class_id: classId,
          p_claim_token: claimToken,
          p_outcome: outcome,
          p_delivered_to: deliveredTo,
          p_error: errorText,
        });
        if (error) {
          // The lease lapses in five minutes and the retry takes the row again.
          console.error('push-trigger-scoring: recording the outcome failed', error.message);
          throw new HttpError(500, 'Recording the outcome failed');
        }
      },
    };

    const result = await runResultsPush(deps, target);
    if (result.status === 'push_failed') {
      console.error(
        'push-trigger-scoring: attempt failed, left pending',
        target.classId,
        result.error
      );
      throw new HttpError(502, result.error);
    }
    return result;
  }
);
