import { HttpError } from '../_shared/http/responses.ts';

/** What `claim_registration_number_needed_job` decided for one send request. */
export type NumberNeededClaim =
  | { outcome: 'busy' }
  | { outcome: 'sent'; jobId: string }
  | { outcome: 'send'; jobId: string; recovered: boolean };

/** Reads the RPC's jsonb answer; anything unexpected is a server error, never a guess. */
export function parseNumberNeededClaim(data: unknown): NumberNeededClaim {
  const row = (data ?? {}) as { outcome?: unknown; job_id?: unknown; recovered?: unknown };
  if (row.outcome === 'busy') return { outcome: 'busy' };
  if (
    (row.outcome === 'sent' || row.outcome === 'send') &&
    typeof row.job_id === 'string' &&
    row.job_id !== ''
  ) {
    return row.outcome === 'sent'
      ? { outcome: 'sent', jobId: row.job_id }
      : { outcome: 'send', jobId: row.job_id, recovered: row.recovered === true };
  }
  throw new HttpError(500, 'Failed to save lifecycle email');
}

/** A registration_number_needed send in flight for this long is presumed dead. */
export const NUMBER_NEEDED_STALE_SEND_MS = 10 * 60 * 1000;

/**
 * The claim's two time arguments from ONE definition of the stale window: the cutoff
 * below which a lease-less ready job counts as abandoned, and the in-flight lease the
 * claim stamps on the job it answers `send` for (cleared when the send is recorded).
 */
export function numberNeededClaimWindow(now = Date.now()) {
  return {
    p_stale_before: new Date(now - NUMBER_NEEDED_STALE_SEND_MS).toISOString(),
    p_lease_until: new Date(now + NUMBER_NEEDED_STALE_SEND_MS).toISOString(),
  };
}
