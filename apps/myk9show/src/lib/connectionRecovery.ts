// Connection recovery and retry mechanisms
// Phase 3.3: Enhanced Error Handling & Recovery

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNetworkStatus } from './offlineHandler';
import { errorMonitor } from './errorMonitoring';
import { logger } from '@/services/LoggingService';

// Retry configuration interface
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: Error, attempt: number) => boolean;
}

// Connection status interface
export interface ConnectionStatus {
  isConnected: boolean;
  isRecovering: boolean;
  reconnectAttempts: number;
  lastConnectionTime?: Date;
  lastDisconnectionTime?: Date;
  connectionQuality: 'poor' | 'fair' | 'good' | 'excellent';
  avgResponseTime: number;
}

// Default retry configurations for different operations
export const RETRY_CONFIGS: Record<string, RetryConfig> = {
  // Critical operations (user auth, payments)
  critical: {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error, attempt) => {
      // Don't retry client errors (4xx) except 408, 429
      if (error.message.includes('4') && 
          !error.message.includes('408') && 
          !error.message.includes('429')) {
        return false;
      }
      return attempt < 5;
    }
  },
  
  // Standard operations (CRUD operations)
  standard: {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      // Retry network errors and server errors
      return error.message.includes('network') || 
             error.message.includes('5') ||
             error.message.includes('timeout');
    }
  },
  
  // Background operations (sync, analytics)
  background: {
    maxAttempts: 10,
    baseDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 1.5,
    jitter: true,
    retryCondition: () => true, // Always retry background operations
  },
  
  // Real-time operations (live updates)
  realtime: {
    maxAttempts: 20,
    baseDelay: 100,
    maxDelay: 5000,
    backoffMultiplier: 1.2,
    jitter: false,
    retryCondition: (error, attempt) => {
      // Quick retries for real-time operations
      return attempt < 20;
    }
  }
};

// Exponential backoff calculator
export class BackoffCalculator {
  static calculateDelay(
    attempt: number,
    config: RetryConfig
  ): number {
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
    
    if (config.jitter) {
      // Add random jitter to prevent thundering herd
      const jitterAmount = cappedDelay * 0.1; // 10% jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
      return Math.max(0, cappedDelay + jitter);
    }
    
    return cappedDelay;
  }
  
  static getTotalRetryTime(config: RetryConfig): number {
    let total = 0;
    for (let i = 1; i <= config.maxAttempts; i++) {
      total += this.calculateDelay(i, config);
    }
    return total;
  }
}

