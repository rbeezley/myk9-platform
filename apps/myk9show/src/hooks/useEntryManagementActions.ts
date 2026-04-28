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
  assignArmband,
  autoAssignArmbands,
  getEntriesForExport,
} from '@/services/database/queries/secretaryEntryQueries';
import { compEntry, uncompEntry } from '@/services/database/queries/entry-query-mutations';
import { mapStatusToDb } from '@/utils/entryManagementUtils';
import { buildExportRow, type ExportEntry } from '@/utils/entryExportUtils';
import type {
  EntryManagementEntry,
  BulkAction,
  CheckInDialogState,
  ArmbandDialogState,
  AutoArmbandDialogState,
  BulkActionDialogState,
} from '@/types/entry-management-types';

interface UseEntryManagementActionsProps {
  entries: EntryManagementEntry[];
  setEntries: React.Dispatch<React.SetStateAction<EntryManagementEntry[]>>;
  selectedShowId: string;
  loadEntries: (showId: string) => Promise<void>;
  setError: (error: string | null) => void;
  selectedEntries: Set<string>;
  setSelectedEntries: React.Dispatch<React.SetStateAction<Set<string>>>;
  user: { id?: string; email?: string } | null;
}

interface UseEntryManagementActionsReturn {
  // Processing state
  isProcessing: boolean;

  // Dialog states
  checkInDialog: CheckInDialogState;
  setCheckInDialog: React.Dispatch<React.SetStateAction<CheckInDialogState>>;
  armbandDialog: ArmbandDialogState;
  setArmbandDialog: React.Dispatch<React.SetStateAction<ArmbandDialogState>>;
  autoArmbandDialog: AutoArmbandDialogState;
  setAutoArmbandDialog: React.Dispatch<React.SetStateAction<AutoArmbandDialogState>>;
  bulkActionDialog: BulkActionDialogState;
  setBulkActionDialog: React.Dispatch<React.SetStateAction<BulkActionDialogState>>;

