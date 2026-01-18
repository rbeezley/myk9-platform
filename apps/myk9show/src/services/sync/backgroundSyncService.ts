/**
 * Background sync service for preparing offline operations for future synchronization
 * Implements Service Worker integration and intelligent sync scheduling
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from '@/services/LoggingService';

export interface BackgroundSyncOptions {
  maxRetries: number;
  retryDelay: number; // Base delay in ms
  backoffMultiplier: number;
  networkTimeout: number;
  batchSize: number;
  enableServiceWorker: boolean;
}

export interface SyncTask {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  entityId: string;
  data?: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  attempts: number;
  lastAttempt?: Date;
  scheduledFor?: Date;
  dependencies?: string[]; // Other task IDs this depends on
  metadata: {
    clientId: string;
    timestamp: Date;
    userAgent: string;
    version: string;
  };
}

export interface SyncResult {
  taskId: string;
  success: boolean;
  error?: string;
  attempts: number;
  duration: number;
  timestamp: Date;
}

export interface NetworkStatus {
  online: boolean;
  connectionType: string;
  effectiveType: string;
  downlink: number;
  rtt: number;
  quality: 'poor' | 'good' | 'excellent';
}

/**
 * Background sync service for preparing and managing offline sync operations
 */
export class BackgroundSyncService {
  private readonly options: BackgroundSyncOptions;
  private syncTasks: Map<string, SyncTask> = new Map();
  private syncResults: Map<string, SyncResult> = new Map();
  private isProcessing = false;
  private networkStatus: NetworkStatus;
  private serviceWorkerRegistration?: ServiceWorkerRegistration;
  private syncIntervalId?: number;

  // Event listeners
  private onSyncCompleteCallbacks: Array<(result: SyncResult) => void> = [];
  private onNetworkChangeCallbacks: Array<(status: NetworkStatus) => void> = [];
  private onSyncErrorCallbacks: Array<(error: Error, task: SyncTask) => void> = [];

  constructor(options?: Partial<BackgroundSyncOptions>) {
    this.options = {
      maxRetries: 5,
      retryDelay: 1000,
      backoffMultiplier: 2,
      networkTimeout: 30000,
      batchSize: 10,
      enableServiceWorker: true,
      ...options
    };

    this.networkStatus = this.getCurrentNetworkStatus();
    this.initializeNetworkMonitoring();
    this.initializeServiceWorker();
    this.startPeriodicSync();
  }

  /**
   * Adds a sync task to the queue
   * @param task - Sync task to add
   */
  async addSyncTask(task: Omit<SyncTask, 'id' | 'attempts' | 'metadata'>): Promise<string> {
    const syncTask: SyncTask = {
      ...task,
      id: this.generateTaskId(),
      attempts: 0,
      metadata: {
        clientId: this.getClientId(),
        timestamp: new Date(),
        userAgent: navigator.userAgent,
        version: '1.0.0' // TODO: Get from package.json
      }
    };

    this.syncTasks.set(syncTask.id, syncTask);
    
    // Store in IndexedDB for persistence
    await this.persistSyncTask(syncTask);
    
    // Try immediate sync if online and not processing
    if (this.networkStatus.online && !this.isProcessing) {
      this.processSyncQueue();
    }

    return syncTask.id;
  }

  /**
   * Removes a sync task from the queue
   * @param taskId - Task ID to remove
   */
  async removeSyncTask(taskId: string): Promise<void> {
    this.syncTasks.delete(taskId);
    await this.removePersistentSyncTask(taskId);
  }

  /**
   * Gets all pending sync tasks
   * @returns Array of pending sync tasks
   */
  getPendingSyncTasks(): SyncTask[] {
    return Array.from(this.syncTasks.values())
      .filter(task => task.attempts < this.options.maxRetries)
      .sort((a, b) => {
        // Sort by priority, then by timestamp
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.metadata.timestamp.getTime() - b.metadata.timestamp.getTime();
      });
  }