// Retry execution engine
export class RetryEngine {
  private activeRetries = new Map<string, AbortController>();
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    operationId?: string
  ): Promise<T> {
    const retryId = operationId || `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Cancel any existing retry for this operation
    if (this.activeRetries.has(retryId)) {
      this.activeRetries.get(retryId)!.abort();
    }
    
    const abortController = new AbortController();
    this.activeRetries.set(retryId, abortController);
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        // Check if operation was cancelled
        if (abortController.signal.aborted) {
          throw new Error('Operation cancelled');
        }
        
        const result = await operation();
        
        // Success - clean up and return
        this.activeRetries.delete(retryId);
        return result;
        
      } catch (error) {
        lastError = error as Error;
        
        // Log error for monitoring
        errorMonitor.captureError(lastError, {
          additionalData: {
            retryAttempt: attempt,
            maxAttempts: config.maxAttempts,
            operationId: retryId,
          }
        });
        
        // Check if we should retry
        const shouldRetry = attempt < config.maxAttempts && 
                           (!config.retryCondition || config.retryCondition(lastError, attempt));
        
        if (!shouldRetry) {
          break;
        }
        
        // Calculate delay for next attempt
        const delay = BackoffCalculator.calculateDelay(attempt, config);
        
        logger.warn('Retry attempt failed', 'connection', {
          attempt,
          maxAttempts: config.maxAttempts,
          delayMs: delay,
          error: lastError.message,
          operationId: retryId,
        });
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // All retries exhausted - clean up and throw
    this.activeRetries.delete(retryId);
    throw lastError!;
  }
  
  cancelRetry(operationId: string): void {
    const controller = this.activeRetries.get(operationId);
    if (controller) {
      controller.abort();
      this.activeRetries.delete(operationId);
    }
  }
  
  cancelAllRetries(): void {
    this.activeRetries.forEach(controller => controller.abort());
    this.activeRetries.clear();
  }
  
  getActiveRetries(): string[] {
    return Array.from(this.activeRetries.keys());
  }
}

// Connection health monitor
export class ConnectionHealthMonitor {
  private responseTimeSamples: number[] = [];
  private maxSamples = 10;
  private testInterval = 30000; // 30 seconds
  private healthCheckUrl = '/api/health'; // Would be actual health endpoint
  
  constructor() {
    this.startHealthMonitoring();
  }
  
  private startHealthMonitoring(): void {
    if (typeof window === 'undefined') return;
    
    setInterval(() => {
      this.performHealthCheck();
    }, this.testInterval);
  }
  
  private async performHealthCheck(): Promise<void> {
    try {
      const startTime = performance.now();
      
      // Simulate health check (in production, would be actual API call)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
      
      const responseTime = performance.now() - startTime;
      this.recordResponseTime(responseTime);
      
    } catch (error) {
      // Health check failed - record as very slow response
      this.recordResponseTime(10000);
      
      errorMonitor.captureError(error as Error, {
        operationType: 'read',
        additionalData: {
          type: 'health_check',
          url: this.healthCheckUrl,
        }
      });
    }
  }
  
  private recordResponseTime(responseTime: number): void {
    this.responseTimeSamples.push(responseTime);
    
    if (this.responseTimeSamples.length > this.maxSamples) {
      this.responseTimeSamples.shift();
    }
  }
  
  getAverageResponseTime(): number {
    if (this.responseTimeSamples.length === 0) return 0;
    
    const sum = this.responseTimeSamples.reduce((acc, time) => acc + time, 0);
    return sum / this.responseTimeSamples.length;
  }
  
  getConnectionQuality(): ConnectionStatus['connectionQuality'] {
    const avgResponseTime = this.getAverageResponseTime();
    
    if (avgResponseTime < 100) return 'excellent';
    if (avgResponseTime < 300) return 'good';
    if (avgResponseTime < 1000) return 'fair';
    return 'poor';
  }
  
  isHealthy(): boolean {
    return this.getAverageResponseTime() < 5000; // Consider healthy if under 5 seconds
  }
}

// Connection recovery manager
export class ConnectionRecoveryManager {
  private retryEngine = new RetryEngine();
  private healthMonitor = new ConnectionHealthMonitor();
  private recoveryQueue: Array<{
    id: string;
    operation: () => Promise<unknown>;
    config: RetryConfig;
    priority: 'high' | 'medium' | 'low';
  }> = [];
  private isRecovering = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  
  constructor(private queryClient: { getQueryCache: () => { getAll: () => unknown[] } }) {
    this.setupConnectionRecovery();
  }
  
  private setupConnectionRecovery(): void {
    if (typeof window === 'undefined') return;
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.handleConnectionRestored();
    });
    
    window.addEventListener('offline', () => {
      this.handleConnectionLost();
    });
  }
  
  private async handleConnectionRestored(): Promise<void> {
    logger.info('Connection restored - starting recovery process', 'connection');
    this.isRecovering = true;
    this.reconnectAttempts = 0;
    
    try {
      // Wait a moment for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Retry failed queries
      await this.retryFailedQueries();
      
      // Process recovery queue
      await this.processRecoveryQueue();
      
      logger.info('Connection recovery completed successfully', 'connection');

    } catch (error) {
      logger.error('Connection recovery failed', 'connection', {}, error as Error);
      errorMonitor.captureError(error as Error, {
        additionalData: {
          type: 'connection_recovery',
          reconnectAttempts: this.reconnectAttempts,
        }
      });
    } finally {
      this.isRecovering = false;
    }
  }
  
  private handleConnectionLost(): void {
    logger.warn('Connection lost - pausing operations', 'connection');

    // Cancel ongoing retries
    this.retryEngine.cancelAllRetries();
    
    // Clear recovery queue of low priority items
    this.recoveryQueue = this.recoveryQueue.filter(item => item.priority === 'high');
  }
  
  private async retryFailedQueries(): Promise<void> {
    const queries = this.queryClient.getQueryCache().getAll();
    const failedQueries = queries.filter((query: unknown) => (query as { state: { error: unknown } }).state.error) as Array<{ fetch: () => Promise<unknown>; queryHash: string }>;
    
    logger.info('Retrying failed queries', 'connection', { count: failedQueries.length });

    for (const query of failedQueries) {
      try {
        await this.retryEngine.executeWithRetry(
          () => query.fetch(),
          RETRY_CONFIGS.standard,
          `recovery_query_${query.queryHash}`
        );
      } catch (error) {
        logger.warn('Failed to recover query', 'connection', { queryHash: query.queryHash }, error as Error);
      }
    }
  }
  
  private async processRecoveryQueue(): Promise<void> {
    // Sort by priority
    const sortedQueue = [...this.recoveryQueue].sort((a, b) => {
      const priorities = { high: 3, medium: 2, low: 1 };
      return priorities[b.priority] - priorities[a.priority];
    });
    
    logger.info('Processing queued operations', 'connection', { count: sortedQueue.length });

    for (const item of sortedQueue) {
      try {
        await this.retryEngine.executeWithRetry(
          item.operation,
          item.config,
          item.id
        );

        // Remove from queue on success
        this.recoveryQueue = this.recoveryQueue.filter(q => q.id !== item.id);

      } catch (error) {
        logger.warn('Failed to recover operation', 'connection', { operationId: item.id }, error as Error);
      }
    }
  }
  
  // Add operation to recovery queue
  queueForRecovery(
    operation: () => Promise<unknown>,
    config: RetryConfig = RETRY_CONFIGS.standard,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): string {
    const id = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.recoveryQueue.push({
      id,
      operation,
      config,
      priority,
    });
    
    // Limit queue size
    if (this.recoveryQueue.length > 100) {
      this.recoveryQueue = this.recoveryQueue
        .filter(item => item.priority === 'high')
        .concat(
          this.recoveryQueue
            .filter(item => item.priority !== 'high')
            .slice(-50)
        );
    }
    
    return id;
  }
  
  // Execute operation with retry and recovery
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    config: RetryConfig = RETRY_CONFIGS.standard,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<T> {
    try {
      return await this.retryEngine.executeWithRetry(operation, config);
    } catch (error) {
      // If operation failed and we're offline, queue for recovery
      if (!navigator.onLine || !this.healthMonitor.isHealthy()) {
        this.queueForRecovery(operation, config, priority);
        throw error;
      }
      
      throw error;
    }
  }
  
  getConnectionStatus(): ConnectionStatus {
    const avgResponseTime = this.healthMonitor.getAverageResponseTime();
    
    return {
      isConnected: navigator.onLine && this.healthMonitor.isHealthy(),
      isRecovering: this.isRecovering,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectionTime: undefined, // Would track in production
      lastDisconnectionTime: undefined, // Would track in production
      connectionQuality: this.healthMonitor.getConnectionQuality(),
      avgResponseTime,
    };
  }
  
  getRecoveryStats() {
    return {
      activeRetries: this.retryEngine.getActiveRetries().length,
      queuedOperations: this.recoveryQueue.length,
      queuedByPriority: {
        high: this.recoveryQueue.filter(q => q.priority === 'high').length,
        medium: this.recoveryQueue.filter(q => q.priority === 'medium').length,
        low: this.recoveryQueue.filter(q => q.priority === 'low').length,
      },
      isRecovering: this.isRecovering,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// Hook for connection recovery
export const useConnectionRecovery = () => {
  const queryClient = useQueryClient();
  const networkStatus = useNetworkStatus();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: true,
    isRecovering: false,
    reconnectAttempts: 0,
    connectionQuality: 'good',
    avgResponseTime: 0,
  });
  
  const recoveryManagerRef = useRef<ConnectionRecoveryManager>();
  
  if (!recoveryManagerRef.current) {
    recoveryManagerRef.current = new ConnectionRecoveryManager(queryClient);
  }
  
  const recoveryManager = recoveryManagerRef.current;
  
  // Update connection status
  useEffect(() => {
    const updateStatus = () => {
      setConnectionStatus(recoveryManager.getConnectionStatus());
    };
    
    updateStatus();
    const interval = setInterval(updateStatus, 5000); // Update every 5 seconds
    
    return () => clearInterval(interval);
  }, [recoveryManager]);
  
  const executeWithRetry = useCallback(async <T>(
    operation: () => Promise<T>,
    config: RetryConfig = RETRY_CONFIGS.standard,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<T> => {
    return recoveryManager.executeWithRecovery(operation, config, priority);
  }, [recoveryManager]);
  
  const queueForRecovery = useCallback((
    operation: () => Promise<unknown>,
    config: RetryConfig = RETRY_CONFIGS.standard,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): string => {
    return recoveryManager.queueForRecovery(operation, config, priority);
  }, [recoveryManager]);
  
  return {
    connectionStatus,
    networkStatus,
    executeWithRetry,
    queueForRecovery,
    recoveryStats: recoveryManager.getRecoveryStats(),
    retryConfigs: RETRY_CONFIGS,
  };
};