/**
 * Pure, date-aware statistics for MyEntriesPage.
 *
 * These helpers are the single source of truth for the "Upcoming Shows" and
 * "Past Shows" summary counts. They exist to fix two long-standing defects:
 *
 *  1. The cards are labelled "Shows" but historically counted *entries*, so an
 *     exhibitor with 6 entries across 3 shows saw "6 Past Shows".
 *  2. "Past" was decided with a live-timestamp comparison against `start_date`,
 *     so a multi-day show that started earlier but is *still running today* was
 *     bucketed as past (and never as upcoming). That disagreed with the
 *     date-range-aware "Show today" banner (get_account_today_entries RPC).
 *
 * The rule here is day-granular and end-date aware: a show is past only once
 * its final day is before today.
 *
 * @module MyEntriesPage/stats
 */

import { parseLocalDateString } from '@/utils/dateLocal';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import { dominantStatus, dominantStatusKind } from './groupEntriesByOrder';
import type { EntryClass, MyEntry } from './my-entries-types';

/**
 * Parse a show date that may be a date-only string ("YYYY-MM-DD") or a full
 * timestamp.
 *
 * `new Date("2026-06-02")` parses as **UTC** midnight, which in a negative-offset
 * zone (e.g. America/Chicago) becomes the *previous* local day — so a show
 * ending today would be read as yesterday and wrongly bucketed "past". For
 * date-only strings we build a local-midnight Date instead; full timestamps
 * (which already carry an offset) fall through to the native parser.
 */
export function parseShowDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const local = parseLocalDateString(value); // only matches bare YYYY-MM-DD
  if (local) return local;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Midnight (local) for the given date — strips the time component. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The last calendar day a show runs — its end date when known, else the start date. */
function showLastDay(entry: Pick<MyEntry, 'showDate' | 'showEndDate'>): Date {
  return entry.showEndDate ?? entry.showDate;
}

/**
 * A show is "past" only once its final day is before today. A multi-day show
 * that started earlier but is still running today is NOT past.
 */
export function isPastShowEntry(
  entry: Pick<MyEntry, 'showDate' | 'showEndDate'>,
  now: Date
): boolean {
  return startOfLocalDay(showLastDay(entry)).getTime() < startOfLocalDay(now).getTime();
}

/**
 * Is this individual class row scored? Reads `entryStatusKind` — the display
 * classifier that folds `check_in_status` into `entry_status` — because a row
 * can sit at `entry_status='confirmed'` with `check_in_status='completed'` and
 * still be scored, which keying on `entryStatus` alone would miss.
 */
function isScoredClass(cls: EntryClass): boolean {
  return (
    cls.isScored === true ||
    cls.entryStatusKind === 'completed' ||
    cls.entryStatus === EntryStatus.COMPLETED
  );
}

/**
 * Is this ORDER fully scored — i.e. every class the exhibitor still has to run
 * has a result?
 *
 * Deliberately per-class, NOT read off the order's aggregated
 * `entryStatusKind`. `groupEntriesByOrder` resolves an order's top-level status
 * by highest priority and puts `COMPLETED` at the top of that scale, so a
 * single scored class makes the whole order read `completed` while its sibling
 * classes are still unrun. Keying the Completed tab on that aggregate would
 * file a card as done mid-show and hide the exhibitor's remaining runs — the
 * seeded Aug 29 show has exactly this shape (two of its three scored rows sit
 * in two-row orders with one class still to run).
 *
 * Rows the exhibitor will not run — scratched, moved, absent — do not hold an
 * order open, so an order with no runnable classes left is done even though
 * none of its rows carry a result (`every` on an empty list is vacuously
 * true, which is the behaviour we want here). When no class rows are present
 * at all (hand-built fixtures and legacy rows that never went through
 * `groupEntriesByOrder`) this falls back to the order's own status.
 */
export function isScoredEntry(entry: MyEntry): boolean {
  if (entry.classes.length > 0) {
    return entry.classes.filter(cls => cls.status === 'entered').every(isScoredClass);
  }
  return entry.entryStatusKind === 'completed' || entry.entryStatus === EntryStatus.COMPLETED;
}

export interface PartiallyScoredState {
  /** Live classes on this order still awaiting a result. Always >= 1. */
  remainingClasses: number;
  /** Dominant status among those remaining classes — what the card still IS. */
  entryStatus: EntryStatus;
  /** Dominant display kind among them, resolved the same way the order card is. */
  entryStatusKind: EntryStatusKind | undefined;
}

