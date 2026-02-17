import * as jsonpatch from 'fast-json-patch';
import { diff as deepDiff } from 'deep-object-diff';
import { isEqual, cloneDeep, get, set, unset } from 'lodash';
import { logger } from '@/services/LoggingService';
import {
  DeltaPayload,
  DeltaOperation,
  ConflictResolutionStrategy,
} from '../../types/performance-types';
import { SyncableEntity } from '../../types/sync-types';
import { eventEmitter } from './eventEmitter';

import type {
  ConflictableEntity,
  ExtendedPatchOperation,
  DeltaCalculationOptions,
  DeltaApplicationOptions,
  ChecksumCache,
  DeltaPerformanceMetrics,
  JsonPatchOperation,
} from './differential-sync-types';

import {
  generateDeltaId,
  mapJsonPatchOp,
  mapToJsonPatchOp,
  arrayBuffersEqual,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  processCustomChanges,
  compressDelta,
  decompressDelta,
  calculateChecksum,
  validateDelta as validateDeltaUtil,
  getEntityType,
  getEntityId,
  createEmptyDelta,
  createFullReplacementDelta,
} from './differential-sync-utils';

import {
  CACHE_TTL,
  MAX_DELTA_SIZE,
  CACHE_CLEANUP_INTERVAL,
  METRICS_RETENTION_MS,
} from './differential-sync-constants';

export class DifferentialSyncService {
  private static instance: DifferentialSyncService;
  private checksumCache: ChecksumCache = {};
  private performanceMetrics: Map<string, DeltaPerformanceMetrics> = new Map();

  private constructor() {
    this.startCacheCleanup();
  }

  static getInstance(): DifferentialSyncService {
    if (!DifferentialSyncService.instance) {
      DifferentialSyncService.instance = new DifferentialSyncService();
    }
    return DifferentialSyncService.instance;
  }

