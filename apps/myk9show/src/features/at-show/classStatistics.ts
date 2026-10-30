/**
 * The one class-statistics calculation (MYK9-1502): entries, scored, qualified
 * rate, fastest and average time. It reads the replicated entry rows, so it runs
 * offline, and counts through `entryAccounting` so "scored" agrees with the
 * class list's "n of m scored" counter.
 */
import {
  expectedEntries,
  isAccountedFor,
  type EntryAccountingFields,
} from '@/features/_shared/entryAccounting';

export interface ClassStatsEntry extends EntryAccountingFields {
  searchTimeSeconds?: number | null | undefined;
  search_time_seconds?: number | null | undefined;
}

export interface ClassStatistics {
  /** Entries the show expects to run (withdrawn, scratched and pulled left out). */
  entries: number;
  /** Expected entries with a result recorded. */
  scored: number;
  qualified: number;
  /** Qualified as a share of scored, 0 to 100; null until something is scored. */
  qualifiedRate: number | null;
  /** Of the qualified runs that recorded a time; null when none did. */
  fastestSeconds: number | null;
  averageSeconds: number | null;
}

function searchTime(entry: ClassStatsEntry): number | null {
  const seconds = entry.searchTimeSeconds ?? entry.search_time_seconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function computeClassStatistics(all: ClassStatsEntry[]): ClassStatistics {
  const expected = expectedEntries(all);
  const scored = expected.filter(isAccountedFor);
  const qualified = scored.filter(
    entry => (entry.resultStatus ?? entry.result_status)?.trim().toLowerCase() === 'qualified'
  );
  const times = qualified.map(searchTime).filter((t): t is number => t !== null);
  return {
    entries: expected.length,
    scored: scored.length,
    qualified: qualified.length,
    qualifiedRate: scored.length ? Math.round((qualified.length / scored.length) * 100) : null,
    fastestSeconds: times.length ? Math.min(...times) : null,
    averageSeconds: times.length ? times.reduce((sum, t) => sum + t, 0) / times.length : null,
  };
}

/** 83.4 -> "1:23.40"; under a minute -> "45.20". */
export function formatStatTime(seconds: number): string {
  const centis = Math.round(seconds * 100);
  const minutes = Math.floor(centis / 6000);
  const rest = ((centis % 6000) / 100).toFixed(2);
  return minutes > 0 ? `${minutes}:${rest.padStart(5, '0')}` : rest;
}
