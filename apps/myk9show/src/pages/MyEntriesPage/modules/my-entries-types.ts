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
  /** Entry row id (one dog in one class) — used as `p_entry_id` for check-in. */
  id: string;
  /** The class being entered. Distinct from `id`; drives the self-check-in cascade. */
  classId?: string | undefined;
  name: string;
  number: string;
  fee: number;
  /** Trial date for this class row, distinct from the show start date. */
  trialDate?: Date | undefined;
  /** Trial number assigned by the show secretary/registry. */
  trialNumber?: string | undefined;
  jumpHeight?: string | undefined;
  /** Trial discipline (e.g. "Scent Work", "Agility"); gates the jump-height field. */
  trialType?: string | undefined;
  runOrder?: number | undefined;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
  /** Denormalized handler display name; may differ from the dog owner when a proxy handles the dog. */
  handler?: string | undefined;
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
  /** Class result release marker; changes when secretary releases or re-releases results. */
  resultsReleasedAt?: string | undefined;
  /** Optional dog photo URL for result-card rendering. */
  dogImageUrl?: string | undefined;
}

/**
 * One dog's slice of a grouped order card: identity + its own nested classes.
 * A single-dog order still populates a one-element `dogs` array on `MyEntry`
 * so `MyEntryCard` has one shape to render regardless of dog count.
 */
export interface MyEntryDogGroup {
  /** Stable row id for this dog within the order (first merged class row's id). */
  id: string;
  dogId: string;
  dogName: string;
  /** Dog's armband number for this show, shared across class rows when assigned. */
  armband?: string | undefined;
  classes: EntryClass[];
  /** Dominant status across this dog's own classes (see `dominantStatus`). */
  entryStatus: EntryStatus;
}

/**
 * Represents a user's entry — grouped to one card per online order
 * (`registrationId`; entries with no registration fall back to a show+dog
 * grouping so nothing disappears — see `groupEntriesByOrder`). `dogName` /
 * `dogId` / `armband` / `classes` mirror the *first* dog on the order for
 * back-compat with single-dog rendering and callers that only care about
 * "the" dog; `dogs` holds every dog on the order and `classes` is the
 * flattened union of every dog's classes (kept in lockstep by
 * `updateEntryCheckIn`).
 */
export interface MyEntry {
  id: string;
  /** Null for secretary/mail-in entries with no linked online registration. */
  registrationId: string | null;
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
  /** Dog's armband number for this show, shared across class rows when assigned. */
  armband?: string | undefined;
  /** Flattened classes across every dog on the order. */
  classes: EntryClass[];
  /** Every dog on this order, in submission order. Length 1 for a single-dog order. */
  dogs: MyEntryDogGroup[];
  totalFee: number;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  /** Raw `entries.payment_method` (DB vocabulary: 'online' | 'cash' | 'check' |
   * 'waived' | 'secretary_paid' | 'group_payment' | null). Drives the cash/check
   * "pay at show" status vs the online "Finish Payment" CTA (4.C). */
  paymentMethod?: string | null;
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
  /** Accepted entries belonging to a non-past/current-or-upcoming show. */
  currentAcceptedEntries: number;
  /** Pending-review entries belonging to a non-past/current-or-upcoming show. */
  currentPendingEntries: number;
  acceptedPaid: number;
  acceptedUnpaid: number;
  needsAction: number;
  /** Fees for non-past accepted or pending-review entries only. */
  currentFees: number;
  /** Unpaid fees for non-past accepted or pending-review entries only. */
  currentAmountDue: number;
  /** All-time fees across every loaded user entry. */
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
