import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Conflict,
  ConflictResolution,
  ResolutionStrategy,
  BaseConflict,
  BaseConflictResolution,
} from '../types/conflict-types';

import {
  conflictManager,
  type ConflictEvent,
  type ConflictEventType,
  type ConflictStats,
} from '@myk9/replication';

import { SyncMetadata } from '../types/core-types';
import { useAuth } from './useAuth';
import {
  STRATEGY_TO_REPLICATION,
  mapConflict,
  mapResolution,
  filterByEntityType,
} from './conflictResolutionUtils';

export interface ConflictNotification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error';
}

export interface ConflictResolutionHookOptions {
  entityType?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableNotifications?: boolean;
}

export interface ConflictResolutionState {
  conflicts: BaseConflict<Record<string, unknown>>[];
  resolutions: BaseConflictResolution<unknown>[];
  stats: ConflictStats;
  isLoading: boolean;
  error: string | null;
  notifications: ConflictNotification[];
}

export interface ConflictResolutionActions {
  resolveConflict: (
    conflictId: string,
    strategy: ResolutionStrategy,
    customResolution?: unknown
  ) => Promise<ConflictResolution<{ id: string }>>;
  dismissNotification: (conflictId: string) => void;
  clearNotifications: () => void;
  refreshConflicts: () => void;
  handleSyncConflict: <T extends { id: string }>(
    local: T & SyncMetadata,
    remote: T & SyncMetadata,
    base?: T & SyncMetadata
  ) => Promise<{
    hasConflict: boolean;
    resolvedEntity?: T & SyncMetadata;
    requiresManualResolution: boolean;
  }>;
}

export function useConflictResolution(
  options: ConflictResolutionHookOptions = {}
): ConflictResolutionState & ConflictResolutionActions {
  const { user } = useAuth();
  const [state, setState] = useState<ConflictResolutionState>({
    conflicts: [],
    resolutions: [],
    stats: conflictManager.getConflictStats(),
    isLoading: false,
    error: null,
    notifications: [],
  });

  const eventHandlersRef = useRef<Map<ConflictEventType, (event: ConflictEvent) => void>>(
    new Map()
  );
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshConflicts = useCallback(() => {
    try {
      const sharedConflicts = conflictManager.getPendingConflicts();
      const sharedResolutions = conflictManager.getResolutionHistory();
      const stats = conflictManager.getConflictStats();

      const filteredConflicts = filterByEntityType(sharedConflicts, options.entityType);
      const filteredResolutions = filterByEntityType(sharedResolutions, options.entityType);

      setState(prev => ({
        ...prev,
        conflicts: filteredConflicts.map(mapConflict),
        resolutions: filteredResolutions.map(mapResolution),
        stats,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to refresh conflicts',
        isLoading: false,
      }));
    }
  }, [options.entityType]);

  // Initialize event handlers
  useEffect(() => {
    const handlers = new Map<ConflictEventType, (event: ConflictEvent) => void>();

    handlers.set('conflict_detected', event => {
      setState(prev => ({
        ...prev,
        stats: conflictManager.getConflictStats(),
        notifications: options.enableNotifications
          ? [
              ...prev.notifications,
              {
                id: `notification-${event.conflictId || Date.now()}`,
                message: `Conflict detected in ${event.entityType} ${event.entityId}`,
                type: 'warning' as 'info' | 'warning' | 'error',
              },
            ]
          : prev.notifications,
      }));

      // Refresh conflicts list
      refreshConflicts();
    });

    handlers.set('conflict_resolved', event => {
      setState(prev => ({
        ...prev,
        stats: conflictManager.getConflictStats(),
        notifications: prev.notifications.filter(n => n.id !== `notification-${event.conflictId}`),
      }));

      // Refresh conflicts and resolutions
      refreshConflicts();
    });

    handlers.set('conflict_failed', event => {
      setState(prev => ({
        ...prev,
        error: `Conflict resolution failed: ${event.data?.error || 'Unknown error'}`,
        stats: conflictManager.getConflictStats(),
      }));
    });

    handlers.set('manual_resolution_required', event => {
      setState(prev => ({
        ...prev,
        notifications: options.enableNotifications
          ? [
              ...prev.notifications,
              {
                id: `notification-${event.conflictId || Date.now()}`,
                message: `Manual resolution required for ${event.entityType} ${event.entityId}`,
                type: 'error' as 'info' | 'warning' | 'error',
              },
            ]
          : prev.notifications,
      }));
    });

    eventHandlersRef.current = handlers;

    // Subscribe to events
    handlers.forEach((handler, type) => {
      conflictManager.addEventListener(type, handler);
    });

    return () => {
      // Unsubscribe from events
      handlers.forEach((handler, type) => {
        conflictManager.removeEventListener(type, handler);
      });
    };
  }, [options.enableNotifications, refreshConflicts]);

  // Auto-refresh setup
  useEffect(() => {
    if (options.autoRefresh && options.refreshInterval) {
      refreshIntervalRef.current = setInterval(refreshConflicts, options.refreshInterval);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
    return undefined;
  }, [options.autoRefresh, options.refreshInterval, refreshConflicts]);

  // Initial load
  useEffect(() => {
    refreshConflicts();
  }, [options.entityType, refreshConflicts]);

  const resolveConflict = useCallback(
    async (
      conflictId: string,
      strategy: ResolutionStrategy,
      customResolution?: unknown
    ): Promise<ConflictResolution<{ id: string }>> => {
      if (!user) {
        throw new Error('User must be authenticated to resolve conflicts');
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const _resolutionContext = {
          userId: user.id,
          userRole: 'user',
          userPermissions: [],
          timestamp: new Date(),
          deviceId: navigator.userAgent, // Simple device identification
        };
        void _resolutionContext; // Reserved for future use

        const sharedStrategy = STRATEGY_TO_REPLICATION[strategy] ?? 'last-write-wins';

        await conflictManager.resolveConflictManually(conflictId, {
          strategy: sharedStrategy,
          resolvedEntity: customResolution,
          userId: user.id,
        });

        // Refresh to get updated state
        refreshConflicts();

        // Look up actual resolution in history if possible
        const resolvedConflict = conflictManager
          .getResolutionHistory()
          .find(c => c.id === conflictId);

        setState(prev => ({
          ...prev,
          isLoading: false,
          notifications: prev.notifications.filter(n => n.id !== `notification-${conflictId}`),
        }));

        return {
          conflictId,
          strategy: strategy,
          resolvedEntity: resolvedConflict?.resolution?.resolvedEntity || customResolution,
          resolvedAt: resolvedConflict?.resolution?.resolvedAt || new Date(),
          resolvedBy: resolvedConflict?.resolution?.resolvedBy || user.id,
          automatic: false,
        } as BaseConflictResolution<{ id: string }>;
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to resolve conflict',
          isLoading: false,
        }));
        throw error;
      }
    },
    [user, refreshConflicts]
  );

  const handleSyncConflict = useCallback(
    async <T extends { id: string }>(
      local: T & SyncMetadata,
      remote: T & SyncMetadata,
      base?: T & SyncMetadata
    ) => {
      if (!user) {
        throw new Error('User must be authenticated to handle conflicts');
      }

      const context = {
        userId: user.id,
        userRole: 'user',
        userPermissions: [],
        timestamp: new Date(),
        deviceId: navigator.userAgent,
      };

      const result = await conflictManager.handleSyncConflict(local, remote, base, context);
      return {
        hasConflict: true,
        resolvedEntity: result.resolvedEntity as T & SyncMetadata,
        requiresManualResolution: !result.automatic,
      };
    },
    [user]
  );

  const dismissNotification = useCallback((conflictId: string) => {
    setState(prev => ({
      ...prev,
      notifications: prev.notifications.filter(n => n.id !== `notification-${conflictId}`),
    }));
  }, []);

  const clearNotifications = useCallback(() => {
    setState(prev => ({
      ...prev,
      notifications: [],
    }));
  }, []);

  return {
    ...state,
    resolveConflict,
    dismissNotification,
    clearNotifications,
    refreshConflicts,
    handleSyncConflict,
  };
}

