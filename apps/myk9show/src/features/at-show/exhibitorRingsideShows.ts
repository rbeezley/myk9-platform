/**
 * exhibitorRingsideShows — pure selection of the shows an exhibitor is entered
 * in that have not started yet, for the Ringside entry chooser.
 *
 * Ringside's only exhibitor source was `get_account_today_entries` (TODAY, by
 * design — it drives auto-favoriting for a live show). That left an exhibitor
 * entered in next weekend's trial resolving to zero shows on every other day,
 * so `/at-show` fell through to its empty state and the passcode button was the
 * only action left on screen. Managers and judges both feed an "upcoming"
 * bucket; this gives exhibitors the equivalent one.
 *
 * Reads the same account-level, offline-aware `getUserEntries` rows My Shows
 * uses — no new network path — and emits UPCOMING refs only. A show running
 * today is already covered by the today source, and `resolveRingsideEntry`
 * drops any upcoming ref that is also live, so overlap is harmless either way.
 */

import { showDateRangeStatus } from '@/utils/date-format';
import { isActiveSubmittedEntryStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import type { NamedShowSource } from './ringsideEntryResolver';

/** The subset of a `getUserEntries` row this selector reads. */
export interface ExhibitorEntryRow {
  entry_status?: string | null;
  check_in_status?: string | null;
  deleted_at?: string | null;
  show?: {
    id?: string | null;
    name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    deleted_at?: string | null;
  } | null;
}

/**
 * Shows the exhibitor is entered in whose date range is still in the future.
 *
 * Excluded: soft-deleted entries and shows, entries that are no longer live
 * (withdrawn / scratched / not accepted / pulled — `isActiveSubmittedEntryStatus`,
 * the same predicate the Shows page uses for its "entered" tab), shows already
 * running or finished, and shows missing an id or name (a partially replicated
 * row cannot be labelled, and an unlabelled card is worse than no card).
 *
 * Deduplicated by show id — one exhibitor typically holds many entry rows per
 * show (one per dog per class).
 */
export function selectExhibitorUpcomingShows(
  rows: readonly ExhibitorEntryRow[],
  now: Date = new Date()
): NamedShowSource[] {
  const byShowId = new Map<string, string>();

  for (const row of rows) {
    if (row.deleted_at) continue;
    if (!isActiveSubmittedEntryStatus(row.entry_status, row.check_in_status)) continue;

    const show = row.show;
    if (!show || show.deleted_at) continue;

    const showId = show.id;
    const showName = show.name;
    if (!showId || !showName) continue;
    if (byShowId.has(showId)) continue;

    const startDate = show.start_date;
    if (!startDate) continue;
    // `end_date` falls back to `start_date` so a show missing one keeps its
    // single-day semantics rather than reading as never-ending — matching
    // `useMyShows.toPhase`, the manager-side bucketing this mirrors.
    if (showDateRangeStatus(startDate, show.end_date || startDate, now) !== 'upcoming') continue;

    byShowId.set(showId, showName);
  }

  return Array.from(byShowId, ([showId, showName]) => ({ showId, showName }));
}
