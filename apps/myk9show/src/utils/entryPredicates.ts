import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { SyncableShowEntry } from '@/store/entry-store-types';
import {
  classifyEntryAttention,
  getOperationalEntryState,
} from '@/features/entry-operations/attentionClassification';

interface EntryWithStatus {
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
}

export function entryIsScored(e: SyncableShowEntry): boolean {
  return e.status === 'completed' || !!e.competitionData;
}

export function isPendingEntry(e: EntryWithStatus): boolean {
  return getOperationalEntryState(e) === 'pending_review';
}

export function isAcceptedEntry(e: EntryWithStatus): boolean {
  return getOperationalEntryState(e) === 'accepted';
}

export function isWaitlistEntry(e: EntryWithStatus): boolean {
  return getOperationalEntryState(e) === 'waitlist';
}

export function isIssueEntry(e: EntryWithStatus): boolean {
  const reasons = classifyEntryAttention(e);
  return reasons.includes('missing_information') || reasons.includes('payment_due');
}
