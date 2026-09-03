/**
 * quickAdvanceCandidates — the ranking behind the post-save "up next" chips
 * (MYK9-83) and the pending-tab gate bubble.
 *
 * INTENT (product decision, MYK9-83): strict run order holds only about half
 * the time at the gate, so we NEVER auto-advance to a single guess. We offer a
 * small set of candidates and let the human pick — three chips is usually
 * enough for the dog that actually walks in to be one tap away.
 *
 * Check-in statuses are an OPPORTUNISTIC enrichment, never a requirement: most
 * gate stewards work from a paper sheet, so `at-gate` / `come-to-gate` will
 * frequently be absent for every entry. With no status data at all this
 * degrades exactly to `pendingByRunOrder` — same order, same dogs.
 *
 * Layered on top of the shared run-queue primitive rather than re-sorting:
 * the in-ring dog stays excluded from the queue (runQueue's locked semantic).
 */

import { pendingByRunOrder, type RunQueueEntry } from './runQueue';

/**
 * A run-queue entry that may also carry a show-day check-in status.
 *
 * `checkInStatus` is the myK9Show `CheckInStatus` value where the host tracks
 * check-in separately from the entry lifecycle (replicated rows do). Ringside's
 * own `Entry` keeps both on `status`, which is why that is the fallback.
 *
 * Optionals are `| undefined` so hosts compiled with
 * `exactOptionalPropertyTypes` can assign object literals directly.
 */
export interface QuickAdvanceEntry extends RunQueueEntry {
  checkInStatus?: string | undefined;
}

/** Gate statuses, strongest signal first. A dog AT the gate beats one called to it. */
export const GATE_PRIORITY_STATUSES = ['at-gate', 'come-to-gate'] as const;

export type GateStatus = (typeof GATE_PRIORITY_STATUSES)[number];

/** The gate status on an entry, or null when there is none (the common case). */
export function gateStatusOf(entry: QuickAdvanceEntry): GateStatus | null {
  const raw = entry.checkInStatus ?? entry.status;
  const match = GATE_PRIORITY_STATUSES.find(status => status === raw);
  return match ?? null;
}

/**
 * Promotion rank: 0 = at the gate, 1 = called to the gate, 2 = no gate signal.
 * Every entry ranks 2 when no statuses exist, so ordering is left untouched.
 */
export function gateRank(entry: QuickAdvanceEntry): number {
  const status = gateStatusOf(entry);
  if (status === null) return GATE_PRIORITY_STATUSES.length;
  return GATE_PRIORITY_STATUSES.indexOf(status);
}

/**
 * Pending entries in run order, with gate-flagged dogs stable-partitioned to
 * the front. Run order is preserved within each rank, so with zero status data
 * the result is identical to `pendingByRunOrder`.
 */
export function gatePromotedPending<T extends QuickAdvanceEntry>(entries: readonly T[]): T[] {
  return pendingByRunOrder(entries)
    .map((entry, index) => ({ entry, index, rank: gateRank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(row => row.entry);
}

export const DEFAULT_QUICK_ADVANCE_LIMIT = 3;

/**
 * Up to `limit` one-tap candidates for "who runs next", best first.
 *
 * Returns fewer than `limit` near the end of a class and an empty array when
 * the class is done — callers render nothing rather than an empty shell.
 */
export function quickAdvanceCandidates<T extends QuickAdvanceEntry>(
  entries: readonly T[],
  limit: number = DEFAULT_QUICK_ADVANCE_LIMIT
): T[] {
  if (limit <= 0) return [];
  return gatePromotedPending(entries).slice(0, limit);
}

/** Short human label for a gate status, or null when there is nothing to say. */
export function gateStatusLabel(entry: QuickAdvanceEntry): string | null {
  const status = gateStatusOf(entry);
  if (status === 'at-gate') return 'At gate';
  if (status === 'come-to-gate') return 'Called to gate';
  return null;
}