// Specialized hooks for different conflict scenarios

export function useShowConflictResolution() {
  return useConflictResolution({
    entityType: 'show',
    autoRefresh: true,
    refreshInterval: 30000, // 30 seconds
    enableNotifications: true,
  });
}

export function useRegistrationConflictResolution() {
  return useConflictResolution({
    entityType: 'registration',
    autoRefresh: true,
    refreshInterval: 15000, // 15 seconds - more frequent for active entries
    enableNotifications: true,
  });
}

export function useScoreConflictResolution() {
  return useConflictResolution({
    entityType: 'score',
    autoRefresh: true,
    refreshInterval: 10000, // 10 seconds - real-time scoring
    enableNotifications: true,
  });
}

// Hook for conflict resolution in forms
// Export types for external use
// export type { Conflict as ConflictData } from '../services/conflict/ConflictResolver';
// export type { ConflictResolution } from '../services/conflict/ConflictResolver';

export function useFormConflictResolution<T extends { id: string } & SyncMetadata>(
  entityType: string,
  currentEntity?: T
) {
  const { handleSyncConflict, resolveConflict } = useConflictResolution({
    entityType,
    enableNotifications: true,
  });

  const [conflictResolution, setConflictResolution] = useState<{
    hasConflict: boolean;
    conflict?: Conflict<T>;
    resolvedEntity?: T;
    requiresManualResolution: boolean;
  } | null>(null);

  const checkForConflicts = useCallback(
    async (updatedEntity: T, remoteEntity: T) => {
      if (!currentEntity) return { hasConflict: false, requiresManualResolution: false };

      const result = await handleSyncConflict(updatedEntity, remoteEntity, currentEntity);
      setConflictResolution(result);
      return result;
    },
    [currentEntity, handleSyncConflict]
  );

  const resolveFormConflict = useCallback(
    async (strategy: ResolutionStrategy, customResolution?: Partial<T>) => {
      if (!conflictResolution?.conflict) {
        throw new Error('No conflict to resolve');
      }

      const resolution = await resolveConflict(
        conflictResolution.conflict.id,
        strategy,
        customResolution
      );

      setConflictResolution(null);
      return resolution;
    },
    [conflictResolution, resolveConflict]
  );

  return {
    conflictResolution,
    checkForConflicts,
    resolveFormConflict,
    clearConflictResolution: useCallback(() => setConflictResolution(null), []),
  };
}
