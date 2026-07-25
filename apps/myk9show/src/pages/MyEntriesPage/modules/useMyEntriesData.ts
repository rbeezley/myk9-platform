/**
 * Data hook for MyEntriesPage
 * Handles fetching, transformation, and real-time updates
 * @module MyEntriesPage/hooks
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { CheckInStatus } from '@/types/check-in-types';
import { logger } from '@/services/LoggingService';
import { getUserEntries } from '@/services/database/entries';
import {
  mapEntryStatus,
  mapPaymentStatus,
  mapClassEntryStatus,
} from '@/utils/entryManagementUtils';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
  type EntryBalanceRawRow,
  type EntryBalanceSummary,
} from '@/features/payments/entryBalanceSummary';
import { parseShowDate } from './myEntriesStats.helpers';
import { normalizeCheckInStatus } from './myEntriesUtils';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import type { MyEntry, EntryClass } from './my-entries-types';

interface UseMyEntriesDataReturn {
  entries: MyEntry[];
  /**
   * Amount-due summary computed from the same RAW, ungrouped per-class rows
   * (via `mapEntryRowToBalanceSource` + `summarizeEntryBalances`) that My
   * Payments uses — not from the grouped `entries` cards above. Grouping
   * cards by order/dog (see `groupEntriesByOrder`) is lossy for money math:
   * it only keeps the first row's `payment_status` per order, so a
   * registration-less order whose class rows have different payment
   * statuses would otherwise show a different amount due here than on My
   * Payments. See `exhibitor-money-clarity` spec + `crossSurfaceAmountDue.test.ts`.
   */
  balanceSummary: EntryBalanceSummary;
  isLoading: boolean;
  isError: boolean;
  refreshing: boolean;
  refreshEntries: () => Promise<void>;
  updateEntryCheckIn: (
    entryId: string,
    classId: string,
    status: CheckInStatus,
    notes?: string
  ) => Promise<void>;
}

interface PersistCheckInStatusInput {
  entryId: string;
  classId: string;
  newStatus: CheckInStatus;
}

interface UseMyEntriesDataOptions {
  persistCheckInStatus: (input: PersistCheckInStatusInput) => Promise<unknown>;
}

type OwnEntryResultRow = Record<string, unknown> & {
  class_results_released_at?: string | null;
  dog_image_url?: string | null;
};

/**
 * Hook for managing user entries data
 * Handles loading, real-time updates, and check-in status changes
 */
