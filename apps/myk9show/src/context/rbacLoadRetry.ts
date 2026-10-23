import { isReadDeadlineTimeout } from '@/services/database/readDeadlineFetch';

/** Attempts the RBAC load makes on a transient failure (a dropped connection, an abort). */
export const RBAC_TRANSIENT_ATTEMPTS = 3;
export const RBAC_TRANSIENT_RETRY_STEP_MS = 250;
/**
 * Attempts on a read the 30 s Supabase deadline cut off (MYK9-1374): the
 * server is still running the first copy (PostgREST does not cancel it), so
 * one more try, after a pause, not three in quick succession.
 */
export const RBAC_DEADLINE_ATTEMPTS = 2;
export const RBAC_DEADLINE_RETRY_DELAY_MS = 5_000;

/**
 * How long the RBAC load waits before attempt `attempt + 1`, or `null` for no
 * retry. `attempt` is the 0-based attempt that just failed; `transient` is the
 * caller's own classification (an abort or a browser fetch failure).
 */
export function rbacRetryDelayMs(
  error: unknown,
  attempt: number,
  transient: boolean
): number | null {
  if (isReadDeadlineTimeout(error)) {
    return attempt + 1 < RBAC_DEADLINE_ATTEMPTS ? RBAC_DEADLINE_RETRY_DELAY_MS : null;
  }
  if (!transient) return null;
  return attempt + 1 < RBAC_TRANSIENT_ATTEMPTS
    ? RBAC_TRANSIENT_RETRY_STEP_MS * (attempt + 1)
    : null;
}
