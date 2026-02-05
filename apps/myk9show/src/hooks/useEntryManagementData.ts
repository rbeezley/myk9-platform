/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// TODO: Remove ts-nocheck once secretaryEntryQueries.ts types match schema
import { useState, useCallback, useEffect } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';
import { getSecretaryShows } from '@/services/database/queries/showQueries';
import {
  getEntriesForShow,
  SecretaryEntry,
} from '@/services/database/queries/secretaryEntryQueries';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@/types/check-in-types';
import type {
  EntryManagementEntry,
  EntryManagementShow,
  EntryStats,
} from '@/types/entry-management-types';
import {
  mapEntryStatus,
  mapPaymentStatus,
  mapClassEntryStatus,
} from '@/utils/entryManagementUtils';

interface UseEntryManagementDataReturn {
  // Auth
  user: ReturnType<typeof useAuthContext>['user'];
  hasRole: ReturnType<typeof useAuthContext>['hasRole'];

  // Shows
  shows: EntryManagementShow[];
  selectedShowId: string;
  setSelectedShowId: (id: string) => void;
  isLoadingShows: boolean;
  loadShows: () => Promise<void>;

  // Entries
  entries: EntryManagementEntry[];
  setEntries: React.Dispatch<React.SetStateAction<EntryManagementEntry[]>>;
  isLoading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  loadEntries: (showId: string) => Promise<void>;

  // Computed
  stats: EntryStats;
}

/**
 * Custom hook for managing entry data loading
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export function useEntryManagementData(): UseEntryManagementDataReturn {
  const { user, hasRole } = useAuthContext();

  // Show selection
  const [shows, setShows] = useState<EntryManagementShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [isLoadingShows, setIsLoadingShows] = useState(true);

  // Entry data
  const [entries, setEntries] = useState<EntryManagementEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadShows = useCallback(async () => {
    setIsLoadingShows(true);
    try {
      const { data, error: queryError } = await getSecretaryShows(user?.id || '');
      if (queryError) {
        logger.error('Error loading shows:', 'secretary', {}, queryError as Error);
      } else {
        setShows(data || []);
      }
    } catch (err) {
      logger.error('Error loading shows:', 'secretary', {}, err as Error);
    } finally {
      setIsLoadingShows(false);
    }
  }, [user?.id]);

  const loadEntries = useCallback(async (showId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await getEntriesForShow(showId);

      if (queryError) {
        setError('Failed to load entries');
        logger.error('Error loading entries:', 'secretary', {}, queryError as Error);
        return;
      }

      // Transform database entries to UI format
      const transformedEntries: EntryManagementEntry[] = (data || []).map((entry: SecretaryEntry) => ({
        id: entry.id,
        registrationId: entry.id,
        entryNumber: entry.armband_number || entry.id.slice(0, 8).toUpperCase(),
        showId: entry.show_id,
        dogName: entry.dog?.name || 'Unknown Dog',
        ownerName: entry.owner
          ? `${entry.owner.first_name || ''} ${entry.owner.last_name || ''}`.trim() || 'Unknown'
          : 'Unknown',
        ownerEmail: entry.owner?.email || '',
        handlerName: entry.handler || entry.owner
          ? `${entry.owner?.first_name || ''} ${entry.owner?.last_name || ''}`.trim()
          : 'Not specified',
        classes: (entry.class_entries || []).map((ce) => ({
          id: ce.id,
          name: ce.class?.name || 'Unknown Class',
          number: ce.class?.class_number || '',
          fee: ce.entry_fee || 0,
          jumpHeight: ce.jump_height || undefined,
          status: mapClassEntryStatus(ce.status),
          checkInStatus: ce.check_in_status as CheckInStatus | undefined,
          checkInTime: ce.check_in_time ? new Date(ce.check_in_time) : undefined,
        })),
        totalFee: entry.total_fees || 0,
        paidAmount: entry.payment_status === 'paid' ? (entry.total_fees || 0) : 0,
        entryStatus: mapEntryStatus(entry.entry_status),
        paymentStatus: mapPaymentStatus(entry.payment_status),
        submittedAt: entry.submitted_at ? new Date(entry.submitted_at) : new Date(entry.created_at),
        lastUpdated: new Date(entry.updated_at),
        notes: entry.special_requests || undefined,
        armbandNumber: entry.armband_number || undefined,
      }));

      setEntries(transformedEntries);
    } catch (err) {
      setError('Failed to load entries');
      logger.error('Error loading entries:', 'secretary', {}, err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load shows on mount
  useEffect(() => {
    loadShows();
  }, [loadShows]);

  // Load entries when show changes
  useEffect(() => {
    if (selectedShowId) {
      loadEntries(selectedShowId);
    } else {
      setEntries([]);
    }
  }, [selectedShowId, loadEntries]);

  // Calculate stats
  const stats: EntryStats = {
    total: entries.length,
    pending: entries.filter(e => e.entryStatus === EntryStatus.PENDING || e.paymentStatus === PaymentStatus.PENDING).length,
    accepted: entries.filter(e => e.entryStatus === EntryStatus.ACCEPTED).length,
    waitlist: entries.filter(e => e.entryStatus === EntryStatus.WAITLIST).length,
    revenue: entries.reduce((sum, e) => sum + e.paidAmount, 0)
  };

  return {
    user,
    hasRole,
    shows,
    selectedShowId,
    setSelectedShowId,
    isLoadingShows,
    loadShows,
    entries,
    setEntries,
    isLoading,
    error,
    setError,
    loadEntries,
    stats,
  };
}
