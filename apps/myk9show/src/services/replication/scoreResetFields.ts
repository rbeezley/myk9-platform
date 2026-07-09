import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/**
 * The detailed scent-work scoring columns, cleared to null. Spread into EVERY
 * reset-score `updateEntry` payload so a reset doesn't leave stale per-area
 * times / find counts / points on the entry (they'd otherwise persist until the
 * next full score overwrites them, showing wrong detail in secretary reports).
 * All columns are ringside-RPC-whitelisted, so the reset still routes correctly.
 */
export const SCORE_DETAIL_CLEAR_FIELDS: Partial<ReplicatedEntry> = {
  area1_time_seconds: null,
  area2_time_seconds: null,
  area3_time_seconds: null,
  area4_time_seconds: null,
  total_correct_finds: null,
  total_incorrect_finds: null,
  no_finish_count: null,
  points_earned: null,
};
