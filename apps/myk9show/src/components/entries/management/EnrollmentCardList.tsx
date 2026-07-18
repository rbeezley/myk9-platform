/**
 * Enrollment-card list + pagination for the Entry Management registration
 * view. Extracted from `RegistrationView.tsx` to keep that file under its
 * size budget — this component owns its own page-index state (reset
 * automatically whenever the enrollment-group identity changes, e.g. a
 * filter narrows the result set) rather than being told to reset by the
 * parent on every filter-change handler.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { Button } from '@/components/ui/button';
import { EnrollmentCard } from './EnrollmentCard';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { BulkActionResult, EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import type { CheckInStatus } from '@myk9/core';
import type { EmailLogEntry } from '@/hooks/useEmailStatus';
import type { EntryDecisionEmailJob, EntryDecisionEmailStatus } from '@/features/lifecycle-emails';

const ENROLLMENT_CARD_PAGE_SIZE = 25;

interface EnrollmentCardListProps {
  enrollmentGroups: EnrollmentGroup[];
  emptyStateContent: ReactNode;
  onStatusChange: (entryId: string, status: EntryStatus) => void | Promise<void>;
  onEntryRefunded: () => void;
  onCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => void;
  onOpenEditEntry?: ((entry: EntryManagementEntry) => void) | undefined;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenCompDialog: (entry: EntryManagementEntry) => void;
  onUncompEntry: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn: (entryIds: string[]) => BulkActionResult | Promise<BulkActionResult>;
  onPaymentStatusChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null,
    refundAmount?: number | null,
    refundNotes?: string | null,
    checkNumber?: string | null
  ) => void;
  emailStatusMap: Record<string, EmailLogEntry> | undefined;
  onResendEmail: (registrationId: string) => void;
  isResendDisabled: (registrationId: string) => boolean;
  onSendDecisionEmail: (
    registrationId: string,
    message?: string,
    amountDue?: number
  ) => Promise<void>;
  lastEmailedMap: Record<string, string>;
  lifecycleDecisionEmailStatusMap: Record<string, EntryDecisionEmailStatus>;
  onReviewLifecycleEmail: (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void;
  onPrepareCorrectionEmail: (job: EntryDecisionEmailJob, entry: EntryManagementEntry) => void;
}

export function EnrollmentCardList({
  enrollmentGroups,
  emptyStateContent,
  onStatusChange,
  onEntryRefunded,
  onCheckInStatusChange,
  onOpenEditEntry,
  onOpenArmbandDialog,
  onOpenCompDialog,
  onUncompEntry,
  onRemoveEntry,
  onBulkStatusChange,
  onBulkCheckIn,
  onPaymentStatusChange,
  emailStatusMap,
  onResendEmail,
  isResendDisabled,
  onSendDecisionEmail,
  lastEmailedMap,
  lifecycleDecisionEmailStatusMap,
  onReviewLifecycleEmail,
  onPrepareCorrectionEmail,
}: EnrollmentCardListProps) {
  const enrollmentGroupKeys = useMemo(
    () => enrollmentGroups.map(group => group.groupKey),
    [enrollmentGroups]
  );
  const [enrollmentPage, setEnrollmentPage] = useState(() => ({
    groupKeys: enrollmentGroupKeys,
    pageIndex: 0,
  }));

  const enrollmentPageCount = Math.max(
    1,
    Math.ceil(enrollmentGroups.length / ENROLLMENT_CARD_PAGE_SIZE)
  );
  const isSameEnrollmentGroupSet =
    enrollmentPage.groupKeys.length === enrollmentGroupKeys.length &&
    enrollmentPage.groupKeys.every((groupKey, index) => groupKey === enrollmentGroupKeys[index]);
  const currentEnrollmentPageIndex = isSameEnrollmentGroupSet
    ? Math.min(enrollmentPage.pageIndex, enrollmentPageCount - 1)
    : 0;
  const enrollmentPageStart = currentEnrollmentPageIndex * ENROLLMENT_CARD_PAGE_SIZE;
  const visibleEnrollmentGroups = enrollmentGroups.slice(
    enrollmentPageStart,
    enrollmentPageStart + ENROLLMENT_CARD_PAGE_SIZE
  );

  return (
    <div className="space-y-3">
      {enrollmentGroups.length > 0 ? (
        <>
          {visibleEnrollmentGroups.map(group => (
            <EnrollmentCard
              key={group.groupKey}
              group={group}
              onStatusChange={onStatusChange}
              onEntryRefunded={onEntryRefunded}
              onCheckInStatusChange={onCheckInStatusChange}
              onOpenEditEntry={onOpenEditEntry}
              onOpenArmbandDialog={onOpenArmbandDialog}
              onCompEntry={(entryId: string) => {
                const entry = group.entries.find(e => e.id === entryId);
                if (entry) onOpenCompDialog(entry);
              }}
              onUncompEntry={onUncompEntry}
              onRemoveEntry={onRemoveEntry}
              onBulkStatusChange={onBulkStatusChange}
              onBulkCheckIn={onBulkCheckIn}
              onPaymentStatusChange={onPaymentStatusChange}
              emailStatusMap={emailStatusMap}
              onResendEmail={onResendEmail}
              isResendDisabled={isResendDisabled}
              onSendDecisionEmail={onSendDecisionEmail}
              lastDecisionEmailedAt={
                group.enrollmentId ? lastEmailedMap[group.enrollmentId] : undefined
              }
              lifecycleDecisionEmailStatusMap={lifecycleDecisionEmailStatusMap}
              onReviewLifecycleEmail={onReviewLifecycleEmail}
              onPrepareCorrectionEmail={onPrepareCorrectionEmail}
            />
          ))}
          {enrollmentPageCount > 1 && (
            <nav
              className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              aria-label="Enrollment card pagination"
            >
              <p className="text-sm text-muted-foreground">
                Showing {enrollmentPageStart + 1}–
                {Math.min(enrollmentPageStart + ENROLLMENT_CARD_PAGE_SIZE, enrollmentGroups.length)}{' '}
                of {enrollmentGroups.length} enrollments
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1 sm:flex-none"
                  onClick={() =>
                    setEnrollmentPage({
                      groupKeys: enrollmentGroupKeys,
                      pageIndex: currentEnrollmentPageIndex - 1,
                    })
                  }
                  disabled={currentEnrollmentPageIndex === 0}
                  aria-label="Go to previous enrollment page"
                >
                  Previous
                </Button>
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  Page {currentEnrollmentPageIndex + 1} of {enrollmentPageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1 sm:flex-none"
                  onClick={() =>
                    setEnrollmentPage({
                      groupKeys: enrollmentGroupKeys,
                      pageIndex: currentEnrollmentPageIndex + 1,
                    })
                  }
                  disabled={currentEnrollmentPageIndex === enrollmentPageCount - 1}
                  aria-label="Go to next enrollment page"
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyStateContent}
        </div>
      )}
    </div>
  );
}
