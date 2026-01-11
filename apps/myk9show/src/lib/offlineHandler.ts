// Offline detection and graceful degradation system
// Phase 3.3: Enhanced Error Handling & Recovery

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryClient';
import { logger } from '@/services/LoggingService';
import type { Dog } from '../types/dog-types';
import type { User } from '../types/user-types';
import type { Show } from '../types/show-types';
import type { Club } from '../types/club-types';

// Enhanced Navigator interface with connection API
interface NavigatorWithConnection extends Navigator {
  connection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    addEventListener?: (event: string, listener: () => void) => void;
    removeEventListener?: (event: string, listener: () => void) => void;
  };
  mozConnection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    addEventListener?: (event: string, listener: () => void) => void;
    removeEventListener?: (event: string, listener: () => void) => void;
  };
  webkitConnection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    addEventListener?: (event: string, listener: () => void) => void;
    removeEventListener?: (event: string, listener: () => void) => void;
  };
}

// Network status detection
export interface NetworkStatus {
  isOnline: boolean;
  connectionType: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
  downlink: number;
  rtt: number;
  lastConnected?: Date;
  lastDisconnected?: Date;
}

// Offline storage interface
export interface OfflineOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entityType: string;
  entityId?: string;
  data: unknown;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority: 'high' | 'medium' | 'low';
}

// Network status hook with enhanced detection
export const useNetworkStatus = (): NetworkStatus => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(() => {
    if (typeof window === 'undefined') {
      return {
        isOnline: true,
        connectionType: 'unknown',
        effectiveType: 'unknown',
        downlink: 0,
        rtt: 0,
      };
    }

    const navWithConnection = navigator as NavigatorWithConnection;
    const connection = navWithConnection.connection || navWithConnection.mozConnection || navWithConnection.webkitConnection;
    
    return {
      isOnline: navigator.onLine,
      connectionType: (connection?.type as NetworkStatus['connectionType']) || 'unknown',
      effectiveType: (connection?.effectiveType as NetworkStatus['effectiveType']) || 'unknown',
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateNetworkStatus = () => {
      const navWithConnection = navigator as NavigatorWithConnection;
      const connection = navWithConnection.connection || navWithConnection.mozConnection || navWithConnection.webkitConnection;
      const isOnline = navigator.onLine;
      
      setNetworkStatus(prev => ({
        ...prev,
        isOnline,
        connectionType: (connection?.type as NetworkStatus['connectionType']) || 'unknown',
        effectiveType: (connection?.effectiveType as NetworkStatus['effectiveType']) || 'unknown',
        downlink: connection?.downlink || 0,
        rtt: connection?.rtt || 0,
        lastConnected: isOnline && !prev.isOnline ? new Date() : prev.lastConnected,
        lastDisconnected: !isOnline && prev.isOnline ? new Date() : prev.lastDisconnected,
      }));
    };

    const handleOnline = () => updateNetworkStatus();
    const handleOffline = () => updateNetworkStatus();
    const handleConnectionChange = () => updateNetworkStatus();

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection quality changes
    const navWithConnection = navigator as NavigatorWithConnection;
    const connection = navWithConnection.connection || navWithConnection.mozConnection || navWithConnection.webkitConnection;
    if (connection) {
      connection.addEventListener?.('change', handleConnectionChange);
    }

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener?.('change', handleConnectionChange);
      }
    };
  }, []);

  return networkStatus;
};

// Offline storage manager
export class OfflineStorageManager {
  private storageKey = 'myK9Show_offline_operations';
  private maxOperations = 100;

