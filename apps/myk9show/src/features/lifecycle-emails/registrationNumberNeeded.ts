import type { LifecycleEmailSupabaseClient } from './api';
import { fetchAllPages } from './pagedRead';
import { buildLifecycleEmailIdempotencyKey } from './types';

export const REGISTRATION_NUMBER_NEEDED_STEP = 'registration_number_needed' as const;

/**
 * Idempotency key for one "registration number needed" email about one entry.
 * The first email uses the plain key; every later one (a reminder) carries its
 * sequence, so a reminder is never deduplicated against the first send.
 */
export function buildRegistrationNumberNeededIdempotencyKey(input: {
  showId: string;
  entryId: string;
  /** How many of these emails already exist for the entry (0 for the first). */
  priorCount: number;
}): string {
  return buildLifecycleEmailIdempotencyKey({
    showId: input.showId,
    stepType: REGISTRATION_NUMBER_NEEDED_STEP,
    recipientScope: 'entry',
    entryId: input.entryId,
    batchKey: input.priorCount > 0 ? `reminder-${input.priorCount}` : null,
  });
}

/** An entry's "registration number needed" email history, as the next send needs it. */
export interface RegistrationNumberNeededHistory {
  /** Every job for the entry, whatever its status: the next reminder's sequence. */
  count: number;
  /** The waiting or failed job, if any: at most one, by the database's index. */
  outstandingJobIds: string[];
}

/**
 * The entry's "registration number needed" jobs. The database allows at most ONE
 * waiting or failed one per entry (a partial unique index); when it exists it is the
 * email to send, so Send reminder never creates a second sendable copy.
 */
export async function readRegistrationNumberNeededHistory(args: {
  supabase: LifecycleEmailSupabaseClient;
  showId: string;
  entryId: string;
}): Promise<RegistrationNumberNeededHistory> {
  const result = await args.supabase
    .from<Array<{ id: string; status: string | null }>>('show_lifecycle_email_jobs')
    .select('id, status')
    .eq('show_id', args.showId)
    .eq('step_type', REGISTRATION_NUMBER_NEEDED_STEP)
    .eq('entry_id', args.entryId);
  if (result.error) {
    throw new Error(result.error.message ?? 'Failed to read earlier registration number emails');
  }
  const rows = result.data ?? [];
  return {
    count: rows.length,
    outstandingJobIds: rows
      .filter(row => row.status === 'ready' || row.status === 'failed')
      .map(row => row.id),
  };
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
