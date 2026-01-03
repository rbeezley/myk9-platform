import { useState, useEffect, useCallback, useRef } from 'react';
import type { 
  Conflict, 
  ConflictResolution, 
  ResolutionStrategy,
  BaseConflict,
  BaseConflictResolution
} from '../types/conflict-types';

// Type for conflict priorities
// type ConflictPriority = 'low' | 'medium' | 'high' | 'critical';
// TODO: Import conflict manager when it's implemented
// import { 
//   conflictManager, 
//   ConflictEvent, 
//   ConflictEventType,
//   ConflictStats,
//   ConflictNotification
// } from '../services/conflict/ConflictManager';

// Temporary types until ConflictManager is implemented
interface ConflictEvent {
  id: string;
  type: string;
  timestamp: Date;
  conflictId?: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

interface ConflictStats {
  total: number;
  resolved: number;
  pending: number;
}

interface ConflictNotification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error';
}

type ConflictEventType = 'created' | 'resolved' | 'updated' | 'conflict_detected' | 'conflict_resolved' | 'conflict_failed' | 'manual_resolution_required';

// Temporary conflict manager stub until real implementation is available
const conflictManager = {
  getConflictStats: (): ConflictStats => ({ total: 0, resolved: 0, pending: 0 }),
  getPendingConflicts: (): BaseConflict<Record<string, unknown>>[] => [],
  getResolutionHistory: (): BaseConflictResolution<unknown>[] => [],
  addEventListener: (type: string, handler: (event: ConflictEvent) => void) => {
    // No-op stub
    void type; void handler;
  },
  removeEventListener: (type: string, handler: (event: ConflictEvent) => void) => {
    // No-op stub  
    void type; void handler;
  },
  resolveConflictManually: async (conflictId: string, resolution: ConflictResolution): Promise<boolean> => {
    console.warn('ConflictManager stub: resolveConflictManually called but not implemented');
    void conflictId; void resolution;
    return false;
  },
  handleSyncConflict: async (local: unknown, remote: unknown, base?: unknown, context?: unknown): Promise<ConflictResolution> => {
    console.warn('ConflictManager stub: handleSyncConflict called but not implemented');
    void local; void remote; void base; void context;
    return {
      conflictId: 'stub-conflict',
      strategy: 'user_decides' as ResolutionStrategy,
      resolvedEntity: local,
      resolvedAt: new Date(),
      resolvedBy: 'system',
      automatic: false
    } as ConflictResolution;
  }
};

