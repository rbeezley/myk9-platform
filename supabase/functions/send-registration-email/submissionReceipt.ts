// The one receipt for a check or cash submission (MYK9-1963). Deno-free so vitest can import it.
//
// Once per submission is enforced by claiming the submission's entries: the claim stamps
// entries.confirmation_email_sent_at, the same marker the scheduled send-confirmation-email
// sender filters on (`confirmation_email_sent_at IS NULL`), so a claimed entry never gets a
// second receipt from either sender, and a retry claims nothing and sends nothing.

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
          column: 'confirmation_email_sent_at',
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
    .update({ confirmation_email_sent_at: nowIso, confirmation_email_status: 'sent' })
    .in('id', entryIds)
    .is('confirmation_email_sent_at', null)
    .select('id');
  if (error) throw new Error(`Could not claim the submission's entries: ${error.message}`);
  return (data ?? []).map(row => row.id);
}

/** Hands a claim back after a failed send so the scheduled sender stays the retry path. */
export async function releaseSubmissionClaim(
  client: EntryClaimClient,
  entryIds: string[]
): Promise<void> {
  await client
    .from('entries')
    .update({ confirmation_email_sent_at: null, confirmation_email_status: 'failed' })
    .in('id', entryIds);
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