/**
 * Describe an order that is *some* of the way through its runs, or `undefined`
 * when it is either untouched or finished.
 *
 * `groupEntriesByOrder` resolves an order card's status by highest priority
 * with COMPLETED at the top of the scale, so one scored class makes the whole
 * card report `completed` and render a "Scored" badge — while sibling classes
 * are still unrun. This recovers what the card should actually say: how many
 * runs are left, and the dominant status among *those* rows, so the summary
 * band describes the work remaining rather than the one result already in.
 *
 * The remaining rows are folded with the same `dominantStatus` /
 * `dominantStatusKind` precedence the grouping itself uses, so a card never
 * disagrees with its own class list about which state is showing.
 */
export function getPartiallyScoredState(
  entry: Pick<MyEntry, 'classes' | 'entryStatus'>
): PartiallyScoredState | undefined {
  const liveClasses = entry.classes.filter(cls => cls.status === 'entered');
  const remaining = liveClasses.filter(cls => !isScoredClass(cls));
  // Untouched (nothing scored) or finished (nothing left) — neither is partial.
  if (remaining.length === 0 || remaining.length === liveClasses.length) return undefined;

  let entryStatus: EntryStatus | undefined;
  let entryStatusKind: EntryStatusKind | undefined;
  for (const cls of remaining) {
    const classStatus = cls.entryStatus ?? entry.entryStatus;
    if (entryStatus === undefined) {
      entryStatus = classStatus;
      entryStatusKind = cls.entryStatusKind;
      continue;
    }
    // Resolve the kind against the PREVIOUS status, before it is reassigned.
    entryStatusKind = dominantStatusKind(
      entryStatus,
      entryStatusKind,
      classStatus,
      cls.entryStatusKind
    );
    entryStatus = dominantStatus(entryStatus, classStatus);
  }

  return {
    remainingClasses: remaining.length,
    entryStatus: entryStatus ?? entry.entryStatus,
    entryStatusKind,
  };
}

/**
 * The exhibitor's "nothing further will happen here" predicate, and the single
 * rule behind the Upcoming / Completed tab pair.
 *
 * These two tabs used to split on `isPastShowEntry` alone, i.e. purely on the
 * calendar. That let a scored entry at a show whose last day is still in the
 * future render a "Scored" badge on its card while the strip read
 * `Completed 0` and counted it as Upcoming — two different definitions of
 * "done" on one screen. Folding the scored check in makes the tab agree with
 * the exhibitor's actual state in both directions. Note that a PARTIALLY
 * scored order stays Upcoming (see `isScoredEntry`) even though its card badge
 * still reads "Scored" — the badge summarises by dominant status, which is a
 * separate question from whether the exhibitor is done.
 *
 * Deliberately NOT used by `computeMyEntriesShowDateStats` or the fee math:
 * "Past Shows" / "Upcoming Shows" and amount-due are genuine show-date
 * questions, and a scored entry can still owe money.
 */
export function isCompletedEntry(entry: MyEntry, now: Date): boolean {
  return isScoredEntry(entry) || isPastShowEntry(entry, now);
}

export interface MyEntriesShowDateStats {
  /** Distinct shows whose final day is before today. */
  pastShows: number;
  /** Distinct shows that are running today or in the future. */
  upcomingShows: number;
  /** Entries belonging to a non-past (current or future) show. */
  upcomingEntries: number;
}

/** Stable key for de-duplicating shows; falls back to name+date for legacy rows without an id. */
function showKey(entry: MyEntry): string {
  return entry.showId || `${entry.showName}|${entry.showDate.getTime()}`;
}

/**
 * Compute show-date-derived stats from the user's entries.
 *
 * Counts DISTINCT shows (deduped by show), not entries — the cards are labelled
 * "Past Shows" / "Upcoming Shows".
 */
export function computeMyEntriesShowDateStats(
  entries: MyEntry[],
  now: Date
): MyEntriesShowDateStats {
  const pastShowIds = new Set<string>();
  const upcomingShowIds = new Set<string>();
  let upcomingEntries = 0;

  for (const entry of entries) {
    if (isPastShowEntry(entry, now)) {
      pastShowIds.add(showKey(entry));
    } else {
      upcomingShowIds.add(showKey(entry));
      upcomingEntries += 1;
    }
  }

  return {
    pastShows: pastShowIds.size,
    upcomingShows: upcomingShowIds.size,
    upcomingEntries,
  };
}

/**
 * Upcoming (non-past) class count per dog, keyed by `dogId`.
 *
 * An order can span several dogs, so each dog's own classes are attributed to
 * its own `dogId` rather than lumped onto the order's lead dog — this is the
 * count `DogStrip` renders, and `exhibitor-count-integrity` requires it to
 * match the dog's own activity view.
 */
export function countUpcomingClassesByDog(
  entries: MyEntry[],
  now: Date = new Date()
): Record<string, number> {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    if (isPastShowEntry(entry, now)) return counts;
    for (const dog of entry.dogs) {
      counts[dog.dogId] = (counts[dog.dogId] ?? 0) + dog.classes.length;
    }
    return counts;
  }, {});
}
