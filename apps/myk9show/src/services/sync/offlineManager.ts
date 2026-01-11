/**
 * Offline Manager
 * Phase 6.3: Sync & Offline Systems
 * 
 * Comprehensive offline-first architecture with robust data management,
 * automatic sync scheduling, and intelligent offline mode detection.
 */

import { logger } from '@/services/LoggingService';
import { syncQueue } from './SyncQueue';
import { conflictResolver } from './conflictResolver';
import { errorMonitor } from '../../lib/errorMonitoring';
import type { NetworkQuality, SyncEvent, SyncQueueItem } from '../../types/sync-types';

export interface OfflineManagerConfig {
  // Offline detection
  pingUrl: string;
  pingInterval: number;
  pingTimeout: number;
  offlineThreshold: number; // consecutive failed pings to go offline
  
  // Storage management
  maxOfflineStorage: number; // bytes
  storageWarningThreshold: number; // 0-1, percentage of max storage
  enableStorageCompression: boolean;
  
  // Sync scheduling
  enableAutoSync: boolean;
  syncInterval: number; // ms, when online
  offlineSyncRetryInterval: number; // ms, when offline
  batchSyncSize: number;
  
  // Data management
  enableDataPrioritization: boolean;
  criticalDataTypes: string[];
  maxOfflineOperations: number;
  enableDraftMode: boolean;
}

export interface OfflineState {
  isOnline: boolean;
  networkQuality: NetworkQuality;
  lastOnlineTime: Date | null;
  offlineDuration: number; // ms
  pendingSyncOperations: number;
  storageUsed: number; // bytes
  storageAvailable: number; // bytes
  syncInProgress: boolean;
  lastSyncTime: Date | null;
  lastSyncSuccess: boolean;
}

export interface OfflineMetrics {
  totalOfflineTime: number;
  offlineSessionCount: number;
  operationsQueuedOffline: number;
  operationsSyncedOnReconnect: number;
  averageOfflineSessionDuration: number;
  syncSuccessRate: number;
  dataSyncedMB: number;
  conflictsDetected: number;
  conflictsResolved: number;
}

export interface StorageEstimate {
  used: number;
  available: number;
  quota: number;
  percentage: number;
  breakdown: {
    databases: number;
    localStorage: number;
    indexedDB: number;
    webSQL: number;
  };
}

/**
 * Comprehensive Offline-First Manager
 */
export class OfflineManager {
  private config: OfflineManagerConfig;
  private state: OfflineState;
  private metrics: OfflineMetrics;
  private eventListeners = new Map<string, Set<(event: SyncEvent) => void>>();
  
  // Timers and monitoring
  private pingTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private storageMonitorTimer: NodeJS.Timeout | null = null;
  
  // State tracking
  private consecutiveFailedPings = 0;
  private offlineStartTime: Date | null = null;
  private pendingOperations = new Map<string, Record<string, unknown>>();
  private draftOperations = new Map<string, Record<string, unknown>>();

  constructor(customConfig?: Partial<OfflineManagerConfig>) {
    this.config = {
      pingUrl: '/api/health',
      pingInterval: 30000, // 30 seconds
      pingTimeout: 5000, // 5 seconds
      offlineThreshold: 3, // 3 failed pings
      
      maxOfflineStorage: 50 * 1024 * 1024, // 50MB
      storageWarningThreshold: 0.8, // 80%
      enableStorageCompression: true,
      
      enableAutoSync: true,
      syncInterval: 10000, // 10 seconds when online
      offlineSyncRetryInterval: 60000, // 1 minute when offline
      batchSyncSize: 20,
      
      enableDataPrioritization: true,
      criticalDataTypes: ['entry', 'checkin', 'score'],
      maxOfflineOperations: 1000,
      enableDraftMode: true,
      
      ...customConfig,
    };

    this.state = this.initializeState();
    this.metrics = this.initializeMetrics();
    
    this.setupEventListeners();
    this.startMonitoring();
  }

