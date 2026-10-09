import {
  isAccountedFor,
  isExpectedEntry,
  isOnClassRunList,
  type EntryAccountingFields,
} from '@/features/_shared/entryAccounting';
import { isPendingEntryStatus } from '@/features/entry-operations/classEntryBreakdown';
import type { SecretaryEntry } from '@/services/database/entries';

/** Stable identity so a missing read does not remint the array each render. */
export const EMPTY_ENTRIES: SecretaryEntry[] = [];

export interface ShowDeskEntriesAvailability {
  /** The read produced data, so counts derived from it are facts. */
  entriesKnown: boolean;
  /**
   * Settled with no data and no error: the query paused (offline) or was
   * disabled. Deliberately NOT keyed on connectivity -- what matters is whether
   * the read produced data, and an online request that never resolves lands
   * here too.
   */
  entriesUnavailable: boolean;
}

/**
 * Reads the three "settled with no data" React Query states apart.
 *
 * The Show Desk derives every per-class count, every pending-attention chip,
 * the mark-complete guard, People at show, the Show Map and closeout from one
 * entries query. An empty array therefore has to mean "this show has no
 * entries" and nothing else.
 *
 * The query inherits React Query's `'online'` networkMode (App.tsx mounts a
 * bare QueryClient and `optimizeQueryCache` sets none), so losing wifi at a
 * venue PAUSES it: `fetchStatus` becomes 'paused', which makes `isFetching`
 * false, which makes `isLoading` false -- and pending is not error, so
 * `isError` is false too. Every gate on the page fell through, and the desk
 * rendered "0 of 0 scored" on classes with 40 entries, with no attention chips
 * at all, reading as fully clear mid-show.
 */
export function getShowDeskEntriesAvailability(input: {
  data: readonly SecretaryEntry[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /**
   * Whether the query is enabled at all. A DISABLED query is also "settled with
   * no data", but it is not a failure and `refetch()` on it does nothing -- so
   * offering a Try again button there hands the secretary an affordance that
   * can never succeed. Defaults to true so callers that always enable the query
   * need not pass it.
   */
  isEnabled?: boolean;
}): ShowDeskEntriesAvailability {
  const enabled = input.isEnabled ?? true;
  return {
    entriesKnown: input.data !== undefined,
    entriesUnavailable: enabled && input.data === undefined && !input.isLoading && !input.isError,
  };
}

export function accountingFields(entry: SecretaryEntry): EntryAccountingFields {
  return {
    entry_status: entry.entry_status ?? undefined,
    check_in_status: entry.check_in_status ?? undefined,
    is_scored: entry.is_scored ?? undefined,
    result_status: entry.result_status ?? undefined,
  };
}

export interface ClassEntryTally {
  /** Dogs the class still has to score: accepted and expected to run. */
  total: number;
  /** Of `total`, those the server counts as done (scored, absent or excused). */
  scored: number;
  /** Rows on the class run list, pending included: what Run order sorts. */
  runList: number;
  /** Not yet accepted (the card's "N pending"); out of `total`, still open work. */
  pending: number;
}

/**
 * Per-class entry tallies in a single pass.
 *
 * This used to be two `showEntries.filter()` scans inside a `.map` over every
 * class -- O(2 x classes x entries), recomputed whenever `showEntries` changed
 * identity, which realtime invalidation does routinely. At the load-rehearsal
 * shape that is hundreds of thousands of array visits per recompute.
 *
 * `total` excludes withdrawn, scratched, absent, moved, not-accepted and pulled
 * rows (`isExpectedEntry`, MYK9-976) and pending ones, which the card counts on
 * its own "N pending" link. Counting every row made a class with two withdrawn
 * dogs read "0 of 3 scored" and never look finished at close-out. `scored`
 * follows the server's `isAccountedFor`, so an absent or excused result is done.
 */
export function tallyEntriesByClass(
  entries: readonly SecretaryEntry[]
): ReadonlyMap<string, ClassEntryTally> {
  const tallies = new Map<string, ClassEntryTally>();
  for (const entry of entries) {
    const classId = entry.class_id;
    if (!classId) continue;
    const fields = accountingFields(entry);
    const onRunList = isOnClassRunList(fields);
    const pending = Boolean(entry.entry_status && isPendingEntryStatus(entry.entry_status));
    const toScore = isExpectedEntry(fields) && !pending;
    if (!onRunList && !toScore) continue;
    const tally = tallies.get(classId) ?? { total: 0, scored: 0, runList: 0, pending: 0 };
    if (onRunList) tally.runList += 1;
    if (onRunList && pending) tally.pending += 1;
    if (toScore) {
      tally.total += 1;
      if (isAccountedFor(fields)) tally.scored += 1;
    }
    tallies.set(classId, tally);
  }
  return tallies;
}
