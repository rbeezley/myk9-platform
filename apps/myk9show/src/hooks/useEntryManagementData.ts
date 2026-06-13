import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { logger } from '@/services/LoggingService';
import { getSecretaryShows, getShowById } from '@/services/database/shows';
import { getEntriesForShow } from '@/services/database/entries';
import type { CheckInStatus } from '@myk9/core';
import type {
  EntryManagementEntry,
  EntryManagementShow,
  EntryStats,
} from '@/types/entry-management-types';
import type { SecretaryEntry } from '@/services/database/entries';
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
  /**
   * Action errors — failures from `useEntryManagementActions` (export,
   * bulk status, comp/uncomp, etc.). Rendered inline at the top of
   * the page so the entries table stays usable. NOT used to gate
   * main-content render; see `loadError` for that.
   */
  error: string | null;
  setError: (error: string | null) => void;
  /**
   * Load errors — failures from `loadEntries` itself. Separated from
   * `error` so a one-off action failure doesn't hide a successfully
   * loaded entries table behind a "Couldn't load entries" card.
   * Set to `null` at the start of each `loadEntries` call.
   */
  loadError: string | null;
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

  // Email log
  lastEmailedMap: Record<string, string>;
  refreshEmailLog: (regIds: string[]) => Promise<void>;
}

const LAST_SHOW_KEY = 'myk9show:entryMgmt:lastShowId';

/** "First Last" from a joined person record, or null when absent/blank. */
function personName(
  person: { first_name: string | null; last_name: string | null } | null | undefined
): string | null {
  if (!person) return null;
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return name || null;
}

interface EntryManagementShowRow {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
}

