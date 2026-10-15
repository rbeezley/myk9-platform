import type { LifecycleEmailFunctionsClient, LifecycleEmailSupabaseClient } from './api';
import { fetchAllPages } from './pagedRead';

export const REGISTRATION_NUMBER_NEEDED_STEP = 'registration_number_needed' as const;

/** What the server did with one "Email exhibitor" / "Send reminder" press. */
export type RegistrationNumberNeededOutcome =
  | { status: 'sent'; jobId: string }
  | { status: 'failed'; jobId: string }
  | { status: 'skipped'; reason: 'not_held' | 'unverified' | 'no_email' }
  | { status: 'busy' };

/**
 * Sends the reviewed text in one server-side step. The server alone authorizes, checks the
 * step switch and that the entry is still held, resolves the owner's current address,
 * replaces any earlier unsent email and builds the idempotency key; none of that is sent
 * from the browser.
 */
export async function sendRegistrationNumberNeededEmail(args: {
  supabase: LifecycleEmailFunctionsClient;
  showId: string;
  entryId: string;
  subject: string;
  body: string;
  secretaryNote: string;
}): Promise<RegistrationNumberNeededOutcome> {
  const { data, error } = await args.supabase.functions.invoke('send-lifecycle-email', {
    body: {
      action: 'send_registration_number_needed',
      show_id: args.showId,
      entry_id: args.entryId,
      subject: args.subject,
      body: args.body,
      secretary_note: args.secretaryNote,
    },
  });
  if (error) throw new Error(error.message ?? 'Failed to send the registration number email');
  const outcome = data as Partial<RegistrationNumberNeededOutcome> | null | undefined;
  if (outcome?.status === 'sent' || outcome?.status === 'failed') {
    return outcome as RegistrationNumberNeededOutcome;
  }
  if (outcome?.status === 'busy') return { status: 'busy' };
  if (outcome?.status === 'skipped') return outcome as RegistrationNumberNeededOutcome;
  throw new Error('Unexpected response from the registration number email');
}

/**
 * How many "registration number needed" jobs exist per entry in the show, whatever their
 * status, in one paged read (not one per row). Entries with none are absent from the map.
 */
export async function fetchRegistrationNumberNeededJobCounts(args: {
  supabase: LifecycleEmailSupabaseClient;
  showId: string;
}): Promise<Record<string, number>> {
  const result = await fetchAllPages<{ id: string; entry_id: string | null }>(() =>
    args.supabase
      .from<Array<{ id: string; entry_id: string | null }>>('show_lifecycle_email_jobs')
      .select('id, entry_id')
      .eq('show_id', args.showId)
      .eq('step_type', REGISTRATION_NUMBER_NEEDED_STEP)
  );
  if (result.error) {
    throw new Error(result.error.message ?? 'Failed to read registration number emails');
  }
  const counts: Record<string, number> = {};
  for (const row of result.data ?? []) {
    if (row.entry_id) counts[row.entry_id] = (counts[row.entry_id] ?? 0) + 1;
  }
  return counts;
}
