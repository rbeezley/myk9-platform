// The one receipt for a check or cash submission (MYK9-1963). Deno-free so vitest can import it.
//
// Once per submission is enforced by claiming the submission's entries: the claim stamps
// entries.receipt_email_sent_at, the receipt's OWN marker. The pre-show confirmation keeps
// entries.confirmation_email_* and is never suppressed by a receipt (owner, 2026-11-14), so a
// claimed entry never gets a second receipt and a retry claims nothing and sends nothing.

export const MAX_SUBMISSION_ENTRIES = 100;

/** The slice of the Supabase client the claim needs; a fake satisfies it in tests. */
export interface EntryClaimClient {
  from(table: 'entries'): {
    update(patch: Record<string, unknown>): {
      in(
        column: 'id',
        ids: string[]
      ): {
        is(
          column: 'receipt_email_sent_at',
          value: null
        ): {
          select(columns: 'id'): PromiseLike<{
            data: Array<{ id: string }> | null;
            error: { message: string } | null;
          }>;
        };
      } & PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

/** The slice of the Supabase client the pre-claim failure mark needs. */
export interface EntryFailMarkClient {
  from(table: 'entries'): {
    update(patch: Record<string, unknown>): {
      eq(
        column: 'registration_id',
        value: string
      ): {
        in(
          column: 'id',
          ids: string[]
        ): {
          is(
            column: 'receipt_email_sent_at',
            value: null
          ): PromiseLike<{ error: { message: string } | null }>;
        };
      };
    };
  };
}

/**
 * A request that exits BEFORE the claim (email service unconfigured, registrant with no email,
 * a transient registration read failure) leaves its entries 'pending', which the retry sweep
 * never selects. Marking the named, still-unsent entries 'failed' hands them to the sweep once
 * the cause is fixed. Scoped to the request's own registration, so another registration's entries
 * are never touched; never throws (the caller is already on a failure path).
 */
export async function markReceiptsFailedBeforeClaim(
  client: EntryFailMarkClient,
  registrationId: string,
  entryIds: string[] | null
): Promise<void> {
  if (!entryIds || entryIds.length === 0) return;
  try {
    const { error } = await client
      .from('entries')
      .update({
        receipt_email_status: 'failed',
        receipt_email_attempted_at: new Date().toISOString(),
      })
      .eq('registration_id', registrationId)
      .in('id', entryIds)
      .is('receipt_email_sent_at', null);
    if (error) console.error('Could not mark the receipt failed', { message: error.message });
  } catch (error) {
    console.error('Could not mark the receipt failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Returns the clean id list, or null when the payload is not a usable list of entry ids. */
export function parseEntryIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SUBMISSION_ENTRIES) {
    return null;
  }
  if (!value.every(id => typeof id === 'string' && id.length > 0)) return null;
  return [...new Set(value as string[])];
}

/**
 * Claims the entries that have not been emailed yet. The conditional update is atomic per
 * row, so two concurrent calls never both claim the same entry. Returns the ids this call won.
 */
export async function claimSubmissionEntries(
  client: EntryClaimClient,
  entryIds: string[],
  nowIso: string
): Promise<string[]> {
  const { data, error } = await client
    .from('entries')
    .update({
      receipt_email_sent_at: nowIso,
      receipt_email_status: 'sent',
      receipt_email_attempted_at: nowIso,
    })
    .in('id', entryIds)
    .is('receipt_email_sent_at', null)
    .select('id');
  if (error) throw new Error(`Could not claim the submission's entries: ${error.message}`);
  return (data ?? []).map(row => row.id);
}

/**
 * Hands a claim back after a failed send; the scheduled retry sweep picks it up from here.
 * Returns false (and logs) when the release itself failed, so the caller can report it.
 */
export async function releaseSubmissionClaim(
  client: EntryClaimClient,
  entryIds: string[]
): Promise<boolean> {
  try {
    const { error } = await client
      .from('entries')
      .update({
        receipt_email_sent_at: null,
        receipt_email_status: 'failed',
        receipt_email_attempted_at: new Date().toISOString(),
      })
      .in('id', entryIds);
    if (error) {
      console.error('Could not release the submission claim', { message: error.message });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Could not release the submission claim', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Runs the work between the claim and the send; any throw hands the claim back, then rethrows. */
export async function releaseClaimOnThrow<T>(
  release: () => Promise<unknown>,
  work: () => Promise<T>
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    await release();
    throw error;
  }
}

/** Server-derived Resend key: the claimed entries, never anything the caller names. */
export async function submissionIdempotencyKey(
  registrationId: string,
  claimedIds: string[]
): Promise<string> {
  const data = new TextEncoder().encode([...claimedIds].sort().join(','));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `registration-submission:${registrationId}:${hex.slice(0, 32)}`;
}

export interface SubmittedEntryRow {
  entry_fee: number | null;
  payment_method: string | null;
  payment_status: string | null;
}

/** What the submission itself owes, from its own entries (fees are dollars, the email wants cents). */
export function summarizeSubmission(rows: SubmittedEntryRow[]): {
  totalCents: number;
  payAtShow: 'check' | 'cash' | undefined;
} {
  const totalCents = rows.reduce((sum, row) => sum + Math.round((row.entry_fee ?? 0) * 100), 0);
  const unpaid = rows.filter(row => row.payment_status === 'pending');
  const methods = new Set(unpaid.map(row => row.payment_method));
  const payAtShow = methods.has('check') ? 'check' : methods.has('cash') ? 'cash' : undefined;
  return { totalCents, payAtShow };
}
