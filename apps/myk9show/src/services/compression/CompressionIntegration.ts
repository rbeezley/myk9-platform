import { CompressionService } from './CompressionService';
import { CompressionOptions, CompressionResult } from '../../types/performance-types';
import { SyncPayload, SyncOperation } from '../../types/sync-types';
import { logger } from '@/services/LoggingService';

/**
 * Integration service that adds compression capabilities to the sync system
 */
export class CompressionIntegration {
  private static instance: CompressionIntegration;
  private compressionService: CompressionService;
  private compressionEnabled: boolean = true;
  private compressionThreshold: number = 1024; // Only compress payloads > 1KB
  private maxCompressionTime: number = 500; // Max 500ms for compression

  private constructor() {
    this.compressionService = CompressionService.getInstance();
  }

  static getInstance(): CompressionIntegration {
    if (!CompressionIntegration.instance) {
      CompressionIntegration.instance = new CompressionIntegration();
    }
    return CompressionIntegration.instance;
  }

  /**
   * Compress sync payload if beneficial
   */
  async compressSyncPayload(
    payload: SyncPayload,
    options: CompressionOptions = {}
  ): Promise<{
    compressed: boolean;
    data: Uint8Array | SyncPayload;
    metadata?: CompressionResult['metadata'];
    stats: {
      originalSize: number;
      finalSize: number;
      compressionRatio: number;
      compressionTime?: number;
    };
  }> {
    if (!this.compressionEnabled) {
      const serialized = JSON.stringify(payload);
      const size = new TextEncoder().encode(serialized).length;
      return {
        compressed: false,
        data: payload,
        stats: {
          originalSize: size,
          finalSize: size,
          compressionRatio: 0
        }
      };
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(payload);
    } catch (error) {
      // Handle serialization errors (like circular references)
      logger.error('Failed to serialize sync payload', 'compression', {}, error as Error);
      return {
        compressed: false,
        data: payload,
        stats: {
          originalSize: 0,
          finalSize: 0,
          compressionRatio: 0
        }
      };
    }
    
    const originalSize = new TextEncoder().encode(serialized).length;

    // Skip compression for small payloads
    if (originalSize < this.compressionThreshold) {
      return {
        compressed: false,
        data: payload,
        stats: {
          originalSize,
          finalSize: originalSize,
          compressionRatio: 0
        }
      };
    }

    try {
      const startTime = performance.now();
      
      // Set appropriate options for sync payloads
      const compressionOptions: CompressionOptions = {
        ...options,
        algorithm: options.algorithm || this.selectSyncAlgorithm(payload),
        dictionary: options.dictionary || this.selectSyncDictionary(payload)
      };

      const result = await this.compressionService.compress(payload, compressionOptions);
      const compressionTime = performance.now() - startTime;

      // If compression takes too long, skip it for future similar payloads
      if (compressionTime > this.maxCompressionTime) {
        logger.warn(`Compression took ${compressionTime}ms, which exceeds threshold of ${this.maxCompressionTime}ms`, 'compression', { compressionTime, maxCompressionTime: this.maxCompressionTime });
      }

      // Only use compression if it provides meaningful benefit
      const minCompressionRatio = 0.1; // At least 10% reduction
      if (result.compressionRatio < minCompressionRatio) {
        return {
          compressed: false,
          data: payload,
          stats: {
            originalSize,
            finalSize: originalSize,
            compressionRatio: 0,
            compressionTime
          }
        };
      }

      return {
        compressed: true,
        data: result.compressed,
        metadata: result.metadata,
        stats: {
          originalSize,
          finalSize: result.compressedSize,
          compressionRatio: result.compressionRatio,
          compressionTime
        }
      };
    } catch (error) {
      logger.error('Compression failed for sync payload', 'compression', {}, error as Error);
      return {
        compressed: false,
        data: payload,
        stats: {
          originalSize,
          finalSize: originalSize,
          compressionRatio: 0
        }
      };
    }
  }

