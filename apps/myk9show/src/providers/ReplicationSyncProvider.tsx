/**
 * ReplicationSyncProvider - Orchestrates sync for replicated tables
 *
 * Phase 2.2: Wire up sync() method calls
 *
 * This provider:
 * 1. Triggers initial sync on app startup (when online)
 * 2. Triggers sync when network status changes from offline to online
 * 3. Provides sync status to the app
 *
 * Uses @myk9/replication package for offline-first data sync.
 */

import { adoptHeldRingsideScoresForLiveClaim } from '@/services/replication/heldRingsideScores';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useStoreSubscriptions } from '@/hooks/useStoreSubscriptions';
import { resolveSessionUser } from '@/hooks/authSessionUser';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import {
  ReplicationSyncActionsContext,
  ReplicationSyncStatusContext,
} from '@/context/ReplicationSyncContext';
import {
  ReplicatedTable,
  SyncCacheWriter,
  abortableWait,
  configureConflictSurfacing,
  isShortOnlyFailure,
  configureRemoteCountCadence,
  markRealtimeReconnected,
  type ReplicationConflictEventDetail,
  type UploadCompleteEventDetail,
} from '@myk9/replication';
import { toast } from 'sonner';
import { SyncFailureReason } from './SyncFailureReason';
import { keepMyChange, keepOtherChange } from './conflictChoices';
import { CONFLICT_SETTLED_EVENT } from '@/features/replication-conflicts/conflictEvents';
import { showConflictSurfacingEnabled } from '@/features/show-presence/conflictSurfacingFlag';
import { features } from '@/config/features';
import { supabase } from '@/services/database/supabaseClient';

// Import replicated table singletons
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { replicatedShowDeskPeopleTable } from '@/services/replication/ReplicatedShowDeskPeopleTable';
import { replicatedClubsTable } from '@/services/replication/ReplicatedClubsTable';
import { replicatedJudgeAssignmentsTable } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { replicatedArmbandsTable } from '@/services/replication/ReplicatedArmbandsTable';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { replicatedPaperworkPrintsTable } from '@/services/replication/ReplicatedPaperworkPrintsTable';
import { isAbortSyncError } from '@/services/replication/syncErrorUtils';
import { invalidateEnrichmentForUpload } from '@/services/replication/classJudgePick';
import { requestPersistentStorage } from '@/lib/persistentStorage';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import type { SyncFailedEventDetail } from './replicationSyncFormatters';
import { withoutListedScores } from '@/features/at-show/scoresNotSent/scoresNotSentFilter';
import {
  isPasscodeRegeneratedMessage,
  revokeRingsidePasscodeAccess,
} from '@/features/at-show/ringsidePasscodeRevocation';
import {
  formatSyncFailureReason,
  formatSyncFailureToast,
  formatDownloadFailureToast,
  hasPermanentScoreAuthorizationFailure,
  splitPermanentScoreAuthorizationFailures,
  DOWNLOAD_SYNC_FAILURE_TOAST_ID,
} from './replicationSyncFormatters';
import { markOnline } from './syncCadence';
import { useSyncPassScheduler } from './useSyncPassScheduler';
import {
  CONFLICT_KEEP_LOCAL_LABEL,
  CONFLICT_TAKE_REMOTE_LABEL,
  CONFLICT_TOAST_DESCRIPTION,
  CONFLICT_TOAST_TITLE,
} from '@/lib/offlineCopy';
import { entryConflictCopy } from '@/lib/entryConflictCopy';
import { useDiscardRevertCacheSync } from './useDiscardRevertCacheSync';
import { useRegistrationsReplicaCacheSync } from './useRegistrationsReplicaCacheSync';
import {
  classifyTableSyncResults,
  createTablesStatus,
  shouldRequestPostUploadSync,
  type TableSyncStatus,
} from './replicationSyncStatus';
import {
  invalidatePostSyncQueries,
  refetchShowEntriesAfterScopedSync,
} from './showEntriesPostSync';
import { registerShortReplicaReporter } from '@/services/observability/shortReplicaAlert';
import { getRingsideUploadSyncTargets, type UploadSyncTarget } from './ringsideUploadSyncTargets';
import { targetsForUploadedEntryInserts } from './showScopeTargets';

// One reporter for every table sync, whoever calls it (MYK9-2254).
registerShortReplicaReporter();

interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  error: string | null;
  tablesStatus: Record<string, TableSyncStatus>;
}

interface ReplicationSyncProviderProps {
  children: React.ReactNode;
  /**
   * Optional replication scope. The meaning is table-specific: entries/trials
   * use show id, classes use trial id, dogs use owner id, and an empty scope
   * means "sync the globally visible/account-visible rows" for tables that
   * support unscoped sync.
   */
  syncScopeId?: string;
  /** Whether to sync automatically on startup */
  autoSync?: boolean;
  /** Whether to sync when coming back online */
  syncOnReconnect?: boolean;
}