  // Actions
  handleStatusChange: (entryId: string, newStatus: EntryStatus) => Promise<void>;
  handleAssignArmband: () => Promise<void>;
  handleAutoAssignArmbands: () => Promise<void>;
  handleBulkCheckIn: () => Promise<void>;
  handleCheckInStatusUpdate: (status: CheckInStatus, notes?: string) => Promise<void>;
  handleBulkAction: (action: BulkAction) => Promise<void>;
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
  selectedEntries,
  setSelectedEntries,
  user,
}: UseEntryManagementActionsProps): UseEntryManagementActionsReturn {
  const [isProcessing, setIsProcessing] = useState(false);

  // Dialog states
  const [checkInDialog, setCheckInDialog] = useState<CheckInDialogState>({
    open: false,
    entry: null,
    classEntry: null,
  });
  const [armbandDialog, setArmbandDialog] = useState<ArmbandDialogState>({
    open: false,
    entry: null,
    value: '',
  });
  const [autoArmbandDialog, setAutoArmbandDialog] = useState<AutoArmbandDialogState>({
    open: false,
    startNumber: '1',
  });
  const [bulkActionDialog, setBulkActionDialog] = useState<BulkActionDialogState>({
    open: false,
    action: null,
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
        setError('Failed to assign armband');
        return;
      }

      setEntries(prev =>
        prev.map(e =>
          e.id === armbandDialog.entry?.id
            ? {
                ...e,
                armbandNumber: armbandDialog.value.trim(),
                entryNumber: armbandDialog.value.trim(),
              }
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

      logger.info(
        `Auto-assigned ${data?.assigned} armbands starting at ${data?.startedAt}`,
        'secretary'
      );
    } catch (err) {
      setError('Failed to auto-assign armbands');
      logger.error('Error auto-assigning armbands:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedShowId, autoArmbandDialog, loadEntries, setError]);

  // Handle bulk check-in
  const handleBulkCheckIn = useCallback(async () => {
    const selectedEntryIds = Array.from(selectedEntries);
    if (selectedEntryIds.length === 0) return;

    setIsProcessing(true);
    try {
      const { error: dbError } = await bulkCheckIn(selectedEntryIds);

      if (dbError) {
        setError('Failed to bulk check-in');
        return;
      }

      setEntries(prev =>
        prev.map(e => {
          if (selectedEntryIds.includes(e.id)) {
            return {
              ...e,
              classes: e.classes.map(c => ({
                ...c,
                checkInStatus: 'checked-in',
                checkInTime: new Date(),
              })),
            };
          }
          return e;
        })
      );

      setSelectedEntries(new Set());
      setBulkActionDialog({ open: false, action: null });
    } catch (err) {
      setError('Failed to bulk check-in');
      logger.error('Error bulk check-in:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedEntries, setEntries, setSelectedEntries, setError]);

  // Handle check-in status update
  const handleCheckInStatusUpdate = useCallback(
    async (status: CheckInStatus, notes?: string) => {
      if (!checkInDialog.entry || !checkInDialog.classEntry) return;

      const { entry, classEntry } = checkInDialog;

      try {
        const { error: dbError } = await updateCheckInStatus(entry.id, status, notes);

        if (dbError) {
          throw dbError;
        }

        setEntries(prev =>
          prev.map(e => {
            if (e.id === entry.id) {
              return {
                ...e,
                classes: e.classes.map(c =>
                  c.id === classEntry.id
                    ? { ...c, checkInStatus: status, checkInTime: new Date() }
                    : c
                ),
              };
            }
            return e;
          })
        );

        await auditService.log({
          action: AuditAction.UPDATE,
          entityType: 'class_entry',
          entityId: classEntry.id,
          changes: {
            checkInStatus: { from: classEntry.checkInStatus || 'no-status', to: status },
          },
          metadata: {
            action: 'check_in_status_change',
            secretaryId: user?.id,
            entryNumber: entry.entryNumber,
            dogName: entry.dogName,
            className: classEntry.name,
            notes,
          },
        });

        setCheckInDialog({ open: false, entry: null, classEntry: null });
      } catch (error) {
        logger.error('Failed to update check-in status:', 'pages', {}, error as Error);
        // Revert optimistic update
        setEntries(prev =>
          prev.map(e => {
            if (e.id === entry.id) {
              return {
                ...e,
                classes: e.classes.map(c =>
                  c.id === classEntry.id
                    ? {
                        ...c,
                        ...(classEntry.checkInStatus != null
                          ? { checkInStatus: classEntry.checkInStatus }
                          : {}),
                        ...(classEntry.checkInTime != null
                          ? { checkInTime: classEntry.checkInTime }
                          : {}),
                      }
                    : c
                ),
              };
            }
            return e;
          })
        );
      }
    },
    [checkInDialog, setEntries, user]
  );

  // Handle bulk action
  const handleBulkAction = useCallback(
    async (action: BulkAction) => {
      const selectedEntryIds = Array.from(selectedEntries);

      try {
        switch (action.type) {
          case 'status_change':
            for (const entryId of selectedEntryIds) {
              await handleStatusChange(entryId, action.data.status as EntryStatus);
            }
            break;

          case 'send_notification':
            await auditService.log({
              action: AuditAction.SYSTEM_ACTION,
              entityType: 'bulk_notification',
              entityId: 'bulk_' + Date.now(),
              metadata: {
                action: 'send_notification',
                entryCount: selectedEntryIds.length,
                message: action.data.message,
                secretaryId: user?.id,
              },
            });
            break;

          case 'export':
            await auditService.log({
              action: AuditAction.EXPORT,
              entityType: 'entries_export',
              entityId: 'export_' + Date.now(),
              metadata: {
                action: 'export_entries',
                entryCount: selectedEntryIds.length,
                format: action.data.format,
                secretaryId: user?.id,
              },
            });
            break;
        }

        setSelectedEntries(new Set());
        setBulkActionDialog({ open: false, action: null });
      } catch (error) {
        logger.error('Failed to execute bulk action:', 'pages', {}, error as Error);
      }
    },
    [selectedEntries, handleStatusChange, setSelectedEntries, user]
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
    checkInDialog,
    setCheckInDialog,
    armbandDialog,
    setArmbandDialog,
    autoArmbandDialog,
    setAutoArmbandDialog,
    bulkActionDialog,
    setBulkActionDialog,
    handleStatusChange,
    handleAssignArmband,
    handleAutoAssignArmbands,
    handleBulkCheckIn,
    handleCheckInStatusUpdate,
    handleBulkAction,
    handleExportCSV,
    handleCompEntry,
    handleUncompEntry,
  };
}