/**
 * Custom hook for managing entry data loading
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */
export function useEntryManagementData(initialShowId?: string): UseEntryManagementDataReturn {
  const { user, hasRole } = useAuthContext();
  const { status: syncStatus, triggerSync } = useReplicationSync();

  // Show selection — resolve from URL param, localStorage, or empty.
  // Defer applying until shows load so the Select can resolve the display name.
  const [shows, setShows] = useState<EntryManagementShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [isLoadingShows, setIsLoadingShows] = useState(true);
  const [didApplyInitial, setDidApplyInitial] = useState(false);

  // Entry data
  const [entries, setEntries] = useState<EntryManagementEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Action errors (multiplexed channel — see interface doc).
  const [error, setError] = useState<string | null>(null);
  // Load-specific errors (only set by `loadEntries`; never by actions).
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestedEmptyReplicaSyncFor = useRef<string | null>(null);
  const reloadedAfterSyncKey = useRef<string | null>(null);

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
    setLoadError(null);
    try {
      const { data, error: queryError } = await getEntriesForShow(showId);

      if (queryError) {
        setLoadError('Failed to load entries');
        logger.error('Error loading entries:', 'secretary', {}, queryError as Error);
        return;
      }

      // Transform database entries to UI format
      // SecretaryEntry is a flat row (one per class entry), not a grouped structure
      // `as unknown` bridge: entries.refund_amount/refunded_at (migration
      // 20260609220000) aren't in the generated Database types yet — drop the
      // bridge after the next `supabase gen types` run.
      const transformedEntries: EntryManagementEntry[] = (
        (data || []) as unknown as SecretaryEntry[]
      ).map(
        (entry): EntryManagementEntry => ({
          id: entry.id,
          registrationId: entry.registration?.id ?? entry.registration_id ?? '',
          entryNumber: entry.armband || entry.id.slice(0, 8).toUpperCase(),
          showId: entry.show_id || '',
          dogId: entry.dog_id || '',
          dogName: entry.dog?.name || 'Unknown Dog',
          // Online (webhook-created) entries set handler_id/dog.owner FKs but
          // never the legacy `handler` text; mail-in entries set the text only.
          ownerName: personName(entry.dog?.owner) || entry.handler || 'Unknown',
          ownerEmail: entry.dog?.owner?.email ?? '',
          handlerName: personName(entry.handler_person) || entry.handler || 'Not specified',
          classes: entry.class
            ? [
                {
                  id: entry.class.id,
                  name: entry.class.name || 'Unknown Class',
                  number: entry.class.class_number || '',
                  fee: entry.entry_fee || 0,
                  ...(entry.jump_height ? { jumpHeight: entry.jump_height } : {}),
                  status: mapClassEntryStatus(entry.entry_status),
                  checkInStatus: (entry.check_in_status as CheckInStatus) ?? 'no-status',
                },
              ]
            : [],
          totalFee: entry.entry_fee || 0,
          // 'refunded' covers partial refunds too (stripe-refund-entry sets it
          // for both) — net paid is fee minus refund, not zero (Codex P2).
          paidAmount:
            entry.payment_status === 'paid'
              ? entry.entry_fee || 0
              : entry.payment_status === 'refunded'
                ? Math.max(0, (entry.entry_fee || 0) - (entry.refund_amount ?? 0))
                : 0,
          entryStatus: mapEntryStatus(entry.entry_status),
          paymentStatus: mapPaymentStatus(entry.payment_status),
          submittedAt: entry.submitted_at
            ? new Date(entry.submitted_at)
            : new Date(entry.created_at || Date.now()),
          lastUpdated: new Date(entry.updated_at || Date.now()),
          ...(entry.special_requests ? { notes: entry.special_requests } : {}),
          ...(entry.armband ? { armbandNumber: entry.armband } : {}),
          ...(entry.registration?.confirmation_number != null
            ? { confirmationNumber: entry.registration.confirmation_number }
            : {}),
          ...(entry.registration?.payment_status != null
            ? { enrollmentPaymentStatus: mapPaymentStatus(entry.registration.payment_status) }
            : {}),
          ...(entry.registration?.payment_reference != null
            ? { enrollmentPaymentReference: entry.registration.payment_reference }
            : {}),
          enrollmentTotalAmount: entry.registration?.total_amount ?? null,
          enrollmentPaidAmount: entry.registration?.paid_amount ?? null,
          // withdrawal_reason and refund fields populated after migration 175/176 pushed
          ...(entry.withdrawal_reason ? { withdrawalReason: entry.withdrawal_reason } : {}),
          ...(entry.registration?.refund_amount != null
            ? { enrollmentRefundAmount: entry.registration.refund_amount }
            : {}),
          ...(entry.registration?.refund_notes != null
            ? { enrollmentRefundNotes: entry.registration.refund_notes }
            : {}),
          ...(entry.registration?.refunded_at != null
            ? { enrollmentRefundedAt: entry.registration.refunded_at }
            : {}),
          // Entry-level Stripe payment/refund state (migration 20260609220000)
          paymentMethod: entry.payment_method ?? null,
          refundAmount: entry.refund_amount ?? null,
          refundedAt: entry.refunded_at ?? null,
          stripePaymentIntentId: entry.stripe_payment_intent_id ?? null,
        })
      );

      setEntries(transformedEntries);
    } catch (err) {
      setLoadError('Failed to load entries');
      logger.error('Error loading entries:', 'secretary', {}, err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load shows on mount
  useEffect(() => {
    loadShows();
  }, [loadShows]);

  // Apply initial show: URL param > localStorage > none.
  // URL deep links must work even when the local replicated show cache is stale.
  useEffect(() => {
    if (didApplyInitial) return;
    const candidate = initialShowId || localStorage.getItem(LAST_SHOW_KEY) || '';

    if (!candidate) {
      if (!isLoadingShows) setDidApplyInitial(true);
      return;
    }

    if (shows.some(s => s.id === candidate)) {
      setSelectedShowId(candidate);
      setDidApplyInitial(true);
      return;
    }

    if (!initialShowId) {
      if (!isLoadingShows) setDidApplyInitial(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data } = await getShowById(initialShowId);
      if (cancelled) return;

      if (data?.id) {
        const row = data as EntryManagementShowRow;
        const linkedShow: EntryManagementShow = {
          id: row.id,
          name: row.name,
          start_date: row.start_date,
          end_date: row.end_date,
        };
        setShows(prev =>
          prev.some(show => show.id === linkedShow.id) ? prev : [linkedShow, ...prev]
        );
        setSelectedShowId(initialShowId);
      }

      setDidApplyInitial(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [didApplyInitial, initialShowId, isLoadingShows, shows]);

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

  const entriesSyncStatus = syncStatus.tablesStatus.entries;
  const entriesSyncAt = syncStatus.lastSyncAt?.getTime() ?? null;

  useEffect(() => {
    if (!selectedShowId || isLoading || loadError || entries.length > 0) {
      if (!selectedShowId || entries.length > 0) {
        requestedEmptyReplicaSyncFor.current = null;
      }
      return;
    }

    if (entriesSyncStatus === 'idle' && requestedEmptyReplicaSyncFor.current !== selectedShowId) {
      requestedEmptyReplicaSyncFor.current = selectedShowId;
      void triggerSync();
    }
  }, [entries.length, entriesSyncStatus, isLoading, loadError, selectedShowId, triggerSync]);

  useEffect(() => {
    if (!selectedShowId || !entriesSyncAt || entriesSyncStatus !== 'success') return;

    const syncKey = `${selectedShowId}:${entriesSyncAt}`;
    if (reloadedAfterSyncKey.current === syncKey) return;

    reloadedAfterSyncKey.current = syncKey;
    void loadEntries(selectedShowId);
  }, [entriesSyncAt, entriesSyncStatus, loadEntries, selectedShowId]);

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

  // Email log: map of registrationId → most recent decision email sent_at
  const [lastEmailedMap, setLastEmailedMap] = useState<Record<string, string>>({});
  const lastEmailedFetchedFor = useRef<string | null>(null);

  const refreshEmailLog = useCallback(async (regIds: string[]) => {
    if (regIds.length === 0) return;
    const { data } = await supabase
      .from('email_log')
      .select('related_id, created_at')
      .in('related_id', regIds)
      .eq('email_type', 'entry_decision')
      .order('created_at', { ascending: false });
    if (!data) return;
    const map: Record<string, string> = {};
    for (const row of data) {
      if (row.related_id && !map[row.related_id]) {
        map[row.related_id] = row.created_at;
      }
    }
    setLastEmailedMap(map);
  }, []);

  useEffect(() => {
    const regIds = [...new Set(entries.map(e => e.registrationId).filter(Boolean))];
    const key = regIds.sort().join(',');
    if (key === lastEmailedFetchedFor.current) return;
    lastEmailedFetchedFor.current = key;
    refreshEmailLog(regIds);
  }, [entries, refreshEmailLog]);

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
    loadError,
    loadEntries,
    stats,
    tabCounts,
    lastEmailedMap,
    refreshEmailLog,
  };
}
