import { BatchProcessor } from '@/services/sync/BatchProcessor';
import {
  SyncOperation,
  SyncPriority,
  SyncStatus,
  BatchResult,
  BatchMetrics
} from '@/types/performance-types';

interface ProcessingMetrics {
  processedCount: number;
  failedCount: number;
  totalLatency: number;
  throughput: number;
  errorRate: number;
  lastProcessedAt: Date;
}

/**
 * Example: Basic BatchProcessor Usage
 */
export class BasicBatchProcessorExample {
  private batchProcessor: BatchProcessor;

  constructor() {
    // Initialize with basic configuration
    this.batchProcessor = new BatchProcessor({
      maxBatchSize: 100,
      minBatchSize: 10,
      maxParallelBatches: 3,
      batchTimeout: 30000,
      adaptiveSizing: true,
      priorityQueuing: true
    });

    // Set up event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.batchProcessor.on('batch:processed', (result: BatchResult) => {
      console.log(`Batch ${result.batchId} processed:`, {
        successful: result.successful.length,
        failed: result.failed.length,
        conflicts: result.conflicts.length,
        throughput: result.metrics.throughput,
        processingTime: result.metrics.processingTime
      });
    });

    this.batchProcessor.on('batch:retry', (event) => {
      console.log(`Retrying batch (attempt ${event.retryCount}):`, event.batch.id);
    });

    this.batchProcessor.on('batch:failed', (event) => {
      console.error('Batch failed permanently:', event.batch.id, event.error);
    });
  }

  async processDogUpdates(dogs: Record<string, unknown>[]): Promise<void> {
    const operations: SyncOperation[] = dogs.map((dog: Record<string, unknown>) => ({
      id: `dog-${dog.id}`,
      entityType: 'dog',
      entityId: String(dog.id),
      action: 'update',
      data: dog,
      priority: SyncPriority.NORMAL,
      timestamp: new Date(),
      status: SyncStatus.PENDING,
      metadata: {
        source: 'mobile-app',
        version: (dog.version as number) || 1
      }
    }));

    await this.batchProcessor.queueOperations(operations);
  }

  getMetrics() {
    return this.batchProcessor.getMetrics();
  }

  shutdown(): void {
    this.batchProcessor.stopProcessing();
    this.batchProcessor.reset();
  }
}

/**
 * Example: Advanced Configuration with Custom Retry Logic
 */
export class AdvancedBatchProcessorExample {
  private batchProcessor: BatchProcessor;

  constructor() {
    this.batchProcessor = new BatchProcessor({
      maxBatchSize: 500,
      minBatchSize: 20,
      maxParallelBatches: 8,
      batchTimeout: 60000,
      adaptiveSizing: true,
      priorityQueuing: true,
      retryConfig: {
        maxRetries: 5,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2.5
      },
      performanceThresholds: {
        maxLatency: 3000,
        minThroughput: 200,
        maxErrorRate: 0.02
      }
    });

    this.setupAdvancedEventHandlers();
  }

  private setupAdvancedEventHandlers(): void {
    this.batchProcessor.on('batch:processed', (result: BatchResult) => {
      // Advanced metrics tracking
      this.trackBatchMetrics(result);
      
      // Handle conflicts
      if (result.conflicts.length > 0) {
        this.handleConflicts(result.conflicts);
      }
    });

    this.batchProcessor.on('processing:started', () => {
      console.log('Batch processing started at:', new Date().toISOString());
    });

    this.batchProcessor.on('processing:stopped', () => {
      console.log('Batch processing stopped at:', new Date().toISOString());
      this.logFinalMetrics();
    });
  }

  private trackBatchMetrics(result: BatchResult): void {
    // Custom metrics tracking logic
    const metrics = {
      batchId: result.batchId,
      timestamp: new Date(),
      throughput: result.metrics.throughput,
      processingTime: result.metrics.processingTime,
      compressionRatio: result.metrics.compressionRatio,
      successRate: result.metrics.successCount / result.metrics.totalOperations
    };

    // Send to analytics service
    console.log('Batch metrics:', metrics);
  }

