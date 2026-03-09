import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

interface EntryWithStatus {
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
}

export function isPendingEntry(e: EntryWithStatus): boolean {
  return e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING;
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
