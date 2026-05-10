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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useStoreSubscriptions } from '@/hooks/useStoreSubscriptions';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import {
  ReplicationSyncContext,
  type ReplicationSyncContextValue,
} from '@/contexts/ReplicationSyncContext';
import { MutationManager, SYNC_INTERVAL_MS } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';

// Import replicated table singletons
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClubsTable } from '@/services/replication/ReplicatedClubsTable';
import { replicatedJudgeAssignmentsTable } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { replicatedArmbandsTable } from '@/services/replication/ReplicatedArmbandsTable';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { isAbortSyncError } from '@/services/replication/syncErrorUtils';
import type { SyncFailedEventDetail } from './replicationSyncFormatters';
import { formatSyncFailureToast, formatDownloadFailureToast } from './replicationSyncFormatters';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  error: string | null;
  tablesStatus: Record<string, 'idle' | 'syncing' | 'success' | 'error'>;
}

interface ReplicationSyncProviderProps {
  children: React.ReactNode;
  /** License key for multi-tenant isolation (optional) */
  licenseKey?: string;
  /** Whether to sync automatically on startup */
  autoSync?: boolean;
  /** Whether to sync when coming back online */
  syncOnReconnect?: boolean;
}

// All replicated tables with their names
const REPLICATED_TABLES = [
  { name: 'shows', table: replicatedShowsTable },
  { name: 'trials', table: replicatedTrialsTable },
  { name: 'classes', table: replicatedClassesTable },
  { name: 'entries', table: replicatedEntriesTable },
  { name: 'dogs', table: replicatedDogsTable },
  { name: 'clubs', table: replicatedClubsTable },
  { name: 'judge_assignments', table: replicatedJudgeAssignmentsTable },
  { name: 'armbands', table: replicatedArmbandsTable },
  { name: 'waitlist_entries', table: replicatedWaitlistEntriesTable },
] as const;

// Adapt myK9Show's LoggingService to the @myk9/replication Logger interface
const replicationLogger = {
  log: (...args: unknown[]) => logger.debug(String(args[0]), 'replication'),
  warn: (...args: unknown[]) => logger.warn(String(args[0]), 'replication'),
  error: (...args: unknown[]) => {
    const msg = String(args[0]);
    const err = args[1];
    // Include actual error details (Supabase errors have message/code/details)
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const details = e.message || e.code || e.details || JSON.stringify(err);
      logger.error(`${msg} ${details}`, 'replication');
    } else {
      logger.error(msg, 'replication');
    }
  },
  debug: (...args: unknown[]) => logger.debug(String(args[0]), 'replication'),
};

// Create shared MutationManager and connect to all tables
const mutationManager = new MutationManager(supabase, { logger: replicationLogger });
for (const { table } of REPLICATED_TABLES) {
  table.setMutationManager(mutationManager);
}

