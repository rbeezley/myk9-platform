/**
 * Data hook for MyEntriesPage
 * Handles fetching, transformation, and real-time updates
 * @module MyEntriesPage/hooks
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useStatusUpdates } from '@/services/NotificationService';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import { logger } from '@/services/LoggingService';
import { getUserEntries } from '@/services/database/queries/entryQueries';
import type { MyEntry, EntryClass, EntryUpdateEvent } from './my-entries-types';

/**
 * Maps database entry status to EntryStatus enum
 */
const mapEntryStatus = (status?: string | null): EntryStatus => {
  switch (status) {
    case 'submitted':
      return EntryStatus.PENDING;
    case 'accepted':
      return EntryStatus.ACCEPTED;
    case 'rejected':
      return EntryStatus.REJECTED;
    case 'withdrawn':
      return EntryStatus.CANCELLED;
    default:
      return EntryStatus.PENDING;
  }
};

/**
 * Maps database payment status to PaymentStatus enum
 */
const mapPaymentStatus = (status?: string | null): PaymentStatus => {
  switch (status) {
    case 'paid':
      return PaymentStatus.PAID_ONLINE;
    case 'refunded':
      return PaymentStatus.REFUNDED;
    case 'pending':
    default:
      return PaymentStatus.PENDING;
  }
};

/**
 * Maps class entry status to component status type
 */
const mapClassEntryStatus = (status?: string): 'entered' | 'scratched' | 'moved' | 'absent' => {
  switch (status) {
    case 'withdrawn':
      return 'scratched';
    case 'rejected':
      return 'absent';
    default:
      return 'entered';
  }
};

interface UseMyEntriesDataReturn {
  entries: MyEntry[];
  isLoading: boolean;
  refreshing: boolean;
  refreshEntries: () => Promise<void>;
  updateEntryCheckIn: (
    entryId: string,
    classId: string,
    status: CheckInStatus,
    notes?: string
  ) => Promise<void>;
}

/**
 * Hook for managing user entries data
 * Handles loading, real-time updates, and check-in status changes
 */
