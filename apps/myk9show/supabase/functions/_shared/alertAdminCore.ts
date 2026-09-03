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
   * includes the caller's own "no RESEND_API_KEY configured" no-op skip). */
  sendEmail: () => Promise<void>;
  log?: (message: string) => void;
  logError?: (message: string, err?: unknown) => void;
}

export interface RunAlertAdminResult {
  insertOutcome: InsertOutcome;
  emailAttempted: boolean;
  emailError: unknown;
}

/** Run the persist-then-email contract. Never throws. */
export async function runAlertAdmin(
  subject: string,
  deps: RunAlertAdminDeps
): Promise<RunAlertAdminResult> {
  const log = deps.log ?? (() => {});
  const logError = deps.logError ?? (() => {});

  let insertOutcome: InsertOutcome;
  try {
    const result = await deps.insert();
    insertOutcome = classifyInsertResult(result);
    if (insertOutcome === 'deduped') {
      log(`operator_alerts insert deduped (existing unresolved match): ${subject}`);
    } else if (insertOutcome === 'insert_failed') {
      logError(`operator_alerts insert failed: ${subject}`, result.error);
    }
  } catch (err) {
    insertOutcome = 'insert_failed';
    logError(`operator_alerts insert threw: ${subject}`, err);
  }

  if (insertOutcome === 'deduped' && deps.skipEmailOnDuplicate) {
    return { insertOutcome, emailAttempted: false, emailError: null };
  }

  let emailError: unknown = null;
  try {
    await deps.sendEmail();
  } catch (err) {
    emailError = err;
    logError(`Alert email error: ${subject}`, err);
  }

  return { insertOutcome, emailAttempted: true, emailError };
}
