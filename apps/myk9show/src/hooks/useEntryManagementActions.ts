import { useState, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import {
  updateEntryStatus,
  updateCheckInStatus,
  bulkCheckIn,
  bulkUpdateEntryStatus,
  getEntriesForExport,
} from '@/services/database/queries/secretaryEntryQueries';
import {
  assignArmband,
  autoAssignArmbands,
} from '@/services/database/queries/secretaryArmbandQueries';
import { compEntry, uncompEntry } from '@/services/database/queries/entry-query-mutations';
import { mapStatusToDb } from '@/utils/entryManagementUtils';
import { buildExportRow, type ExportEntry } from '@/utils/entryExportUtils';
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
  handleStatusChange: (entryId: string, newStatus: EntryStatus) => Promise<void>;
  handleAssignArmband: () => Promise<void>;
  handleAutoAssignArmbands: () => Promise<void>;
  handleCheckInStatusChange: (
    entry: EntryManagementEntry,
    cls: EntryClass,
    status: CheckInStatus
  ) => Promise<void>;
  handleEnrollmentBulkStatusChange: (entryIds: string[], status: EntryStatus) => Promise<void>;
  handleEnrollmentBulkCheckIn: (entryIds: string[]) => Promise<void>;
  handleExportCSV: () => Promise<void>;
  handleCompEntry: (entryId: string, reason: string) => Promise<void>;
  handleUncompEntry: (entryId: string) => Promise<void>;
}

/**
 * Custom hook for managing entry actions
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export function useEntryManagementActions({
  entries,
  setEntries,
  selectedShowId,
  loadEntries,
  setError,
  user,
}: UseEntryManagementActionsProps): UseEntryManagementActionsReturn {
  const [isProcessing, setIsProcessing] = useState(false);

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

  // Handle status change
  const handleStatusChange = useCallback(
    async (entryId: string, newStatus: EntryStatus) => {
      const entry = entries.find(e => e.id === entryId);
      if (!entry) return;

      const oldStatus = entry.entryStatus;

      // Optimistic update
      setEntries(prev =>
        prev.map(e =>
          e.id === entryId ? { ...e, entryStatus: newStatus, lastUpdated: new Date() } : e
        )
      );

      try {
        const { error: dbError } = await updateEntryStatus(entryId, mapStatusToDb(newStatus));

        if (dbError) {
          throw dbError;
        }

        await auditService.log({
          action: AuditAction.UPDATE,
          entityType: 'entry',
          entityId: entryId,
          changes: {
            entryStatus: { from: oldStatus, to: newStatus },
          },
          metadata: {
            action: 'status_change',
            secretaryId: user?.id,
            entryNumber: entry.entryNumber,
          },
        });
      } catch (error) {
        logger.error('Failed to update entry status:', 'pages', {}, error as Error);
        // Revert optimistic update
        setEntries(prev =>
          prev.map(e => (e.id === entryId ? { ...e, entryStatus: oldStatus } : e))
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
        setArmbandDialog(prev => ({ ...prev, error: dbError.message || 'Failed to assign armband' }));
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
      } catch (err) {
        setError('Failed to update entry statuses');
        logger.error('Error bulk updating statuses:', 'secretary', {}, err as Error);
      } finally {
        setIsProcessing(false);
      }
    },
    [setEntries, setError]
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
        setError('Failed to export entries');
        return;
      }

      if (data.length === 0) {
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

  return {
    isProcessing,
    armbandDialog,
    setArmbandDialog,
    autoArmbandDialog,
    setAutoArmbandDialog,
    handleStatusChange,
    handleAssignArmband,
    handleAutoAssignArmbands,
    handleCheckInStatusChange,
    handleEnrollmentBulkStatusChange,
    handleEnrollmentBulkCheckIn,
    handleExportCSV,
    handleCompEntry,
    handleUncompEntry,
  };
}
