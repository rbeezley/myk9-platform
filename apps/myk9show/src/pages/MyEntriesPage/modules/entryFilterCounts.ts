/**
 * The My Shows filter strip's counts, and what they are scoped to (MYK9-657).
 *
 * The When row and the Status row compose, and each row's COUNTS are scoped to
 * the other row's selection: a Status count answers "how many will I see if I
 * click this, within the window I picked", and a When count answers the same
 * within the status I picked. That is the right promise for a chip, but it was
 * invisible — picking Completed re-scoped every Status number without a word,
 * and a Status chip could read 0 for a status the exhibitor demonstrably holds.
 * This module states the relationship (`describeFilterScope`) and tells a
 * narrowed 0 apart from "none at all" (`statusChipCountText`).
 *
 * The derivations are pure and the hook calls them, so the composed case is
 * testable without rendering the page.
 *
 * @module MyEntriesPage/modules/entryFilterCounts
 */

import { ENTRY_STATUS_FILTER_DEFS, ENTRY_TAB_DEFS, TAB_PREDICATES } from './entryTabDefs';
import { orderMatchesStatusFilter } from './statusFilterPredicate';
import { resolveWaitlistSurface, type WaitlistSurface } from './waitlistSurface';
import type { EntryStatusFilter, EntryTabFilter, MyEntry } from './my-entries-types';

/** The wait-list position facts the Waitlist chip folds in beside entries. */
export interface WaitlistPositionFacts {
  activePositionCount: number;
  displayedPositionCount: number;
  isLoadingPositions: boolean;
  isScoped: boolean;
}

/**
 * Per-status counts WITHIN one When window, plus the wait-list surface for
 * that window. The `waitlist` chip is the one count not derived from entries
 * alone — `waitlist_entries` positions ride along through
 * `resolveWaitlistSurface`, the same rule the positions section reads.
 */
export function deriveStatusCounts(
  entries: MyEntry[],
  tab: EntryTabFilter,
  selectedStatus: EntryStatusFilter,
  now: Date,
  positions: WaitlistPositionFacts
): { counts: Record<EntryStatusFilter, number>; surface: WaitlistSurface } {
  const inTab = entries.filter(entry => TAB_PREDICATES[tab](entry, now));
  const waitlistEntries = inTab.filter(entry => orderMatchesStatusFilter(entry, 'waitlist')).length;
  const surface = resolveWaitlistSurface({
    waitlistEntryCount: waitlistEntries,
    ...positions,
    selectedTab: tab,
    selectedStatus,
  });
  return {
    counts: {
      any: inTab.length + (surface.chipCount - waitlistEntries),
      pending: inTab.filter(entry => orderMatchesStatusFilter(entry, 'pending')).length,
      accepted: inTab.filter(entry => orderMatchesStatusFilter(entry, 'accepted')).length,
      waitlist: surface.chipCount,
    },
    surface,
  };
}

/**
 * Per-window counts WITHIN one status. `positionCount` is the wait-list
 * positions that belong on All and Upcoming (never Completed) under this
 * status; the caller decides it, because only it knows the scope.
 *
 * A position has no `MyEntry` row, so it renders in its own section below
 * the show list rather than as a row inside it (MYK9-417). Folding it into a
 * badge's count is therefore only honest when it is the ONLY thing that
 * badge describes — a real order under the same tab already has its own row
 * in the list the badge sits above, and adding the position on top would
 * count something the list underneath does not contain (MYK9-804: an
 * exhibitor read "All 8" over a 7-row list and took the extra one for a
 * missing entry, when it was a wait-list position rendered elsewhere on the
 * page). So the position only stands in for an otherwise-EMPTY tab.
 */
export function deriveTabCounts(
  entries: MyEntry[],
  status: EntryStatusFilter,
  now: Date,
  positionCount: number
): Record<EntryTabFilter, number> {
  const statusFiltered = entries.filter(entry => orderMatchesStatusFilter(entry, status));
  return Object.fromEntries(
    ENTRY_TAB_DEFS.map(tab => {
      const realCount = statusFiltered.filter(entry => TAB_PREDICATES[tab.id](entry, now)).length;
      const admitsPositions = tab.id !== 'completed';
      const count = admitsPositions && realCount === 0 ? realCount + positionCount : realCount;
      return [tab.id, count];
    })
  ) as Record<EntryTabFilter, number>;
}

function tabLabel(tab: EntryTabFilter): string {
  return ENTRY_TAB_DEFS.find(def => def.id === tab)?.label ?? tab;
}

function statusLabel(status: EntryStatusFilter): string {
  return ENTRY_STATUS_FILTER_DEFS.find(def => def.id === status)?.label ?? status;
}

/**
 * The visible count on a Status chip. A 0 inside a narrowing When window,
 * for a status the exhibitor HAS in another window, says where it is 0
 * ("0 in Completed"), so it cannot read as "you have none of these".
 */
export function statusChipCountText(
  status: EntryStatusFilter,
  count: number,
  countAcrossAllWindows: number,
  tab: EntryTabFilter
): string {
  if (count === 0 && tab !== 'all' && status !== 'any' && countAcrossAllWindows > 0) {
    return `0 in ${tabLabel(tab)}`;
  }
  return String(count);
}

/**
 * One plain sentence under the strip saying which row's counts the other row
 * is narrowing, or null when neither narrows (All + Any status).
 */
export function describeFilterScope(tab: EntryTabFilter, status: EntryStatusFilter): string | null {
  const parts: string[] = [];
  if (tab !== 'all') {
    parts.push(`Status counts are for ${tabLabel(tab).toLowerCase()} shows only.`);
  }
  if (status !== 'any') {
    parts.push(`When counts are for ${statusLabel(status).toLowerCase()} entries only.`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
