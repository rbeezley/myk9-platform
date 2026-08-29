import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import type { PullRefundDecision, PullTiming } from '@/features/payments/pullReconciliation';

export type BulkActionResult = boolean | void;

/**
 * Entry management types
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */

export interface EntryClass {
  /** Entry row id for mutation targets; class metadata is display-only here. */
  id: string;
  classId?: string | null;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string;
  trialType?: string;
  handlerId?: string | null;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
  checkInStatus?: CheckInStatus;
  checkInTime?: Date;
}

export interface EntryManagementEntry {
  id: string;
  registrationId: string;
  entryNumber: string;
  showId: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  ownerEmail: string;
  handlerName: string;
  handlerId?: string | null;
  handlerAuthUserId?: string | null;
  ownerId?: string | null;
  ownerAuthUserId?: string | null;
  classes: EntryClass[];
  totalFee: number;
  paidAmount: number;
  entryStatus: EntryStatus;
  /** Raw DB `entry_status` before UI-enum projection. Needed by
   * `deriveEntryPresentation` for the owner-approved review-lane overrides
   * (`paid`/`promotion-expired`) that the UI enum folds away. */
  rawEntryStatus?: string | null;
  /** Scoring facts (entries.is_scored / entries.result_status) — a scored
   * entry can carry these while entryStatus is still ACCEPTED (scoring
   * doesn't always flip lifecycle status to COMPLETED), so guards that only
   * check entryStatus === COMPLETED can miss a real recorded result. */
  isScored?: boolean | null;
  resultStatus?: string | null;
  paymentStatus: PaymentStatus;
  submittedAt: Date;
  lastUpdated: Date;
  notes?: string;
  armbandNumber?: string;
  confirmationNumber?: string;
  comped?: boolean;
  compedReason?: string;
  withdrawalReason?: string;
  enrollmentPaymentStatus?: PaymentStatus | null;
  enrollmentPaymentReference?: string | null;
  enrollmentTotalAmount?: number | null;
  enrollmentPaidAmount?: number | null;
  enrollmentRefundAmount?: number | null;
  enrollmentRefundNotes?: string | null;
  enrollmentRefundedAt?: string | null;
  /** entries.payment_method — 'online' marks Stripe-paid (refundable) entries */
  paymentMethod?: string | null;
  /** Entry-level Stripe refund in dollars, issued via stripe-refund-entry */
  refundAmount?: number | null;
  refundedAt?: string | null;
  /** Stripe charge this entry was paid under — the per-ORDER grouping key for
   * online entries, which have no registrationId */
  stripePaymentIntentId?: string | null;
  /** Post-show pull reconciliation metadata. Null timing deliberately disables a default. */
  pullReason?: string | null;
  pulledAt?: string | null;
  pullTiming?: PullTiming;
  refundDecision?: PullRefundDecision | null;
}

export interface EntryManagementShow {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  entry_close_date?: string | null;
}

export interface BulkAction {
  type: 'status_change' | 'payment_update' | 'send_notification' | 'export';
  data: Record<string, unknown>;
}

export interface EntryStats {
  total: number;
  pending: number;
  accepted: number;
  waitlist: number;
  revenue: number;
  outstanding: number;
}

export interface CheckInDialogState {
  open: boolean;
  entry: EntryManagementEntry | null;
  classEntry: EntryClass | null;
}

export interface ArmbandDialogState {
  open: boolean;
  entry: EntryManagementEntry | null;
  value: string;
  error?: string | null;
}

export interface BulkActionDialogState {
  open: boolean;
  action: string | null;
}
