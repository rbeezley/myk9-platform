/**
 * MYK9-1527: `classes.ring_phase` / `ring_phase_time` (20261030174300) are an optional column
 * set. Vercel can serve a build before `supabase db push` runs, and PostgREST then fails the
 * WHOLE classes request (42703 on a read, PGRST204 on a write), which is every signed-in role's
 * class list. A read names the pair, and when the server rejects it the read is retried once
 * without it; the answer is remembered for the session so later syncs skip the failed request.
 */
import { isRingPhaseSchemaUnavailable } from '@/features/payments/pullRefundSchemaCompatibility';
import { logger } from '@/services/LoggingService';

let ringPhaseColumnsMissing = false;

/** True once the server has rejected the ring phase pair this session. */
export function isRingPhaseKnownMissing(): boolean {
  return ringPhaseColumnsMissing;
}

/** Drop the ring phase pair from a classes column list; other columns and embeds are untouched. */
export function withoutRingPhaseColumns(select: string): string {
  return select.replace(/,\s*ring_phase(?:_time)?(?=\s*(?:,|$))/g, '');
}

/** Test seam: forget what this session learned about the server's schema. */
export function resetRingPhaseSchemaCache(): void {
  ringPhaseColumnsMissing = false;
}

/**
 * Run a classes read, retrying once without the ring phase pair when the server lacks it.
 * `run(omitRingPhase)` receives whether to leave the pair out of its select.
 */
export async function withRingPhaseFallback<T extends { error: unknown }>(
  run: (omitRingPhase: boolean) => PromiseLike<T>
): Promise<T> {
  if (ringPhaseColumnsMissing) return run(true);
  const first = await run(false);
  if (!isRingPhaseSchemaUnavailable(first.error as { code?: string; message?: string } | null)) {
    return first;
  }
  ringPhaseColumnsMissing = true;
  logger.warn('[classes] ring_phase is not in the schema yet; reading without the ring phase');
  return run(true);
}
