import { PerformanceMetrics, SyncPriority } from '../../types/performance-types';
import { eventEmitter } from '../sync/eventEmitter';
import { logger } from '@/services/LoggingService';

interface PerformanceEntry {
  id: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private entries: Map<string, PerformanceEntry> = new Map();
  private completedEntries: PerformanceEntry[] = [];
  private readonly MAX_ENTRIES = 1000;

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string, metadata?: Record<string, unknown>): string {
    const id = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const entry: PerformanceEntry = {
      id,
      operation,
      startTime: performance.now(),
    };
    if (metadata !== undefined) {
      entry.metadata = metadata;
    }
    this.entries.set(id, entry);

    return id;
  }

  /**
   * End timing an operation
   */
  endTimer(id: string, additionalMetadata?: Record<string, unknown>): number | null {
    const entry = this.entries.get(id);
    if (!entry) {
      logger.warn(`Performance timer not found: ${id}`, 'performance', {});
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - entry.startTime;

    const completedEntry: PerformanceEntry = {
      ...entry,
      endTime,
      duration,
      metadata: { ...entry.metadata, ...additionalMetadata }
    };

    this.entries.delete(id);
    this.completedEntries.push(completedEntry);

    // Keep only the most recent entries
    if (this.completedEntries.length > this.MAX_ENTRIES) {
      this.completedEntries.shift();
    }

    // Emit performance event
    eventEmitter.emit('performance:measurement', {
      operation: entry.operation,
      duration,
      metadata: completedEntry.metadata
    });

    return duration;
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(
    operation: string, 
    fn: () => Promise<T> | T,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const id = this.startTimer(operation, metadata);
    
    try {
      const result = await fn();
      this.endTimer(id, { success: true });
      return result;
    } catch (error) {
      this.endTimer(id, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Get performance statistics for an operation
   */
  getStats(operation?: string): PerformanceMetrics | null {
    const relevantEntries = this.completedEntries.filter(
      entry => !operation || entry.operation === operation
    );

    if (relevantEntries.length === 0) {
      return null;
    }

    const durations = relevantEntries
      .map(entry => entry.duration!)
      .filter(duration => duration !== undefined);

    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    const avgDuration = totalDuration / durations.length;
    
    const successfulEntries = relevantEntries.filter(
      entry => entry.metadata?.success !== false
    );

    return {
      sync: {
        totalSyncs: relevantEntries.length,
        successfulSyncs: successfulEntries.length,
        failedSyncs: relevantEntries.length - successfulEntries.length,
        averageDuration: avgDuration,
        throughput: relevantEntries.length / (totalDuration / 1000),
        byPriority: {
          [SyncPriority.CRITICAL]: 0,
          [SyncPriority.HIGH]: 0,
          [SyncPriority.NORMAL]: 0,
          [SyncPriority.LOW]: 0,
          [SyncPriority.BACKGROUND]: 0
        },
        lastSyncTime: new Date()
      },
      network: {
        bytesSent: 0,
        bytesReceived: 0,
        compressionSavings: 0,
        averageRequestSize: 0,
        averageResponseSize: 0,
        networkErrors: 0,
        averageLatency: avgDuration
      },
      storage: {
        totalUsed: 0,
        byEntityType: {},
        cacheHitRate: 0,
        cachedItems: 0,
        quotaUsage: 0
      },
      processing: {
        averageDiffTime: avgDuration,
        averageCompressionTime: 0,
        averageDecompressionTime: 0,
        queueProcessingTime: 0,
        cpuUsage: 0,
        memoryUsage: 0
      },
      errors: {
        totalErrors: relevantEntries.length - successfulEntries.length,
        byType: {},
        errorRate: (relevantEntries.length - successfulEntries.length) / relevantEntries.length,
        recentErrors: []
      }
    };
  }

  /**
   * Get all operations that have been measured
   */
  getOperations(): string[] {
    const operations = new Set(this.completedEntries.map(entry => entry.operation));
    return Array.from(operations);
  }

  /**
   * Clear all performance data
   */
  clear(): void {
    this.entries.clear();
    this.completedEntries = [];
  }

  /**
   * Get raw performance entries for detailed analysis
   */
  getEntries(operation?: string): PerformanceEntry[] {
    return this.completedEntries.filter(
      entry => !operation || entry.operation === operation
    );
  }

  /**
   * Check for performance issues
   */
  checkPerformanceIssues(operation?: string): {
    slowOperations: PerformanceEntry[];
    failedOperations: PerformanceEntry[];
    recommendations: string[];
  } {
    const entries = operation 
      ? this.completedEntries.filter(e => e.operation === operation)
      : this.completedEntries;

    const durations = entries.map(e => e.duration!).filter(d => d !== undefined);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const threshold = avgDuration * 2; // Consider operations 2x slower than average as slow

    const slowOperations = entries.filter(e => e.duration! > threshold);
    const failedOperations = entries.filter(e => e.metadata?.success === false);

    const recommendations: string[] = [];
    
    if (slowOperations.length > entries.length * 0.1) { // More than 10% slow
      recommendations.push('Consider optimizing slow operations or implementing caching');
    }
    
    if (failedOperations.length > entries.length * 0.05) { // More than 5% failed
      recommendations.push('High failure rate detected, review error handling');
    }

    if (avgDuration > 1000) { // Average operation takes more than 1 second
      recommendations.push('Operations are taking too long, consider performance optimization');
    }

    return {
      slowOperations,
      failedOperations,
      recommendations
    };
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();