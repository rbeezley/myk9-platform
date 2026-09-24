/**
 * Utility functions for determining show entry status
 */

import type { Show } from '@/types/show-types';
import { toLocalDate } from './date-format';
import { formatShortCalendarDate } from '@/lib/format/dates';
import { isActiveSubmittedEntryStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import { currentEntryWindowDate, getEntryWindowTimezone } from './entryWindowDate';

export type EntryStatus =
  | 'window_unknown' // No entry window set (or today cannot be resolved): says nothing about when entries open
  | 'not_yet_open' // Before entry open date
  | 'accepting' // Currently accepting entries
  | 'closing_soon' // Closing within 7 days
  | 'closed' // After entry close date
  | 'submitted' // User has submitted entries
  | 'setup_incomplete'; // Show has no configured classes to enter

export interface EntryStatusInfo {
  status: EntryStatus;
  label: string;
  description: string;
  daysUntilClose?: number;
  daysUntilOpen?: number;
  canEnter: boolean;
}

interface EntryStatusOptions {
  hasEntryClassInventory?: boolean | null;
}

export function hasKnownEntryClassInventory(show: Show): boolean | null {
  if (!show.trials || show.trials.length === 0) return null;
  const trialsWithClassLists = show.trials.filter(trial => Array.isArray(trial.classes));
  if (trialsWithClassLists.length === 0) return null;
  return trialsWithClassLists.some(trial => (trial.classes?.length ?? 0) > 0);
}

/**
 * Get entry status for a show
 */
export function getEntryStatus(
  show: Show,
  userHasEntries: boolean = false,
  options: EntryStatusOptions = {}
): EntryStatusInfo {
  // `entryOpenDate` / `entryCloseDate` are typed `string` but are genuinely
  // absent on a show whose entry window was never set, and `toLocalDate` calls
  // `.split` on them. That threw here for EVERY audience -- this line runs
  // before the public / exhibitor / management branch in `ShowDetailsPage` --
  // so one such show rendered the lazy-route error boundary's "Failed to load
  // component" over the whole page. Found while pinning MYK9-634.
  const entryWindowKnown = Boolean(show.entryOpenDate && show.entryCloseDate);
  const openDate = entryWindowKnown ? toLocalDate(show.entryOpenDate) : null;
  const closeDate = entryWindowKnown ? toLocalDate(show.entryCloseDate) : null;
  const today = currentEntryWindowDate(undefined, getEntryWindowTimezone(show.trials));
  if (!today || !openDate || !closeDate) {
    // currentEntryWindowDate always resolves a date in practice (see
    // entryWindowDate.ts); this guards that theoretical case (e.g. a bad IANA
    // zone) AND the real one above, a show with no entry window at all. The
    // same copy is right for both: the window is not available. Never say
    // "Entries open <date>" here — this path runs
    // before the userHasEntries check, so the show may already be entered,
    // and this branch has no evidence either way about the entry window.
    //
    // Its own status (MYK9-649). This used to return `not_yet_open`, and every
    // consumer that branches on the enum rather than the label -- the public
    // landing's Enter gate, the badge icon, the browse filters -- treated a
    // window nobody set as a window that opens later.
    return {
      status: 'window_unknown',
      label: 'Entry status unavailable',
      description: 'Entry window is not available yet',
      canEnter: false,
    };
  }
  const dayDiff = (target: Date): number =>
    Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Before entry open date
  if (today < openDate) {
    const daysUntilOpen = dayDiff(openDate);
    return {
      status: 'not_yet_open',
      label: `Entries open ${formatShortCalendarDate(show.entryOpenDate)}`,
      description: `Entries open in ${daysUntilOpen} day${daysUntilOpen !== 1 ? 's' : ''}`,
      daysUntilOpen,
      canEnter: false,
    };
  }

  // After entry close date
  if (today > closeDate) {
    return {
      status: 'closed',
      label: 'Entries Closed',
      description: `Entries closed on ${closeDate.toLocaleDateString()}`,
      canEnter: false,
    };
  }

  // User has already submitted entries and entries are still open
  if (userHasEntries) {
    return {
      status: 'submitted',
      label: 'Entry Submitted',
      description: 'You have entries for this show',
      canEnter: true, // Can still add more entries while open
    };
  }

  const hasEntryClassInventory =
    options.hasEntryClassInventory ?? hasKnownEntryClassInventory(show);
  if (hasEntryClassInventory === false) {
    return {
      status: 'setup_incomplete',
      label: 'Classes Not Ready',
      description: 'This show has no classes assigned yet, so entries are not available.',
      canEnter: false,
    };
  }

  // Currently accepting entries
  const daysUntilClose = dayDiff(closeDate);

  // Closing soon (within 7 days)
  if (daysUntilClose <= 7) {
    return {
      status: 'closing_soon',
      label:
        daysUntilClose === 0
          ? 'Closes Today!'
          : `Closes in ${daysUntilClose} day${daysUntilClose !== 1 ? 's' : ''}`,
      description: `Hurry! Entries close on ${closeDate.toLocaleDateString()}`,
      daysUntilClose,
      canEnter: true,
    };
  }

  // Normal accepting entries
  return {
    status: 'accepting',
    label: 'Accepting Entries',
    description: `Entries close on ${closeDate.toLocaleDateString()}`,
    daysUntilClose,
    canEnter: true,
  };
}

/**
 * Whether the public landing must withhold its Enter CTA because entries are
 * not open YET: the window has not opened, or nobody set one (MYK9-649).
 * `closed` is false on purpose: the landing's countdown judges closing in the
 * show's own zone. `setup_incomplete` is gated separately by class inventory.
 */
export function isEntryWindowNotOpen(status: EntryStatus): boolean {
  switch (status) {
    case 'not_yet_open':
    case 'window_unknown':
      return true;
    case 'accepting':
    case 'closing_soon':
    case 'closed':
    case 'submitted':
    case 'setup_incomplete':
      return false;
    default:
      return unknownStatusNotOpen(status);
  }
}

function unknownStatusNotOpen(status: never): boolean {
  void status;
  return true;
}

/**
 * Get badge styling based on entry status
 */
export function getEntryStatusBadgeStyle(status: EntryStatus): {
  className: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  switch (status) {
    case 'accepting':
      return {
        className: 'bg-success/10 text-success border-success/20 border',
        variant: 'default',
      };
    case 'closing_soon':
      return {
        className: 'bg-warning/10 text-warning border-warning/20 border animate-pulse',
        variant: 'default',
      };
    case 'closed':
      return {
        className: 'bg-muted/50 text-muted-foreground border-muted/20 border',
        variant: 'secondary',
      };
    case 'submitted':
      return {
        className: 'bg-primary/10 text-primary border-primary/20 border',
        variant: 'default',
      };
    case 'not_yet_open':
    case 'setup_incomplete':
    case 'window_unknown':
      return {
        className: 'bg-muted/30 text-muted-foreground border-muted/10 border',
        variant: 'outline',
      };
    default:
      return unknownStatusBadgeStyle(status);
  }
}

/**
 * `never` makes a new `EntryStatus` member a compile error in the switch above
 * instead of a silent fall-through; the body still covers a bad value at runtime.
 */
function unknownStatusBadgeStyle(status: never): {
  className: string;
  variant: 'secondary';
} {
  void status;
  return { className: 'bg-muted text-muted-foreground', variant: 'secondary' };
}

/**
 * Check if user has entries for a specific show
 */
export function userHasEntriesForShow(
  showId: string,
  userEntries: Array<{
    showId?: string | undefined;
    show_id?: string | undefined;
    status?: string | null | undefined;
    entry_status?: string | null | undefined;
    checkInStatus?: string | null | undefined;
    check_in_status?: string | null | undefined;
    deletedAt?: string | null | undefined;
    deleted_at?: string | null | undefined;
  }> = []
): boolean {
  return userEntries.some(entry => {
    if (entry.showId !== showId && entry.show_id !== showId) return false;
    if (entry.deletedAt || entry.deleted_at) return false;
    const status = entry.status ?? entry.entry_status;
    const checkInStatus = entry.checkInStatus ?? entry.check_in_status;
    if (status === undefined && checkInStatus === undefined) return true;
    return isActiveSubmittedEntryStatus(status, checkInStatus);
  });
}
