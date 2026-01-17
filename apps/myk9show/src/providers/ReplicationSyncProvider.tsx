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
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { logger } from '@/services/LoggingService';
import { ReplicationSyncContext, type ReplicationSyncContextValue } from '@/contexts/ReplicationSyncContext';

// Import replicated table singletons
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';

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
] as const;

export const ReplicationSyncProvider: React.FC<ReplicationSyncProviderProps> = ({
  children,
  licenseKey = '',
  autoSync = true,
  syncOnReconnect = true,
}) => {
  const { isOnline } = useNetworkStatus();
  const wasOffline = useRef(false);
  const hasInitialSynced = useRef(false);

  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncAt: null,
    error: null,
    tablesStatus: Object.fromEntries(REPLICATED_TABLES.map(({ name }) => [name, 'idle'])),
  });

  /**
   * Sync a single table
   */
  const syncTable = useCallback(async (tableName: string) => {
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
        logger.info('Table synced', 'replication', { tableName, rowsAffected: result.rowsAffected });
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
  }, [licenseKey]);

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
      // Sync tables in order (shows first, then dependent tables)
      for (const { name, table } of REPLICATED_TABLES) {
        setStatus(prev => ({
          ...prev,
          tablesStatus: { ...prev.tablesStatus, [name]: 'syncing' },
        }));

        try {
          const result = await table.sync(licenseKey);

          if (result.success) {
            logger.info('Table sync success', 'replication', { name, rowsAffected: result.rowsAffected });
            setStatus(prev => ({
              ...prev,
              tablesStatus: { ...prev.tablesStatus, [name]: 'success' },
            }));
          } else {
            logger.warn('Table sync failed', 'replication', { name, error: result.error || 'Unknown error' });
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
  }, [isOnline, status.isSyncing, licenseKey]);

  // Initial sync on startup
  useEffect(() => {
    if (autoSync && isOnline && !hasInitialSynced.current) {
      hasInitialSynced.current = true;
      // Delay initial sync to not block app startup
      const timer = setTimeout(() => {
        logger.info('Starting initial sync', 'replication');
        triggerSync();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [autoSync, isOnline, triggerSync]);

  // Sync when coming back online
  useEffect(() => {
    if (syncOnReconnect) {
      if (!isOnline) {
        wasOffline.current = true;
      } else if (wasOffline.current) {
        wasOffline.current = false;
        logger.info('Back online - triggering sync', 'replication');
        // Defer to next tick to avoid synchronous setState in effect
        const timer = setTimeout(() => {
          triggerSync();
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [isOnline, syncOnReconnect, triggerSync]);

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
