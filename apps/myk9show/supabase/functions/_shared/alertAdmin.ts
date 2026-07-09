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
import { buildAlertRow, runAlertAdmin, type InsertResultLike } from './alertAdminCore.ts';

export type AlertSeverity = 'info' | 'warn' | 'error';

export interface AlertAdminOptions {
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
  const { error } = await supabase
    .from('operator_alerts')
    .insert(buildAlertRow(subject, html, opts));
  return {
    error: error ? { code: (error as { code?: string }).code, message: error.message } : null,
  };
}

async function sendAlertEmail(subject: string, html: string): Promise<void> {
  if (!resendApiKey) {
    console.log(`Alert email skipped (no RESEND_API_KEY): ${subject}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'myK9Show <notifications@myk9show.com>',
      to: alertEmail,
      subject: `[myK9Show payments] ${subject}`,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Alert email failed (${res.status}): ${subject}`);
  }
}

export async function alertAdmin(
  subject: string,
  html: string,
  opts: AlertAdminOptions = {}
): Promise<void> {
  await runAlertAdmin(subject, {
    insert: () => insertOperatorAlert(subject, html, opts),
    sendEmail: () => sendAlertEmail(subject, html),
    log: console.log,
    logError: console.error,
  });
}