export function useMyEntriesData({
  persistCheckInStatus,
}: UseMyEntriesDataOptions): UseMyEntriesDataReturn {
  const { user, userWithRoles } = useAuthContext();
  const legacyPersonId = useCurrentUserPersonId();
  const personId = legacyPersonId ?? userWithRoles?.databaseUserId ?? null;
  const [entries, setEntries] = useState<MyEntry[]>([]);
  const [balanceSummary, setBalanceSummary] = useState<EntryBalanceSummary>(() =>
    summarizeEntryBalances([])
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Transforms database entry to MyEntry format
   */
  const transformEntry = useCallback((entry: OwnEntryResultRow): MyEntry => {
    // Type assertions for nested objects
    const dog = entry.dog as { id: string; name: string; call_name?: string } | null;
    const show = entry.show as {
      id: string;
      name: string;
      start_date: string;
      end_date?: string | null;
      entry_close_date?: string | null;
      venue_name?: string;
      city?: string;
      state?: string;
    } | null;
    // Each entry row from getUserEntries represents one dog in one class.
    // The class data is available via the `class` join (class:class_id).
    const classData = entry.class as {
      id: string;
      name: string;
      class_number?: string;
      trial?: { trial_type?: string; date?: string; trial_number?: string | null } | null;
    } | null;
    // Discipline gates the jump-height field. Prefer entries.trial_id, but fall
    // back through class.trial_id so legacy entries with NULL trial_id still work.
    const trialData = entry.trial as {
      trial_type?: string;
      date?: string;
      trial_number?: string | null;
    } | null;
    const armband = entry.armband ? String(entry.armband) : undefined;
    const trialDate = parseShowDate(trialData?.date ?? classData?.trial?.date);
    const trialNumber = trialData?.trial_number ?? classData?.trial?.trial_number ?? undefined;

    // Build a single-element classes array from this entry row's own data
    const classes: EntryClass[] = classData
      ? [
          {
            id: entry.id as string,
            classId: classData.id,
            name: classData.name || 'Unknown Class',
            number: classData.class_number || '',
            fee: (entry.entry_fee as number) || 0,
            trialDate,
            trialNumber,
            jumpHeight: (entry.jump_height as string) || undefined,
            trialType: trialData?.trial_type || classData.trial?.trial_type || undefined,
            runOrder: (entry.run_order as number) || undefined,
            status: mapClassEntryStatus(entry.entry_status as string),
            handler: (entry.handler as string) || undefined,
            // Read the persisted check-in status instead of hardcoding undefined,
            // or the card always shows "Not Checked In" even after a check-in.
            checkInStatus: normalizeCheckInStatus(entry.check_in_status),
            isScored: (entry.is_scored as boolean) || false,
            resultStatus: (entry.result_status as EntryClass['resultStatus']) ?? undefined,
            searchTimeSeconds: (entry.search_time_seconds as number) ?? undefined,
            totalFaults: (entry.total_faults as number) ?? undefined,
            finalPlacement: (entry.final_placement as number) ?? undefined,
            resultsReleasedAt: (entry.class_results_released_at as string | null) ?? undefined,
            dogImageUrl: (entry.dog_image_url as string | null) ?? undefined,
          },
        ]
      : [];

    const entryStatus = mapEntryStatus(entry.entry_status as string);
    // Use real confirmation number from joined registration, fall back to UUID slice for legacy entries
    const registration = entry.registration as {
      id: string;
      confirmation_number: string;
      payment_status?: string | null;
    } | null;
    const confirmationNumber =
      registration?.confirmation_number ?? (entry.id as string).slice(0, 8).toUpperCase();
    const effectivePaymentStatus = registration?.payment_status ?? (entry.payment_status as string);

    return {
      id: entry.id as string,
      // Preserve genuine nullness (secretary/mail-in entries have no online
      // registration) — groupEntriesByOrder falls back to a show+dog key for
      // these instead of merging them under a synthetic per-row id.
      registrationId: (entry.registration_id as string | null) ?? null,
      showId: show?.id || '',
      showName: show?.name || 'Unknown Show',
      // Date-only DB columns ("YYYY-MM-DD") must be read as local days, not UTC,
      // or a show ending today is misread as yesterday (see parseShowDate).
      showDate: parseShowDate(show?.start_date) ?? new Date(),
      showEndDate: parseShowDate(show?.end_date),
      location: {
        venue: show?.venue_name || '',
        city: show?.city || '',
        state: show?.state || '',
      },
      dogName: dog?.call_name || dog?.name || 'Unknown Dog',
      dogId: dog?.id || '',
      armband,
      classes,
      // Rebuilt by groupEntriesByOrder from the top-level dog fields above —
      // this raw per-class-row shape never renders directly.
      dogs: [],
      totalFee: (entry.entry_fee as number) || 0,
      entryStatus,
      paymentStatus: mapPaymentStatus(effectivePaymentStatus),
      paymentMethod: (entry.payment_method as string | null) ?? null,
      confirmationNumber,
      entryCloseDate: show?.entry_close_date ? new Date(show.entry_close_date) : undefined,
      submittedAt: new Date((entry.submitted_at as string) || (entry.created_at as string)),
      lastUpdated: new Date(entry.updated_at as string),
    };
  }, []);

  /**
   * Loads user entries from the database
   */
  const loadMyEntries = useCallback(async () => {
    if (!user?.id || !personId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await getUserEntries(personId);

      if (error) {
        logger.error('Failed to load entries:', 'pages', {}, error as Error);
        setIsError(true);
        setEntries([]);
        return;
      }

      const rawRows = data as OwnEntryResultRow[];
      const userEntries = groupEntriesByOrder(rawRows.map(entry => transformEntry(entry)));
      setEntries(userEntries);
      // Money math runs on the same raw, ungrouped rows My Payments uses —
      // see the `balanceSummary` doc comment above.
      setBalanceSummary(
        summarizeEntryBalances(
          rawRows.map(row => mapEntryRowToBalanceSource(row as EntryBalanceRawRow))
        )
      );
      setIsError(false);
    } catch (error) {
      logger.error('Failed to load entries:', 'pages', {}, error as Error);
      setIsError(true);
      setEntries([]);
      setBalanceSummary(summarizeEntryBalances([]));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, personId, transformEntry]);

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
      // After grouping, entry.id is the first class row's id and may differ from
      // classId. Find the grouped card that contains the target class instead.
      const entry = entries.find(e => e.id === entryId || e.classes.some(c => c.id === classId));
      const classEntry = entry?.classes.find(c => c.id === classId);

      if (!entry || !classEntry) return;

      const previousStatus = classEntry.checkInStatus;
      const previousTime = classEntry.checkInTime;

      try {
        // Optimistic update
        setEntries(prev =>
          prev.map((e): MyEntry => {
            if (e.id === entryId) {
              return {
                ...e,
                classes: e.classes.map((c): EntryClass =>
                  c.id === classId ? { ...c, checkInStatus: status, checkInTime: new Date() } : c
                ),
                // Keep the per-dog nested classes (rendered in the dogs grid
                // for multi-dog orders) in lockstep with the flattened list.
                dogs: e.dogs.map(dog => ({
                  ...dog,
                  classes: dog.classes.map((c): EntryClass =>
                    c.id === classId ? { ...c, checkInStatus: status, checkInTime: new Date() } : c
                  ),
                })),
              };
            }
            return e;
          })
        );

        // classId is the individual entry row id — use it as the DB target so
        // grouped cards with multiple classes update the right row.
        await persistCheckInStatus({ entryId: classId, classId, newStatus: status });

        // Log the check-in status change
        auditService.log({
          action: AuditAction.UPDATE,
          entityType: 'class_entry',
          entityId: classId,
          changes: {
            checkInStatus: { from: previousStatus || 'no-status', to: status },
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
        setEntries(prev =>
          prev.map((e): MyEntry => {
            if (e.id === entryId) {
              return {
                ...e,
                classes: e.classes.map((c): EntryClass =>
                  c.id === classId
                    ? { ...c, checkInStatus: previousStatus, checkInTime: previousTime }
                    : c
                ),
                dogs: e.dogs.map(dog => ({
                  ...dog,
                  classes: dog.classes.map((c): EntryClass =>
                    c.id === classId
                      ? { ...c, checkInStatus: previousStatus, checkInTime: previousTime }
                      : c
                  ),
                })),
              };
            }
            return e;
          })
        );
        throw error;
      }
    },
    [entries, persistCheckInStatus, user?.id]
  );

  return {
    entries,
    balanceSummary,
    isLoading,
    isError,
    refreshing,
    refreshEntries,
    updateEntryCheckIn,
  };
}
