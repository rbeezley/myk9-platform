// Pure persist-then-email orchestration for `alertAdmin.ts` (Deno-free,
// colocated vitest — see the header note in alertAdmin.ts for why the split).
//
// Contract (money-path-hardening-remainder, MP-08): every alertAdmin() call
// MUST attempt to persist an `operator_alerts` row, independent of whether
// email delivery is configured or succeeds. Insert and email each get their
// own try/catch so a failure in one never blocks the other, and neither ever
// throws out of alertAdmin() — an alert-raising call must not itself become
// an unhandled error in the caller's request path.
//
// Dedupe: a unique-violation (Postgres error code 23505) on the
// `(source, dedupe_key)` partial unique index (unresolved rows only) means
// another unresolved alert with the same key already exists — this is a
// benign, expected outcome under Stripe webhook re-delivery / cron re-runs,
// not a failure. It is logged at the same "handled" level as a normal insert,
// not as an error.

export type InsertOutcome = 'inserted' | 'deduped' | 'insert_failed';

export interface InsertResultLike {
  error: { code?: string; message: string } | null;
  /** True when the row the insert stored is already resolved: a database
   * trigger resolved it on insert because its condition had already cleared
   * (the payout approval reminder, MYK9-2456). Absent or false otherwise. */
  storedResolved?: boolean;
}

/** Options accepted by `buildAlertRow` — a structural subset of
 * `AlertAdminOptions` in alertAdmin.ts (kept separate so this Deno-free file
 * has no dependency on the Deno glue module). */
export interface AlertRowOptions {
  severity?: 'info' | 'warn' | 'error';
  source?: string;
  dedupeKey?: string;
  detail?: Record<string, unknown>;
}

export interface AlertRow {
  source: string;
  severity: 'info' | 'warn' | 'error';
  title: string;
  detail: Record<string, unknown> | null;
  dedupe_key: string | null;
}

/** Build the `operator_alerts` insert payload. Most existing call sites pass
 * no `opts.detail` — the entry/refund/payment identifiers they care about
 * live only in the email `html` body. Without a fallback, those rows persist
 * with `detail: null` and are unactionable from the alerts board. When
 * `opts.detail` is absent, fall back to `{ html }` so every row carries its
 * context. An explicit `opts.detail` always wins verbatim — it is never
 * merged with `html`. */
export function buildAlertRow(subject: string, html: string, opts: AlertRowOptions = {}): AlertRow {
  return {
    source: opts.source ?? 'unspecified',
    severity: opts.severity ?? 'error',
    title: subject,
    detail: opts.detail ?? { html },
    dedupe_key: opts.dedupeKey ?? null,
  };
}

const UNIQUE_VIOLATION_CODE = '23505';

/** Classify an `operator_alerts` insert result. A unique-violation on the
 * dedupe index is a benign hit, not a failure; anything else non-null is a
 * real insert failure. */
export function classifyInsertResult(result: InsertResultLike): InsertOutcome {
  if (!result.error) return 'inserted';
  if (result.error.code === UNIQUE_VIOLATION_CODE) return 'deduped';
  return 'insert_failed';
}

export interface AlertDeliveryOptions {
  /** Opt in to suppressing email when an unresolved alert already exists. */
  skipEmailOnDuplicate?: boolean;
}

export interface RunAlertAdminDeps extends AlertDeliveryOptions {
  /** Attempts the `operator_alerts` insert. May reject; may also resolve with
   * a non-null `error` (the supabase-js convention) — both are handled. */
  insert: () => Promise<InsertResultLike>;
  /** Attempts email delivery. May reject; resolving means "attempted" (which
   * includes the caller's own "no RESEND_API_KEY configured" no-op skip).
   * Resolving `{ sent: false }` says the send was skipped, so nothing went out. */
  sendEmail: () => Promise<void | { sent: boolean }>;
  log?: (message: string) => void;
  logError?: (message: string, err?: unknown) => void;
}

export interface RunAlertAdminResult {
  insertOutcome: InsertOutcome;
  emailAttempted: boolean;
  emailError: unknown;
  /** False when the send was skipped (no key). Never true after an error. */
  emailSent: boolean;
  /** Present (true) only when the stored row was already resolved, so no email
   * was sent: the condition cleared before the alert landed. Nothing to retry. */
  storedResolved?: true;
}

/** True only when an email really went out for a row that was really saved.
 * A skipped send, a failed send and a failed insert (the row is not there for
 * the "emailed" stamp to land on) all count as not emailed. */
export function alertWasEmailed(result: RunAlertAdminResult): boolean {
  return result.emailSent && result.emailError == null && result.insertOutcome !== 'insert_failed';
}

/** Run the persist-then-email contract. Never throws. */
export async function runAlertAdmin(
  subject: string,
  deps: RunAlertAdminDeps
): Promise<RunAlertAdminResult> {
  const log = deps.log ?? (() => {});
  const logError = deps.logError ?? (() => {});

  let insertOutcome: InsertOutcome;
  let storedResolved = false;
  try {
    const result = await deps.insert();
    insertOutcome = classifyInsertResult(result);
    storedResolved = insertOutcome === 'inserted' && result.storedResolved === true;
    if (insertOutcome === 'deduped') {
      log(`operator_alerts insert deduped (existing unresolved match): ${subject}`);
    } else if (insertOutcome === 'insert_failed') {
      logError(`operator_alerts insert failed: ${subject}`, result.error);
    }
  } catch (err) {
    insertOutcome = 'insert_failed';
    logError(`operator_alerts insert threw: ${subject}`, err);
  }

  if (storedResolved) {
    log(`operator_alerts row stored already resolved; email skipped: ${subject}`);
    return {
      insertOutcome,
      emailAttempted: false,
      emailError: null,
      emailSent: false,
      storedResolved: true,
    };
  }

  if (insertOutcome === 'deduped' && deps.skipEmailOnDuplicate) {
    return { insertOutcome, emailAttempted: false, emailError: null, emailSent: false };
  }

  let emailError: unknown = null;
  let emailSent = false;
  try {
    const sent = await deps.sendEmail();
    emailSent = sent?.sent !== false;
  } catch (err) {
    emailError = err;
    logError(`Alert email error: ${subject}`, err);
  }

  return { insertOutcome, emailAttempted: true, emailError, emailSent };
}

/** Every older caller's subject prefix: the payment alerts. */
export const DEFAULT_ALERT_SUBJECT_PREFIX = '[myK9Show payments]';

export interface AlertEmailDeps {
  /** RESEND_API_KEY; unset means the send is skipped and reported as not sent. */
  apiKey: string | undefined;
  to: string;
  post: (init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  }) => Promise<{ ok: boolean; status: number }>;
  log: (message: string) => void;
}

/** One alert email. Resolves { sent: false } when no key is configured (MYK9-2301), so the
 * caller never records an email that did not go out; throws when the provider refuses it. */
export async function sendAlertEmailWith(
  deps: AlertEmailDeps,
  subject: string,
  html: string,
  prefix: string = DEFAULT_ALERT_SUBJECT_PREFIX
): Promise<{ sent: boolean }> {
  if (!deps.apiKey) {
    deps.log(`Alert email skipped (no RESEND_API_KEY): ${subject}`);
    return { sent: false };
  }
  const res = await deps.post({
    method: 'POST',
    headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'myK9Show <notifications@myk9show.com>',
      to: deps.to,
      subject: `${prefix} ${subject}`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Alert email failed (${res.status}): ${subject}`);
  return { sent: true };
}
