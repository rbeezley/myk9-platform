import type { LifecycleEmailSupabaseClient } from './api';
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

/** How many "registration number needed" jobs exist for the entry, whatever their status. */
export async function countRegistrationNumberNeededJobs(args: {
  supabase: LifecycleEmailSupabaseClient;
  showId: string;
  entryId: string;
}): Promise<number> {
  const result = await args.supabase
    .from<Array<{ id: string }>>('show_lifecycle_email_jobs')
    .select('id')
    .eq('show_id', args.showId)
    .eq('step_type', REGISTRATION_NUMBER_NEEDED_STEP)
    .eq('entry_id', args.entryId);
  if (result.error) {
    throw new Error(result.error.message ?? 'Failed to read earlier registration number emails');
  }
  return result.data?.length ?? 0;
}
