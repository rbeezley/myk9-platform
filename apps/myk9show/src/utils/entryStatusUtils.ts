/**
 * Utility functions for determining show entry status
 */

import type { Show } from '@/types/show-types';
import { toLocalDate } from './date-format';

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
  const now = new Date();
  const openDate = toLocalDate(show.entryOpenDate);
  const closeDate = toLocalDate(show.entryCloseDate);
  // Inclusive: "Closes Today!" stays on the banner the whole closing day.
  const closeEndOfDay = new Date(closeDate);
  closeEndOfDay.setHours(23, 59, 59, 999);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = (target: Date): number =>
    Math.round((target.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

  // Before entry open date
  if (now < openDate) {
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
  if (now > closeEndOfDay) {
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
        className: 'bg-success-green/10 text-success-green border-success-green/20 border',
        variant: 'default',
      };
    case 'closing_soon':
      return {
        className:
          'bg-warning-orange/10 text-warning-orange border-warning-orange/20 border animate-pulse',
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
  userEntries: Array<{ showId?: string; show_id?: string }> = []
): boolean {
  return userEntries.some(entry => entry.showId === showId || entry.show_id === showId);
}
