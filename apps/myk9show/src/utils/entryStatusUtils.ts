/**
 * Utility functions for determining show entry status
 */

import type { Show } from '@/types/show-types';

export type EntryStatus =
  | 'not_yet_open' // Before entry open date
  | 'accepting' // Currently accepting entries
  | 'closing_soon' // Closing within 7 days
  | 'closed' // After entry close date
  | 'submitted'; // User has submitted entries

export interface EntryStatusInfo {
  status: EntryStatus;
  label: string;
  description: string;
  daysUntilClose?: number;
  daysUntilOpen?: number;
  canEnter: boolean;
}

/**
 * Get entry status for a show
 */
export function getEntryStatus(show: Show, userHasEntries: boolean = false): EntryStatusInfo {
  const now = new Date();
  const openDate = new Date(show.entryOpenDate);
  const closeDate = new Date(show.entryCloseDate);

  // Before entry open date
  if (now < openDate) {
    const daysUntilOpen = Math.ceil((openDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      status: 'not_yet_open',
      label: `Opens ${openDate.toLocaleDateString()}`,
      description: `Entries open in ${daysUntilOpen} day${daysUntilOpen !== 1 ? 's' : ''}`,
      daysUntilOpen,
      canEnter: false,
    };
  }

  // After entry close date
  if (now > closeDate) {
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

  // Currently accepting entries
  const daysUntilClose = Math.ceil((closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

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
