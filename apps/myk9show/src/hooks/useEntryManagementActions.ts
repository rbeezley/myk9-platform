import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';
import { friendlyDbError } from '@/utils/friendlyDbError';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import {
  deleteEntry,
  getEntriesForExport,
  compEntry,
  uncompEntry,
  executeStatusChange,
  executeRemoveEntry,
} from '@/services/database/entries';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import { getEligibleForBulkStatusChange } from '@/components/entries/management/bulkActionEligibility';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { useEntryStatusUndo } from '@/hooks/useEntryStatusUndo';
import { showUndoToast } from '@/lib/undoToast';
import { CLOSED_STATUSES } from '@/components/entries/management/bulkActionEligibility';
import {
  autoAssignArmbands,
  getNextArmbandForShow,
  setEntryArmband,
} from '@/services/database/armbands';

import { supabase } from '@/services/database/supabaseClient';
import { resolveSecretaryCc } from '@/services/notifications/ccSecretary';
import { updateEnrollmentPaymentStatus } from '@/services/database/show-registrations';
import { buildExportRow, type ExportEntry } from '@/utils/entryExportUtils';
import { getEntryPaidAmount, hasEntryLevelRefund } from '@/utils/entryManagementUtils';
import { changeSecretaryEntryStatus } from '@/services/secretary/entry-workflow';
import type {
  EntryManagementEntry,
  EntryClass,
  ArmbandDialogState,
  AutoArmbandDialogState,
} from '@/types/entry-management-types';

interface UseEntryManagementActionsProps {
  entries: EntryManagementEntry[];
  setEntries: React.Dispatch<React.SetStateAction<EntryManagementEntry[]>>;
  selectedShowId: string;
  selectedShow: { name?: string | null; start_date?: string | null } | null;
  loadEntries: (showId: string) => Promise<void>;
  setError: (error: string | null) => void;
  user: { id?: string; email?: string } | null;
}

interface UseEntryManagementActionsReturn {
  // Processing state
  isProcessing: boolean;

  // Dialog states
  armbandDialog: ArmbandDialogState;
  setArmbandDialog: React.Dispatch<React.SetStateAction<ArmbandDialogState>>;
  autoArmbandDialog: AutoArmbandDialogState;
  setAutoArmbandDialog: React.Dispatch<React.SetStateAction<AutoArmbandDialogState>>;

  // Actions
  handleStatusChange: (
    entryId: string,
    newStatus: EntryStatus,
    withdrawalReason?: string
  ) => Promise<boolean>;
  handleAssignArmband: () => Promise<void>;
  handleNextArmband: () => Promise<void>;
  handleAutoAssignArmbands: () => Promise<void>;
  handleCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => Promise<void>;
  handleEnrollmentBulkStatusChange: (entryIds: string[], status: EntryStatus) => Promise<boolean>;
  handleEnrollmentBulkCheckIn: (entryIds: string[]) => Promise<boolean>;
  handleEnrollmentPaymentChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null,
    refundAmount?: number | null,
    refundNotes?: string | null,
    checkNumber?: string | null
  ) => Promise<void>;
  handleExportCSV: () => Promise<void>;
  handleCompEntry: (entryId: string, reason: string) => Promise<void>;
  handleUncompEntry: (entryId: string) => Promise<void>;
  handleRemoveEntry: (entryId: string) => Promise<void>;
  handleSendDecisionEmail: (
    registrationId: string,
    message?: string,
    amountDue?: number
  ) => Promise<void>;
}

function mapEnrollmentStatusToEntryPaymentStatus(status: PaymentStatus): PaymentStatus {
  // Keep this collapse aligned with mapEnrollmentPaymentStatusToEntryStatus in
  // services/database/show-registrations/reads.ts. Entries only persist coarse
  // payment_status values; the UI enum carries the method-specific paid state.
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return PaymentStatus.PAID_ONLINE;
    case PaymentStatus.REFUNDED:
    case PaymentStatus.PARTIAL_REFUND:
      return status;
    case PaymentStatus.PENDING:
    default:
      return PaymentStatus.PENDING;
  }
}