  /**
   * Decompress sync payload
   */
  async decompressSyncPayload(
    data: Uint8Array,
    metadata: CompressionResult['metadata']
  ): Promise<SyncPayload> {
    try {
      const decompressed = await this.compressionService.decompress(data, metadata);
      return JSON.parse(decompressed);
    } catch (error) {
      logger.error('Decompression failed for sync payload', 'compression', {}, error as Error);
      throw new Error(`Failed to decompress sync payload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Compress batch of sync operations
   */
  async compressSyncBatch(
    operations: SyncOperation[],
    options: CompressionOptions = {}
  ): Promise<{
    compressed: boolean;
    data: Uint8Array | SyncOperation[];
    metadata?: CompressionResult['metadata'];
    stats: {
      originalSize: number;
      finalSize: number;
      compressionRatio: number;
      operationCount: number;
    };
  }> {
    if (!this.compressionEnabled || operations.length === 0) {
      const serialized = JSON.stringify(operations);
      const size = new TextEncoder().encode(serialized).length;
      return {
        compressed: false,
        data: operations,
        stats: {
          originalSize: size,
          finalSize: size,
          compressionRatio: 0,
          operationCount: operations.length
        }
      };
    }

    // Optimize batch for better compression
    const optimizedBatch = this.optimizeBatchForCompression(operations);
    
    const compressionOptions: CompressionOptions = {
      ...options,
      algorithm: options.algorithm || 'lz4', // LZ4 for fast batch processing
      dictionary: 'sync'
    };

    try {
      const result = await this.compressionService.compress(optimizedBatch, compressionOptions);
      const originalSize = new TextEncoder().encode(JSON.stringify(operations)).length;

      return {
        compressed: result.compressionRatio > 0.05, // 5% minimum benefit for batches
        data: result.compressionRatio > 0.05 ? result.compressed : operations,
        metadata: result.compressionRatio > 0.05 ? result.metadata : undefined,
        stats: {
          originalSize,
          finalSize: result.compressionRatio > 0.05 ? result.compressedSize : originalSize,
          compressionRatio: result.compressionRatio > 0.05 ? result.compressionRatio : 0,
          operationCount: operations.length
        }
      };
    } catch (error) {
      logger.error('Failed to compress sync batch', 'compression', {}, error as Error);
      const serialized = JSON.stringify(operations);
      const size = new TextEncoder().encode(serialized).length;
      return {
        compressed: false,
        data: operations,
        stats: {
          originalSize: size,
          finalSize: size,
          compressionRatio: 0,
          operationCount: operations.length
        }
      };
    }
  }

  /**
   * Select optimal compression algorithm for sync payloads
   */
  private selectSyncAlgorithm(payload: SyncPayload): 'gzip' | 'lz4' | 'brotli' | 'custom' {
    const operations = payload.operations || [];
    const hasLargeData = operations.some(op => 
      JSON.stringify(op.data).length > 10000
    );
    
    const hasManyOperations = operations.length > 50;
    const hasRepetitiveData = this.hasRepetitiveOperations(operations);

    // For large payloads with repetitive data, use brotli
    if (hasLargeData && hasRepetitiveData) {
      return 'brotli';
    }

    // For many small operations, use LZ4 for speed
    if (hasManyOperations && !hasLargeData) {
      return 'lz4';
    }

    // For dog show specific data, use custom dictionary
    if (this.hasDogShowData(operations)) {
      return 'custom';
    }

    // Default to gzip for balanced compression/speed
    return 'gzip';
  }

  /**
   * Select appropriate dictionary for sync payloads
   */
  private selectSyncDictionary(payload: SyncPayload): string {
    const operations = payload.operations || [];
    
    if (this.hasDogShowData(operations)) {
      return 'dogShow';
    }

    return 'sync';
  }

  /**
   * Check if operations contain repetitive patterns
   */
  private hasRepetitiveOperations(operations: SyncOperation[]): boolean {
    if (operations.length < 5) return false;

    const entityTypes = operations.map((op: SyncOperation) => op.entityType);
    const uniqueTypes = new Set(entityTypes);
    const repetitionRatio = 1 - (uniqueTypes.size / entityTypes.length);
    
    return repetitionRatio > 0.7; // 70% repetition threshold
  }

  /**
   * Check if operations contain dog show specific data
   */
  private hasDogShowData(operations: SyncOperation[]): boolean {
    const dogShowTerms = ['breed', 'handler', 'judge', 'ring', 'class', 'entry', 'show', 'dog'];
    
    return operations.some(op => {
      const serialized = JSON.stringify(op).toLowerCase();
      return dogShowTerms.some(term => serialized.includes(term));
    });
  }

  /**
   * Optimize batch operations for better compression
   */
  private optimizeBatchForCompression(operations: SyncOperation[]): Record<string, unknown> {
    // Group operations by entity type and operation for better compression
    const grouped = operations.reduce((acc: Record<string, SyncOperation[]>, op: SyncOperation) => {
      const key = `${op.entityType}_${op.operation}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(op);
      return acc;
    }, {} as Record<string, SyncOperation[]>);

    // Extract common fields to reduce redundancy
    const optimized = {
      version: operations[0]?.version || '1.0',
      timestamp: Date.now(),
      groups: Object.entries(grouped).map(([key, ops]: [string, SyncOperation[]]) => {
        const [entityType, operation] = key.split('_');
        return {
          entityType,
          operation,
          count: ops.length,
          operations: ops.map((op: SyncOperation) => ({
            id: op.id,
            data: op.data,
            timestamp: op.timestamp,
            clientId: op.clientId
          }))
        };
      })
    };

    return optimized;
  }

