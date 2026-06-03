/**
 * Types for MyEntriesPage
 * @module MyEntriesPage/types
 */

import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import type { ResultStatus } from '@/components/common/ResultBadge';

/**
 * Represents a class entry within a show registration
 */
export interface EntryClass {
  id: string;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string | undefined;
  runOrder?: number | undefined;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
  checkInStatus?: CheckInStatus | undefined;
  checkInTime?: Date | undefined;
  /** Whether this entry has been scored */
  isScored?: boolean | undefined;
  /** Result status: qualified, nq, absent, excused, withdrawn */
  resultStatus?: ResultStatus | undefined;
  /** Search time in seconds */
  searchTimeSeconds?: number | undefined;
  /** Total faults */
  totalFaults?: number | undefined;
  /** Final placement */
  finalPlacement?: number | undefined;
}

/**
 * Represents a user's entry in a show
 */
export interface MyEntry {
  id: string;
  registrationId: string;
  showId: string;
  showName: string;
  showDate: Date;
  /** Final calendar day the show runs; absent for legacy/single-day rows. */
  showEndDate?: Date | undefined;
  location: {
    venue: string;
    city: string;
    state: string;
  };
  dogName: string;
  dogId: string;
  classes: EntryClass[];
  totalFee: number;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  registrationNumber?: string | undefined;
  confirmationNumber?: string | undefined;
  entryCloseDate?: Date | undefined;
  submittedAt: Date;
  lastUpdated: Date;
}

/**
 * Computed statistics for entries
 */
export interface MyEntryStats {
  total: number;
  accepted: number;
  pending: number;
  /** Entries belonging to a non-past (current or future) show. */
  upcoming: number;
  /** Distinct shows whose final day is before today. */
  pastShows: number;
  /** Distinct shows running today or in the future. */
  upcomingShows: number;
  acceptedPaid: number;
  acceptedUnpaid: number;
  needsAction: number;
  totalFees: number;
  paidFees: number;
  unpaidFees: number;
  acceptedPercent: number;
  paidPercent: number;
  needsActionPercent: number;
}

/**
 * Dialog state for check-in status
 */
export interface CheckInDialogState {
  open: boolean;
  entry: MyEntry | null;
  classEntry: EntryClass | null;
}

/**
 * Dialog state for entry edit
 */
export interface EditDialogState {
  open: boolean;
  entry: MyEntry | null;
}

/**
 * Dialog state for receipt
 */
export interface ReceiptDialogState {
  open: boolean;
  entry: MyEntry | null;
}

/**
 * Tab filter options
 */
export type EntryTabFilter = 'all' | 'pending' | 'accepted' | 'waitlist' | 'upcoming' | 'completed';

/**
 * Entry update event from real-time subscription
 */
export interface EntryUpdateEvent {
  type: string;
  entryId: string;
  changes: Record<string, unknown>;
}