  private handleConflicts(conflicts: { entityType: string; entityId: string; id: string }[]): void {
    // Custom conflict resolution logic
    for (const conflict of conflicts) {
      console.warn('Sync conflict detected:', {
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        conflictId: conflict.id
      });
      
      // Implement custom resolution strategy
      // For example: last-write-wins, user-prompt, or merge strategies
    }
  }

  async processMultiEntitySync(data: {
    dogs: Record<string, unknown>[];
    people: Record<string, unknown>[];
    shows: Record<string, unknown>[];
  }): Promise<void> {
    const allOperations: SyncOperation[] = [];

    // Process dogs with high priority
    const dogOperations = data.dogs.map(dog => ({
      id: `dog-${dog.id}`,
      entityType: 'dog',
      entityId: String(dog.id),
      action: (dog.isNew ? 'create' : 'update') as 'create' | 'update',
      data: dog,
      priority: SyncPriority.HIGH,
      timestamp: new Date(),
      status: SyncStatus.PENDING,
      metadata: {
        source: 'web-app',
        version: (dog.version as number) || 1,
        entityGroup: 'dogs'
      }
    }));

    // Process people with normal priority
    const peopleOperations = data.people.map(person => ({
      id: `person-${person.id}`,
      entityType: 'person',
      entityId: String(person.id),
      action: (person.isNew ? 'create' : 'update') as 'create' | 'update',
      data: person,
      priority: SyncPriority.NORMAL,
      timestamp: new Date(),
      status: SyncStatus.PENDING,
      metadata: {
        source: 'web-app',
        version: (person.version as number) || 1,
        entityGroup: 'people'
      }
    }));

    // Process shows with critical priority (time-sensitive)
    const showOperations = data.shows.map(show => ({
      id: `show-${show.id}`,
      entityType: 'show',
      entityId: String(show.id),
      action: (show.isNew ? 'create' : 'update') as 'create' | 'update',
      data: show,
      priority: (show.isUpcoming as boolean) ? SyncPriority.CRITICAL : SyncPriority.HIGH,
      timestamp: new Date(),
      status: SyncStatus.PENDING,
      metadata: {
        source: 'web-app',
        version: (show.version as number) || 1,
        entityGroup: 'shows',
        isTimesensitive: show.isUpcoming as boolean
      }
    }));

    allOperations.push(...dogOperations, ...peopleOperations, ...showOperations);
    await this.batchProcessor.queueOperations(allOperations);
  }

  private logFinalMetrics(): void {
    const metrics = this.batchProcessor.getMetrics();
    console.log('Final processing metrics:', {
      totalQueued: metrics.queueSize,
      activeBatches: metrics.activeBatches,
      finalBatchSize: metrics.currentBatchSize,
      priorityBreakdown: metrics.priorityQueueSizes,
      processingMetrics: Array.from(metrics.processingMetrics.entries())
    });
  }
}

/**
 * Example: Real-time Sync with BatchProcessor
 */
export class RealtimeSyncExample {
  private batchProcessor: BatchProcessor;
  private pendingOperations: Map<string, SyncOperation>;
  private flushInterval?: NodeJS.Timeout;

  constructor() {
    this.batchProcessor = new BatchProcessor({
      maxBatchSize: 50,
      minBatchSize: 1,
      maxParallelBatches: 2,
      batchTimeout: 5000, // Short timeout for real-time feel
      adaptiveSizing: true,
      priorityQueuing: true
    });

    this.pendingOperations = new Map();
    this.setupRealtimeHandlers();
    this.startPeriodicFlush();
  }

