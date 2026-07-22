import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { mapPaymentStatus } from '@/utils/entryManagementUtils';

export const ENTRY_ATTENTION_REASONS = [
  'pending_review',
  'missing_information',
  'payment_due',
] as const;

export type EntryAttentionReason = (typeof ENTRY_ATTENTION_REASONS)[number];
export type ClassAttentionReason = 'reopened_after_closeout';
export type OperationalAttentionFilter =
  'all' | 'pending' | 'missing_information' | 'accepted' | 'waitlist' | 'issues' | 'pulled';

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
  if (filter === 'pulled') {
    return (entry.entryStatus ?? mapEntryStatus(entry.rawEntryStatus)) === EntryStatus.SCRATCHED;
  }
  const reasons = classifyEntryAttention(entry);
  return reasons.includes('missing_information') || reasons.includes('payment_due');
}

export function classifyRawEntryAttention(entry: RawOperationalEntryInput): EntryAttentionReason[] {
  return classifyEntryAttention({
    rawEntryStatus: entry.entry_status,
    ...(entry.payment_status != null
      ? { paymentStatus: mapPaymentStatus(entry.payment_status) }
      : {}),
    ...(entry.registration?.payment_status != null
      ? { enrollmentPaymentStatus: mapPaymentStatus(entry.registration.payment_status) }
      : {}),
  });
}

export function getEffectivePaymentStatus(
  entry: Pick<OperationalEntryInput, 'paymentStatus' | 'enrollmentPaymentStatus'>
): PaymentStatus | null {
  return entry.enrollmentPaymentStatus ?? entry.paymentStatus ?? null;
}

export function classifyClassAttention(cls: OperationalClassInput): ClassAttentionReason[] {
  return cls.reopenedAfterCloseoutAt ? ['reopened_after_closeout'] : [];
}