/**
 * Custom hook for managing entry actions
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export function useEntryManagementActions({
  entries,
  setEntries,
  selectedShowId,
  selectedShow,
  loadEntries,
  setError,
  user,
}: UseEntryManagementActionsProps): UseEntryManagementActionsReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const entriesRef = useRef(entries);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Dialog states
  const [armbandDialog, setArmbandDialog] = useState<ArmbandDialogState>({
    open: false,
    entry: null,
    value: '',
  });
  const [autoArmbandDialog, setAutoArmbandDialog] = useState<AutoArmbandDialogState>({
    open: false,
    startNumber: '1',
  });

  const { runSingleUndo, runBulkUndo } = useEntryStatusUndo({
    entriesRef,
    setEntries,
    userId: user?.id,
  });

  const bulkStatusDispatch = useBulkDispatch<EntryManagementEntry>({
    getLabel: entry => `${entry.dogName} (#${entry.entryNumber})`,
    applicableWhen: entry => !CLOSED_STATUSES.has(entry.entryStatus),
  });
  // Dispatched over raw entry ids (not entry objects) — check-in has always accepted
  // any id it's given, independent of whether the id is present in the currently
  // loaded local entries snapshot; mirrors the pre-allSettled Promise.all behavior.
  const bulkCheckInDispatch = useBulkDispatch<string>({
    getLabel: entryId => {
      const entry = entriesRef.current.find(e => e.id === entryId);
      return entry ? `${entry.dogName} (#${entry.entryNumber})` : entryId;
    },
    applicableWhen: entryId => {
      const entry = entriesRef.current.find(e => e.id === entryId);
      return !entry || (entry.entryStatus === EntryStatus.ACCEPTED && entry.classes.length > 0);
    },
  });

  const handleStatusChange = useCallback(
    async (entryId: string, newStatus: EntryStatus, withdrawalReason?: string) => {
      const entry = entries.find(e => e.id === entryId);
      if (!entry) return false;
      const priorStatus = entry.entryStatus;
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      const ok = await executeStatusChange(
        { entryId, newStatus, withdrawalReason, entry, userId: user?.id },
        { changeSecretaryStatus: changeSecretaryEntryStatus, patchEntries: setEntries }
      );

      if (!ok) {
        toast.error("Couldn't update entry status");
        return false;
      }

      // Offer a time-boxed undo only for simple transitions (design.md D6). A
      // withdrawal carries a reason (collected in its own dialog) and is left
      // to that flow; a no-op transition has nothing to undo.
      if (ok && withdrawalReason === undefined && priorStatus !== newStatus) {
        showUndoToast({
          message: 'Status updated',
          onUndo: () => {
            void runSingleUndo(entryId, priorStatus, newStatus);
          },
          ...(offline ? { description: 'Queued — will sync when online' } : {}),
        });
      }

      return true;
    },
    [entries, setEntries, user, runSingleUndo]
  );

  // Handle armband assignment
  const handleAssignArmband = useCallback(async () => {
    if (!armbandDialog.entry || !armbandDialog.value.trim()) return;

    setIsProcessing(true);
    try {
      const { error: dbError } = await setEntryArmband(
        armbandDialog.entry.id,
        armbandDialog.value.trim()
      );

      if (dbError) {
        setArmbandDialog(prev => ({
          ...prev,
          error: (dbError as { message?: string })?.message || 'Failed to assign armband',
        }));
        return;
      }

      const targetDogId = armbandDialog.entry.dogId;
      const targetShowId = armbandDialog.entry.showId;
      const armband = armbandDialog.value.trim();
      setEntries(prev =>
        prev.map(e =>
          e.dogId === targetDogId && e.showId === targetShowId
            ? { ...e, armbandNumber: armband, entryNumber: armband }
            : e
        )
      );

      setArmbandDialog({ open: false, entry: null, value: '' });
    } catch (err) {
      setError('Failed to assign armband');
      logger.error('Error assigning armband:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [armbandDialog, setEntries, setError]);

  const handleNextArmband = useCallback(async () => {
    if (!armbandDialog.entry) return;
    try {
      const next = await getNextArmbandForShow(armbandDialog.entry.showId);
      setArmbandDialog(prev => ({ ...prev, value: String(next), error: null }));
    } catch (err) {
      logger.error('Error fetching next armband:', 'secretary', {}, err as Error);
    }
  }, [armbandDialog.entry]);

  // Handle auto-assign armbands
  const handleAutoAssignArmbands = useCallback(async () => {
    if (!selectedShowId) return;

    setIsProcessing(true);
    try {
      const startNum = parseInt(autoArmbandDialog.startNumber, 10) || 1;
      const { data, error: dbError } = await autoAssignArmbands(selectedShowId, startNum);

      if (dbError) {
        setError('Failed to auto-assign armbands');
        return;
      }

      await loadEntries(selectedShowId);
      setAutoArmbandDialog({ open: false, startNumber: '1' });

      const skipped = data?.skipped ?? 0;
      if (skipped > 0) {
        setError(
          `Assigned ${data?.assigned} armbands — ${skipped} dog(s) skipped due to conflicts`
        );
      }
      logger.info(
        `Auto-assigned ${data?.assigned} armbands starting at ${data?.startedAt}; skipped ${skipped}`,
        'secretary'
      );
    } catch (err) {
      setError('Failed to auto-assign armbands');
      logger.error('Error auto-assigning armbands:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedShowId, autoArmbandDialog, loadEntries, setError]);

  // Handle enrollment-level bulk status change. Each entry is dispatched through
  // executeStatusChange (the same optimistic-update-with-rollback path the single-entry
  // handler uses) via useBulkDispatch's Promise.allSettled fold, so one entry's failure
  // can't roll back or block the others — see design.md decision D3.
  const handleEnrollmentBulkStatusChange = useCallback(
    async (entryIds: string[], status: EntryStatus, onFullSuccess?: () => void) => {
      const requested = entriesRef.current.filter(e => entryIds.includes(e.id));
      // Narrow to the entries this status change may validly touch, HERE rather
      // than in each caller. `bulkActionEligibility` says a bulk status change
      // "must never" touch a completed/scratched/moved/cancelled/move-up-
      // requested entry, because re-approving a scored entry corrupts closed
      // results and the move-up queue. The selection toolbar filtered; the
      // registration Actions menu passed `group.entries.map(e => e.id)` raw, so
      // "Accept all" on a registration containing a scored entry rewrote it
      // with no dialog and no count. Enforcing the rule at the single shared
      // handler closes that hole for every present and future caller.
      const targets = getEligibleForBulkStatusChange(requested, status);
      if (targets.length === 0) return false;
      // Capture each entry's prior status BEFORE the change so undo can revert
      // each item to exactly where it started (design.md D6).
      const priorById = new Map(targets.map(e => [e.id, e.entryStatus]));
      setIsProcessing(true);
      try {
        const outcome = await bulkStatusDispatch.run(
          targets,
          async entry => {
            const ok = await executeStatusChange(
              { entryId: entry.id, newStatus: status, entry, userId: user?.id },
              { changeSecretaryStatus: changeSecretaryEntryStatus, patchEntries: setEntries }
            );
            if (!ok) throw new Error('Failed to update entry status');
          },
          {
            buildUndo: result =>
              result.succeeded.length > 0
                ? () => {
                    void runBulkUndo(result.succeeded, priorById, status);
                  }
                : undefined,
            onFullSuccess,
            applicableWhen: entry => {
              const fresh = entriesRef.current.find(e => e.id === entry.id) ?? entry;
              // Retry ONLY if no other actor has touched this entry since our first
              // attempt. A failed item keeps its prior status, so fresh must still
              // equal it — this catches the case `getEligibleForBulkAction` misses:
              // a pending entry another actor REJECTED is still "approve-eligible"
              // (rejected isn't closed), and retrying would overwrite that decision.
              return fresh.entryStatus === priorById.get(entry.id);
            },
          }
        );
        // null = latched no-op (prior batch in flight) — report "not done" so
        // runBulkAndClear does NOT clear the live selection out from under it.
        if (outcome === null) return false;
        return outcome.failed.length === 0;
      } catch (err) {
        setError('Failed to update entry statuses');
        logger.error('Error bulk updating statuses:', 'secretary', {}, err as Error);
        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [bulkStatusDispatch, setEntries, setError, user, runBulkUndo]
  );

  // Handle enrollment-level bulk check-in. Only entries that actually succeed get their
  // local check-in state patched — a partial failure leaves failed entries' local state
  // untouched (and the selection, owned by the caller, stays intact for retry).
  const handleEnrollmentBulkCheckIn = useCallback(
    async (entryIds: string[], onFullSuccess?: () => void) => {
      if (entryIds.length === 0) return false;
      setIsProcessing(true);
      try {
        const outcome = await bulkCheckInDispatch.run(
          entryIds,
          async entryId => {
            await updateReplicatedCheckInStatus(entryId, 'checked-in');
          },
          { onFullSuccess }
        );
        // null = latched no-op — nothing dispatched, keep selection intact.
        if (outcome === null) return false;
        if (outcome.succeeded.length > 0) {
          const succeededIds = new Set(outcome.succeeded);
          setEntries(prev =>
            prev.map(e =>
              succeededIds.has(e.id)
                ? {
                    ...e,
                    classes: e.classes.map(cls => ({
                      ...cls,
                      checkInStatus: 'checked-in' as const,
                    })),
                  }
                : e
            )
          );
        }
        return outcome.failed.length === 0;
      } catch (err) {
        setError('Failed to check in entries');
        logger.error('Error bulk checking in entries:', 'secretary', {}, err as Error);
        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [bulkCheckInDispatch, setEntries, setError]
  );

  const handleEnrollmentPaymentChange = useCallback(
    async (
      enrollmentId: string,
      status: PaymentStatus,
      reference?: string | null,
      paidAmount?: number | null,
      refundAmount?: number | null,
      refundNotes?: string | null,
      checkNumber?: string | null
    ) => {
      const snapshot = entries;

      setEntries(prev =>
        prev.map(e => {
          if (e.registrationId !== enrollmentId) return e;
          const entryPaymentStatus = hasEntryLevelRefund(e)
            ? e.paymentStatus
            : mapEnrollmentStatusToEntryPaymentStatus(status);

          return {
            ...e,
            enrollmentPaymentStatus: status,
            paymentStatus: entryPaymentStatus,
            paidAmount: getEntryPaidAmount({
              ...e,
              paymentStatus: entryPaymentStatus,
              enrollmentPaymentStatus: status,
            }),
            ...(reference != null ? { enrollmentPaymentReference: reference } : {}),
            ...(paidAmount != null ? { enrollmentPaidAmount: paidAmount } : {}),
            ...(refundAmount != null ? { enrollmentRefundAmount: refundAmount } : {}),
            ...(refundNotes != null ? { enrollmentRefundNotes: refundNotes } : {}),
            ...(refundAmount != null ? { enrollmentRefundedAt: new Date().toISOString() } : {}),
          };
        })
      );

      try {
        const { data, error: dbError } = await updateEnrollmentPaymentStatus(
          enrollmentId,
          status,
          reference,
          paidAmount,
          refundAmount,
          refundNotes,
          checkNumber
        );
        if (dbError) {
          if (data) {
            toast.error('Payment saved, but linked entry rows may need a refresh');
            logger.error(
              'DB error cascading enrollment payment to entries:',
              'secretary',
              {},
              new Error(dbError.message)
            );
            return;
          }

          setEntries(snapshot);
          toast.error(friendlyDbError(dbError, 'Failed to update payment status'));
          logger.error(
            'DB error updating enrollment payment:',
            'secretary',
            {},
            new Error(dbError.message)
          );
        }
      } catch (err) {
        setEntries(snapshot);
        toast.error('Failed to update payment status');
        logger.error('Error updating enrollment payment:', 'secretary', {}, err as Error);
      }
    },
    [entries, setEntries]
  );

  // Handle check-in status change (inline, no dialog)
  const handleCheckInStatusChange = useCallback(
    async (entry: EntryManagementEntry, cls: EntryClass, status: CheckInStatus) => {
      const prevStatus = cls.checkInStatus || 'no-status';

      // Optimistic update
      setEntries(prev =>
        prev.map(e =>
          e.id === entry.id
            ? {
                ...e,
                classes: e.classes.map(c =>
                  c.id === cls.id ? { ...c, checkInStatus: status, checkInTime: new Date() } : c
                ),
              }
            : e
        )
      );

      try {
        await updateReplicatedCheckInStatus(entry.id, status);

        await auditService.log({
          action: AuditAction.UPDATE,
          entityType: 'class_entry',
          entityId: cls.id,
          changes: { checkInStatus: { from: prevStatus, to: status } },
          metadata: {
            action: 'check_in_status_change',
            secretaryId: user?.id,
            entryNumber: entry.entryNumber,
            dogName: entry.dogName,
            className: cls.name,
          },
        });
      } catch (error) {
        logger.error('Failed to update check-in status:', 'pages', {}, error as Error);
        // Revert
        setEntries(prev =>
          prev.map(e =>
            e.id === entry.id
              ? {
                  ...e,
                  classes: e.classes.map(c =>
                    c.id === cls.id ? { ...c, checkInStatus: prevStatus } : c
                  ),
                }
              : e
          )
        );
      }
    },
    [setEntries, user]
  );

  // Handle CSV export
  const handleExportCSV = useCallback(async () => {
    if (!selectedShowId || isProcessing) return;

    setIsProcessing(true);
    try {
      const { data, error: dbError } = await getEntriesForExport(selectedShowId);

      if (dbError) {
        setError(friendlyDbError(dbError, 'Failed to export entries'));
        return;
      }

      if (!data || data.length === 0) {
        setError('No entries found for this show');
        return;
      }

      const headers = [
        'Armband',
        'Dog Name',
        'Call Name',
        'Breed',
        'Registration #',
        'Owner First Name',
        'Owner Last Name',
        'Owner Email',
        'Owner Phone',
        'Handler',
        'Entry Status',
        'Payment Status',
        'Total Fees',
        'Classes',
        'Special Requests',
      ];

      const rows = data.map(entry => buildExportRow(entry as ExportEntry));

      const csvContent = [
        headers.join(','),
        ...rows.map(row =>
          row
            .map(cell => {
              const s = String(cell).replace(/[\r\n]+/g, ' ');
              const safe = /^[=+\-@\t]/.test(s) ? `\t${s}` : s;
              return `"${safe.replace(/"/g, '""')}"`;
            })
            .join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `entries_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      await auditService.log({
        action: AuditAction.EXPORT,
        entityType: 'entries_export',
        entityId: selectedShowId,
        metadata: {
          format: 'csv',
          entryCount: data.length,
          secretaryId: user?.id,
        },
      });
    } catch (err) {
      setError('Failed to export entries');
      logger.error('Error exporting entries:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedShowId, isProcessing, setError, user]);

  // Handle comp entry
  const handleCompEntry = useCallback(
    async (entryId: string, reason: string) => {
      setIsProcessing(true);
      try {
        const { error: dbError } = await compEntry({ entryId, reason });

        if (dbError) {
          setError('Failed to comp entry');
          return;
        }

        setEntries(prev =>
          prev.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  comped: true,
                  compedReason: reason,
                  paymentStatus: 'waived' as unknown as PaymentStatus,
                }
              : e
          )
        );

        await auditService.log({
          action: AuditAction.UPDATE,
          entityType: 'entry',
          entityId: entryId,
          changes: { comped: { from: false, to: true } },
          metadata: { action: 'comp_entry', reason, secretaryId: user?.id },
        });
      } catch (err) {
        setError('Failed to comp entry');
        logger.error('Error comping entry:', 'secretary', {}, err as Error);
      } finally {
        setIsProcessing(false);
      }
    },
    [setEntries, setError, user]
  );

  // Handle uncomp entry
  const handleUncompEntry = useCallback(
    async (entryId: string) => {
      setIsProcessing(true);
      try {
        const { error: dbError } = await uncompEntry(entryId);

        if (dbError) {
          setError('Failed to remove comp');
          return;
        }

        setEntries(prev =>
          prev.map((e): EntryManagementEntry => {
            if (e.id !== entryId) return e;
            const { compedReason: _, ...rest } = e;
            return { ...rest, comped: false, paymentStatus: PaymentStatus.PENDING };
          })
        );

        await auditService.log({
          action: AuditAction.UPDATE,
          entityType: 'entry',
          entityId: entryId,
          changes: { comped: { from: true, to: false } },
          metadata: { action: 'uncomp_entry', secretaryId: user?.id },
        });
      } catch (err) {
        setError('Failed to remove comp');
        logger.error('Error uncomping entry:', 'secretary', {}, err as Error);
      } finally {
        setIsProcessing(false);
      }
    },
    [setEntries, setError, user]
  );

  const handleRemoveEntry = useCallback(
    async (entryId: string) => {
      const currentEntries = entriesRef.current;
      const entry = currentEntries.find(e => e.id === entryId);
      const { removed } = await executeRemoveEntry(
        { entryId, userId: user?.id, currentEntries },
        { deleteEntry, patchEntries: setEntries, setError }
      );
      if (removed && entry) {
        toast.success(`Removed ${entry.dogName} from ${entry.classes[0]?.name ?? 'the class'}`);
      }
    },
    [setEntries, setError, user?.id]
  );

  const statusToDecision = (
    s: EntryStatus
  ):
    | 'accepted'
    | 'not_accepted'
    | 'waitlisted'
    | 'withdrawn'
    | 'scratched'
    | 'missing_info'
    | 'pending' => {
    if (s === EntryStatus.ACCEPTED) return 'accepted';
    if (s === EntryStatus.REJECTED) return 'not_accepted';
    if (s === EntryStatus.CANCELLED) return 'withdrawn';
    if (s === EntryStatus.SCRATCHED) return 'scratched';
    if (s === EntryStatus.WAITLIST) return 'waitlisted';
    if (s === EntryStatus.MISSING_INFO) return 'missing_info';
    return 'pending';
  };

  const handleSendDecisionEmail = useCallback(
    async (registrationId: string, message?: string, amountDue?: number) => {
      const registrationEntries = entries.filter(e => e.registrationId === registrationId);
      if (registrationEntries.length === 0) return;

      const first = registrationEntries[0];
      if (!first.ownerEmail) {
        toast.error('No email address on file for this exhibitor.');
        return;
      }

      try {
        // EntryManagementShow is a slim type without secretary fields; fetch them separately.
        // TODO: widen EntryManagementShow + getSecretaryShows to include these fields and remove this query.
        let cc: string[] | undefined;
        if (selectedShowId) {
          const { data: showRow } = await supabase
            .from('shows')
            .select('secretary_email, cc_secretary_on_exhibitor_emails')
            .eq('id', selectedShowId)
            .maybeSingle();
          const resolved = resolveSecretaryCc(
            showRow?.cc_secretary_on_exhibitor_emails,
            showRow?.secretary_email
          );
          if (resolved.length > 0) cc = resolved;
        }

        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            type: 'entry_decision',
            to: first.ownerEmail,
            exhibitorName: first.ownerName,
            showName: selectedShow?.name ?? 'the show',
            showDate: selectedShow?.start_date ?? '',
            registrationId,
            ...(message ? { message } : {}),
            ...(amountDue !== undefined ? { amountDue } : {}),
            ...(cc ? { cc } : {}),
            entries: registrationEntries.map(e => ({
              dogName: e.dogName,
              className: e.classes?.[0]?.name ?? 'Unknown Class',
              status: statusToDecision(e.entryStatus),
              armbandNumber: e.armbandNumber,
            })),
          },
        });
        if (error) throw error;
        toast.success(`Decision email sent to ${first.ownerEmail}`);
      } catch (err) {
        logger.warn('Failed to send decision email', 'pages', {}, err as Error);
        toast.error('Entry decision is saved. The email did not send yet.');
      }
    },
    [entries, selectedShow, selectedShowId]
  );

  return {
    isProcessing,
    armbandDialog,
    setArmbandDialog,
    autoArmbandDialog,
    setAutoArmbandDialog,
    handleStatusChange,
    handleAssignArmband,
    handleNextArmband,
    handleAutoAssignArmbands,
    handleCheckInStatusChange,
    handleEnrollmentBulkStatusChange,
    handleEnrollmentBulkCheckIn,
    handleEnrollmentPaymentChange,
    handleExportCSV,
    handleCompEntry,
    handleUncompEntry,
    handleRemoveEntry,
    handleSendDecisionEmail,
  };
}