// The header's count of held conflicts re-reads after the saved choice, not before it lands.
const announceConflictSettled = () => window.dispatchEvent(new CustomEvent(CONFLICT_SETTLED_EVENT));

// All replicated tables with their names
export const REPLICATED_TABLES = [
  { name: 'shows', table: replicatedShowsTable },
  { name: 'trials', table: replicatedTrialsTable },
  { name: 'classes', table: replicatedClassesTable },
  { name: 'entries', table: replicatedEntriesTable },
  { name: 'dogs', table: replicatedDogsTable },
  { name: 'dog_registrations', table: replicatedDogRegistrationsTable },
  { name: 'people', table: replicatedShowDeskPeopleTable },
  { name: 'clubs', table: replicatedClubsTable },
  { name: 'judge_assignments', table: replicatedJudgeAssignmentsTable },
  { name: 'armbands', table: replicatedArmbandsTable },
  { name: 'waitlist_entries', table: replicatedWaitlistEntriesTable },
  { name: 'paperwork_prints', table: replicatedPaperworkPrintsTable },
] as const;

const REPLICATED_TABLE_NAMES = REPLICATED_TABLES.map(({ name }) => name);
const REPLICATED_TABLE_NAME_SET: ReadonlySet<string> = new Set(REPLICATED_TABLE_NAMES);
const ENTRY_RESULT_REPLICA_VERSION_KEY = 'myk9:entry-result-replica-version';
const ENTRY_RESULT_REPLICA_VERSION = '20260620-authenticated-entry-results-view-v2';
let entryResultReplicaVersionPromise: Promise<void> | null = null;

// Connect the shared MutationManager (owned by sharedMutationManager.ts so
// hooks can import it read-only) to all replicated tables.
for (const { table } of REPLICATED_TABLES) {
  table.setMutationManager(mutationManager);
}

// Configure Phase 4 conflict surfacing at module load — evaluated once so the
// flag state at startup governs the full session (consistent with kill-switch use).
configureConflictSurfacing(showConflictSurfacingEnabled());

// MYK9-1301: the per-table remote row count runs on a cadence; the flag's OFF
// state counts on every pass again.
configureRemoteCountCadence({ everyPass: !features.replicationCountCadence });

/**
 * A full re-sync triggered by an empty replica that metadata says previously held
 * rows is an unexpected eviction/heal — the silent failure mode the
 * server-authoritative watermark fix guards against. A recurring warning here
 * means a client keeps losing its replica between sessions, which is worth
 * investigating. Shared by both sync paths (single-table + full sync).
 */
function warnRecoveredFromEmptyReplica(tableName: string): void {
  logger.warn('Replica recovered from unexpected empty state', 'replication', { tableName });
}

async function applyAuthenticatedEntryResultReplicaVersion(signal?: AbortSignal): Promise<void> {
  if (typeof window === 'undefined') return;
  // MYK9-1624: an aborted pass (offline, unmount) starts nothing destructive.
  if (signal?.aborted) return;

  try {
    if (
      window.localStorage.getItem(ENTRY_RESULT_REPLICA_VERSION_KEY) === ENTRY_RESULT_REPLICA_VERSION
    ) {
      return;
    }
  } catch (error) {
    logger.warn('Could not read entry result replica version', 'replication', { error });
  }

  const pendingCount = await mutationManager.getPendingCount();
  if (pendingCount > 0) {
    logger.warn(
      'Deferring entry result replica refresh while mutations are pending',
      'replication',
      {
        pendingCount,
      }
    );
    return;
  }

  const existingEntryIds = await replicatedEntriesTable.getAllLocalIds();
  // Re-checked after the awaits above and right before the clear: offline
  // downloads cannot refill a cache this empties (show-day data loss), and the
  // version marker below must not claim a refresh that never happened.
  if (signal?.aborted) return;
  if (existingEntryIds.size > 0) {
    await new SyncCacheWriter(replicatedEntriesTable, signal).clear();
  }

  try {
    window.localStorage.setItem(ENTRY_RESULT_REPLICA_VERSION_KEY, ENTRY_RESULT_REPLICA_VERSION);
  } catch (error) {
    logger.warn('Could not persist entry result replica version', 'replication', { error });
  }

  logger.info('Entry result replica cache refreshed for authenticated result view', 'replication');
}

async function ensureAuthenticatedEntryResultReplicaVersion(signal?: AbortSignal): Promise<void> {
  if (entryResultReplicaVersionPromise) {
    return entryResultReplicaVersionPromise;
  }

  const operation = applyAuthenticatedEntryResultReplicaVersion(signal);
  entryResultReplicaVersionPromise = operation;
  try {
    await operation;
  } finally {
    if (entryResultReplicaVersionPromise === operation) {
      entryResultReplicaVersionPromise = null;
    }
  }
}

