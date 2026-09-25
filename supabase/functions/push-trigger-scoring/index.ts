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
  audienceRowsFromRpc,
  classifyPushResponse,
  parseLease,
  parseResultsPushPayload,
  runResultsPush,
  type ResultsPushDeps,
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

      // Owner, co-owner and handler accounts of every announceable entry, from
      // the same SQL predicate that made the class due.
      async readScoredEntries(classId) {
        const { data, error } = await supabase.rpc('class_results_push_audience', {
          p_class_id: classId,
        });
        if (error) throw new Error(error.message);
        return audienceRowsFromRpc(data);
      },

      async sendPush(userId, payload) {
        const { data, error } = await supabase.functions.invoke('send-push-notification', {
          body: { user_id: userId, payload },
        });
        const outcome = classifyPushResponse(data, error);
        if (outcome.kind === 'failed' || outcome.kind === 'gone') {
          console.error('push-trigger-scoring: send', outcome.kind, userId, outcome.detail);
        }
        return outcome;
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
