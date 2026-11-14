// Retry sweep for failed submit receipts (MYK9-1963). Deno-free so vitest can import it.
//
// A check or cash receipt that failed to send is released by send-registration-email as
// entries.receipt_email_status = 'failed' with receipt_email_sent_at NULL. This sweep runs on
// every scheduled (batch) send-confirmation-email call, independent of any trial's
// confirmation_date, and re-asks send-registration-email to send those receipts. That function
// claims the entries again and derives the SAME Resend idempotency key from the claimed ids, so a
// receipt that actually went out the first time is not duplicated.
//
// Card receipts are not swept: a failed card send stamps nothing, and the stripe-webhook's own
// replay (cart_fulfillments.receipt_sent_at) retries it.

/** Wait this long after the last attempt, so a send still in flight is not retried underneath itself. */
export const RECEIPT_RETRY_MIN_AGE_MS = 5 * 60 * 1000;
/** Give up on a receipt this old: a person is told by the failed status, not by an endless retry. */
export const RECEIPT_RETRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Registrations re-sent per run; the rest wait for the next run. */
export const RECEIPT_SWEEP_MAX_REGISTRATIONS = 10;
const ROW_FETCH_LIMIT = 100;

export interface FailedReceiptRow {
  id: string;
  registration_id: string | null;
}

/** The slice of the Supabase client the sweep reads; a fake satisfies it in tests. */
export interface ReceiptSweepClient {
  from(table: 'entries'): {
    update(patch: { receipt_email_attempted_at: string }): {
      in(column: 'id', ids: string[]): PromiseLike<{ error: { message: string } | null }>;
    };
    select(columns: 'id, registration_id'): {
      eq(
        column: 'receipt_email_status',
        value: 'failed'
      ): {
        is(
          column: 'receipt_email_sent_at',
          value: null
        ): {
          is(
            column: 'deleted_at',
            value: null
          ): {
            lt(
              column: 'receipt_email_attempted_at',
              value: string
            ): {
              gt(
                column: 'receipt_email_attempted_at',
                value: string
              ): {
                order(
                  column: 'receipt_email_attempted_at',
                  options: { ascending: true }
                ): {
                  limit(count: number): PromiseLike<{
                    data: FailedReceiptRow[] | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    };
  };
}

/** What one re-send came to: sent, failed but worth another run, or refused (a 4xx: retrying cannot help). */
export type ReceiptResendOutcome = 'sent' | 'retry' | 'rejected';

export interface ReceiptSweepResult {
  retried: number;
  stillFailing: number;
  /** Registrations the server refused with a 4xx; sent to the back of the queue, not retried again this run. */
  rejected: number;
}

/** Groups failed entries by registration, oldest first, capped at `maxRegistrations`. */
export function groupFailedReceipts(
  rows: FailedReceiptRow[],
  maxRegistrations: number
): Array<{ registrationId: string; entryIds: string[] }> {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.registration_id) continue;
    const ids = groups.get(row.registration_id);
    if (ids) ids.push(row.id);
    else if (groups.size < maxRegistrations) groups.set(row.registration_id, [row.id]);
  }
  return [...groups].map(([registrationId, entryIds]) => ({ registrationId, entryIds }));
}

/**
 * Re-sends failed receipts through `resend` (which POSTs send-registration-email). One failing
 * registration never stops the others; the count of those still failing is returned, not thrown.
 */
export async function sweepFailedReceipts(
  client: ReceiptSweepClient,
  resend: (registrationId: string, entryIds: string[]) => Promise<ReceiptResendOutcome>,
  nowMs: number
): Promise<ReceiptSweepResult> {
  const { data, error } = await client
    .from('entries')
    .select('id, registration_id')
    .eq('receipt_email_status', 'failed')
    .is('receipt_email_sent_at', null)
    .is('deleted_at', null)
    .lt('receipt_email_attempted_at', new Date(nowMs - RECEIPT_RETRY_MIN_AGE_MS).toISOString())
    .gt('receipt_email_attempted_at', new Date(nowMs - RECEIPT_RETRY_MAX_AGE_MS).toISOString())
    .order('receipt_email_attempted_at', { ascending: true })
    .limit(ROW_FETCH_LIMIT);
  if (error) {
    console.error('Could not read failed receipts', { message: error.message });
    return { retried: 0, stillFailing: 0, rejected: 0 };
  }

  let retried = 0;
  let stillFailing = 0;
  let rejected = 0;
  for (const group of groupFailedReceipts(data ?? [], RECEIPT_SWEEP_MAX_REGISTRATIONS)) {
    let outcome: ReceiptResendOutcome = 'retry';
    try {
      outcome = await resend(group.registrationId, group.entryIds);
    } catch (err) {
      // A timeout or network error: this registration failed, the others still run.
      console.error('Receipt retry threw', { message: err instanceof Error ? err.message : '' });
    }
    if (outcome === 'sent') {
      retried++;
    } else if (outcome === 'rejected') {
      rejected++;
      // The queue is oldest-attempt first, so a permanently refused registration would take a slot
      // every run. Stamping the attempt moves it behind everything not yet tried.
      const { error: deferError } = await client
        .from('entries')
        .update({ receipt_email_attempted_at: new Date(nowMs).toISOString() })
        .in('id', group.entryIds);
      if (deferError)
        console.error('Could not defer a refused receipt', { message: deferError.message });
    } else {
      stillFailing++;
    }
  }
  return { retried, stillFailing, rejected };
}