  // Get all pending offline operations
  getOperations(): OfflineOperation[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      logger.error('Failed to load offline operations', 'offline', {}, error as Error);
      return [];
    }
  }

  // Add a new offline operation
  addOperation(operation: Omit<OfflineOperation, 'id' | 'timestamp' | 'retryCount'>): void {
    try {
      const operations = this.getOperations();
      const newOperation: OfflineOperation = {
        ...operation,
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        retryCount: 0,
      };

      operations.push(newOperation);

      // Keep only the most recent operations
      if (operations.length > this.maxOperations) {
        operations.splice(0, operations.length - this.maxOperations);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(operations));
    } catch (error) {
      logger.error('Failed to save offline operation', 'offline', {}, error as Error);
    }
  }

  // Remove an operation (after successful sync)
  removeOperation(operationId: string): void {
    try {
      const operations = this.getOperations().filter(op => op.id !== operationId);
      localStorage.setItem(this.storageKey, JSON.stringify(operations));
    } catch (error) {
      logger.error('Failed to remove offline operation', 'offline', {}, error as Error);
    }
  }

  // Update operation retry count
  incrementRetryCount(operationId: string): void {
    try {
      const operations = this.getOperations();
      const operation = operations.find(op => op.id === operationId);

      if (operation) {
        operation.retryCount++;
        localStorage.setItem(this.storageKey, JSON.stringify(operations));
      }
    } catch (error) {
      logger.error('Failed to update operation retry count', 'offline', {}, error as Error);
    }
  }

  // Clear all operations
  clearOperations(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      logger.error('Failed to clear offline operations', 'offline', {}, error as Error);
    }
  }

  // Get operations by priority
  getOperationsByPriority(): { high: OfflineOperation[]; medium: OfflineOperation[]; low: OfflineOperation[] } {
    const operations = this.getOperations();
    return {
      high: operations.filter(op => op.priority === 'high'),
      medium: operations.filter(op => op.priority === 'medium'),
      low: operations.filter(op => op.priority === 'low'),
    };
  }

  // Get failed operations (exceeded max retries)
  getFailedOperations(): OfflineOperation[] {
    return this.getOperations().filter(op => op.retryCount >= op.maxRetries);
  }

  // Get statistics
  getStats() {
    const operations = this.getOperations();
    const failed = this.getFailedOperations();
    
    return {
      total: operations.length,
      pending: operations.length - failed.length,
      failed: failed.length,
      byType: operations.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byPriority: operations.reduce((acc, op) => {
        acc[op.priority] = (acc[op.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// Graceful degradation strategies
export class GracefulDegradationManager {
  private queryClient: QueryClient;
  private offlineStorage: OfflineStorageManager;

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.offlineStorage = new OfflineStorageManager();
  }

  // Handle offline data operations
  handleOfflineOperation(
    type: 'create' | 'update' | 'delete',
    entityType: string,
    data: unknown,
    options: {
      entityId?: string;
      priority?: 'high' | 'medium' | 'low';
      maxRetries?: number;
    } = {}
  ): Promise<{ success: boolean; offlineId?: string }> {
    const { entityId, priority = 'medium', maxRetries = 3 } = options;

    // Store operation for later sync
    this.offlineStorage.addOperation({
      type,
      entityType,
      entityId,
      data,
      priority,
      maxRetries,
    });

    // Apply optimistic updates to cache
    this.applyOptimisticUpdate(type, entityType, data, entityId);

    return Promise.resolve({ success: true, offlineId: `offline_${Date.now()}` });
  }

  // Apply optimistic updates to React Query cache
  private applyOptimisticUpdate(
    type: 'create' | 'update' | 'delete',
    entityType: string,
    data: unknown,
    entityId?: string
  ): void {
    try {
      switch (entityType) {
        case 'dog':
          this.updateDogCache(type, data, entityId);
          break;
        case 'user':
          this.updateUserCache(type, data, entityId);
          break;
        case 'show':
          this.updateShowCache(type, data, entityId);
          break;
        case 'club':
          this.updateClubCache(type, data, entityId);
          break;
        default:
          logger.warn('Unknown entity type for optimistic update', 'offline', { entityType });
      }
    } catch (error) {
      logger.error('Failed to apply optimistic update', 'offline', {}, error as Error);
    }
  }

  private updateDogCache(type: 'create' | 'update' | 'delete', data: unknown, entityId?: string): void {
    if (type === 'create') {
      const dataObj = data as Record<string, unknown>;
      const newDog = { ...dataObj, id: `temp_${Date.now()}` };
      this.queryClient.setQueryData(queryKeys.dogs, (old: Dog[] | undefined) => {
        return old ? [...old, newDog as Dog] : [newDog as Dog];
      });
    } else if (type === 'update' && entityId) {
      this.queryClient.setQueryData(queryKeys.dog(entityId), data);
      const dataObj = data as Record<string, unknown>;
      this.queryClient.setQueryData(queryKeys.dogs, (old: Dog[] | undefined) => {
        if (!old) return old;
        return old.map((dog: Dog) => dog.id === entityId ? { ...dog, ...dataObj } : dog);
      });
    } else if (type === 'delete' && entityId) {
      this.queryClient.setQueryData(queryKeys.dogs, (old: Dog[] | undefined) => {
        if (!old) return old;
        return old.filter((dog: Dog) => dog.id !== entityId);
      });
      this.queryClient.removeQueries({ queryKey: queryKeys.dog(entityId) });
    }
  }

  private updateUserCache(type: 'create' | 'update' | 'delete', data: unknown, entityId?: string): void {
    if (type === 'create') {
      const dataObj = data as Record<string, unknown>;
      const newUser = { ...dataObj, id: `temp_${Date.now()}` };
      this.queryClient.setQueryData(queryKeys.users.all, (old: User[] | undefined) => {
        return old ? [...old, newUser as User] : [newUser as User];
      });
    } else if (type === 'update' && entityId) {
      this.queryClient.setQueryData(queryKeys.users.detail(entityId), data);
      const dataObj = data as Record<string, unknown>;
      this.queryClient.setQueryData(queryKeys.users.all, (old: User[] | undefined) => {
        if (!old) return old;
        return old.map((user: User) => user.id === entityId ? { ...user, ...dataObj } : user);
      });
    } else if (type === 'delete' && entityId) {
      this.queryClient.setQueryData(queryKeys.users.all, (old: User[] | undefined) => {
        if (!old) return old;
        return old.filter((user: User) => user.id !== entityId);
      });
      this.queryClient.removeQueries({ queryKey: queryKeys.users.detail(entityId) });
    }
  }

  private updateShowCache(type: 'create' | 'update' | 'delete', data: unknown, entityId?: string): void {
    if (type === 'create') {
      const dataObj = data as Record<string, unknown>;
      const newShow = { ...dataObj, id: `temp_${Date.now()}` };
      this.queryClient.setQueryData(queryKeys.shows, (old: Show[] | undefined) => {
        return old ? [...old, newShow as Show] : [newShow as Show];
      });
    } else if (type === 'update' && entityId) {
      this.queryClient.setQueryData(queryKeys.show(entityId), data);
      const dataObj = data as Record<string, unknown>;
      this.queryClient.setQueryData(queryKeys.shows, (old: Show[] | undefined) => {
        if (!old) return old;
        return old.map((show: Show) => show.id === entityId ? { ...show, ...dataObj } : show);
      });
    } else if (type === 'delete' && entityId) {
      this.queryClient.setQueryData(queryKeys.shows, (old: Show[] | undefined) => {
        if (!old) return old;
        return old.filter((show: Show) => show.id !== entityId);
      });
      this.queryClient.removeQueries({ queryKey: queryKeys.show(entityId) });
    }
  }

  private updateClubCache(type: 'create' | 'update' | 'delete', data: unknown, entityId?: string): void {
    if (type === 'create') {
      const dataObj = data as Record<string, unknown>;
      const newClub = { ...dataObj, id: `temp_${Date.now()}` };
      this.queryClient.setQueryData(queryKeys.clubs, (old: Club[] | undefined) => {
        return old ? [...old, newClub as Club] : [newClub as Club];
      });
    } else if (type === 'update' && entityId) {
      this.queryClient.setQueryData(queryKeys.club(entityId), data);
      const dataObj = data as Record<string, unknown>;
      this.queryClient.setQueryData(queryKeys.clubs, (old: Club[] | undefined) => {
        if (!old) return old;
        return old.map((club: Club) => club.id === entityId ? { ...club, ...dataObj } : club);
      });
    } else if (type === 'delete' && entityId) {
      this.queryClient.setQueryData(queryKeys.clubs, (old: Club[] | undefined) => {
        if (!old) return old;
        return old.filter((club: Club) => club.id !== entityId);
      });
      this.queryClient.removeQueries({ queryKey: queryKeys.club(entityId) });
    }
  }

  // Sync offline operations when back online
  async syncOfflineOperations(): Promise<{ synced: number; failed: number }> {
    const operations = this.offlineStorage.getOperations();
    let synced = 0;
    let failed = 0;

    // Process high priority operations first
    const prioritizedOps = [
      ...operations.filter(op => op.priority === 'high'),
      ...operations.filter(op => op.priority === 'medium'),
      ...operations.filter(op => op.priority === 'low'),
    ];

    for (const operation of prioritizedOps) {
      if (operation.retryCount >= operation.maxRetries) {
        failed++;
        continue;
      }

      try {
        // Attempt to sync operation
        await this.syncSingleOperation(operation);
        this.offlineStorage.removeOperation(operation.id);
        synced++;
      } catch (error) {
        logger.error('Failed to sync operation', 'offline', { operationId: operation.id }, error as Error);
        this.offlineStorage.incrementRetryCount(operation.id);
        failed++;
      }
    }

    return { synced, failed };
  }

  private async syncSingleOperation(_operation: OfflineOperation): Promise<void> {
    void _operation; // Mark as used for ESLint
    // This would call the actual API endpoints
    // For now, we'll simulate the sync
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In production, this would make actual API calls:
    // switch (operation.type) {
    //   case 'create':
    //     await createEntity(operation.entityType, operation.data);
    //     break;
    //   case 'update':
    //     await updateEntity(operation.entityType, operation.entityId!, operation.data);
    //     break;
    //   case 'delete':
    //     await deleteEntity(operation.entityType, operation.entityId!);
    //     break;
    // }
  }

  // Get offline capabilities status
  getOfflineCapabilities() {
    const operations = this.offlineStorage.getOperations();
    const stats = this.offlineStorage.getStats();
    
    return {
      isOfflineCapable: true,
      pendingOperations: stats.pending,
      failedOperations: stats.failed,
      totalOperations: stats.total,
      lastSync: operations.length > 0 ? new Date(Math.max(...operations.map(op => op.timestamp))) : null,
      storageUsage: JSON.stringify(operations).length,
      maxStorageSize: 5 * 1024 * 1024, // 5MB limit
    };
  }
}

// Hook for offline-first operations
export const useOfflineFirst = () => {
  const queryClient = useQueryClient();
  const networkStatus = useNetworkStatus();
  const degradationManagerRef = useRef<GracefulDegradationManager>();

  if (!degradationManagerRef.current) {
    degradationManagerRef.current = new GracefulDegradationManager(queryClient);
  }

  const degradationManager = degradationManagerRef.current;

  // Auto-sync when coming back online
  useEffect(() => {
    if (networkStatus.isOnline && networkStatus.lastConnected) {
      const timeSinceConnected = Date.now() - networkStatus.lastConnected.getTime();
      
      // Only auto-sync if we just came back online (within last 5 seconds)
      if (timeSinceConnected < 5000) {
        degradationManager.syncOfflineOperations()
          .then(({ synced, failed }) => {
            if (synced > 0) {
              logger.info('Successfully synced offline operations', 'offline', { synced });
            }
            if (failed > 0) {
              logger.warn('Failed to sync some offline operations', 'offline', { failed });
            }
          })
          .catch(error => {
            logger.error('Failed to sync offline operations', 'offline', {}, error as Error);
          });
      }
    }
  }, [networkStatus.isOnline, networkStatus.lastConnected, degradationManager]);

  const performOperation = useCallback(async (
    type: 'create' | 'update' | 'delete',
    entityType: string,
    data: unknown,
    options: {
      entityId?: string;
      priority?: 'high' | 'medium' | 'low';
      forceOffline?: boolean;
    } = {}
  ) => {
    const { forceOffline = false } = options;

    // If offline or forced offline, handle gracefully
    if (!networkStatus.isOnline || forceOffline) {
      return degradationManager.handleOfflineOperation(type, entityType, data, options);
    }

    // If online, attempt normal operation
    try {
      // This would be the actual API call in production
      await new Promise(resolve => setTimeout(resolve, 100));
      return { success: true };
    } catch (error) {
      // If online operation fails, fallback to offline
      logger.warn('Online operation failed, falling back to offline mode', 'offline', {}, error as Error);
      return degradationManager.handleOfflineOperation(type, entityType, data, options);
    }
  }, [networkStatus.isOnline, degradationManager]);

  const manualSync = useCallback(async () => {
    if (!networkStatus.isOnline) {
      throw new Error('Cannot sync while offline');
    }
    return degradationManager.syncOfflineOperations();
  }, [networkStatus.isOnline, degradationManager]);

  return {
    networkStatus,
    performOperation,
    manualSync,
    offlineCapabilities: degradationManager.getOfflineCapabilities(),
    isOnline: networkStatus.isOnline,
    connectionQuality: networkStatus.effectiveType,
  };
};