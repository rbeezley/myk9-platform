import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import type { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@myk9/core';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import type { EntryDecisionEmailJob, EntryDecisionEmailStatus } from '@/features/lifecycle-emails';

export interface EnrollmentCardProps {
  group: EnrollmentGroup;
  onStatusChange: (entryId: string, status: EntryStatus, withdrawalReason?: string) => void;
  onEntryRefunded?: () => void;
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenEditEntry?: ((entry: EntryManagementEntry) => void) | undefined;
  onCompEntry?: (entryId: string) => void;
  onUncompEntry?: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  onBulkStatusChange: (entryIds: string[], status: EntryStatus) => void;
  onBulkCheckIn: (entryIds: string[]) => void;
  onPaymentStatusChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null,
    refundAmount?: number | null,
    refundNotes?: string | null,
    checkNumber?: string | null
  ) => void;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  onSendDecisionEmail?:
    ((registrationId: string, message?: string, amountDue?: number) => Promise<void>) | undefined;
  lastDecisionEmailedAt?: string | undefined;
  lifecycleDecisionEmailStatusMap?: Record<string, EntryDecisionEmailStatus> | undefined;
  onReviewLifecycleEmail?:
    ((job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void) | undefined;
  onPrepareCorrectionEmail?:
    ((job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void) | undefined;
}