  /**
   * Calculate delta between two objects using specified algorithm
   */
  async calculateDelta<T extends SyncableEntity>(
    original: T,
    modified: T,
    options: DeltaCalculationOptions = {}
  ): Promise<DeltaPayload> {
    const startTime = performance.now();

    try {
      const {
        algorithm = 'json-patch',
        compressionType = 'gzip',
        includeChecksum = true,
        maxDeltaSize = MAX_DELTA_SIZE,
      } = options;

      if (isEqual(original, modified)) {
        return createEmptyDelta(original);
      }

      const originalChecksum = includeChecksum ? await calculateChecksum(original) : undefined;
      const modifiedChecksum = includeChecksum ? await calculateChecksum(modified) : undefined;

      const cacheKey = `${originalChecksum}-${modifiedChecksum}`;
      const cachedDelta = this.getCachedDelta(cacheKey);
      if (cachedDelta) {
        return cachedDelta;
      }

      let operations: DeltaOperation[];
      switch (algorithm) {
        case 'json-patch':
          operations = this.calculateJsonPatchDelta(original, modified);
          break;
        case 'binary-diff':
          operations = await this.calculateBinaryDelta(original, modified);
          break;
        case 'custom':
          operations = this.calculateCustomDelta(original, modified);
          break;
        default:
          throw new Error(`Unsupported delta algorithm: ${algorithm}`);
      }

      let deltaPayload: DeltaPayload = {
        id: generateDeltaId(),
        entityType: getEntityType(original),
        entityId: getEntityId(original),
        operations,
        algorithm,
        originalChecksum,
        modifiedChecksum,
        timestamp: Date.now(),
        metadata: {
          originalSize: JSON.stringify(original).length,
          modifiedSize: JSON.stringify(modified).length,
          operationCount: operations.length,
        },
      };

      if (compressionType !== 'none') {
        deltaPayload = await compressDelta(deltaPayload, compressionType);
      }

      const deltaSize = JSON.stringify(deltaPayload).length;
      if (deltaSize > maxDeltaSize) {
        deltaPayload = createFullReplacementDelta(modified, originalChecksum, modifiedChecksum);
      }

      this.cacheDelta(cacheKey, deltaPayload);

      const endTime = performance.now();
      this.trackPerformance('calculateDelta', {
        duration: endTime - startTime,
        algorithm,
        compressionType,
        deltaSize,
        operationCount: operations.length,
      });

      return deltaPayload;
    } catch (error) {
      logger.error('Error calculating delta:', 'sync', {}, error as Error);
      eventEmitter.emit('sync:error', {
        type: 'delta-calculation',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Apply delta to reconstruct modified object
   */
  async applyDelta<T extends SyncableEntity>(
    original: T,
    delta: DeltaPayload,
    options: DeltaApplicationOptions = {}
  ): Promise<T> {
    const startTime = performance.now();
    const {
      validateChecksum = true,
      rollbackOnError = true,
      trackPerformance: shouldTrack = true,
    } = options;

    let result = cloneDeep(original) as T;
    const rollbackState = rollbackOnError ? cloneDeep(original) : null;

    try {
      const decompressedDelta =
        delta.compressionType && delta.compressionType !== 'none'
          ? await decompressDelta(delta)
          : delta;

      if (validateChecksum && decompressedDelta.originalChecksum) {
        const currentChecksum = await calculateChecksum(original);
        if (currentChecksum !== decompressedDelta.originalChecksum) {
          throw new Error('Checksum mismatch: original object has been modified');
        }
      }

      switch (decompressedDelta.algorithm) {
        case 'json-patch':
          result = this.applyJsonPatchDelta(result, decompressedDelta.operations);
          break;
        case 'binary-diff':
          result = await this.applyBinaryDelta(result, decompressedDelta.operations);
          break;
        case 'custom':
          result = this.applyCustomDelta(result, decompressedDelta.operations);
          break;
        default:
          throw new Error(`Unsupported delta algorithm: ${decompressedDelta.algorithm}`);
      }

      if (validateChecksum && decompressedDelta.modifiedChecksum) {
        const resultChecksum = await calculateChecksum(result);
        if (resultChecksum !== decompressedDelta.modifiedChecksum) {
          throw new Error('Checksum mismatch: delta application failed');
        }
      }

      if (shouldTrack) {
        const endTime = performance.now();
        this.trackPerformance('applyDelta', {
          duration: endTime - startTime,
          algorithm: decompressedDelta.algorithm,
          operationCount: decompressedDelta.operations.length,
          success: true,
        });
      }

      eventEmitter.emit('sync:delta-applied', {
        entityType: delta.entityType,
        entityId: delta.entityId,
        operationCount: delta.operations.length,
      });

      return result;
    } catch (error) {
      logger.error('Error applying delta:', 'sync', {}, error as Error);
      if (rollbackOnError && rollbackState) {
        return rollbackState;
      }
      throw error;
    }
  }

  /**
   * Validate delta before application (delegates to pure utility)
   */
  async validateDelta(delta: DeltaPayload) {
    return validateDeltaUtil(delta);
  }

  /**
   * Handle conflicts during delta application
   */
  async resolveConflict(
    local: SyncableEntity,
    remote: SyncableEntity,
    base: SyncableEntity,
    strategy: ConflictResolutionStrategy = 'last-write-wins'
  ): Promise<ConflictableEntity> {
    switch (strategy) {
      case 'last-write-wins':
        return remote;
      case 'first-write-wins':
        return local;
      case 'manual':
        return {
          ...local,
          _conflict: true,
          local,
          remote,
          base,
        } as ConflictableEntity;
      case 'merge':
        return this.attemptAutoMerge(local, remote, base);
      default:
        return remote;
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(operation?: string): Record<string, unknown> | null {
    const relevantMetrics = Array.from(this.performanceMetrics.values()).filter(
      m => !operation || m.operation === operation
    );

    if (relevantMetrics.length === 0) return null;

    const durations = relevantMetrics.map(m => m.duration || 0);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    return {
      operation,
      count: relevantMetrics.length,
      avgDuration,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalOperations: relevantMetrics.reduce((sum, m) => sum + (m.operationCount || 0), 0),
    };
  }

  /**
   * Clear all caches and metrics
   */
  clearCache(): void {
    this.checksumCache = {};
    this.performanceMetrics.clear();
  }

  // === Private: Delta Algorithm Implementations ===

  private calculateJsonPatchDelta<T extends SyncableEntity>(
    original: T,
    modified: T
  ): DeltaOperation[] {
    const patches = jsonpatch.compare(
      original as Record<string, unknown>,
      modified as Record<string, unknown>
    ) as JsonPatchOperation[];

    return patches.map(patch => ({
      type: mapJsonPatchOp(patch.op),
      path: patch.path,
      value: 'value' in patch ? patch.value : undefined,
      oldValue: undefined,
      from: 'from' in patch ? patch.from : undefined,
    }));
  }

  private applyJsonPatchDelta<T extends SyncableEntity>(
    target: T,
    operations: DeltaOperation[]
  ): T {
    const patches = operations
      .map(op => {
        const patchOp: ExtendedPatchOperation = {
          op: mapToJsonPatchOp(op.type) as jsonpatch.Operation['op'],
          path: op.path,
        };
        if (op.value !== undefined) patchOp.value = op.value;
        if (op.from) patchOp.from = op.from;
        return patchOp;
      })
      .filter(
        patch =>
          patch.op === 'remove' ||
          'value' in patch ||
          ((patch.op === 'move' || patch.op === 'copy') && 'from' in patch)
      ) as jsonpatch.Operation[];

    const result = jsonpatch.applyPatch(target as Record<string, unknown>, patches);
    return result.newDocument as T;
  }

  private async calculateBinaryDelta<T extends SyncableEntity>(
    original: T,
    modified: T
  ): Promise<DeltaOperation[]> {
    const encoder = new TextEncoder();
    const originalBuffer = encoder.encode(JSON.stringify(original));
    const modifiedBuffer = encoder.encode(JSON.stringify(modified));

    const operations: DeltaOperation[] = [];
    let offset = 0;

    while (offset < Math.max(originalBuffer.length, modifiedBuffer.length)) {
      const chunkSize = Math.min(
        1024,
        originalBuffer.length - offset,
        modifiedBuffer.length - offset
      );
      const originalChunk = originalBuffer.slice(offset, offset + chunkSize);
      const modifiedChunk = modifiedBuffer.slice(offset, offset + chunkSize);

      if (!arrayBuffersEqual(originalChunk, modifiedChunk)) {
        operations.push({
          type: 'replace',
          path: `/binary/${offset}`,
          value: arrayBufferToBase64(modifiedChunk),
          oldValue: arrayBufferToBase64(originalChunk),
          metadata: { offset, length: chunkSize },
        });
      }
      offset += chunkSize;
    }

    return operations;
  }

  private async applyBinaryDelta<T extends SyncableEntity>(
    target: T,
    operations: DeltaOperation[]
  ): Promise<T> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let targetBuffer = encoder.encode(JSON.stringify(target));

    for (const op of operations) {
      if (op.type === 'replace' && op.metadata?.offset !== undefined) {
        const newData = base64ToArrayBuffer(op.value as string);
        const offset = op.metadata.offset as number;

        if (offset + newData.length > targetBuffer.length) {
          const expandedBuffer = new Uint8Array(offset + newData.length);
          expandedBuffer.set(targetBuffer);
          targetBuffer = expandedBuffer;
        }
        targetBuffer.set(newData, offset);
      }
    }

    return JSON.parse(decoder.decode(targetBuffer));
  }

  private calculateCustomDelta<T extends SyncableEntity>(
    original: T,
    modified: T
  ): DeltaOperation[] {
    const operations: DeltaOperation[] = [];
    const changes = deepDiff(
      original as Record<string, unknown>,
      modified as Record<string, unknown>
    );
    processCustomChanges(changes, operations);
    return operations;
  }

  private applyCustomDelta<T extends SyncableEntity>(target: T, operations: DeltaOperation[]): T {
    const result = cloneDeep(target) as Record<string, unknown>;

    for (const op of operations) {
      switch (op.type) {
        case 'add':
        case 'replace':
          set(result, op.path, op.value);
          break;
        case 'remove':
          unset(result, op.path);
          break;
        case 'move':
          if (op.from) {
            const value = get(result, op.from);
            unset(result, op.from);
            set(result, op.path, value);
          }
          break;
        case 'copy':
          if (op.from) {
            const value = get(result, op.from);
            set(result, op.path, value);
          }
          break;
      }
    }

    return result as T;
  }

  // === Private: Conflict Resolution ===

  private attemptAutoMerge(
    local: SyncableEntity,
    remote: SyncableEntity,
    base: SyncableEntity
  ): SyncableEntity {
    const localDelta = this.calculateCustomDelta(base, local);
    const remoteDelta = this.calculateCustomDelta(base, remote);

    const localPaths = new Set(localDelta.map(op => op.path));
    const remotePaths = new Set(remoteDelta.map(op => op.path));
    const conflicts = Array.from(localPaths).filter(path => remotePaths.has(path));

    if (conflicts.length === 0) {
      let result = cloneDeep(base);
      result = this.applyCustomDelta(result, localDelta);
      result = this.applyCustomDelta(result, remoteDelta);
      return result;
    }

    let result = cloneDeep(base);
    for (const op of [...localDelta, ...remoteDelta]) {
      if (!conflicts.includes(op.path)) {
        result = this.applyCustomDelta(result, [op]);
      }
    }

    for (const path of conflicts) {
      const localOp = localDelta.find(op => op.path === path);
      const remoteOp = remoteDelta.find(op => op.path === path);
      set(result, `${path}_conflict`, {
        local: localOp?.value,
        remote: remoteOp?.value,
        base: get(base, path),
      });
    }

    return result;
  }

  // === Private: Cache Management ===

  private getCachedDelta(key: string): DeltaPayload | null {
    const cached = this.checksumCache[key];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as unknown as DeltaPayload;
    }
    return null;
  }

  private cacheDelta(key: string, delta: DeltaPayload): void {
    this.checksumCache[key] = {
      checksum: key,
      timestamp: Date.now(),
      data: delta as unknown as Record<string, unknown>,
    };
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const key in this.checksumCache) {
        if (now - this.checksumCache[key].timestamp > CACHE_TTL) {
          delete this.checksumCache[key];
        }
      }
    }, CACHE_CLEANUP_INTERVAL);
  }

  // === Private: Performance Tracking ===

  private trackPerformance(operation: string, metrics: Record<string, unknown>): void {
    const key = `${operation}_${Date.now()}`;
    const performanceEntry: DeltaPerformanceMetrics = {
      operation,
      timestamp: Date.now(),
      duration: (metrics.duration as number) || 0,
      operationCount: (metrics.operationCount as number) || 0,
      algorithm: metrics.algorithm as string,
      compressionType: metrics.compressionType as string,
      deltaSize: metrics.deltaSize as number,
      success: metrics.success !== false,
    };

    this.performanceMetrics.set(key, performanceEntry);
    eventEmitter.emit('performance:delta', { operation, metrics: performanceEntry });
    this.cleanOldMetrics();
  }

  private cleanOldMetrics(): void {
    const cutoff = Date.now() - METRICS_RETENTION_MS;
    for (const [key, metric] of this.performanceMetrics) {
      if (metric.timestamp < cutoff) {
        this.performanceMetrics.delete(key);
      }
    }
  }
}

// Export singleton instance
export const differentialSync = DifferentialSyncService.getInstance();