export const ReplicationSyncProvider: React.FC<ReplicationSyncProviderProps> = ({
  children,
  licenseKey = '',
  autoSync = true,
  syncOnReconnect = true,
}) => {
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const wasOffline = useRef(false);
  const hasInitialSynced = useRef(false);
  const triggerSyncRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const prevIsAuthenticated = useRef(false);

  // INITIAL_SESSION fires on subscribe with the current session (null for guests),
  // so getSession() is not needed — onAuthStateChange covers both initial state and changes.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Subscribe all Zustand stores to replicated table changes
  useStoreSubscriptions();

  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncAt: null,
    error: null,
    tablesStatus: Object.fromEntries(REPLICATED_TABLES.map(({ name }) => [name, 'idle'])),
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
        const result = await tableConfig.table.sync(licenseKey);

        if (result.success) {
          logger.info('Table synced', 'replication', {
            tableName,
            rowsAffected: result.rowsAffected,
          });
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
    [licenseKey, queryClient]
  );

  /**
   * Trigger sync for all tables
   */
  const triggerSync = useCallback(async () => {
    if (!isAuthenticated) {
      logger.debug('Skipping sync - not authenticated', 'replication');
      return;
    }

    if (!isOnline) {
      logger.debug('Skipping sync - offline', 'replication');
      return;
    }

    if (status.isSyncing) {
      logger.debug('Sync already in progress', 'replication');
      return;
    }

    logger.info('Starting full sync', 'replication');
    setStatus(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      // Phase 1: Upload pending mutations to Supabase
      try {
        const uploadResults = await mutationManager.uploadPendingMutations();
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

      // Phase 2: parallel download — one failure must not block others.
      setStatus(prev => ({
        ...prev,
        tablesStatus: Object.fromEntries(REPLICATED_TABLES.map(({ name }) => [name, 'syncing'])),
      }));

      const syncResults = await Promise.all(
        REPLICATED_TABLES.map(async ({ name, table }) => {
          try {
            const result = await table.sync(licenseKey);
            return { name, ok: result.success, error: result.error };
          } catch (err) {
            logger.error('Table sync threw', 'replication', { name }, err as Error);
            return { name, ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        })
      );

      const downloadFailures: Array<{ name: string; error: string }> = [];
      const tableStatusUpdates: Record<string, SyncStatus['tablesStatus'][string]> = {};

      for (const { name, ok, error } of syncResults) {
        if (ok) {
          tableStatusUpdates[name] = 'success';
        } else if (isAbortSyncError(error)) {
          logger.debug('Table sync aborted', 'replication', { name, error });
          tableStatusUpdates[name] = 'idle';
        } else {
          const errorMsg = error || 'Unknown error';
          logger.warn('Table sync failed', 'replication', { name, error: errorMsg });
          downloadFailures.push({ name, error: errorMsg });
          tableStatusUpdates[name] = 'error';
        }
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
        notifications.error(formatDownloadFailureToast(downloadFailures));
      }

      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date(),
      }));

      // Invalidate React Query caches so components refetch fresh data.
      // Uses REPLICATED_TABLES to stay in sync automatically.
      for (const { name } of REPLICATED_TABLES) {
        queryClient.invalidateQueries({ queryKey: [name] });
      }

      logger.info('Full sync complete', 'replication');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      logger.error('Sync error', 'replication', {}, error as Error);
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        error: errorMessage,
      }));
    }
  }, [isAuthenticated, isOnline, status.isSyncing, licenseKey, queryClient]);

  // Keep ref in sync so effects always call latest version without re-triggering
  useEffect(() => {
    triggerSyncRef.current = triggerSync;
  });

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

  // Sync when coming back online + restore localStorage backup
  useEffect(() => {
    if (syncOnReconnect) {
      if (!isOnline) {
        wasOffline.current = true;
      } else if (wasOffline.current) {
        wasOffline.current = false;
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

  // Background poll — keeps data fresh and recovers from any failed startup sync.
  // SYNC_INTERVAL_MS was defined in the replication package but never wired up.
  useEffect(() => {
    if (!autoSync) return undefined;
    const interval = setInterval(() => {
      triggerSyncRef.current?.();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoSync]);

  // Sync when tab regains visibility — catches stale data after the user returns.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerSyncRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Listen for sync-requested events (e.g., from wizard after publish)
  useEffect(() => {
    const handleSyncRequest = () => {
      logger.info('Sync requested via event', 'replication');
      triggerSyncRef.current?.();
    };
    window.addEventListener('replication:sync-requested', handleSyncRequest);
    return () => window.removeEventListener('replication:sync-requested', handleSyncRequest);
  }, []);

  // Listen for circuit breaker recovery — show toast and re-sync
  useEffect(() => {
    const handleRecovery = (event: Event) => {
      const { reason } = (event as CustomEvent<{ reason: string }>).detail;
      logger.warn('IndexedDB recovery triggered', 'replication', { reason });
      notifications.info('Resyncing local data...');
      triggerSyncRef.current?.();
    };
    window.addEventListener('replication:recovery', handleRecovery);
    return () => window.removeEventListener('replication:recovery', handleRecovery);
  }, []);

  // Invalidate React Query caches when auto-upload completes
  useEffect(() => {
    const handleUploadComplete = (event: Event) => {
      const { tables } = (event as CustomEvent<{ tables: string[]; count: number }>).detail;
      logger.info('Auto-upload complete, invalidating queries', 'replication', { tables });
      for (const table of tables) {
        queryClient.invalidateQueries({ queryKey: [table] });
      }
    };
    window.addEventListener('replication:upload-complete', handleUploadComplete);
    return () => window.removeEventListener('replication:upload-complete', handleUploadComplete);
  }, [queryClient]);

  // Surface mutation sync failures so silent RLS rejections, timeouts, and
  // other permanent failures don't end up hidden in the console. Prevents
  // the "UI showed success but the row never persisted" class of data-loss
  // bugs we hit on 2026-04-16 (shows_insert RLS rejecting secretary role).
  useEffect(() => {
    const handleSyncFailed = (event: Event) => {
      const detail = (event as CustomEvent<SyncFailedEventDetail>).detail;
      logger.error('Replication sync failed', 'replication', {
        count: detail.count,
        mutations: detail.mutations,
      });
      notifications.error(formatSyncFailureToast(detail));
    };
    window.addEventListener('replication:sync-failed', handleSyncFailed);
    return () => window.removeEventListener('replication:sync-failed', handleSyncFailed);
  }, []);

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

  const contextValue: ReplicationSyncContextValue = {
    status,
    triggerSync,
    syncTable,
  };

  return (
    <ReplicationSyncContext.Provider value={contextValue}>
      {children}
    </ReplicationSyncContext.Provider>
  );
};
