/**
 * MYK9-1527: `classes.ring_phase` / `ring_phase_time` (20261030174300) are an optional column
 * set. Vercel can serve a build before `supabase db push` runs, and PostgREST then fails the
 * WHOLE classes request (42703 on a read, PGRST204 on a write), which is every signed-in role's
 * class list. A read names the pair, and when the server rejects it the read is retried once
 * without it. The answer is remembered only for RING_PHASE_RECHECK_MS: the at-show PWA stays open
 * for hours, so a tab that latched before `supabase db push` must ask again rather than drop
 * every ring phase change until reload.
 */
import { isRingPhaseSchemaUnavailable } from '@/features/payments/pullRefundSchemaCompatibility';
import { logger } from '@/services/LoggingService';

/** How long a "the server lacks the pair" answer holds before the next read asks again. */
export const RING_PHASE_RECHECK_MS = 5 * 60 * 1000;

let latchedAt: number | null = null;
let now: () => number = Date.now;

/** True while the server's rejection of the ring phase pair is still fresh. */
export function isRingPhaseKnownMissing(): boolean {
  return latchedAt !== null && now() - latchedAt < RING_PHASE_RECHECK_MS;
}

/** Drop the ring phase pair from a classes column list; other columns and embeds are untouched. */
export function withoutRingPhaseColumns(select: string): string {
  return select.replace(/,\s*ring_phase(?:_time)?(?=\s*(?:,|$))/g, '');
}

/** Test seam: forget what this session learned about the server's schema, and restore the clock. */
export function resetRingPhaseSchemaCache(clock: () => number = Date.now): void {
  latchedAt = null;
  now = clock;
}

/**
 * Run a classes read, retrying once without the ring phase pair when the server lacks it.
 * `run(omitRingPhase)` receives whether to leave the pair out of its select.
 */
export async function withRingPhaseFallback<T extends { error: unknown }>(
  run: (omitRingPhase: boolean) => PromiseLike<T>
): Promise<T> {
  if (isRingPhaseKnownMissing()) return run(true);
  const first = await run(false);
  if (!isRingPhaseSchemaUnavailable(first.error as { code?: string; message?: string } | null)) {
    // The pair was requested; an error that is not about it means the latch (if any) is stale.
    if (!first.error) latchedAt = null;
    return first;
  }
  latchedAt = now();
  logger.warn('[classes] ring_phase is not in the schema yet; reading without the ring phase');
  return run(true);
}
