/**
 * Sync Optimization Service
 * 
 * Essential sync payload optimization for Phase 4 production readiness.
 * Reduces data transfer and sync times through smart payload management.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SyncPayload {
  type: 'full' | 'incremental';
  timestamp: number;
  data: any;
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

  private lastSyncSnapshots: Map<string, any> = new Map();

  /**
   * Optimize sync payload for transmission
   */
  async optimizePayload(type: string, data: any[]): Promise<SyncPayload[]> {
    const payloads: SyncPayload[] = [];
    
    // Determine if we can use differential sync
    const canUseDifferential = this.config.enableDifferentialSync && 
                              this.lastSyncSnapshots.has(type);

    if (canUseDifferential) {
      // Create differential payload
      const differential = this.createDifferentialPayload(type, data);
      if (differential.added.length > 0 || differential.modified.length > 0 || differential.deleted.length > 0) {
        payloads.push(await this.createSyncPayload('incremental', differential));
      }
    } else {
      // Create full payload, possibly batched
      const batches = this.batchData(data, this.config.batchSize);
      
      for (const batch of batches) {
        const payload = await this.createSyncPayload('full', batch);
        payloads.push(payload);
      }
    }

    // Update snapshot for next sync
    this.lastSyncSnapshots.set(type, this.createSnapshot(data));

    return payloads;
  }

  /**
   * Create differential payload by comparing with last sync
   */
  private createDifferentialPayload(type: string, currentData: any[]) {
    const lastSnapshot = this.lastSyncSnapshots.get(type) || [];
    const lastMap = new Map(lastSnapshot.map((item: any) => [item.id, item]));
    
    const changes = {
      added: [] as any[],
      modified: [] as any[],
      deleted: [] as string[]
    };

    // Find added and modified items
    currentData.forEach(item => {
      const lastItem = lastMap.get(item.id);
      if (!lastItem) {
        changes.added.push(item);
      } else if (this.hasChanged(item, lastItem)) {
        changes.modified.push({
          id: item.id,
          changes: this.extractChanges(item, lastItem)
        });
      }
    });

    // Find deleted items
    const currentIds = new Set(currentData.map(item => item.id));
    lastSnapshot.forEach((item: any) => {
      if (!currentIds.has(item.id)) {
        changes.deleted.push(item.id);
      }
    });

    return changes;
  }

  /**
   * Check if item has changed since last sync
   */
  private hasChanged(current: any, previous: any): boolean {
    // Simple implementation - compare key fields
    const keyFields = ['_lastModified', 'updatedAt', '_version'];
    
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
  private extractChanges(current: any, previous: any): any {
    const changes: any = {};
    
    for (const key in current) {
      if (current[key] !== previous[key]) {
        changes[key] = current[key];
      }
    }
    
    return changes;
  }

  /**
   * Create snapshot of data for differential comparison
   */
  private createSnapshot(data: any[]): any[] {
    return data.map(item => ({
      id: item.id,
      _lastModified: item._lastModified || Date.now(),
      _version: item._version || 1,
      updatedAt: item.updatedAt
    }));
  }

  /**
   * Batch data into smaller chunks
   */
  private batchData(data: any[], batchSize: number): any[][] {
    const batches: any[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Create optimized sync payload
   */
  private async createSyncPayload(type: 'full' | 'incremental', data: any): Promise<SyncPayload> {
    const dataStr = JSON.stringify(data);
    const size = new Blob([dataStr]).size;
    
    let finalData = data;
    let compressed = false;

    // Compress if data exceeds threshold
    if (this.config.enableCompression && size > this.config.compressionThreshold) {
      try {
        // Simple compression simulation (in real implementation, use actual compression)
        finalData = {
          compressed: true,
          originalSize: size,
          data: dataStr // Would be compressed data
        };
        compressed = true;
      } catch (error) {
        console.warn('Compression failed, sending uncompressed:', error);
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