import { SyncMetadata } from '../types/core-types';
import { useAuth } from './useAuth';

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
    notifications: []
  });

  const eventHandlersRef = useRef<Map<ConflictEventType, (event: ConflictEvent) => void>>(new Map());
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const refreshConflicts = useCallback(() => {
    try {
      const conflicts = conflictManager.getPendingConflicts();
      const resolutions = conflictManager.getResolutionHistory();
      const stats = conflictManager.getConflictStats();

      setState(prev => ({
        ...prev,
        conflicts,
        resolutions,
        stats,
        isLoading: false,
        error: null
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to refresh conflicts',
        isLoading: false
      }));
    }
  }, []);

  // Initialize event handlers
  useEffect(() => {
    const handlers = new Map<ConflictEventType, (event: ConflictEvent) => void>();

    handlers.set('conflict_detected', (event) => {
      setState(prev => ({
        ...prev,
        stats: conflictManager.getConflictStats(),
        notifications: options.enableNotifications ? [
          ...prev.notifications,
          {
            id: `notification-${event.conflictId || Date.now()}`,
            message: `Conflict detected in ${event.entityType} ${event.entityId}`,
            type: 'warning' as 'info' | 'warning' | 'error'
          }
        ] : prev.notifications
      }));
      
      // Refresh conflicts list
      refreshConflicts();
    });

    handlers.set('conflict_resolved', (event) => {
      setState(prev => ({
        ...prev,
        stats: conflictManager.getConflictStats(),
        notifications: prev.notifications.filter(n => n.id !== `notification-${event.conflictId}`)
      }));
      
      // Refresh conflicts and resolutions
      refreshConflicts();
    });

    handlers.set('conflict_failed', (event) => {
      setState(prev => ({
        ...prev,
        error: `Conflict resolution failed: ${event.data?.error || 'Unknown error'}`,
        stats: conflictManager.getConflictStats()
      }));
    });

    handlers.set('manual_resolution_required', (event) => {
      setState(prev => ({
        ...prev,
        notifications: options.enableNotifications ? [
          ...prev.notifications,
          {
            id: `notification-${event.conflictId || Date.now()}`,
            message: `Manual resolution required for ${event.entityType} ${event.entityId}`,
            type: 'error' as 'info' | 'warning' | 'error'
          }
        ] : prev.notifications
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
      refreshIntervalRef.current = setInterval(
        refreshConflicts,
        options.refreshInterval
      );

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [options.autoRefresh, options.refreshInterval, refreshConflicts]);

  // Initial load
  useEffect(() => {
    refreshConflicts();
  }, [options.entityType, refreshConflicts]);

  const resolveConflict = useCallback(async (
    conflictId: string,
    strategy: ResolutionStrategy,
    customResolution?: unknown
  ): Promise<ConflictResolution<{ id: string }>> => {
    if (!user) {
      throw new Error('User must be authenticated to resolve conflicts');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const context = {
        userId: user.id,
        userRole: 'user',
        userPermissions: [],
        timestamp: new Date(),
        deviceId: navigator.userAgent // Simple device identification
      };

      await conflictManager.resolveConflictManually(
        conflictId,
        {
          conflictId,
          strategy,
          resolvedEntity: customResolution,
          resolvedAt: new Date(),
          resolvedBy: context.userId,
          automatic: false
        } as ConflictResolution
      );

      setState(prev => ({
        ...prev,
        isLoading: false,
        notifications: prev.notifications.filter(n => n.id !== `notification-${conflictId}`)
      }));

      // Refresh to get updated state
      refreshConflicts();

      return {
        conflictId,
        strategy,
        resolvedEntity: customResolution,
        resolvedAt: new Date(),
        resolvedBy: context.userId,
        automatic: false
      } as BaseConflictResolution<{ id: string }>;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to resolve conflict',
        isLoading: false
      }));
      throw error;
    }
  }, [user, refreshConflicts]);

  const handleSyncConflict = useCallback(async <T extends { id: string }>(
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
      deviceId: navigator.userAgent
    };

    const result = await conflictManager.handleSyncConflict(local, remote, base, context);
    return {
      hasConflict: true,
      resolvedEntity: result.resolvedEntity as T & SyncMetadata,
      requiresManualResolution: !result.automatic
    };
  }, [user]);

  const dismissNotification = useCallback((conflictId: string) => {
    setState(prev => ({
      ...prev,
      notifications: prev.notifications.filter(n => n.id !== `notification-${conflictId}`)
    }));
  }, []);

  const clearNotifications = useCallback(() => {
    setState(prev => ({
      ...prev,
      notifications: []
    }));
  }, []);

  return {
    ...state,
    resolveConflict,
    dismissNotification,
    clearNotifications,
    refreshConflicts,
    handleSyncConflict
  };
}

// Specialized hooks for different conflict scenarios

export function useShowConflictResolution() {
  return useConflictResolution({
    entityType: 'show',
    autoRefresh: true,
    refreshInterval: 30000, // 30 seconds
    enableNotifications: true
  });
}

export function useRegistrationConflictResolution() {
  return useConflictResolution({
    entityType: 'registration',
    autoRefresh: true,
    refreshInterval: 15000, // 15 seconds - more frequent for active entries
    enableNotifications: true
  });
}

export function useScoreConflictResolution() {
  return useConflictResolution({
    entityType: 'score',
    autoRefresh: true,
    refreshInterval: 10000, // 10 seconds - real-time scoring
    enableNotifications: true
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
    enableNotifications: true
  });

  const [conflictResolution, setConflictResolution] = useState<{
    hasConflict: boolean;
    conflict?: Conflict<T>;
    requiresManualResolution: boolean;
  } | null>(null);

  const checkForConflicts = useCallback(async (
    updatedEntity: T,
    remoteEntity: T
  ) => {
    if (!currentEntity) return { hasConflict: false, requiresManualResolution: false };

    const result = await handleSyncConflict(updatedEntity, remoteEntity, currentEntity);
    setConflictResolution(result);
    return result;
  }, [currentEntity, handleSyncConflict]);

  const resolveFormConflict = useCallback(async (
    strategy: ResolutionStrategy,
    customResolution?: Partial<T>
  ) => {
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
  }, [conflictResolution, resolveConflict]);

  return {
    conflictResolution,
    checkForConflicts,
    resolveFormConflict,
    clearConflictResolution: useCallback(() => setConflictResolution(null), [])
  };
}