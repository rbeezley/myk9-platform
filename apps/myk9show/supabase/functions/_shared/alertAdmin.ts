// Operator alert helper: persist-then-email (MP-08). Shared by every edge
// function that raises an operator alert (stripe-webhook, stripe-refund-entry,
// stripe-refund-show, cron-process-payouts — one implementation, per DRY; the
// payout cron's local copy is deleted).
//
// Persistence is the point: a missing RESEND_API_KEY, an unconfigured
// PLATFORM_ALERT_EMAIL inbox, or a Resend outage must never be the only way an
// alert is lost. Every call inserts an `operator_alerts` row FIRST (own
// try/catch — a unique-violation on the (source, dedupe_key) partial index is
// a benign dedupe hit under Stripe re-delivery, not a failure), THEN attempts
// the existing email delivery (own try/catch). Neither failure blocks the
// other; alertAdmin() itself never throws.
//
// The persist/email orchestration and the insert-outcome classification are
// pure and live in `alertAdminCore.ts` (colocated vitest). This file is thin
// Deno glue — it creates the service-role client and the Resend fetch call —
// and, like the pre-existing helper, reads Deno.env at module scope, so it
// has no colocated vitest of its own; keep it trivial.

import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  buildAlertRow,
  runAlertAdmin,
  sendAlertEmailWith,
  DEFAULT_ALERT_SUBJECT_PREFIX,
  type RunAlertAdminResult,
  type InsertResultLike,
  type AlertDeliveryOptions,
} from './alertAdminCore.ts';
import {
  dedupeKeyPrefixPattern,
  resolveOperatorAlertsWith,
  type AlertMatch,
  type OpenAlertRow,
} from './alertResolve.ts';
import { sendResendEmailWithRetry } from './resendEmail.ts';

export type AlertSeverity = 'info' | 'warn' | 'error';

export interface AlertAdminOptions extends AlertDeliveryOptions {
  /** Row severity; defaults to 'error' (the pre-existing helper had no
   * severity concept — every prior call site was effectively an error). */
  severity?: AlertSeverity;
  /** The emitting function/flow, e.g. 'stripe-webhook'. Stored in `source`.
   * Callers that don't pass one get 'unspecified' — still NOT NULL-valid,
   * but callers reacting to a specific condition should pass this. */
  source?: string;
  /** Stable key for dedupe under event re-delivery (e.g. a Stripe event id).
   * Paired with `source` against the DB's partial unique index. */
  dedupeKey?: string;
  /** Structured context (payment identifiers, amounts, etc.). */
  detail?: Record<string, unknown>;
  /** Subject prefix; defaults to the payments one every older caller relied on. */
  subjectPrefix?: string;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const alertEmail = Deno.env.get('PLATFORM_ALERT_EMAIL') ?? 'richardbeezley1@gmail.com';

// Lazily-missing SUPABASE_URL/SERVICE_ROLE_KEY must not crash the module load
// for callers that only need the (still-working) email path in some
// misconfigured environment — insert() reports a clear error instead.
const supabase =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

async function insertOperatorAlert(
  subject: string,
  html: string,
  opts: AlertAdminOptions
): Promise<InsertResultLike> {
  if (!supabase) {
    return {
      error: {
        message: 'operator_alerts client unavailable (missing SUPABASE_URL/SERVICE_ROLE_KEY)',
      },
    };
  }
  // Read resolved_at back: a trigger may store the row already resolved
  // (MYK9-2456), or refresh an open one and store nothing (no row comes back).
  const { data, error } = await supabase
    .from('operator_alerts')
    .insert(buildAlertRow(subject, html, opts))
    .select('resolved_at');
  return {
    error: error ? { code: (error as { code?: string }).code, message: error.message } : null,
    storedResolved: (data ?? []).some(row => row.resolved_at != null),
  };
}

/**
 * Close the open alerts `match` selects because their condition cleared
 * (MYK9-2540); see alertResolve.ts. Never throws: logs and returns 0.
 */
export async function resolveOperatorAlerts(
  source: string,
  match: AlertMatch,
  note: string
): Promise<number> {
  if (!supabase) {
    console.error(`operator_alerts client unavailable; not resolving ${source} alerts`);
    return 0;
  }
  const client = supabase;
  try {
    return await resolveOperatorAlertsWith(
      {
        findOpen: async (src, m) => {
          let query = client
            .from('operator_alerts')
            .select('id, detail')
            .eq('source', src)
            .is('resolved_at', null);
          query =
            'dedupeKey' in m
              ? query.eq('dedupe_key', m.dedupeKey)
              : query.like('dedupe_key', dedupeKeyPrefixPattern(m.dedupeKeyPrefix));
          const { data, error } = await query;
          if (error) throw new Error(error.message);
          return (data ?? []) as OpenAlertRow[];
        },
        resolve: async (id, resolvedAt, detail) => {
          const { data, error } = await client
            .from('operator_alerts')
            .update({ resolved_at: resolvedAt, detail })
            .eq('id', id)
            .is('resolved_at', null)
            .select('id');
          if (error) throw new Error(error.message);
          return (data ?? []).length > 0;
        },
      },
      { source, match, note, now: new Date() }
    );
  } catch (err) {
    console.error(`Resolving ${source} alerts failed:`, err);
    return 0;
  }
}

export async function alertAdmin(
  subject: string,
  html: string,
  opts: AlertAdminOptions = {}
): Promise<RunAlertAdminResult> {
  return await runAlertAdmin(subject, {
    insert: () => insertOperatorAlert(subject, html, opts),
    sendEmail: () =>
      sendAlertEmailWith(
        {
          apiKey: resendApiKey,
          to: alertEmail,
          post: init => sendResendEmailWithRetry(init),
          log: console.log,
        },
        subject,
        html,
        opts.subjectPrefix ?? DEFAULT_ALERT_SUBJECT_PREFIX
      ),
    skipEmailOnDuplicate: opts.skipEmailOnDuplicate,
    log: console.log,
    logError: console.error,
  });
}