/** A conflict prompt re-asked after a failed choice (MYK9-2337): counts the re-asks. */
type ConflictRetryDetail = ReplicationConflictEventDetail & { retryAttempt?: number };

export const ReplicationSyncProvider: React.FC<ReplicationSyncProviderProps> = ({
  children,
  syncScopeId = '',
  autoSync = true,
  syncOnReconnect = true,
}) => {
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  useDiscardRevertCacheSync();
  useRegistrationsReplicaCacheSync();
  const wasOffline = useRef(false);
  const hasInitialSynced = useRef(false);
  const triggerSyncRef = useRef<((targets?: UploadSyncTarget[]) => Promise<void>) | undefined>(
    undefined
  );
  const pendingUploadTargets = useRef(new Map<string, UploadSyncTarget>());
  const scopedSyncInFlight = useRef(false);
  const pendingFullSync = useRef(false);
  const syncInFlightRef = useRef(false);
  const passControllerRef = useRef<AbortController | null>(null);
  const failedSyncToastIdsRef = useRef<string[]>([]);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const prevIsAuthenticated = useRef(false);
  const syncDeferredForSessionRef = useRef(false);

  // INITIAL_SESSION fires on subscribe with the current session (null for guests),
  // so getSession() is not needed — onAuthStateChange covers both initial state and changes.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // A null session that is not SIGNED_OUT is a refresh that failed offline, not a sign-out:
      // queued changes keep their owner and send on reconnect (MYK9-1992).
      setIsAuthenticated(!!resolveSessionUser(event, session));
      // The refresh that was failing has landed (or a sign-in did): run the sync deferred for want of
      // a session. A reconnect needs no case here: its own trigger re-reads the session.
      if (
        (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') &&
        syncDeferredForSessionRef.current
      ) {
        syncDeferredForSessionRef.current = false;
        void triggerSyncRef.current?.();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Subscribe all Zustand stores to replicated table changes
  useStoreSubscriptions();

  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncAt: null,
    error: null,
    tablesStatus: createTablesStatus(REPLICATED_TABLE_NAMES, 'idle'),
  });

  /**
   * Sync a single table
   */
  const syncTable = useCallback(
    async (tableName: string) => {
      const tableConfig = REPLICATED_TABLES.find(t => t.name === tableName);
      if (!tableConfig) {
        logger.warn('Unknown table', 'replication', { tableName });
        return;
      }

      setStatus(prev => ({
        ...prev,
        tablesStatus: { ...prev.tablesStatus, [tableName]: 'syncing' },
      }));

      try {
        const result = await tableConfig.table.sync(syncScopeId);

        if (result.success) {
          logger.info('Table synced', 'replication', {
            tableName,
            rowsAffected: result.rowsAffected,
            operation: result.operation,
            since: result.since,
          });
          if (result.recoveredFromEmptyReplica) {
            warnRecoveredFromEmptyReplica(tableName);
          }
          queryClient.invalidateQueries({ queryKey: [tableName] });
          setStatus(prev => ({
            ...prev,
            tablesStatus: { ...prev.tablesStatus, [tableName]: 'success' },
          }));
        } else {
          logger.error('Table sync failed', 'replication', { tableName, error: result.error });
          setStatus(prev => ({
            ...prev,
            tablesStatus: { ...prev.tablesStatus, [tableName]: 'error' },
          }));
        }
      } catch (error) {
        logger.error('Table sync error', 'replication', { tableName }, error as Error);
        setStatus(prev => ({
          ...prev,
          tablesStatus: { ...prev.tablesStatus, [tableName]: 'error' },
        }));
      }
    },
    [syncScopeId, queryClient]
  );

  /**
   * An aborted pass settles as cancelled, not complete: syncing clears, tables
   * leave 'syncing', and lastSyncAt is not stamped (nothing finished).
   */
  const endAbortedPass = useCallback((names: readonly string[]) => {
    logger.info('Sync pass cancelled', 'replication');
    setStatus(prev => ({
      ...prev,
      isSyncing: false,
      tablesStatus: { ...prev.tablesStatus, ...createTablesStatus(names, 'idle') },
    }));
    syncInFlightRef.current = false;
  }, []);

  /**
   * Trigger sync for all tables
   */
  const triggerSync = useCallback(
    async (targets?: UploadSyncTarget[]) => {
      if (!isAuthenticated) {
        logger.debug('Skipping sync - not authenticated', 'replication');
        return;
      }

      if (!isOnline) {
        logger.debug('Skipping sync - offline', 'replication');
        return;
      }

      // MYK9-1992: `isAuthenticated` may rest on the saved session while a refresh has failed
      // (a 5xx or transient error online). Nothing can upload without a bound session, so defer
      // quietly: no attempt, no retry-budget or dead-letter hit, until a session exists.
      let hasLiveSession = false;
      try {
        hasLiveSession = !!(await supabase.auth.getSession()).data.session;
      } catch {
        // A throwing read is a deferral too, never a rejected sync.
      }
      if (!hasLiveSession) {
        logger.debug('Deferring sync - session not resolved yet', 'replication');
        syncDeferredForSessionRef.current = true;
        return;
      }

      // State updates are asynchronous, so the startup timer and auth-session
      // effect can both observe isSyncing=false in the same render. The ref flips
      // synchronously before the first await and is the authoritative overlap
      // guard.
      if (syncInFlightRef.current) {
        // A download started before this upload may miss its derived state.
        // Coalesce scopes, then run once more AFTER the in-flight pass finishes.
        for (const target of targets ?? [])
          pendingUploadTargets.current.set(`${target.name}:${target.scopeId}`, target);
        if (!targets && scopedSyncInFlight.current) pendingFullSync.current = true;
        logger.debug('Sync already in progress', 'replication');
        return;
      }

      const selectedTables = targets
        ? targets.map(target => ({
            ...REPLICATED_TABLES.find(table => table.name === target.name)!,
            scope: target.scopeId,
          }))
        : REPLICATED_TABLES.map(table => ({ ...table, scope: syncScopeId }));
      const selectedNames = [...new Set(selectedTables.map(table => table.name))];
      logger.info(targets ? 'Starting scoped ringside sync' : 'Starting full sync', 'replication');
      syncInFlightRef.current = true;
      scopedSyncInFlight.current = targets !== undefined;
      // MYK9-1624: one controller per pass. Going offline or unmounting aborts it,
      // which releases the upload and every table read, so a dead connection can
      // never hold isSyncing or syncInFlightRef.
      const controller = new AbortController();
      const { signal } = controller;
      passControllerRef.current = controller;
      setStatus(prev => ({ ...prev, isSyncing: true, error: null }));

      try {
        // Phase 1: Upload pending mutations to Supabase
        try {
          const uploadResults = await mutationManager.uploadPendingMutations({ signal });
          const succeeded = uploadResults.filter(r => r.success).length;
          if (uploadResults.length > 0) {
            logger.info('Phase 1 upload complete', 'replication', {
              succeeded,
              total: uploadResults.length,
            });
          }
        } catch (uploadError) {
          logger.error('Phase 1 upload failed', 'replication', {}, uploadError as Error);
          // Continue to Phase 2 even if upload fails
        }

        // An aborted pass ends here, before the entry-replica refresh (it clears
        // every cached entry, which offline downloads cannot refill).
        if (signal.aborted) {
          endAbortedPass(selectedNames);
          return;
        }
        await ensureAuthenticatedEntryResultReplicaVersion(signal);
        if (signal.aborted) {
          endAbortedPass(selectedNames);
          return;
        }

        // Phase 2: parallel download — one failure must not block others.
        setStatus(prev => ({
          ...prev,
          tablesStatus: { ...prev.tablesStatus, ...createTablesStatus(selectedNames, 'syncing') },
        }));

        const syncResults = await Promise.all(
          selectedTables.map(async ({ name, table, scope }) => {
            try {
              // Bounded by the pass signal whatever a table does after its download.
              const result = await abortableWait(table.sync(scope, { signal }), signal);
              return {
                name,
                ok: result.success,
                error: result.error,
                recoveredFromEmptyReplica: result.recoveredFromEmptyReplica ?? false,
                shortReplica: isShortOnlyFailure(result),
              };
            } catch (err) {
              if (signal.aborted)
                return { name, ok: false, error: 'AbortError', recoveredFromEmptyReplica: false };
              logger.error('Table sync threw', 'replication', { name }, err as Error);
              return {
                name,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
                recoveredFromEmptyReplica: false,
              };
            }
          })
        );

        if (signal.aborted) {
          endAbortedPass(selectedNames);
          return;
        }

        const { tableStatusUpdates, downloadFailures, recoveredTables, abortedTables } =
          classifyTableSyncResults(syncResults, isAbortSyncError);

        for (const name of recoveredTables) {
          warnRecoveredFromEmptyReplica(name);
        }

        for (const { name, error } of abortedTables) {
          logger.debug('Table sync aborted', 'replication', { name, error });
        }

        for (const { name, error } of downloadFailures) {
          logger.warn('Table sync failed', 'replication', { name, error });
        }

        setStatus(prev => ({
          ...prev,
          tablesStatus: { ...prev.tablesStatus, ...tableStatusUpdates },
        }));

        // Surface download-sync failures so the UI doesn't silently show empty
        // lists when data exists in the database but couldn't be fetched
        // (RLS rejection, network blip, auth race). Mirrors the mutation-failure
        // toast added after the 2026-04-16 RLS data-loss incident.
        if (downloadFailures.length > 0) {
          notifications.error(formatDownloadFailureToast(downloadFailures), {
            id: DOWNLOAD_SYNC_FAILURE_TOAST_ID,
          });
        } else {
          toast.dismiss(DOWNLOAD_SYNC_FAILURE_TOAST_ID);
        }

        setStatus(prev => ({
          ...prev,
          isSyncing: false,
          lastSyncAt: new Date(),
        }));
        syncInFlightRef.current = false;

        const succeededTables = selectedTables
          .filter((_, i) => syncResults[i]?.ok)
          .map(({ name, scope }) => ({ name, scope }));
        void invalidatePostSyncQueries(queryClient, selectedNames, succeededTables);
        // MYK9-1064: the canonical show-entries query for each show a scoped
        // entries pass downloaded, whatever component or hook asked for it.
        refetchShowEntriesAfterScopedSync(queryClient, succeededTables);

        logger.info(
          targets ? 'Scoped ringside sync complete' : 'Full sync complete',
          'replication'
        );
      } catch (error) {
        if (signal.aborted) {
          endAbortedPass(selectedNames);
          return;
        }
        const errorMessage =
          error instanceof Error ? error.message : 'Saved data could not be updated';
        logger.error('Sync error', 'replication', {}, error as Error);
        setStatus(prev => ({
          ...prev,
          isSyncing: false,
          error: errorMessage,
        }));
        syncInFlightRef.current = false;
      } finally {
        if (passControllerRef.current === controller) passControllerRef.current = null;
        scopedSyncInFlight.current = false;
        if (pendingFullSync.current) {
          pendingFullSync.current = false;
          void triggerSyncRef.current?.();
        } else {
          const pending = [...pendingUploadTargets.current.values()];
          pendingUploadTargets.current.clear();
          if (pending.length) void triggerSyncRef.current?.(pending);
        }
      }
    },
    [isAuthenticated, isOnline, syncScopeId, queryClient, endAbortedPass]
  );

  // Going offline (or unmounting) cancels the pass in flight (MYK9-1624).
  useEffect(() => {
    const abortPass = () => passControllerRef.current?.abort();
    if (!isOnline) abortPass();
    window.addEventListener('offline', abortPass);
    return () => {
      window.removeEventListener('offline', abortPass);
    };
  }, [isOnline]);
  useEffect(() => () => passControllerRef.current?.abort(), []);

  // Keep ref in sync so effects always call latest version without re-triggering
  useEffect(() => {
    triggerSyncRef.current = triggerSync;
  });

  useEffect(
    () => () => {
      triggerSyncRef.current = undefined;
    },
    []
  );

  // Trigger sync when session becomes available — covers both "page load while
  // already signed in" (initial sync fires before INITIAL_SESSION is delivered)
  // and "user signs in mid-session".
  useEffect(() => {
    if (autoSync && isAuthenticated && !prevIsAuthenticated.current && isOnline) {
      triggerSyncRef.current?.();
    }
    prevIsAuthenticated.current = isAuthenticated;
  }, [autoSync, isAuthenticated, isOnline]);

  // Initial sync on startup — defer by one tick so render completes first,
  // but don't wait any longer. The 2s delay this replaced was a source of
  // "UI shows empty on cold load" confusion: users navigated around in the
  // gap before IndexedDB got populated.
  useEffect(() => {
    if (autoSync && isOnline && !hasInitialSynced.current) {
      hasInitialSynced.current = true;
      const timer = setTimeout(() => {
        logger.info('Starting initial sync', 'replication');
        triggerSyncRef.current?.();
      }, 0);

      return () => {
        clearTimeout(timer);
        hasInitialSynced.current = false; // Reset so StrictMode remount can re-trigger
      };
    }
    return undefined;
  }, [autoSync, isOnline]);

  // An anonymous passcode session that is active and online takes over this
  // device's held ringside scores for its show (MYK9-1205). Runs on auth init
  // (reload) and on reconnect, so a one-shot adoption that failed retries by
  // itself. Idempotent and guarded inside the service; never blocks or throws.
  useEffect(() => {
    if (isAuthenticated && isOnline) void adoptHeldRingsideScoresForLiveClaim();
  }, [isAuthenticated, isOnline]);

  // Sync when coming back online + restore localStorage backup
  useEffect(() => {
    if (syncOnReconnect) {
      if (!isOnline) {
        wasOffline.current = true;
      } else if (wasOffline.current) {
        wasOffline.current = false;
        // MYK9-1301: events may have been missed while offline, so the next pass counts.
        markRealtimeReconnected();
        logger.info('Back online - restoring mutations and triggering sync', 'replication');
        const timer = setTimeout(async () => {
          await mutationManager.restoreMutationsFromLocalStorage();
          triggerSyncRef.current?.();
        }, 0);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [isOnline, syncOnReconnect]);

  // Startup: flush pending mutations from previous session (runs once)
  const hasStartedFlush = useRef(false);
  useEffect(() => {
    if (hasStartedFlush.current) return;
    hasStartedFlush.current = true;

    const startupUpload = async () => {
      // Ask the browser to make our IndexedDB durable so queued scores aren't
      // evicted under storage pressure. Best-effort, never blocks.
      void requestPersistentStorage().then(status =>
        logger.info('Persistent storage status', 'replication', { status })
      );
      await mutationManager.restoreMutationsFromLocalStorage();
      const pendingCount = await mutationManager.getPendingCount();
      if (pendingCount > 0) {
        logger.info('Startup: flushing pending mutations', 'replication', { pendingCount });
        triggerSyncRef.current?.();
      }
    };
    const startupTimer = setTimeout(startupUpload, 0);
    return () => {
      clearTimeout(startupTimer);
      hasStartedFlush.current = false; // Reset so StrictMode remount can re-trigger
    };
  }, []);

  // Feeds the poll cadence (MYK9-1305); declared before the scheduler so it
  // runs first on mount.
  useEffect(() => {
    markOnline(isOnline);
  }, [isOnline]);

  // Poll, tab-visible and sync-requested wiring; see useSyncPassScheduler.
  useSyncPassScheduler(autoSync, triggerSyncRef);

  // Listen for mutation-queue overflow — the queue hit its hard cap and is now
  // rejecting new writes. This is a data-loss risk (a new score can't be
  // queued), so surface it loudly and prompt an immediate sync rather than
  // letting the rejection fail silently. (audit M4)
  useEffect(() => {
    const handleQueueOverflow = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number; queueSize?: number }>).detail || {};
      const count = detail.count ?? detail.queueSize;
      logger.error('Mutation queue overflow', 'replication', { count });
      // Persistent (duration: Infinity) like the sync-failure toast — this is a
      // standing data-loss risk the user must act on, not a transient blip.
      toast.error(
        count
          ? `This device is holding ${count} changes that have not been sent. Connect to the internet so they can be sent. New changes may not be saved until then.`
          : 'This device is holding too many changes that have not been sent. Connect to the internet so they can be sent. New changes may not be saved until then.',
        { id: 'replication-queue-overflow', duration: Infinity }
      );
      triggerSyncRef.current?.();
    };
    window.addEventListener('replication:queue-overflow', handleQueueOverflow);
    return () => window.removeEventListener('replication:queue-overflow', handleQueueOverflow);
  }, []);

  // Listen for circuit breaker recovery — show toast and re-sync
  useEffect(() => {
    const handleRecovery = (event: Event) => {
      const { reason } = (event as CustomEvent<{ reason: string }>).detail;
      logger.warn('IndexedDB recovery triggered', 'replication', { reason });
      notifications.info("Getting this device's show data back. This can take a moment.");
      // The circuit breaker deleted and recreated the DB. Restore pending +
      // failed mutations from the localStorage backup BEFORE the download sync,
      // so unsynced scores survive the wipe instead of being silently lost.
      void mutationManager
        .restoreMutationsFromLocalStorage()
        .catch(err =>
          logger.error('Failed to restore mutations after recovery', 'replication', {}, err)
        )
        .finally(() => triggerSyncRef.current?.());
    };
    window.addEventListener('replication:recovery', handleRecovery);
    return () => window.removeEventListener('replication:recovery', handleRecovery);
  }, []);

  // Invalidate React Query caches when auto-upload completes
  useEffect(() => {
    const handleUploadComplete = (event: Event) => {
      const detail = (event as CustomEvent<UploadCompleteEventDetail>).detail;
      const { tables } = detail;
      logger.info('Auto-upload complete, invalidating queries', 'replication', { tables });
      // A successful upload means the backlog is draining — clear the standing
      // "backlog is full" overflow toast so it doesn't linger over a now-healthy
      // queue. (The overflow handler shows it with this fixed id.)
      toast.dismiss('replication-queue-overflow');
      invalidateEnrichmentForUpload(detail);
      for (const table of tables) {
        queryClient.invalidateQueries({ queryKey: [table] });
      }
      void getRingsideUploadSyncTargets(detail, {
        getEntry: id => replicatedEntriesTable.get(id),
        getClass: id => replicatedClassesTable.get(id),
      }).then(targets => {
        if (targets) void triggerSyncRef.current?.(targets);
        else if (shouldRequestPostUploadSync(tables, REPLICATED_TABLE_NAME_SET, false)) {
          void triggerSyncRef.current?.();
        }
      });
      // MYK9-1930: an uploaded entry INSERT came back from the server with fields only it sets
      // (the entry form it attached). Pull that show's entries, whoever ran the upload.
      void targetsForUploadedEntryInserts(detail, id => replicatedEntriesTable.get(id)).then(
        targets => {
          if (targets.length) void triggerSyncRef.current?.(targets);
        }
      );
    };
    window.addEventListener('replication:upload-complete', handleUploadComplete);
    return () => window.removeEventListener('replication:upload-complete', handleUploadComplete);
  }, [queryClient]);

  // Surface mutation sync failures so silent RLS rejections, timeouts, and
  // other permanent failures don't end up hidden in the console. Prevents
  // the "UI showed success but the row never persisted" class of data-loss
  // bugs we hit on 2026-04-16 (shows_insert RLS rejecting secretary role).
  // Failed mutations are kept in the failed_mutations IDB store until the
  // user explicitly retries or discards them — never auto-deleted.
  useEffect(() => {
    const handleSyncFailed = (event: Event) => {
      const detail = (event as CustomEvent<SyncFailedEventDetail>).detail;
      logger.error('Replication sync failed', 'replication', {
        count: detail.count,
        mutations: detail.mutations,
      });

      // J1.3 — a ringside SCORE/check-in write rejected because the secretary
      // regenerated passcodes surfaces here (42501, non-retryable). Route it to
      // the revocation UX ("access revoked — re-enter code" + back to sign-in)
      // instead of the generic "check your connection" retry toast — a passcode
      // that no longer exists will never succeed on retry. This makes revocation
      // work even for a device with no push subscription (the heartbeat path).
      if (detail.mutations.some(m => isPasscodeRegeneratedMessage(m.error))) {
        revokeRingsidePasscodeAccess();
        return;
      }

      // MYK9-2011: refused scores live on the Scores not sent list (ScoresNotSentNotice).
      const listed = withoutListedScores(detail);
      if (listed.mutations.length === 0) return;
      for (const failureDetail of splitPermanentScoreAuthorizationFailures(listed)) {
        const ids = failureDetail.mutations.map(m => m.id).filter(Boolean);
        const isPermanentScoreAuthorizationFailure =
          hasPermanentScoreAuthorizationFailure(failureDetail);
        const toastId = ids[0]
          ? `sync-failed:${ids[0]}`
          : `sync-failed:${
              isPermanentScoreAuthorizationFailure ? 'authorization' : 'other'
            }:unknown`;
        if (!failedSyncToastIdsRef.current.includes(toastId)) {
          failedSyncToastIdsRef.current.push(toastId);
        }
        while (failedSyncToastIdsRef.current.length > 3) {
          const oldest = failedSyncToastIdsRef.current.shift();
          if (oldest) toast.dismiss(oldest);
        }
        const clearToastId = () => {
          failedSyncToastIdsRef.current = failedSyncToastIdsRef.current.filter(
            id => id !== toastId
          );
          toast.dismiss(toastId);
        };
        const reason = formatSyncFailureReason(failureDetail);
        toast.error(formatSyncFailureToast(failureDetail), {
          id: toastId,
          ...(reason && { description: <SyncFailureReason reason={reason} /> }),
          // INTENT: Failure toasts persist until the user makes an explicit
          // choice. The underlying mutations survive in IDB either way, so a
          // dismissed-by-reload toast re-surfaces on the next sign-in.
          duration: Infinity,
          action: {
            label: isPermanentScoreAuthorizationFailure
              ? 'Try again after access is fixed'
              : 'Try again',
            onClick: () => {
              void Promise.allSettled(ids.map(id => mutationManager.retryFailedMutation(id)));
              clearToastId();
            },
          },
          cancel: {
            label: 'Discard',
            onClick: () => {
              void Promise.allSettled(ids.map(id => mutationManager.discardFailedMutation(id)));
              clearToastId();
            },
          },
        });
      }
    };
    window.addEventListener('replication:sync-failed', handleSyncFailed);
    return () => window.removeEventListener('replication:sync-failed', handleSyncFailed);
  }, []);

  // Re-surface persisted sync failures from previous sessions when the user
  // authenticates. A failure toast lost to navigation or reload must not bury
  // the underlying mutations — they stay in the failed_mutations store and
  // re-dispatching fires the existing handleSyncFailed toast for review.
  useEffect(() => {
    if (!isAuthenticated) return;

    const resurface = async () => {
      try {
        const failed = await mutationManager.getFailedMutations();
        if (failed.length === 0) return;
        window.dispatchEvent(
          new CustomEvent('replication:sync-failed', {
            detail: {
              count: failed.length,
              mutations: failed,
              message: `${failed.length} ${failed.length === 1 ? 'change' : 'changes'} could not be sent.`,
            } satisfies SyncFailedEventDetail,
          })
        );
      } catch (err) {
        logger.warn('Failed to re-surface failed mutations', 'replication', { err });
      }
    };

    void resurface();
  }, [isAuthenticated]);

  // Phase 4: surface same-field replication conflicts as persistent toasts.
  // Upholds the §2.5 hard guarantee — no silent data loss on any replicated table.
  // The toast ID deduplicates re-fires from repeated sync cycles on the same row.
  useEffect(() => {
    const handleConflict = (event: Event) => {
      const detail = (event as CustomEvent<ReplicationConflictEventDetail>).detail;
      // A re-ask after a failed choice gets its own toast id: the click that failed dismissed the
      // original id, and Sonner's pending removal would take a reused id's buttons with it.
      const retryAttempt = (detail as ConflictRetryDetail).retryAttempt ?? 0;
      const conflictId =
        `conflict:${detail.tableName}:${detail.rowId}` +
        (retryAttempt ? `:retry-${retryAttempt}` : '');
      const askAgain = () =>
        window.dispatchEvent(
          new CustomEvent('replication:conflict', {
            detail: { ...detail, retryAttempt: retryAttempt + 1 } satisfies ConflictRetryDetail,
          })
        );

      logger.warn('Replication conflict detected', 'replication', {
        tableName: detail.tableName,
        rowId: detail.rowId,
        fields: detail.fields,
      });

      const tableConfig = REPLICATED_TABLES.find(t => t.name === detail.tableName);
      const anyTable = tableConfig?.table as ReplicatedTable<{ id: string }> | undefined;

      // MYK9-2010: a dog's conflict names the dog and shows both scores on the notice and buttons.
      const copy =
        detail.tableName === 'entries'
          ? entryConflictCopy(
              (detail.localData ?? {}) as Record<string, unknown>,
              (detail.remoteData ?? {}) as Record<string, unknown>,
              detail.fields
            )
          : {
              title: CONFLICT_TOAST_TITLE,
              description: CONFLICT_TOAST_DESCRIPTION,
              takeRemoteLabel: CONFLICT_TAKE_REMOTE_LABEL,
              keepLocalLabel: CONFLICT_KEEP_LOCAL_LABEL,
            };

      toast.warning(copy.title, {
        id: conflictId,
        // INTENT: Conflict toasts persist until the user makes an explicit choice.
        // See docs/plan-show-presence.md §7 conflict-state lifecycle.
        duration: Infinity,
        description: copy.description,
        action: {
          label: copy.takeRemoteLabel,
          onClick: () => {
            // Drop the queued write, then show the server's copy (conflictChoices.ts).
            toast.dismiss(conflictId);
            if (!anyTable) {
              announceConflictSettled();
              return;
            }
            void keepOtherChange(anyTable, mutationManager, detail.tableName, detail.rowId)
              .catch(err => {
                // Nothing was released: ask again rather than leave the rows different.
                logger.warn('Keep the other change failed', 'replication', { err });
                askAgain();
              })
              .finally(announceConflictSettled);
          },
        },
        cancel: {
          label: copy.keepLocalLabel,
          onClick: () => {
            // MYK9-1993: send the kept write now, not at the next poll (conflictChoices.ts).
            toast.dismiss(conflictId);
            if (!anyTable) {
              announceConflictSettled();
              return;
            }
            // A refusal gets the queue's own "could not be sent" notice (handleSyncFailed).
            void keepMyChange(anyTable, mutationManager, detail.tableName, detail.rowId)
              .catch(err => {
                // The row kept its conflict (MYK9-2337): ask again rather than lose the choice.
                logger.warn('Keep my change failed', 'replication', { err });
                askAgain();
              })
              .finally(announceConflictSettled);
          },
        },
      });
    };

    window.addEventListener('replication:conflict', handleConflict);
    return () => window.removeEventListener('replication:conflict', handleConflict);
  }, []);

  // Re-surface persisted conflicts from previous sessions when the user
  // authenticates.  A conflict navigated away from before resolving stays
  // syncStatus:'conflict' in IDB — re-dispatching fires the existing
  // handleConflict toast automatically so the resolution prompt reappears.
  useEffect(() => {
    if (!isAuthenticated || !showConflictSurfacingEnabled()) return;

    const resurface = async () => {
      for (const { table } of REPLICATED_TABLES) {
        try {
          const conflicts = await (table as ReplicatedTable<{ id: string }>).getConflictedRows();
          for (const snapshot of conflicts) {
            window.dispatchEvent(new CustomEvent('replication:conflict', { detail: snapshot }));
          }
        } catch (err) {
          logger.warn('Failed to re-surface conflicts for table', 'replication', { err });
        }
      }
    };

    void resurface();
  }, [isAuthenticated]);

  // Expose diagnostic helpers on window for browser console debugging
  useEffect(() => {
    const diag = {
      getPendingCount: () => mutationManager.getPendingCount(),
      uploadNow: () => mutationManager.uploadPendingMutations(),
      triggerSync: () => triggerSyncRef.current?.(),
    };
    (window as unknown as Record<string, unknown>).__replicationDiag = diag;
    return () => {
      delete (window as unknown as Record<string, unknown>).__replicationDiag;
    };
  }, []);

  // Two contexts: `status` changes on every sync-pass transition, the actions
  // only when auth/connectivity/scope change. Action-only consumers skip the churn.
  const actions = useMemo(() => ({ triggerSync, syncTable }), [triggerSync, syncTable]);

  return (
    <ReplicationSyncStatusContext.Provider value={status}>
      <ReplicationSyncActionsContext.Provider value={actions}>
        {children}
      </ReplicationSyncActionsContext.Provider>
    </ReplicationSyncStatusContext.Provider>
  );
};
