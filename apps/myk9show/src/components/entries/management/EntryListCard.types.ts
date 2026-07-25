import type { CheckInStatus } from '@myk9/core';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryStatus } from '@/types/show-registration-types';
import type {
  EntryDecisionEmailJob,
  EntryDecisionEmailStatus,
} from '@/features/lifecycle-emails';

export interface EntryListCardProps {
  entries: EntryManagementEntry[];
  onStatusChange: (entryId: string, status: EntryStatus, withdrawalReason?: string) => void;
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenEditEntry?: ((entry: EntryManagementEntry) => void) | undefined;
  onCompEntry?: ((entryId: string) => void) | undefined;
  onUncompEntry?: ((entryId: string) => void) | undefined;
  onRemoveEntry: (entryId: string) => void;
  showCheckInStatus?: boolean | undefined;
  matchingEntryIds?: ReadonlySet<string> | undefined;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  hidePaymentBadge?: boolean | undefined;
  hideHeader?: boolean | undefined;
  onEntryRefunded?: (() => void) | undefined;
  onPaymentRequested?: (() => void) | undefined;
  lifecycleDecisionEmailStatusMap?: Record<string, EntryDecisionEmailStatus> | undefined;
  onReviewLifecycleEmail?:
    ((job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void) | undefined;
  onPrepareCorrectionEmail?:
    ((job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void) | undefined;
}