  /**
   * Initialize offline state
   */
  private initializeState(): OfflineState {
    return {
      isOnline: navigator.onLine,
      networkQuality: 'good',
      lastOnlineTime: navigator.onLine ? new Date() : null,
      offlineDuration: 0,
      pendingSyncOperations: 0,
      storageUsed: 0,
      storageAvailable: 0,
      syncInProgress: false,
      lastSyncTime: null,
      lastSyncSuccess: false,
    };
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): OfflineMetrics {
    return {
      totalOfflineTime: 0,
      offlineSessionCount: 0,
      operationsQueuedOffline: 0,
      operationsSyncedOnReconnect: 0,
      averageOfflineSessionDuration: 0,
      syncSuccessRate: 0,
      dataSyncedMB: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
    };
  }

  /**
   * Setup browser event listeners
   */
  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Browser online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Visibility change for sync optimization
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Storage events
    window.addEventListener('storage', this.handleStorageChange.bind(this));
    
    // Before unload - save pending operations
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  /**
   * Start monitoring and sync processes
   */
  private startMonitoring(): void {
    this.startNetworkMonitoring();
    this.startStorageMonitoring();
    
    if (this.config.enableAutoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Start network connectivity monitoring
   */
  private startNetworkMonitoring(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }

    this.pingTimer = setInterval(async () => {
      const isOnline = await this.checkConnectivity();
      this.updateNetworkState(isOnline);
    }, this.config.pingInterval);
  }

  /**
   * Check network connectivity with ping
   */
  private async checkConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.pingTimeout);
      
