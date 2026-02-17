/**
 * Batch Processor Constants
 *
 * Default configuration for the BatchProcessor service.
 */

import type { BatchProcessorConfig } from './BatchProcessor.types';

export const DEFAULT_BATCH_CONFIG: BatchProcessorConfig = {
  maxBatchSize: 1000,
  minBatchSize: 10,
  maxParallelBatches: 5,
  batchTimeout: 30000,
  adaptiveSizing: true,
  priorityQueuing: true,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  performanceThresholds: {
    maxLatency: 5000,
    minThroughput: 100,
    maxErrorRate: 0.05,
  },
};