  /**
   * Get compression performance metrics
   */
  getCompressionMetrics(): {
    enabled: boolean;
    threshold: number;
    maxTime: number;
    serviceStats: ReturnType<CompressionService['getStatistics']>;
  } {
    return {
      enabled: this.compressionEnabled,
      threshold: this.compressionThreshold,
      maxTime: this.maxCompressionTime,
      serviceStats: this.compressionService.getStatistics()
    };
  }

  /**
   * Configure compression settings
   */
  configure(options: {
    enabled?: boolean;
    threshold?: number;
    maxTime?: number;
  }): void {
    if (options.enabled !== undefined) {
      this.compressionEnabled = options.enabled;
    }
    if (options.threshold !== undefined) {
      this.compressionThreshold = Math.max(0, options.threshold);
    }
    if (options.maxTime !== undefined) {
      this.maxCompressionTime = Math.max(100, options.maxTime);
    }
  }

  /**
   * Reset compression statistics
   */
  resetMetrics(): void {
    this.compressionService.clearStatistics();
  }

  /**
   * Test compression effectiveness for a given payload
   */
  async testCompression(payload: Record<string, unknown>): Promise<{
    algorithms: Array<{
      algorithm: string;
      compressionRatio: number;
      compressionTime: number;
      compressedSize: number;
    }>;
    recommendation: string;
  }> {
    const algorithms: Array<'gzip' | 'lz4' | 'brotli' | 'custom'> = ['gzip', 'lz4', 'brotli', 'custom'];
    const results = [];

    for (const algorithm of algorithms) {
      try {
        const startTime = performance.now();
        const result = await this.compressionService.compress(payload, { algorithm });
        const compressionTime = performance.now() - startTime;

        results.push({
          algorithm,
          compressionRatio: result.compressionRatio,
          compressionTime,
          compressedSize: result.compressedSize
        });
      } catch (error) {
        logger.warn(`Failed to test ${algorithm} compression`, 'compression', { algorithm }, error as Error);
      }
    }

    // Find best algorithm based on compression ratio and time
    const best = results.reduce((best, current) => {
      const bestScore = best.compressionRatio - (best.compressionTime / 1000); // Subtract time penalty
      const currentScore = current.compressionRatio - (current.compressionTime / 1000);
      return currentScore > bestScore ? current : best;
    }, results[0]);

    return {
      algorithms: results,
      recommendation: best?.algorithm || 'gzip'
    };
  }
}