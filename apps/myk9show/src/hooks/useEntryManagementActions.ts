import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import {
  updateCheckInStatus,
  bulkCheckIn,
  bulkUpdateEntryStatus,
  deleteEntry,
  getEntriesForExport,
  compEntry,
  uncompEntry,
} from '@/services/database/entries';
import {
  autoAssignArmbands,
  getNextArmbandForShow,
  assignArmband,
} from '@/services/database/armbands/secretary';

import { supabase } from '@/services/database/supabaseClient';
import { resolveSecretaryCc } from '@/services/notifications/ccSecretary';
import { updateEnrollmentPaymentStatus } from '@/services/database/show-registrations';
import { mapStatusToDb } from '@/utils/entryManagementUtils';
import { buildExportRow, type ExportEntry } from '@/utils/entryExportUtils';
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
  ) => Promise<void>;
  handleAssignArmband: () => Promise<void>;
  handleNextArmband: () => Promise<void>;
  handleAutoAssignArmbands: () => Promise<void>;
  handleCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => Promise<void>;
  handleEnrollmentBulkStatusChange: (entryIds: string[], status: EntryStatus) => Promise<void>;
  handleEnrollmentBulkCheckIn: (entryIds: string[]) => Promise<void>;
  handleEnrollmentPaymentChange: (
    enrollmentId: string,
    status: PaymentStatus,
    reference?: string | null,
    paidAmount?: number | null,
    refundAmount?: number | null,
    refundNotes?: string | null
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

  const handleStatusChange = useCallback(
    async (entryId: string, newStatus: EntryStatus, withdrawalReason?: string) => {
      const entry = entries.find(e => e.id === entryId);
      if (!entry) return;

      const oldStatus = entry.entryStatus;
      const oldWithdrawalReason = entry.withdrawalReason;

      setEntries(prev =>
        prev.map(e =>
          e.id === entryId
            ? {
                ...e,
                entryStatus: newStatus,
                lastUpdated: new Date(),
                ...(withdrawalReason !== undefined ? { withdrawalReason } : {}),
              }
            : e
        )
      );

      try {
        const result = await changeSecretaryEntryStatus({
          entry,
          newStatus,
          ...(user?.id ? { secretaryId: user.id } : {}),
          ...(withdrawalReason !== undefined ? { withdrawalReason } : {}),
        });

        if (result.armbandPatch) {
          const { armband, dogId, showId } = result.armbandPatch;
          setEntries(prev =>
            prev.map(e =>
              e.dogId === dogId && e.showId === showId
                ? { ...e, armbandNumber: armband, entryNumber: armband }
                : e
            )
          );
        }
      } catch (error) {
        logger.error('Failed to update entry status:', 'pages', {}, error as Error);
        setEntries(prev =>
          prev.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  entryStatus: oldStatus,
                  ...(oldWithdrawalReason !== undefined
                    ? { withdrawalReason: oldWithdrawalReason }
                    : {}),
                }
              : e
          )
        );
      }
    },
    [entries, setEntries, user]
  );

  // Handle armband assignment
  const handleAssignArmband = useCallback(async () => {
    if (!armbandDialog.entry || !armbandDialog.value.trim()) return;

    setIsProcessing(true);
    try {
      const { error: dbError } = await assignArmband(
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

  // Handle enrollment-level bulk status change
  const handleEnrollmentBulkStatusChange = useCallback(
    async (entryIds: string[], status: EntryStatus) => {
      if (entryIds.length === 0) return;
      setIsProcessing(true);
      try {
        const { error: dbError } = await bulkUpdateEntryStatus(entryIds, mapStatusToDb(status));
        if (dbError) {
          setError('Failed to update entry statuses');
          return;
        }
        setEntries(prev =>
          prev.map(e =>
            entryIds.includes(e.id) ? { ...e, entryStatus: status, lastUpdated: new Date() } : e
          )
        );

        // Full reload picks up trigger-assigned armbands for all dogs in the group
        if (status === EntryStatus.ACCEPTED && selectedShowId) {
          await loadEntries(selectedShowId);
        }
      } catch (err) {
        setError('Failed to update entry statuses');
        logger.error('Error bulk updating statuses:', 'secretary', {}, err as Error);
      } finally {
        setIsProcessing(false);
      }
    },
    [setEntries, setError, selectedShowId, loadEntries]
  );

  // Handle enrollment-level bulk check-in
  const handleEnrollmentBulkCheckIn = useCallback(
    async (entryIds: string[]) => {
      if (entryIds.length === 0) return;
      setIsProcessing(true);
      try {
        const { error: dbError } = await bulkCheckIn(entryIds);
        if (dbError) {
          setError('Failed to check in entries');
          return;
        }
        setEntries(prev =>
          prev.map(e =>
            entryIds.includes(e.id)
              ? {
                  ...e,
                  classes: e.classes.map(cls => ({ ...cls, checkInStatus: 'checked-in' as const })),
                }
              : e
          )
        );
      } catch (err) {
        setError('Failed to check in entries');
        logger.error('Error bulk checking in entries:', 'secretary', {}, err as Error);
      } finally {
        setIsProcessing(false);
      }
    },
    [setEntries, setError]
  );

  const handleEnrollmentPaymentChange = useCallback(
    async (
      enrollmentId: string,
      status: PaymentStatus,
      reference?: string | null,
      paidAmount?: number | null,
      refundAmount?: number | null,
      refundNotes?: string | null
    ) => {
      const snapshot = entries;

      setEntries(prev =>
        prev.map(e =>
          e.registrationId === enrollmentId
            ? {
                ...e,
                enrollmentPaymentStatus: status,
                ...(reference != null ? { enrollmentPaymentReference: reference } : {}),
                ...(paidAmount != null ? { enrollmentPaidAmount: paidAmount } : {}),
                ...(refundAmount != null ? { enrollmentRefundAmount: refundAmount } : {}),
                ...(refundNotes != null ? { enrollmentRefundNotes: refundNotes } : {}),
                ...(refundAmount != null ? { enrollmentRefundedAt: new Date().toISOString() } : {}),
              }
            : e
        )
      );

      try {
        const { error: dbError } = await updateEnrollmentPaymentStatus(
          enrollmentId,
          status,
          reference,
          paidAmount,
          refundAmount,
          refundNotes
        );
        if (dbError) {
          setEntries(snapshot);
          toast.error(dbError.message || 'Failed to update payment status');
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
        const { error: dbError } = await updateCheckInStatus(entry.id, status);
        if (dbError) throw dbError;

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
        setError(dbError.message || 'Failed to export entries');
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
      const snapshot = entriesRef.current;
      const entry = snapshot.find(e => e.id === entryId);
      if (!entry) return;

      setEntries(prev => prev.filter(e => e.id !== entryId));

      try {
        const { error: dbError } = await deleteEntry(entryId, user?.id);

        if (dbError) {
          setEntries(snapshot);
          setError(dbError.message || 'Failed to remove entry');
          return;
        }

        setError(null);
        toast.success(`Removed ${entry.dogName} from ${entry.classes[0]?.name ?? 'the class'}`);
      } catch (err) {
        setEntries(snapshot);
        setError('Failed to remove entry');
        logger.error('Error removing entry:', 'secretary', {}, err as Error);
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
        toast.error('Failed to send decision email. Please try again.');
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
