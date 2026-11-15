/**
 * gateRank — the gate-aware ordering the Pending tab uses.
 *
 * INTENT (product decision, MYK9-83, updated MYK9-2012): dogs often do not come
 * in the ring in run order, so the app never chooses or suggests the next dog.
 * This only ranks the list a person is already looking at: a dog checked in AT
 * the gate or CALLED to it sorts ahead of the rest. Check-in statuses are an
 * opportunistic enrichment: with a paper gate sheet none exist and every entry
 * ranks the same, so run order is left untouched.
 */

import type { RunQueueEntry } from './runQueue';

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
export interface GateRankEntry extends RunQueueEntry {
  checkInStatus?: string | undefined;
}

/** Gate statuses, strongest signal first. A dog AT the gate beats one called to it. */
export const GATE_PRIORITY_STATUSES = ['at-gate', 'come-to-gate'] as const;

export type GateStatus = (typeof GATE_PRIORITY_STATUSES)[number];

/** The gate status on an entry, or null when there is none (the common case). */
export function gateStatusOf(entry: GateRankEntry): GateStatus | null {
  const raw = entry.checkInStatus ?? entry.status;
  const match = GATE_PRIORITY_STATUSES.find(status => status === raw);
  return match ?? null;
}

/**
 * Promotion rank: 0 = at the gate, 1 = called to the gate, 2 = no gate signal.
 * Every entry ranks 2 when no statuses exist, so ordering is left untouched.
 */
export function gateRank(entry: GateRankEntry): number {
  const status = gateStatusOf(entry);
  if (status === null) return GATE_PRIORITY_STATUSES.length;
  return GATE_PRIORITY_STATUSES.indexOf(status);
}
