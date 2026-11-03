import type { CheckInStatus } from '@myk9/core';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryStatus } from '@/types/show-registration-types';
import type { EntryDecisionEmailJob, EntryDecisionEmailStatus } from '@/features/lifecycle-emails';

export interface EntryListCardProps {
  entries: EntryManagementEntry[];
  onStatusChange: (entryId: string, status: EntryStatus, withdrawalReason?: string) => void;
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  /**
   * MYK9-1672: true for an entry whose armband is already owed through another control on the
   * page (the entry form's checklist). The card then renders no "Assign armband" button for it,
   * so the form never shows two controls with one name. "Change armband" is unaffected.
   */
  hideAssignArmband?: ((entry: EntryManagementEntry) => boolean) | undefined;
  onOpenEditEntry?: ((entry: EntryManagementEntry) => void) | undefined;
  onCompEntry?: ((entryId: string) => void) | undefined;
  onUncompEntry?: ((entryId: string) => void) | undefined;
  onEntryRemoved: (entryId: string) => void;
  showCheckInStatus?: boolean | undefined;
  matchingEntryIds?: ReadonlySet<string> | undefined;
  emailStatusMap?: Record<string, EmailLogEntry> | undefined;
  /** MYK9-879: entries whose junior fee was charged on the exhibitor's declaration. */
  juniorDeclaredEntryIds?: ReadonlySet<string> | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  hidePaymentBadge?: boolean | undefined;
  hideHeader?: boolean | undefined;
  onEntryRefunded?: (() => void) | undefined;
  /** Undo brought a deleted entry back: the parent re-reads its own entry list. */
  onEntryRestored?: (() => void) | undefined;
  onPaymentRequested?: (() => void) | undefined;
  lifecycleDecisionEmailStatusMap?: Record<string, EntryDecisionEmailStatus> | undefined;
  onReviewLifecycleEmail?:
    ((job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void) | undefined;
  onPrepareCorrectionEmail?:
    ((job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void) | undefined;
}