  private setupRealtimeHandlers(): void {
    this.batchProcessor.on('batch:processed', (result: BatchResult) => {
      // Notify UI of successful sync
      result.successful.forEach(item => {
        this.notifyUI('sync:success', {
          entityType: item.operation.entityType,
          entityId: item.operation.entityId
        });
      });

      // Handle failures in real-time
      result.failed.forEach(item => {
        this.notifyUI('sync:failed', {
          entityType: item.operation.entityType,
          entityId: item.operation.entityId,
          error: item.error.message
        });
      });
    });
  }

  private notifyUI(event: string, data: Record<string, unknown>): void {
    // Emit to UI components via event system
    window.dispatchEvent(new CustomEvent(event, { detail: data }));
  }

  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushPendingOperations();
    }, 2000); // Flush every 2 seconds
  }

  async addOperation(operation: SyncOperation): Promise<void> {
    // Deduplicate operations by entity
    const key = `${operation.entityType}:${operation.entityId}`;
    this.pendingOperations.set(key, operation);

    // For critical operations, flush immediately
    if (operation.priority === SyncPriority.CRITICAL) {
      await this.flushPendingOperations();
    }
  }

  private async flushPendingOperations(): Promise<void> {
    if (this.pendingOperations.size === 0) return;

    const operations = Array.from(this.pendingOperations.values());
    this.pendingOperations.clear();

    await this.batchProcessor.queueOperations(operations);
  }

  // Real-time event handlers
  async onDogDataChanged(dogId: string, data: Record<string, unknown>): Promise<void> {
    await this.addOperation({
      id: `dog-change-${dogId}-${Date.now()}`,
      entityType: 'dog',
      entityId: dogId,
      action: 'update',
      data,
      priority: SyncPriority.HIGH,
      timestamp: new Date(),
      status: SyncStatus.PENDING,
      metadata: {
        source: 'realtime-edit',
        version: typeof data.version === 'number' ? data.version : 1
      }
    });
  }

  async onShowRegistration(showId: string, registrationData: Record<string, unknown> & { id: string }): Promise<void> {
    await this.addOperation({
      id: `registration-${showId}-${Date.now()}`,
      entityType: 'registration',
      entityId: registrationData.id,
      action: 'create',
      data: registrationData,
      priority: SyncPriority.CRITICAL, // Immediate sync for registrations
      timestamp: new Date(),
      status: SyncStatus.PENDING,
      metadata: {
        source: 'registration-form',
        showId,
        version: 1
      }
    });
  }

  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    // Flush any remaining operations
    this.flushPendingOperations();
    
    this.batchProcessor.stopProcessing();
    this.batchProcessor.reset();
  }
}

/**
 * Example: Performance Monitoring and Optimization
 */
export class PerformanceOptimizedBatchProcessor {
  private batchProcessor: BatchProcessor;
  private performanceLog: Array<{
    timestamp: Date;
    metrics: {
      queueSize: number;
      activeBatches: number;
      currentBatchSize: number;
      processingMetrics: Map<string, ProcessingMetrics>;
      priorityQueueSizes: Record<SyncPriority, number>;
    };
    adjustments: string[];
  }>;

  constructor() {
    this.batchProcessor = new BatchProcessor({
      maxBatchSize: 200,
      minBatchSize: 25,
      maxParallelBatches: 4,
      adaptiveSizing: true,
      performanceThresholds: {
        maxLatency: 2000,
        minThroughput: 300,
        maxErrorRate: 0.01
      }
    });

    this.performanceLog = [];
    this.setupPerformanceMonitoring();
  }

  private setupPerformanceMonitoring(): void {
    // Monitor every 5 seconds
    setInterval(() => {
      this.analyzePerformance();
    }, 5000);

    this.batchProcessor.on('batch:processed', (result: BatchResult) => {
      this.logPerformanceMetrics(result.metrics);
    });
  }

