/**
 * Reconciles the TWO sources My Shows has for "am I on a wait list".
 *
 * The status chips and the filtered list read the `entries` table
 * (`isWaitlistEntry` → `getOperationalEntryState(e) === 'waitlist'`). The
 * "My Wait List Positions" section reads the `waitlist_entries` table, which
 * is a different thing entirely: `add_to_waitlist` queues a dog for a full
 * class and need not create an entry row at all, and when it does the entry
 * sits at its own status ('submitted' in the MYK9-417 reproduction) rather
 * than 'waitlisted'.
 *
 * Nothing reconciled them, so the page said both things at once: a `Waitlist 0`
 * chip and an empty state reading "No waitlisted entries … Nothing to do here
 * right now", rendered directly above a live "#1 · Juni · Interior Advanced"
 * position with a Withdraw button. `filterEntriesByStatus` already keeps the
 * count and the list from drifting apart — but only from EACH OTHER; the drift
 * was between both of them and the positions section.
 *
 * So the rule is stated once, here, and the chip count, the empty state and the
 * section all read the same answer. Making them disagree requires changing this
 * file, not remembering to change three call sites.
 *
 * @module MyEntriesPage/modules/waitlistSurface
 */

import type { EntryStatusFilter, EntryTabFilter } from './my-entries-types';

export interface WaitlistSurfaceInput {
  /**
   * Entries whose OWN status is waitlisted, already narrowed to the active tab
   * and scope — the number the chip used to show on its own.
   */
  waitlistEntryCount: number;
  /**
   * Positions the exhibitor HOLDS: `waitlist_entries` rows at `waiting` or
   * `offered`. This is the number the chip promises.
   */
  activePositionCount: number;
  /**
   * Rows the section would RENDER, which is the active list plus any terminal
   * offer a `?waitlistOffer=` deep link pulled in to explain. Larger than the
   * active count only on that path — and a dead offer still deserves its
   * explanation, so it keeps the section (and the empty-state suppression)
   * without ever reaching the chip.
   */
  displayedPositionCount: number;
  /** The positions query has not settled yet, so the count proves nothing. */
  isLoadingPositions: boolean;
  selectedTab: EntryTabFilter;
  selectedStatus: EntryStatusFilter;
  /**
   * An inbound `?showId=/?entryIds=` scope from My Payments' Receipt link is
   * on. It names specific entry rows; a wait-list position is not one of them
   * and we cannot tell which show it belongs to from the row the page holds,
   * so positions stay out rather than widening a list the banner has just
   * promised is narrowed.
   */
  isScoped: boolean;
}

export interface WaitlistSurface {
  /** What the `Waitlist` chip reads — both sources, one number. */
  chipCount: number;
  /**
   * Whether "My Wait List Positions" renders under the current filter pair.
   * The section is part of the filtered surface, not page furniture: leaving it
   * up while the exhibitor filters to Pending would be the same contradiction
   * pointing the other way.
   */
  showPositions: boolean;
  /**
   * Whether an empty filtered list may show the "No waitlisted entries"
   * copy. False while positions are on screen or still loading — that copy
   * ends "Nothing to do here right now", which is a claim about the whole
   * page, not about the entries list.
   */
  allowEmptyState: boolean;
}

/**
 * A `waiting` or `offered` position is a queue for a class that has not been
 * run yet, so it can never belong to Completed. Excluding it there keeps the
 * chip's promise: a count is what clicking will show.
 */
function tabAdmitsPositions(tab: EntryTabFilter): boolean {
  return tab !== 'completed';
}

/** The status axis: positions are a waitlist thing, so only 'any' and 'waitlist'. */
function statusAdmitsPositions(status: EntryStatusFilter): boolean {
  return status === 'any' || status === 'waitlist';
}

export function resolveWaitlistSurface({
  waitlistEntryCount,
  activePositionCount,
  displayedPositionCount,
  isLoadingPositions,
  selectedTab,
  selectedStatus,
  isScoped,
}: WaitlistSurfaceInput): WaitlistSurface {
  const inScope = tabAdmitsPositions(selectedTab) && !isScoped;
  const visible = inScope && statusAdmitsPositions(selectedStatus);
  const showPositions = visible && (isLoadingPositions || (inScope && displayedPositionCount > 0));

  return {
    // While the query is in flight the count is genuinely unknown; showing the
    // entries-only number is the honest placeholder, and the skeleton below it
    // says the rest is still arriving.
    chipCount: waitlistEntryCount + (inScope ? activePositionCount : 0),
    showPositions,
    allowEmptyState: !showPositions,
  };
}
