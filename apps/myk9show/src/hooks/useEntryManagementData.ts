import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';
import { getSecretaryShows } from '@/services/database/queries/showQueries';
import {
  getEntriesForShow,
  SecretaryEntry,
} from '@/services/database/queries/secretaryEntryQueries';
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
import {
  isPendingEntry,
  isAcceptedEntry,
  isWaitlistEntry,
  isIssueEntry,
} from '@/utils/entryPredicates';

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
  tabCounts: {
    all: number;
    pending: number;
    accepted: number;
    waitlist: number;
    issues: number;
  };
}

const LAST_SHOW_KEY = 'myk9show:entryMgmt:lastShowId';

/**
 * Custom hook for managing entry data loading
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export function useEntryManagementData(initialShowId?: string): UseEntryManagementDataReturn {
  const { user, hasRole } = useAuthContext();

  // Show selection — resolve from URL param, localStorage, or empty.
  // Defer applying until shows load so the Select can resolve the display name.
  const [shows, setShows] = useState<EntryManagementShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [isLoadingShows, setIsLoadingShows] = useState(true);
  const [didApplyInitial, setDidApplyInitial] = useState(false);

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
      // SecretaryEntry is a flat row (one per class entry), not a grouped structure
      const transformedEntries: EntryManagementEntry[] = (data || []).map(
        (entry: SecretaryEntry) => ({
          id: entry.id,
          registrationId: entry.id,
          entryNumber: entry.armband || entry.id.slice(0, 8).toUpperCase(),
          showId: entry.show_id || '',
          dogName: entry.dog?.name || 'Unknown Dog',
          ownerName: entry.handler || 'Unknown',
          ownerEmail: '',
          handlerName: entry.handler || 'Not specified',
          classes: entry.class
            ? [
                {
                  id: entry.class.id,
                  name: entry.class.name || 'Unknown Class',
                  number: entry.class.class_number || '',
                  fee: entry.entry_fee || 0,
                  ...(entry.jump_height ? { jumpHeight: entry.jump_height } : {}),
                  status: mapClassEntryStatus(entry.entry_status),
                  checkInStatus: (entry.is_in_ring ? 'checked-in' : 'none') as CheckInStatus,
                },
              ]
            : [],
          totalFee: entry.entry_fee || 0,
          paidAmount: entry.payment_status === 'paid' ? entry.entry_fee || 0 : 0,
          entryStatus: mapEntryStatus(entry.entry_status),
          paymentStatus: mapPaymentStatus(entry.payment_status),
          submittedAt: entry.submitted_at
            ? new Date(entry.submitted_at)
            : new Date(entry.created_at || Date.now()),
          lastUpdated: new Date(entry.updated_at || Date.now()),
          ...(entry.special_requests ? { notes: entry.special_requests } : {}),
          ...(entry.armband ? { armbandNumber: entry.armband } : {}),
          ...(entry.registration?.confirmation_number
            ? { confirmationNumber: entry.registration.confirmation_number }
            : {}),
        })
      );

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

  // Apply initial show once shows have loaded: URL param > localStorage > none.
  // Deferred so the Select component has items to resolve the display name.
  useEffect(() => {
    if (didApplyInitial || shows.length === 0) return;
    const candidate = initialShowId || localStorage.getItem(LAST_SHOW_KEY) || '';
    if (candidate && shows.some(s => s.id === candidate)) {
      setSelectedShowId(candidate);
    }
    setDidApplyInitial(true);
  }, [didApplyInitial, initialShowId, shows]);

  // Persist selection to localStorage so sidebar navigation remembers it
  useEffect(() => {
    if (selectedShowId) {
      localStorage.setItem(LAST_SHOW_KEY, selectedShowId);
    }
  }, [selectedShowId]);

  // Load entries when show changes
  useEffect(() => {
    if (selectedShowId) {
      loadEntries(selectedShowId);
    } else {
      setEntries([]);
    }
  }, [selectedShowId, loadEntries]);

  // Single-pass computation for stats and tab counts
  const { stats, tabCounts } = useMemo(() => {
    const acc = { pending: 0, accepted: 0, waitlist: 0, issues: 0, revenue: 0 };
    for (const e of entries) {
      if (isPendingEntry(e)) acc.pending++;
      if (isAcceptedEntry(e)) acc.accepted++;
      if (isWaitlistEntry(e)) acc.waitlist++;
      if (isIssueEntry(e)) acc.issues++;
      acc.revenue += e.paidAmount;
    }
    return {
      stats: {
        total: entries.length,
        pending: acc.pending,
        accepted: acc.accepted,
        waitlist: acc.waitlist,
        revenue: acc.revenue,
      } satisfies EntryStats,
      tabCounts: {
        all: entries.length,
        pending: acc.pending,
        accepted: acc.accepted,
        waitlist: acc.waitlist,
        issues: acc.issues,
      },
    };
  }, [entries]);

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
    tabCounts,
  };
}