  private analyzePerformance = (): void => {
    const metrics = this.batchProcessor.getMetrics();
    const adjustments: string[] = [];

    // Analyze queue backlog
    if (metrics.queueSize > 1000) {
      adjustments.push('High queue backlog detected - consider increasing parallel batches');
    }

    // Analyze batch efficiency
    if (metrics.currentBatchSize < 50 && metrics.queueSize > 500) {
      adjustments.push('Small batch size with large queue - adaptive sizing may need tuning');
    }

    // Log performance snapshot
    this.performanceLog.push({
      timestamp: new Date(),
      metrics: metrics,
      adjustments
    });

    // Keep only last 100 entries
    if (this.performanceLog.length > 100) {
      this.performanceLog.shift();
    }

    if (adjustments.length > 0) {
      console.warn('Performance adjustments suggested:', adjustments);
    }
  }

  private logPerformanceMetrics = (metrics: BatchMetrics): void => {
    // Custom performance logging
    if (metrics.throughput < 100) {
      console.warn('Low throughput detected:', metrics.throughput);
    }

    if (metrics.processingTime > 5000) {
      console.warn('High processing time detected:', metrics.processingTime);
    }
  }

  getPerformanceReport(): {
    currentMetrics: {
      queueSize: number;
      activeBatches: number;
      currentBatchSize: number;
      processingMetrics: Map<string, ProcessingMetrics>;
      priorityQueueSizes: Record<SyncPriority, number>;
    };
    historicalLog: Array<{
      timestamp: Date;
      metrics: {
        queueSize: number;
        activeBatches: number;
        currentBatchSize: number;
        processingMetrics: Map<string, ProcessingMetrics>;
        priorityQueueSizes: Record<SyncPriority, number>;
      };
      adjustments: string[];
    }>;
    recommendations: string[];
  } {
    const current = this.batchProcessor.getMetrics();
    const recommendations: string[] = [];

    // Generate recommendations based on historical data
    if (this.performanceLog.length > 10) {
      const recent = this.performanceLog.slice(-10);
      const avgQueueSize = recent.reduce((sum, entry) => sum + entry.metrics.queueSize, 0) / recent.length;
      
      if (avgQueueSize > 500) {
        recommendations.push('Consider increasing maxParallelBatches or optimizing operation complexity');
      }

      if (recent.every(entry => entry.metrics.currentBatchSize < 50)) {
        recommendations.push('Batch sizes consistently small - review adaptive sizing configuration');
      }
    }

    return {
      currentMetrics: current,
      historicalLog: this.performanceLog,
      recommendations
    };
  }
}

/**
 * Usage Examples
 */
export const UsageExamples = {
  // Basic usage
  async basicExample() {
    const processor = new BasicBatchProcessorExample();
    
    const mockDogs = [
      { id: '1', name: 'Rex', breed: 'German Shepherd', version: 1 },
      { id: '2', name: 'Bella', breed: 'Golden Retriever', version: 2 }
    ];

    await processor.processDogUpdates(mockDogs);
    
    setTimeout(() => {
      console.log('Current metrics:', processor.getMetrics());
      processor.shutdown();
    }, 5000);
  },

  // Advanced multi-entity sync
  async advancedExample() {
    const processor = new AdvancedBatchProcessorExample();
    
    const mockData = {
      dogs: [
        { id: '1', name: 'Max', isNew: false, version: 3 },
        { id: '2', name: 'Luna', isNew: true, version: 1 }
      ],
      people: [
        { id: '1', name: 'John Doe', isNew: false, version: 2 }
      ],
      shows: [
        { id: '1', name: 'Spring Championship', isNew: false, isUpcoming: true, version: 1 }
      ]
    };

    await processor.processMultiEntitySync(mockData);
  },

  // Real-time sync example
  async realtimeExample() {
    const processor = new RealtimeSyncExample();
    
    // Simulate real-time events
    await processor.onDogDataChanged('dog-1', { name: 'Updated Name', weight: 65 });
    await processor.onShowRegistration('show-1', { 
      id: 'reg-1', 
      dogId: 'dog-1', 
      classId: 'class-1' 
    });

    setTimeout(() => {
      processor.shutdown();
    }, 10000);
  }
};