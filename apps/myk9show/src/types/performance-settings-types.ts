/**
 * Aggregated performance optimization settings
 */

import type { SelectiveSync, FieldLevelSyncConfig, PriorityQueueConfig } from './performance-sync-types';
import type { DifferentialSyncConfig } from './performance-delta-types';
import type { CompressionConfig } from './performance-compression-types';
import type { PerformanceMonitoringConfig } from './performance-metrics-types';
import type { BatchProcessingConfig } from './performance-batch-types';

/**
 * Performance optimization settings
 */
export interface PerformanceOptimizationSettings {
  /** Selective sync configuration */
  selectiveSync: SelectiveSync;

  /** Differential sync configuration */
  differentialSync: DifferentialSyncConfig;

  /** Compression configuration */
  compression: CompressionConfig;

  /** Batch processing configuration */
  batchProcessing: BatchProcessingConfig;

  /** Field-level sync configuration */
  fieldLevelSync: FieldLevelSyncConfig;

  /** Priority queue configuration */
  priorityQueue: PriorityQueueConfig;

  /** Performance monitoring settings */
  monitoring: PerformanceMonitoringConfig;
}