      const response = await fetch(this.config.pingUrl, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      
      clearTimeout(timeoutId);
      return response.ok;
      
    } catch (error) {
      logger.warn('Connectivity check failed', 'offline', { error });
      return false;
    }
  }

  /**
   * Update network state based on connectivity
   */
  private updateNetworkState(isOnline: boolean): void {
    const wasOnline = this.state.isOnline;
    
    if (isOnline) {
      this.consecutiveFailedPings = 0;
      
      if (!wasOnline) {
        // Just came online
        this.handleConnectionRestored();
      }
    } else {
      this.consecutiveFailedPings++;
      
      if (wasOnline && this.consecutiveFailedPings >= this.config.offlineThreshold) {
        // Just went offline
        this.handleConnectionLost();
      }
    }
  }

  /**
   * Handle connection restored
   */
  private async handleConnectionRestored(): Promise<void> {
    logger.info('Connection restored', 'offline');
    
    // Update state
    this.state.isOnline = true;
    this.state.lastOnlineTime = new Date();
    
    // Calculate offline duration
    if (this.offlineStartTime) {
      const offlineDuration = Date.now() - this.offlineStartTime.getTime();
      this.state.offlineDuration = 0;
      this.metrics.totalOfflineTime += offlineDuration;
      this.metrics.averageOfflineSessionDuration = 
        this.metrics.totalOfflineTime / this.metrics.offlineSessionCount;
      this.offlineStartTime = null;
    }

    // Emit event
    this.emitEvent({
      type: 'connection-restored',
      timestamp: new Date(),
    });

    // Start sync process
    if (this.config.enableAutoSync) {
      await this.syncPendingOperations();
    }
  }

  /**
   * Handle connection lost
   */
  private handleConnectionLost(): void {
    logger.info('Connection lost', 'offline');
    
    // Update state
    this.state.isOnline = false;
    this.offlineStartTime = new Date();
    this.metrics.offlineSessionCount++;

    // Emit event
    this.emitEvent({
      type: 'connection-lost',
      timestamp: new Date(),
    });

    // Pause non-critical sync operations
    this.pauseSync();
  }

  /**
   * Handle browser online event
   */
  private handleOnline(): void {
    logger.debug('Browser online event', 'offline');
    this.checkConnectivity().then(isOnline => {
      if (isOnline) {
        this.updateNetworkState(true);
      }
    });
  }

  /**
   * Handle browser offline event
   */
  private handleOffline(): void {
    logger.debug('Browser offline event', 'offline');
    this.updateNetworkState(false);
  }

  /**
   * Handle visibility change
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      // App became active - check connectivity and sync
      this.checkConnectivity().then(isOnline => {
        this.updateNetworkState(isOnline);
        if (isOnline && this.hasPendingOperations()) {
          this.syncPendingOperations();
        }
      });
    }
  }

  /**
   * Handle storage change
   */
  private handleStorageChange(): void {
    this.updateStorageEstimate();
  }

  /**
   * Handle before unload
   */
  private handleBeforeUnload(): void {
    this.savePendingOperations();
  }

  /**
   * Start storage monitoring
   */
  private startStorageMonitoring(): void {
    if (this.storageMonitorTimer) {
      clearInterval(this.storageMonitorTimer);
    }

    this.storageMonitorTimer = setInterval(() => {
      this.updateStorageEstimate();
    }, 60000); // Check every minute

    // Initial check
    this.updateStorageEstimate();
  }

  /**
   * Update storage usage estimate
   */
  private async updateStorageEstimate(): Promise<void> {
    try {
      let storageEstimate: StorageEstimate;

      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        
        storageEstimate = {
          used: estimate.usage || 0,
          available: (estimate.quota || 0) - (estimate.usage || 0),
          quota: estimate.quota || 0,
          percentage: estimate.quota ? (estimate.usage || 0) / estimate.quota : 0,
          breakdown: {
            databases: 0, // Would need more detailed analysis
            localStorage: this.getLocalStorageSize(),
            indexedDB: 0, // Would need to enumerate databases
            webSQL: 0, // Deprecated
          },
        };
      } else {
        // Fallback estimation
        storageEstimate = {
          used: this.getLocalStorageSize(),
          available: this.config.maxOfflineStorage - this.getLocalStorageSize(),
          quota: this.config.maxOfflineStorage,
          percentage: this.getLocalStorageSize() / this.config.maxOfflineStorage,
          breakdown: {
            databases: 0,
            localStorage: this.getLocalStorageSize(),
            indexedDB: 0,
            webSQL: 0,
          },
        };
      }

      this.state.storageUsed = storageEstimate.used;
      this.state.storageAvailable = storageEstimate.available;

      // Check for storage warnings
      if (storageEstimate.percentage > this.config.storageWarningThreshold) {
        this.emitEvent({
          type: 'storage-warning',
          timestamp: new Date(),
          details: { storageEstimate },
        });
      }

    } catch (error) {
      logger.error('Failed to estimate storage', 'offline', {}, error as Error);
    }
  }

  /**
   * Get localStorage size estimate
   */
  private getLocalStorageSize(): number {
    try {
      let total = 0;
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          total += localStorage[key].length + key.length;
        }
      }
      return total * 2; // Rough estimate (UTF-16)
    } catch {
      return 0;
    }
  }

  /**
   * Start automatic sync process
   */
  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    const interval = this.state.isOnline 
      ? this.config.syncInterval 
      : this.config.offlineSyncRetryInterval;

    this.syncTimer = setInterval(() => {
      if (this.state.isOnline && this.hasPendingOperations()) {
        this.syncPendingOperations();
      }
    }, interval);
  }

  /**
   * Pause sync operations
   */
  private pauseSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Queue operation for offline processing
   */
  queueOperation(
    entityType: 'club' | 'person' | 'dog' | 'show' | 'trial' | 'class' | 'entry' | 'trial_class',
    actionType: 'create' | 'update' | 'delete',
    entityId: string,
    data: Record<string, unknown>,
    priority: number = 5
  ): string {
    const operationId = syncQueue.enqueue({
      entityType,
      actionType,
      entityId,
      data,
      userId: this.getCurrentUserId(),
      retries: 0,
      lastError: undefined,
      priority,
      scheduledFor: new Date(),
    });

    this.metrics.operationsQueuedOffline++;
    this.state.pendingSyncOperations = syncQueue.size();

    // Store pending operation for persistence
    this.pendingOperations.set(operationId, {
      entityType,
      actionType,
      entityId,
      data,
      priority,
      timestamp: Date.now(),
    });

    this.emitEvent({
      type: 'operation-queued',
      timestamp: new Date(),
      details: { operationId, entityType, actionType },
    });

    logger.debug('Queued offline operation', 'offline', { operationId, entityType, actionType });
    return operationId;
  }

  /**
   * Create draft operation
   */
  createDraft(
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): string {
    if (!this.config.enableDraftMode) {
      throw new Error('Draft mode is disabled');
    }

    const draftId = `draft-${entityType}-${entityId}-${Date.now()}`;
    
    this.draftOperations.set(draftId, {
      entityType,
      entityId,
      data,
      createdAt: Date.now(),
      lastModified: Date.now(),
    });

    this.saveDrafts();
    
    logger.debug('Created draft', 'offline', { draftId });
    return draftId;
  }

  /**
   * Update draft operation
   */
  updateDraft(draftId: string, data: Record<string, unknown>): void {
    const draft = this.draftOperations.get(draftId);
    if (!draft) {
      throw new Error(`Draft not found: ${draftId}`);
    }

    draft.data = data;
    draft.lastModified = Date.now();
    
    this.draftOperations.set(draftId, draft);
    this.saveDrafts();
  }

  /**
   * Promote draft to sync queue
   */
  promoteDraft(draftId: string): string {
    const draft = this.draftOperations.get(draftId);
    if (!draft) {
      throw new Error(`Draft not found: ${draftId}`);
    }

    const operationId = this.queueOperation(
      draft.entityType as 'club' | 'person' | 'dog' | 'show' | 'trial' | 'class' | 'entry' | 'trial_class',
      'create', // Drafts are typically new entities
      draft.entityId as string,
      draft.data as Record<string, unknown>,
      7 // High priority for promoted drafts
    );

    // Remove draft
    this.draftOperations.delete(draftId);
    this.saveDrafts();

    logger.info('Promoted draft to operation', 'offline', { draftId, operationId });
    return operationId;
  }

  /**
   * Sync pending operations
   */
  private async syncPendingOperations(): Promise<void> {
    if (this.state.syncInProgress || !this.state.isOnline) {
      return;
    }

    const pendingItems = syncQueue.getByStatus('pending');
    if (pendingItems.length === 0) {
      return;
    }

    this.state.syncInProgress = true;
    
    this.emitEvent({
      type: 'sync-started',
      timestamp: new Date(),
      details: { itemCount: pendingItems.length },
    });

    try {
      const batch = pendingItems.slice(0, this.config.batchSyncSize);
      
      for (const item of batch) {
        try {
          await this.syncSingleOperation(item);
          syncQueue.markCompleted(item.id);
          this.metrics.operationsSyncedOnReconnect++;
          
        } catch (error) {
          syncQueue.markFailed(item.id, error as Error);
          
          // Check for conflicts
          if (this.isConflictError(error as Error)) {
            await this.handleSyncConflict(item);
          }
        }
      }

      this.state.lastSyncTime = new Date();
      this.state.lastSyncSuccess = true;
      this.state.pendingSyncOperations = syncQueue.size();

      this.emitEvent({
        type: 'sync-completed',
        timestamp: new Date(),
        details: { 
          syncedItems: batch.length,
          remainingItems: syncQueue.size(),
        },
      });

    } catch (error) {
      this.state.lastSyncSuccess = false;
      
      this.emitEvent({
        type: 'sync-failed',
        timestamp: new Date(),
        details: { error: (error as Error).message },
      });

      errorMonitor.captureError(error as Error, {
        additionalData: { 
          pendingOperations: pendingItems.length,
          isOnline: this.state.isOnline,
        }
      });

    } finally {
      this.state.syncInProgress = false;
    }
  }

  /**
   * Sync single operation using registered processors
   */
  private async syncSingleOperation(item: SyncQueueItem): Promise<void> {
    logger.debug('Syncing operation', 'offline', { itemId: item.id, entityType: item.entityType, actionType: item.actionType });

    // Get the processor for this entity type from SyncQueue
    const processor = syncQueue.getProcessor(item.entityType);

    if (processor) {
      // Use the registered processor
      const result = await processor.processItem(item);

      if (!result.success) {
        if (result.conflictDetected) {
          throw new Error(`Conflict detected: version ${result.serverVersion}`);
        }
        throw result.error || new Error('Sync operation failed');
      }

      // Success - processor has already updated local cache
      return;
    }

    // No processor registered - fall back to stub behavior
    logger.warn('No processor registered for entity type', 'offline', { entityType: item.entityType });
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Check if error is a conflict error
   */
  private isConflictError(error: Error): boolean {
    return error.message.includes('conflict') || 
           error.message.includes('version') ||
           error.message.includes('concurrent');
  }

  /**
   * Handle sync conflict
   */
  private async handleSyncConflict(item: SyncQueueItem): Promise<void> {
    this.metrics.conflictsDetected++;
    
    // Would fetch current remote data for conflict resolution
    const remoteData = {}; // Placeholder
    
    const conflict = conflictResolver.detectConflict(
      item.entityType as string,
      item.entityId,
      item.data,
      remoteData
    );

    if (conflict) {
      logger.info('Conflict detected, queuing for resolution', 'offline', { itemId: item.id });
      
      this.emitEvent({
        type: 'conflict-detected',
        timestamp: new Date(),
        details: { 
          conflictId: conflict.id,
          entityType: item.entityType,
          entityId: item.entityId,
        },
      });
    }
  }

  /**
   * Get current user ID
   */
  private getCurrentUserId(): string {
    // Would get from auth context
    return 'current-user-id';
  }

  /**
   * Check if there are pending operations
   */
  private hasPendingOperations(): boolean {
    return syncQueue.size() > 0;
  }

  /**
   * Save pending operations to localStorage
   */
  private savePendingOperations(): void {
    try {
      const operations = Array.from(this.pendingOperations.entries());
      localStorage.setItem('myK9Show_pending_operations', JSON.stringify(operations));
    } catch (error) {
      logger.error('Failed to save pending operations', 'offline', {}, error as Error);
    }
  }

  /**
   * Load pending operations from localStorage
   */
  private loadPendingOperations(): void {
    try {
      const stored = localStorage.getItem('myK9Show_pending_operations');
      if (stored) {
        const operations = JSON.parse(stored);
        this.pendingOperations = new Map(operations);
      }
    } catch (error) {
      logger.error('Failed to load pending operations', 'offline', {}, error as Error);
    }
  }

  /**
   * Save drafts to localStorage
   */
  private saveDrafts(): void {
    try {
      const drafts = Array.from(this.draftOperations.entries());
      localStorage.setItem('myK9Show_drafts', JSON.stringify(drafts));
    } catch (error) {
      logger.error('Failed to save drafts', 'offline', {}, error as Error);
    }
  }

  /**
   * Load drafts from localStorage
   */
  private loadDrafts(): void {
    try {
      const stored = localStorage.getItem('myK9Show_drafts');
      if (stored) {
        const drafts = JSON.parse(stored);
        this.draftOperations = new Map(drafts);
      }
    } catch (error) {
      logger.error('Failed to load drafts', 'offline', {}, error as Error);
    }
  }

  /**
   * Emit sync event
   */
  private emitEvent(event: SyncEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          logger.error('Error in offline event listener', 'offline', { eventType: event.type }, error as Error);
        }
      });
    }
  }

  /**
   * Add event listener
   */
  addEventListener(
    eventType: string,
    listener: (event: SyncEvent) => void
  ): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    
    this.eventListeners.get(eventType)!.add(listener);
    
    return () => {
      this.eventListeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Get current offline state
   */
  getState(): OfflineState {
    return { ...this.state };
  }

  /**
   * Get offline metrics
   */
  getMetrics(): OfflineMetrics {
    return { ...this.metrics };
  }

  /**
   * Get pending operations count
   */
  getPendingOperationsCount(): number {
    return syncQueue.size();
  }

  /**
   * Get draft operations
   */
  getDrafts(): Map<string, Record<string, unknown>> {
    return new Map(this.draftOperations);
  }

  /**
   * Force sync now
   */
  async forceSyncNow(): Promise<void> {
    if (!this.state.isOnline) {
      throw new Error('Cannot sync while offline');
    }
    
    await this.syncPendingOperations();
  }

  /**
   * Clear all offline data
   */
  clearOfflineData(): void {
    syncQueue.clear();
    this.pendingOperations.clear();
    this.draftOperations.clear();
    
    // Clear localStorage
    localStorage.removeItem('myK9Show_pending_operations');
    localStorage.removeItem('myK9Show_drafts');
    
    this.state.pendingSyncOperations = 0;
    
    logger.info('All offline data cleared', 'offline');
  }

  /**
   * Get configuration
   */
  getConfig(): OfflineManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<OfflineManagerConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Restart monitoring if intervals changed
    if (updates.pingInterval) {
      this.startNetworkMonitoring();
    }
    
    if (updates.syncInterval && this.config.enableAutoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Cleanup and destroy manager
   */
  destroy(): void {
    // Clear timers
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    
    if (this.storageMonitorTimer) {
      clearInterval(this.storageMonitorTimer);
      this.storageMonitorTimer = null;
    }

    // Save final state
    this.savePendingOperations();
    this.saveDrafts();
    
    // Clear event listeners
    this.eventListeners.clear();
    
    logger.info('Offline manager destroyed', 'offline');
  }
}

// Create singleton instance
export const offlineManager = new OfflineManager();

export default OfflineManager;