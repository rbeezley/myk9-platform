import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { SyncableShowEntry } from '@/store/entry-store-types';

interface EntryWithStatus {
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
}

export function entryIsScored(e: SyncableShowEntry): boolean {
  return e.status === 'completed' || !!e.competitionData;
}

export function isPendingEntry(e: EntryWithStatus): boolean {
  return e.entryStatus === EntryStatus.PENDING;
}

export function isAcceptedEntry(e: EntryWithStatus): boolean {
  return e.entryStatus === EntryStatus.ACCEPTED;
}

export function isWaitlistEntry(e: EntryWithStatus): boolean {
  return e.entryStatus === EntryStatus.WAITLIST;
}

export function isIssueEntry(e: EntryWithStatus): boolean {
  return (
    e.entryStatus === EntryStatus.MISSING_INFO ||
    (e.entryStatus === EntryStatus.ACCEPTED && e.paymentStatus === PaymentStatus.PENDING)
  );
}
