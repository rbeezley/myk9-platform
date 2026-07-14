/**
 * Utility functions for determining show entry status
 */

import type { Show } from '@/types/show-types';
import { toLocalDate } from './date-format';
import { isActiveSubmittedEntryStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import { currentEntryWindowDate, getEntryWindowTimezone } from './entryWindowDate';

export type EntryStatus =
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
  const openDate = toLocalDate(show.entryOpenDate);
  const closeDate = toLocalDate(show.entryCloseDate);
  const today = currentEntryWindowDate(undefined, getEntryWindowTimezone(show.trials));
  if (!today) {
    return {
      status: 'not_yet_open',
      label: `Opens ${openDate.toLocaleDateString()}`,
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
      label: `Opens ${openDate.toLocaleDateString()}`,
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
      return {
        className: 'bg-muted/30 text-muted-foreground border-muted/10 border',
        variant: 'outline',
      };
    default:
      return {
        className: 'bg-muted text-muted-foreground',
        variant: 'secondary',
      };
  }
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