  /**
   * Gets sync results
   * @param limit - Maximum number of results to return
   * @returns Array of sync results
   */
  getSyncResults(limit = 100): SyncResult[] {
    return Array.from(this.syncResults.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Gets current network status
   * @returns Current network status
   */
  getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }

  /**
   * Forces immediate sync attempt
   * @returns Number of tasks processed
   */
  async forcSync(): Promise<number> {
    if (this.isProcessing) {
      logger.warn('Sync already in progress', 'sync');
      return 0;
    }

    return await this.processSyncQueue();
  }

  /**
   * Clears all completed sync tasks and results
   */
  async clearCompletedTasks(): Promise<void> {
    // Remove completed tasks
    const completedTaskIds: string[] = [];
    for (const [taskId, result] of this.syncResults) {
      if (result.success) {
        completedTaskIds.push(taskId);
      }
    }

    for (const taskId of completedTaskIds) {
      this.syncTasks.delete(taskId);
      this.syncResults.delete(taskId);
      await this.removePersistentSyncTask(taskId);
    }
  }

  /**
   * Gets sync statistics
   * @returns Sync statistics
   */
  getSyncStatistics(): SyncStatistics {
    const tasks = Array.from(this.syncTasks.values());
    const results = Array.from(this.syncResults.values());
    
    return {
      pendingTasks: tasks.length,
      completedTasks: results.filter(r => r.success).length,
      failedTasks: results.filter(r => !r.success).length,
      totalTasks: tasks.length + results.length,
      averageRetries: results.length > 0 
        ? results.reduce((sum, r) => sum + r.attempts, 0) / results.length 
        : 0,
      averageDuration: results.length > 0
        ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
        : 0,
      networkQuality: this.networkStatus.quality,
      lastSyncAttempt: Math.max(...results.map(r => r.timestamp.getTime()), 0)
    };
  }

  // Event listener methods
  onSyncComplete(callback: (result: SyncResult) => void): void {
    this.onSyncCompleteCallbacks.push(callback);
  }

  onNetworkChange(callback: (status: NetworkStatus) => void): void {
    this.onNetworkChangeCallbacks.push(callback);
  }

  onSyncError(callback: (error: Error, task: SyncTask) => void): void {
    this.onSyncErrorCallbacks.push(callback);
  }

  /**
   * Stops the background sync service
   */
  async stop(): Promise<void> {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    // Unregister service worker background sync
    if (this.serviceWorkerRegistration && 'sync' in this.serviceWorkerRegistration) {
      // Note: Can't actually unregister background sync tags, but we can stop processing
    }

    this.isProcessing = false;
  }

  // Private methods

  private async processSyncQueue(): Promise<number> {
    if (this.isProcessing || !this.networkStatus.online) {
      return 0;
    }

    this.isProcessing = true;
    let processedCount = 0;

    try {
      const pendingTasks = this.getPendingSyncTasks()
        .slice(0, this.options.batchSize);

      for (const task of pendingTasks) {
        try {
          // Check dependencies
          if (task.dependencies && !this.areDependenciesMet(task.dependencies)) {
            continue;
          }

          // Check if scheduled for later
          if (task.scheduledFor && task.scheduledFor > new Date()) {
            continue;
          }

          const result = await this.executeSyncTask(task);
          this.syncResults.set(task.id, result);
          
          if (result.success) {
            this.syncTasks.delete(task.id);
            await this.removePersistentSyncTask(task.id);
          } else {
            // Update task with retry information
            task.attempts++;
            task.lastAttempt = new Date();
            task.scheduledFor = this.calculateNextRetry(task.attempts);
            await this.persistSyncTask(task);
          }

          // Notify listeners
          this.onSyncCompleteCallbacks.forEach(callback => callback(result));
          processedCount++;

          // Respect network quality - add delays for poor connections
          if (this.networkStatus.quality === 'poor') {
            await this.delay(1000);
          }

        } catch (error) {
          logger.error('Error processing sync task', 'sync', {}, error as Error);
          this.onSyncErrorCallbacks.forEach(callback => 
            callback(error instanceof Error ? error : new Error(String(error)), task)
          );
        }
      }

    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private async executeSyncTask(task: SyncTask): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      // This is where you would implement the actual sync logic
      // For now, we'll simulate the sync operation
      await this.simulateSyncOperation(task);
      
      return {
        taskId: task.id,
        success: true,
        attempts: task.attempts + 1,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
      
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        attempts: task.attempts + 1,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  private async simulateSyncOperation(task: SyncTask): Promise<void> {
    // Real implementation for form submissions and data sync
    const baseUrl = process.env.VITE_API_URL || '/api';
    const endpoint = this.getEndpointForTask(task);
    
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: this.getMethodForTask(task),
      headers: {
        'Content-Type': 'application/json',
        // Add auth headers here if needed
      },
      body: task.data ? JSON.stringify(task.data) : null,
      signal: AbortSignal.timeout(this.options.networkTimeout)
    });

    if (!response.ok) {
      if (response.status === 409) {
        // Conflict - handle specially
        const conflictData = await response.json();
        throw new Error(`CONFLICT:${JSON.stringify(conflictData)}`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Update local data with server response if needed
    const result = await response.json();
    if (result && task.type === 'create' && result.id) {
      // Store server-generated ID for future updates
      await this.updateLocalEntity(task.entity, task.entityId, { serverId: result.id });
    }
  }

  private getEndpointForTask(task: SyncTask): string {
    switch (task.entity) {
      case 'dog': return `/dogs${task.type === 'create' ? '' : `/${task.entityId}`}`;
      case 'person': return `/people${task.type === 'create' ? '' : `/${task.entityId}`}`;
      case 'show': return `/shows${task.type === 'create' ? '' : `/${task.entityId}`}`;
      case 'entry': return `/entries${task.type === 'create' ? '' : `/${task.entityId}`}`;
      case 'club': return `/clubs${task.type === 'create' ? '' : `/${task.entityId}`}`;
      default: return `/${task.entity}${task.type === 'create' ? '' : `/${task.entityId}`}`;
    }
  }

  private getMethodForTask(task: SyncTask): string {
    switch (task.type) {
      case 'create': return 'POST';
      case 'update': return 'PUT';
      case 'delete': return 'DELETE';
      default: return 'POST';
    }
  }

  private async updateLocalEntity(entity: string, entityId: string, updates: Record<string, unknown>): Promise<void> {
    // Update local store with server data
    // This would integrate with your Zustand stores
    try {
      const event = new CustomEvent('sync-entity-updated', {
        detail: { entity, entityId, updates }
      });
      window.dispatchEvent(event);
    } catch (error) {
      logger.warn('Failed to update local entity', 'sync', {}, error as Error);
    }
  }

  private areDependenciesMet(dependencies: string[]): boolean {
    return dependencies.every(depId => {
      const result = this.syncResults.get(depId);
      return result && result.success;
    });
  }

  private calculateNextRetry(attempts: number): Date {
    const delay = this.options.retryDelay * Math.pow(this.options.backoffMultiplier, attempts - 1);
    return new Date(Date.now() + delay);
  }

  private initializeNetworkMonitoring(): void {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.updateNetworkStatus();
      this.processSyncQueue();
    });

    window.addEventListener('offline', () => {
      this.updateNetworkStatus();
    });

    // Monitor connection changes if supported
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection.addEventListener('change', () => {
        this.updateNetworkStatus();
      });
    }
  }

  private updateNetworkStatus(): void {
    const oldStatus = this.networkStatus;
    this.networkStatus = this.getCurrentNetworkStatus();
    
    // Notify listeners if status changed
    if (JSON.stringify(oldStatus) !== JSON.stringify(this.networkStatus)) {
      this.onNetworkChangeCallbacks.forEach(callback => callback(this.networkStatus));
    }
  }

  private getCurrentNetworkStatus(): NetworkStatus {
    const connection = (navigator as any).connection;
    
    const status: NetworkStatus = {
      online: navigator.onLine,
      connectionType: connection?.type || 'unknown',
      effectiveType: connection?.effectiveType || 'unknown',
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
      quality: 'good' // Default
    };

    // Determine quality based on connection info
    if (connection) {
      if (connection.effectiveType === 'slow-2g' || connection.downlink < 0.5) {
        status.quality = 'poor';
      } else if (connection.effectiveType === '4g' && connection.downlink > 2) {
        status.quality = 'excellent';
      }
    }

    return status;
  }

  private async initializeServiceWorker(): Promise<void> {
    if (!this.options.enableServiceWorker || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
      
      // Register for background sync if supported
      if ('sync' in this.serviceWorkerRegistration) {
        // Background sync will be handled by the service worker
        await (this.serviceWorkerRegistration as any).sync.register('background-sync');
      }
    } catch (error) {
      logger.warn('Service Worker registration failed', 'sync', {}, error as Error);
    }
  }

  private startPeriodicSync(): void {
    // Check for pending tasks every 30 seconds
    this.syncIntervalId = window.setInterval(() => {
      if (this.networkStatus.online && this.syncTasks.size > 0) {
        this.processSyncQueue();
      }
    }, 30000);
  }

  private async persistSyncTask(task: SyncTask): Promise<void> {
    try {
      // Store in IndexedDB for persistence across browser sessions
      const request = indexedDB.open('BackgroundSyncDB', 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('syncTasks')) {
          db.createObjectStore('syncTasks', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['syncTasks'], 'readwrite');
        const store = transaction.objectStore('syncTasks');
        store.put(task);
      };
    } catch (error) {
      logger.warn('Failed to persist sync task', 'sync', {}, error as Error);
    }
  }

  private async removePersistentSyncTask(taskId: string): Promise<void> {
    try {
      const request = indexedDB.open('BackgroundSyncDB', 1);
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction(['syncTasks'], 'readwrite');
        const store = transaction.objectStore('syncTasks');
        store.delete(taskId);
      };
    } catch (error) {
      logger.warn('Failed to remove persistent sync task', 'sync', {}, error as Error);
    }
  }

  private generateTaskId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientId(): string {
    let clientId = localStorage.getItem('client_id');
    if (!clientId) {
      clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('client_id', clientId);
    }
    return clientId;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export interface SyncStatistics {
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
  averageRetries: number;
  averageDuration: number;
  networkQuality: string;
  lastSyncAttempt: number;
}

// Export singleton instance
export const backgroundSyncService = new BackgroundSyncService();