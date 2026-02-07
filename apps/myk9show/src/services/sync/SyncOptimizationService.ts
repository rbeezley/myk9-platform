import { logger } from '@/services/LoggingService';
import { isObject } from '@myk9/core';

/**
 * Sync Optimization Service
 *
 * Essential sync payload optimization for Phase 4 production readiness.
 * Reduces data transfer and sync times through smart payload management.
 */

/**
 * Base interface for syncable entities
 */
export interface SyncableEntity {
  id: string | number;
  _lastModified?: number;
  _version?: number;
  updatedAt?: string | number;
}

/**
 * Differential sync changes
 */
export interface DifferentialChanges<T extends SyncableEntity = SyncableEntity> {
  added: T[];
  modified: Array<{ id: string | number; changes: Partial<T> }>;
  deleted: Array<string | number>;
}

/**
 * Compressed data container
 */
export interface CompressedData {
  compressed: true;
  originalSize: number;
  data: string;
}

/**
 * Generic sync payload
 */
export interface SyncPayload<T = unknown> {
  type: 'full' | 'incremental';
  timestamp: number;
  data: T | CompressedData;
  checksum?: string;
  compressed: boolean;
}

export interface SyncOptimizationConfig {
  enableCompression: boolean;
  compressionThreshold: number; // bytes
  enableDifferentialSync: boolean;
  maxPayloadSize: number; // bytes
  batchSize: number;
}

export class SyncOptimizationService {
  private config: SyncOptimizationConfig = {
    enableCompression: true,
    compressionThreshold: 1024, // 1KB
    enableDifferentialSync: true,
    maxPayloadSize: 1024 * 1024, // 1MB
    batchSize: 100
  };

  private lastSyncSnapshots: Map<string, SyncableEntity[]> = new Map();

  /**
   * Optimize sync payload for transmission
   */
  async optimizePayload<T extends SyncableEntity>(
    type: string,
    data: T[]
  ): Promise<Array<SyncPayload<T | DifferentialChanges<T>>>> {
    const payloads: Array<SyncPayload<T | DifferentialChanges<T>>> = [];

    // Determine if we can use differential sync
    const canUseDifferential = this.config.enableDifferentialSync &&
                              this.lastSyncSnapshots.has(type);

    if (canUseDifferential) {
      // Create differential payload
      const differential = this.createDifferentialPayload(type, data);
      if (differential.added.length > 0 || differential.modified.length > 0 || differential.deleted.length > 0) {
        payloads.push(await this.createSyncPayload<DifferentialChanges<T>>('incremental', differential));
      }
    } else {
      // Create full payload, possibly batched
      const batches = this.batchData(data, this.config.batchSize);

      for (const batch of batches) {
        const payload = await this.createSyncPayload<T[]>('full', batch);
        payloads.push(payload);
      }
    }

    // Update snapshot for next sync
    this.lastSyncSnapshots.set(type, data);

    return payloads;
  }

  /**
   * Create differential payload by comparing with last sync
   */
  private createDifferentialPayload<T extends SyncableEntity>(
    type: string,
    currentData: T[]
  ): DifferentialChanges<T> {
    const lastSnapshot = this.lastSyncSnapshots.get(type) || [];
    const lastMap = new Map(lastSnapshot.map(item => [item.id, item]));

    const changes: DifferentialChanges<T> = {
      added: [],
      modified: [],
      deleted: []
    };

    // Find added and modified items
    currentData.forEach(item => {
      const lastItem = lastMap.get(item.id);
      if (!lastItem) {
        changes.added.push(item);
      } else if (this.hasChanged(item, lastItem)) {
        changes.modified.push({
          id: item.id,
          changes: this.extractChanges(item, lastItem) as Partial<T>
        });
      }
    });

    // Find deleted items
    const currentIds = new Set(currentData.map(item => item.id));
    lastSnapshot.forEach(item => {
      if (!currentIds.has(item.id)) {
        changes.deleted.push(item.id);
      }
    });

    return changes;
  }

  /**
   * Check if item has changed since last sync
   */
  private hasChanged(current: SyncableEntity, previous: SyncableEntity): boolean {
    // Simple implementation - compare key fields
    const keyFields: Array<keyof SyncableEntity> = ['_lastModified', 'updatedAt', '_version'];

    for (const field of keyFields) {
      if (current[field] !== previous[field]) {
        return true;
      }
    }

    // Fallback to JSON comparison for other changes
    return JSON.stringify(current) !== JSON.stringify(previous);
  }

  /**
   * Extract specific changes between items
   */
  private extractChanges<T extends SyncableEntity>(
    current: T,
    previous: SyncableEntity
  ): Partial<T> {
    const changes: Partial<T> = {};

    // Type-safe iteration over keys
    (Object.keys(current) as Array<keyof T>).forEach(key => {
      if (isObject(previous) && key in previous) {
        const prevValue = (previous as Record<string, unknown>)[key as string];
        if (current[key] !== prevValue) {
          changes[key] = current[key];
        }
      } else {
        changes[key] = current[key];
      }
    });

    return changes;
  }

  /**
   * Batch data into smaller chunks
   */
  private batchData<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Create optimized sync payload
   */
  private async createSyncPayload<T>(
    type: 'full' | 'incremental',
    data: T
  ): Promise<SyncPayload<T>> {
    const dataStr = JSON.stringify(data);
    const size = new Blob([dataStr]).size;

    let finalData: T | CompressedData = data;
    let compressed = false;

    // Compress if data exceeds threshold
    if (this.config.enableCompression && size > this.config.compressionThreshold) {
      try {
        // Simple compression simulation (in real implementation, use actual compression)
        const compressedData: CompressedData = {
          compressed: true,
          originalSize: size,
          data: dataStr // Would be compressed data
        };
        finalData = compressedData;
        compressed = true;
      } catch (error) {
        logger.warn('Compression failed, sending uncompressed:', 'sync', {}, error as Error);
      }
    }

    return {
      type,
      timestamp: Date.now(),
      data: finalData,
      checksum: this.calculateChecksum(dataStr),
      compressed
    };
  }

  /**
   * Calculate checksum for data integrity
   */
  private calculateChecksum(data: string): string {
    // Simple hash implementation
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    return {
      config: this.config,
      snapshotTypes: Array.from(this.lastSyncSnapshots.keys()),
      snapshotCount: this.lastSyncSnapshots.size
    };
  }

  /**
   * Update optimization configuration
   */
  updateConfig(newConfig: Partial<SyncOptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear sync snapshots (useful for testing or reset)
   */
  clearSnapshots(): void {
    this.lastSyncSnapshots.clear();
  }
}

// Service instance
let syncOptimizationService: SyncOptimizationService | null = null;

export function getSyncOptimizationService(): SyncOptimizationService {
  if (!syncOptimizationService) {
    syncOptimizationService = new SyncOptimizationService();
  }
  return syncOptimizationService;
}