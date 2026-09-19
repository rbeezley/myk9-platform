import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { mapPaymentStatus } from '@/utils/entryManagementUtils';
import { resolveEffectivePaymentStatus } from '@/utils/effectivePaymentStatus';

export const ENTRY_ATTENTION_REASONS = [
  'pending_review',
  'missing_information',
  'payment_due',
] as const;

export type EntryAttentionReason = (typeof ENTRY_ATTENTION_REASONS)[number];
export type ClassAttentionReason = 'reopened_after_closeout';
export type OperationalAttentionFilter =
  'all' | 'pending' | 'missing_information' | 'accepted' | 'waitlist' | 'issues';

export type OperationalEntryState =
  'pending_review' | 'missing_information' | 'accepted' | 'waitlist' | 'terminal' | 'other';

export interface OperationalEntryInput {
  entryStatus?: EntryStatus | null | undefined;
  rawEntryStatus?: string | null | undefined;
  paymentStatus?: PaymentStatus | null | undefined;
  enrollmentPaymentStatus?: PaymentStatus | null | undefined;
}

export interface RawOperationalEntryInput {
  entry_status?: string | null;
  payment_status?: string | null;
  registration?: { payment_status?: string | null } | null;
  /**
   * MYK9-639: set on the DESTINATION of a move-up. Its `payment_status` is
   * `'pending'` by construction — the money stayed on the entry it points at —
   * so this row's payment status says nothing about whether anyone owes
   * anything.
   */
  moved_from_entry_id?: string | null;
}

export interface OperationalClassInput {
  reopenedAfterCloseoutAt?: string | null | undefined;
}

const TERMINAL_ENTRY_STATUSES = new Set<EntryStatus>([
  EntryStatus.CANCELLED,
  EntryStatus.REJECTED,
  EntryStatus.SCRATCHED,
  EntryStatus.MOVED,
  EntryStatus.COMPLETED,
]);

export function getOperationalEntryState(entry: OperationalEntryInput): OperationalEntryState {
  // `missing_info` is not currently part of the database lifecycle enum, but it
  // remains a supported UI state and must not collapse into pending_review.
  if (entry.rawEntryStatus === EntryStatus.MISSING_INFO) return 'missing_information';

  const status = entry.entryStatus ?? mapEntryStatus(entry.rawEntryStatus);
  if (status === EntryStatus.MISSING_INFO) return 'missing_information';
  if (status === EntryStatus.PENDING) return 'pending_review';
  if (status === EntryStatus.ACCEPTED) return 'accepted';
  if (status === EntryStatus.WAITLIST) return 'waitlist';
  if (TERMINAL_ENTRY_STATUSES.has(status)) return 'terminal';
  return 'other';
}

export function classifyEntryAttention(entry: OperationalEntryInput): EntryAttentionReason[] {
  const state = getOperationalEntryState(entry);
  if (state === 'pending_review') return ['pending_review'];
  if (state === 'missing_information') return ['missing_information'];
  if (state === 'accepted' && getEffectivePaymentStatus(entry) === PaymentStatus.PENDING) {
    return ['payment_due'];
  }
  return [];
}

export function matchesOperationalAttentionFilter(
  entry: OperationalEntryInput,
  filter: OperationalAttentionFilter
): boolean {
  if (filter === 'all') return true;
  const state = getOperationalEntryState(entry);
  if (filter === 'pending') return state === 'pending_review';
  if (filter === 'missing_information') return state === 'missing_information';
  if (filter === 'accepted') return state === 'accepted';
  if (filter === 'waitlist') return state === 'waitlist';
  const reasons = classifyEntryAttention(entry);
  return reasons.includes('missing_information') || reasons.includes('payment_due');
}

/**
 * The raw-row classifier, for the two show-day surfaces that never see the
 * mapper's rooted rows: the Show Desk's "Payment due" signal and the class
 * readiness panel.
 *
 * A move-up destination is skipped for the PAYMENT question entirely. It is
 * created money-neutral (`payment_status = 'pending'`, `entry_fee = 0`) and the
 * settlement stays on the entry `moved_from_entry_id` names, which these
 * surfaces do not load — so classifying it here could only ever produce
 * "Payment due" on a dog who has paid, in red, while Entry Management on the
 * same data reports no issue. Two surfaces, two answers, one pair: the defect
 * class MYK9-639 exists to end.
 *
 * Its LIFECYCLE questions (pending review, missing information) are unaffected
 * and still asked, because those are properties of the run, not of the money.
 */
export function classifyRawEntryAttention(entry: RawOperationalEntryInput): EntryAttentionReason[] {
  const reasons = classifyEntryAttention({
    rawEntryStatus: entry.entry_status,
    ...(entry.payment_status != null
      ? { paymentStatus: mapPaymentStatus(entry.payment_status) }
      : {}),
    ...(entry.registration?.payment_status != null
      ? { enrollmentPaymentStatus: mapPaymentStatus(entry.registration.payment_status) }
      : {}),
  });

  if (entry.moved_from_entry_id) {
    return reasons.filter(reason => reason !== 'payment_due');
  }
  return reasons;
}

/**
 * Secretary-facing half of the same rule as the exhibitor balance — see
 * `@/utils/effectivePaymentStatus`. An order's `paid` must not drop an entry
 * that is still `pending` off the attention list (MYK9-495), and an order's
 * `pending` must still raise an entry row that reads paid.
 */
export function getEffectivePaymentStatus(
  entry: Pick<OperationalEntryInput, 'paymentStatus' | 'enrollmentPaymentStatus'>
): PaymentStatus | null {
  return resolveEffectivePaymentStatus(entry.paymentStatus, entry.enrollmentPaymentStatus);
}

export function classifyClassAttention(cls: OperationalClassInput): ClassAttentionReason[] {
  return cls.reopenedAfterCloseoutAt ? ['reopened_after_closeout'] : [];
}