export function useMyEntriesData(): UseMyEntriesDataReturn {
  const { user } = useAuthContext();
  const [entries, setEntries] = useState<MyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real-time status updates for user's entries
  const { status: entryUpdates } = useStatusUpdates('user_entries', user?.id || '');

  /**
   * Transforms database entry to MyEntry format
   */
  const transformEntry = useCallback((entry: Record<string, unknown>): MyEntry => {
    // Type assertions for nested objects
    const dog = entry.dog as { id: string; name: string; call_name?: string } | null;
    const show = entry.show as {
      id: string;
      name: string;
      start_date: string;
      venue?: string;
      city?: string;
      state?: string;
    } | null;
    const classEntries = (entry.class_entry || []) as Array<{
      id: string;
      class_id: string;
      armband?: string;
      run_order?: number;
      jump_height?: string;
      entry_fee?: number;
      status?: string;
      class?: { id: string; name: string; class_number?: string } | null;
    }>;

    // Map class entries to EntryClass format
    const classes: EntryClass[] = classEntries.map((ce) => ({
      id: ce.id,
      name: ce.class?.name || 'Unknown Class',
      number: ce.class?.class_number || '',
      fee: ce.entry_fee || 0,
      jumpHeight: ce.jump_height,
      runOrder: ce.run_order,
      status: mapClassEntryStatus(ce.status),
      checkInStatus: undefined,
    }));

    const entryStatus = mapEntryStatus(entry.entry_status as string);
    const paymentStatus = mapPaymentStatus(entry.payment_status as string);

    return {
      id: entry.id as string,
      registrationId: entry.id as string,
      showId: show?.id || '',
      showName: show?.name || 'Unknown Show',
      showDate: new Date(show?.start_date || Date.now()),
      location: {
        venue: show?.venue || '',
        city: show?.city || '',
        state: show?.state || '',
      },
      dogName: dog?.call_name || dog?.name || 'Unknown Dog',
      dogId: dog?.id || '',
      classes,
      totalFee: (entry.total_fees as number) || classes.reduce((sum, c) => sum + c.fee, 0),
      entryStatus,
      paymentStatus,
      registrationNumber: undefined,
      confirmationNumber: (entry.id as string).slice(0, 8).toUpperCase(),
      submittedAt: new Date((entry.submitted_at as string) || (entry.created_at as string)),
      lastUpdated: new Date(entry.updated_at as string),
    };
  }, []);

  /**
   * Loads user entries from the database
   */
  const loadMyEntries = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await getUserEntries(user.id);

      if (error) {
        logger.error('Failed to load entries:', 'pages', {}, error as Error);
        setEntries([]);
        return;
      }

      const userEntries = data.map((entry) => transformEntry(entry));
      setEntries(userEntries);
    } catch (error) {
      logger.error('Failed to load entries:', 'pages', {}, error as Error);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, user?.email, transformEntry]);

  /**
   * Handles real-time entry updates
   */
  const handleEntryUpdate = useCallback((update: EntryUpdateEvent) => {
    if (update.type === 'entry_status_change' || update.type === 'payment_status_change') {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === update.entryId
            ? { ...entry, ...update.changes, lastUpdated: new Date() }
            : entry
        )
      );
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadMyEntries();
    auditService.log({
      action: AuditAction.READ,
      entityType: 'my_entries',
      entityId: user?.id || 'unknown',
      metadata: {
        page: 'my_entries',
        loadTime: new Date().toISOString(),
      },
    });
  }, [loadMyEntries, user?.id]);

  // Real-time updates
  useEffect(() => {
    if (entryUpdates && typeof entryUpdates === 'object') {
      const update = entryUpdates as unknown as EntryUpdateEvent;
      if (update.type && update.entryId) {
        handleEntryUpdate(update);
      }
    }
  }, [entryUpdates, handleEntryUpdate]);

  /**
   * Refreshes entries data
   */
  const refreshEntries = useCallback(async () => {
    setRefreshing(true);
    await loadMyEntries();
    setRefreshing(false);
  }, [loadMyEntries]);

  /**
   * Updates check-in status for a class entry
   */
  const updateEntryCheckIn = useCallback(
    async (entryId: string, classId: string, status: CheckInStatus, notes?: string) => {
      const entry = entries.find((e) => e.id === entryId);
      const classEntry = entry?.classes.find((c) => c.id === classId);

      if (!entry || !classEntry) return;

      const previousStatus = classEntry.checkInStatus;
      const previousTime = classEntry.checkInTime;

      try {
        // Optimistic update
        setEntries((prev) =>
          prev.map((e): MyEntry => {
            if (e.id === entryId) {
              return {
                ...e,
                classes: e.classes.map((c): EntryClass =>
                  c.id === classId ? { ...c, checkInStatus: status, checkInTime: new Date() } : c
                ),
              };
            }
            return e;
          })
        );

        // Log the check-in status change
        auditService.log({
          action: AuditAction.UPDATE,
          entityType: 'class_entry',
          entityId: classId,
          changes: {
            checkInStatus: { from: previousStatus || 'none', to: status },
          },
          metadata: {
            action: 'exhibitor_check_in',
            userId: user?.id,
            entryId,
            dogName: entry.dogName,
            className: classEntry.name,
            notes,
          },
        });
      } catch (error) {
        logger.error('Failed to update check-in status:', 'pages', {}, error as Error);
        // Revert optimistic update
        setEntries((prev) =>
          prev.map((e): MyEntry => {
            if (e.id === entryId) {
              return {
                ...e,
                classes: e.classes.map((c): EntryClass =>
                  c.id === classId
                    ? { ...c, checkInStatus: previousStatus, checkInTime: previousTime }
                    : c
                ),
              };
            }
            return e;
          })
        );
        throw error;
      }
    },
    [entries, user?.id]
  );

  return {
    entries,
    isLoading,
    refreshing,
    refreshEntries,
    updateEntryCheckIn,
  };
}
