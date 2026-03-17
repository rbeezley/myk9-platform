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
import {
  ReplicationSyncContext,
  type ReplicationSyncContextValue,
} from '@/contexts/ReplicationSyncContext';
import { MutationManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';

// Import replicated table singletons
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClubsTable } from '@/services/replication/ReplicatedClubsTable';
import { replicatedJudgeAssignmentsTable } from '@/services/replication/ReplicatedJudgeAssignmentsTable';

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

      // Phase 2: Download sync (shows first, then dependent tables)
      for (const { name, table } of REPLICATED_TABLES) {
        setStatus(prev => ({
          ...prev,
          tablesStatus: { ...prev.tablesStatus, [name]: 'syncing' },
        }));

        try {
          const result = await table.sync(licenseKey);

          if (result.success) {
            logger.info('Table sync success', 'replication', {
              name,
              rowsAffected: result.rowsAffected,
            });
            setStatus(prev => ({
              ...prev,
              tablesStatus: { ...prev.tablesStatus, [name]: 'success' },
            }));
          } else {
            logger.warn('Table sync failed', 'replication', {
              name,
              error: result.error || 'Unknown error',
            });
            setStatus(prev => ({
              ...prev,
              tablesStatus: { ...prev.tablesStatus, [name]: 'error' },
            }));
          }
        } catch (tableError) {
          logger.error('Table sync error', 'replication', { name }, tableError as Error);
          setStatus(prev => ({
            ...prev,
            tablesStatus: { ...prev.tablesStatus, [name]: 'error' },
          }));
          // Continue with other tables
        }
      }

      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date(),
      }));

      // Invalidate React Query caches so components refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['shows'] });
      queryClient.invalidateQueries({ queryKey: ['trials'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['dogs'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
      queryClient.invalidateQueries({ queryKey: ['judge_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['shows'] }); // refresh shows with updated judge join

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
  }, [isOnline, status.isSyncing, licenseKey, queryClient]);

  // Keep ref in sync so effects always call latest version without re-triggering
  useEffect(() => {
    triggerSyncRef.current = triggerSync;
  });

  // Initial sync on startup
  useEffect(() => {
    if (autoSync && isOnline && !hasInitialSynced.current) {
      hasInitialSynced.current = true;
      // Delay initial sync to not block app startup
      const timer = setTimeout(() => {
        logger.info('Starting initial sync', 'replication');
        triggerSyncRef.current?.();
      }, 2000);

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
    const startupTimer = setTimeout(startupUpload, 2000);
    return () => {
      clearTimeout(startupTimer);
      hasStartedFlush.current = false; // Reset so StrictMode remount can re-trigger
    };
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
