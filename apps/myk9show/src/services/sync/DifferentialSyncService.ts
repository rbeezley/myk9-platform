import { compress, decompress } from 'fflate';
import * as jsonpatch from 'fast-json-patch';
import { diff as deepDiff } from 'deep-object-diff';
import { isEqual, cloneDeep, get, set, unset } from 'lodash';
import { logger } from '@/services/LoggingService';
import {
  DeltaPayload, 
  DeltaOperation, 
  DeltaAlgorithm,
  DeltaCompressionType,
  DeltaValidationResult,
  ConflictResolutionStrategy
} from '../../types/performance-types';
import { SyncableEntity } from '../../types/sync-types';
import { eventEmitter } from './eventEmitter';

// Extended interfaces for conflict resolution
interface ConflictableEntity extends SyncableEntity {
  _conflict?: boolean;
  local?: SyncableEntity;
  remote?: SyncableEntity;
  base?: SyncableEntity;
}

interface ExtendedPatchOperation {
  op: jsonpatch.Operation['op'];
  path: string;
  value?: unknown;
  from?: string;
}

interface DeltaCalculationOptions {
  algorithm?: DeltaAlgorithm;
  compressionType?: DeltaCompressionType;
  includeChecksum?: boolean;
  maxDeltaSize?: number;
  conflictStrategy?: ConflictResolutionStrategy;
}

interface DeltaApplicationOptions {
  validateChecksum?: boolean;
  rollbackOnError?: boolean;
  trackPerformance?: boolean;
}

interface ChecksumCache {
  [key: string]: {
    checksum: string;
    timestamp: number;
    data: Record<string, unknown>;
  };
}

interface DeltaPerformanceMetrics {
  operation: string;
  timestamp: number;
  duration: number;
  operationCount: number;
  algorithm?: string;
  compressionType?: string;
  deltaSize?: number;
  success: boolean;
}

interface JsonPatchOperationBase {
  op: string;
  path: string;
}

interface JsonPatchAdd extends JsonPatchOperationBase {
  op: 'add';
  value: unknown;
}

interface JsonPatchRemove extends JsonPatchOperationBase {
  op: 'remove';
}

interface JsonPatchReplace extends JsonPatchOperationBase {
  op: 'replace';
  value: unknown;
}

interface JsonPatchMove extends JsonPatchOperationBase {
  op: 'move';
  from: string;
}

interface JsonPatchCopy extends JsonPatchOperationBase {
  op: 'copy';
  from: string;
}

interface JsonPatchTest extends JsonPatchOperationBase {
  op: 'test';
  value: unknown;
}

type JsonPatchOperation = JsonPatchAdd | JsonPatchRemove | JsonPatchReplace | JsonPatchMove | JsonPatchCopy | JsonPatchTest;


export class DifferentialSyncService {
  private static instance: DifferentialSyncService;
  private checksumCache: ChecksumCache = {};
  private performanceMetrics: Map<string, DeltaPerformanceMetrics> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_DELTA_SIZE = 1024 * 1024; // 1MB

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
        maxDeltaSize = this.MAX_DELTA_SIZE
      } = options;

      // Quick equality check
      if (isEqual(original, modified)) {
        return this.createEmptyDelta(original);
      }

      // Calculate checksums
      const originalChecksum = includeChecksum ? await this.calculateChecksum(original) : undefined;
      const modifiedChecksum = includeChecksum ? await this.calculateChecksum(modified) : undefined;

      // Check cache for existing delta
      const cacheKey = `${originalChecksum}-${modifiedChecksum}`;
      const cachedDelta = this.getCachedDelta(cacheKey);
      if (cachedDelta) {
        return cachedDelta;
      }

      // Calculate delta operations
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

      // Create delta payload
      let deltaPayload: DeltaPayload = {
        id: this.generateDeltaId(),
        entityType: this.getEntityType(original),
        entityId: this.getEntityId(original),
        operations,
        algorithm,
        originalChecksum,
        modifiedChecksum,
        timestamp: Date.now(),
        metadata: {
          originalSize: JSON.stringify(original).length,
          modifiedSize: JSON.stringify(modified).length,
          operationCount: operations.length
        }
      };

      // Compress if needed
      if (compressionType !== 'none') {
        deltaPayload = await this.compressDelta(deltaPayload, compressionType);
      }

      // Validate delta size
      const deltaSize = JSON.stringify(deltaPayload).length;
      if (deltaSize > maxDeltaSize) {
        // Fall back to full replacement if delta is too large
        deltaPayload = this.createFullReplacementDelta(modified, originalChecksum, modifiedChecksum);
      }

      // Cache the delta
      this.cacheDelta(cacheKey, deltaPayload);

      // Track performance
      const endTime = performance.now();
      this.trackPerformance('calculateDelta', {
        duration: endTime - startTime,
        algorithm,
        compressionType,
        deltaSize,
        operationCount: operations.length
      });

      return deltaPayload;
    } catch (error) {
      logger.error('Error calculating delta:', 'sync', {}, error as Error);
      eventEmitter.emit('sync:error', {
        type: 'delta-calculation',
        error: error instanceof Error ? error.message : 'Unknown error'
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
      trackPerformance = true
    } = options;

    let result = cloneDeep(original) as T;
    const rollbackState = rollbackOnError ? cloneDeep(original) : null;

    try {
      // Decompress delta if needed
      const decompressedDelta = delta.compressionType && delta.compressionType !== 'none'
        ? await this.decompressDelta(delta)
        : delta;

      // Validate checksum if provided
      if (validateChecksum && decompressedDelta.originalChecksum) {
        const currentChecksum = await this.calculateChecksum(original);
        if (currentChecksum !== decompressedDelta.originalChecksum) {
          throw new Error('Checksum mismatch: original object has been modified');
        }
      }

      // Apply operations based on algorithm
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

      // Validate result checksum if provided
      if (validateChecksum && decompressedDelta.modifiedChecksum) {
        const resultChecksum = await this.calculateChecksum(result);
        if (resultChecksum !== decompressedDelta.modifiedChecksum) {
          throw new Error('Checksum mismatch: delta application failed');
        }
      }

      // Track performance
      if (trackPerformance) {
        const endTime = performance.now();
        this.trackPerformance('applyDelta', {
          duration: endTime - startTime,
          algorithm: decompressedDelta.algorithm,
          operationCount: decompressedDelta.operations.length,
          success: true
        });
      }

      eventEmitter.emit('sync:delta-applied', {
        entityType: delta.entityType,
        entityId: delta.entityId,
        operationCount: delta.operations.length
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
   * Calculate JSON Patch delta
   */
  private calculateJsonPatchDelta<T extends SyncableEntity>(original: T, modified: T): DeltaOperation[] {
    const patches = jsonpatch.compare(original as Record<string, unknown>, modified as Record<string, unknown>) as JsonPatchOperation[];
    
    return patches.map(patch => ({
      type: this.mapJsonPatchOp(patch.op),
      path: patch.path,
      value: 'value' in patch ? patch.value : undefined,
      oldValue: undefined, // JSON patch doesn't provide old values
      from: 'from' in patch ? patch.from : undefined
    }));
  }

  /**
   * Apply JSON Patch delta
   */
  private applyJsonPatchDelta<T extends SyncableEntity>(target: T, operations: DeltaOperation[]): T {
    const patches = operations.map(op => {
      const patchOp: ExtendedPatchOperation = {
        op: this.mapToJsonPatchOp(op.type) as jsonpatch.Operation['op'],
        path: op.path
      };
      
      if (op.value !== undefined) {
        patchOp.value = op.value;
      }
      
      if (op.from) {
        patchOp.from = op.from;
      }
      
      return patchOp;
    }).filter(patch => 
      patch.op === 'remove' || 
      'value' in patch || 
      (patch.op === 'move' || patch.op === 'copy') && 'from' in patch
    ) as jsonpatch.Operation[];

    const result = jsonpatch.applyPatch(target as Record<string, unknown>, patches);
    return result.newDocument as T;
  }

  /**
   * Calculate binary delta (for large data)
   */
  private async calculateBinaryDelta<T extends SyncableEntity>(original: T, modified: T): Promise<DeltaOperation[]> {
    const encoder = new TextEncoder();
    const originalBuffer = encoder.encode(JSON.stringify(original));
    const modifiedBuffer = encoder.encode(JSON.stringify(modified));

    // Simple binary diff implementation
    const operations: DeltaOperation[] = [];
    let offset = 0;

    while (offset < Math.max(originalBuffer.length, modifiedBuffer.length)) {
      const chunkSize = Math.min(1024, originalBuffer.length - offset, modifiedBuffer.length - offset);
      const originalChunk = originalBuffer.slice(offset, offset + chunkSize);
      const modifiedChunk = modifiedBuffer.slice(offset, offset + chunkSize);

      if (!this.arrayBuffersEqual(originalChunk, modifiedChunk)) {
        operations.push({
          type: 'replace',
          path: `/binary/${offset}`,
          value: this.arrayBufferToBase64(modifiedChunk),
          oldValue: this.arrayBufferToBase64(originalChunk),
          metadata: {
            offset,
            length: chunkSize
          }
        });
      }

      offset += chunkSize;
    }

    return operations;
  }

  /**
   * Apply binary delta
   */
  private async applyBinaryDelta<T extends SyncableEntity>(target: T, operations: DeltaOperation[]): Promise<T> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let targetBuffer = encoder.encode(JSON.stringify(target));

    for (const op of operations) {
      if (op.type === 'replace' && op.metadata?.offset !== undefined) {
        const newData = this.base64ToArrayBuffer(op.value as string);
        const offset = op.metadata.offset as number;
        
        // Expand buffer if needed
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

  /**
   * Calculate custom delta (optimized for specific entities)
   */
  private calculateCustomDelta<T extends SyncableEntity>(original: T, modified: T): DeltaOperation[] {
    const operations: DeltaOperation[] = [];
    const changes = deepDiff(original as Record<string, unknown>, modified as Record<string, unknown>);

    this.processCustomChanges(changes, operations);
    return operations;
  }

  /**
   * Apply custom delta
   */
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

  /**
   * Process custom changes into operations
   */
  private processCustomChanges(
    changes: unknown,
    operations: DeltaOperation[],
    path: string = ''
  ): void {
    if (!changes || typeof changes !== 'object') {
      return;
    }

    const changesRecord = changes as Record<string, unknown>;
    for (const [key, value] of Object.entries(changesRecord)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (value === undefined) {
        operations.push({
          type: 'remove',
          path: currentPath,
          value: null
        });
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.processCustomChanges(value as Record<string, unknown>, operations, currentPath);
      } else {
        operations.push({
          type: 'replace',
          path: currentPath,
          value
        });
      }
    }
  }

  /**
   * Compress delta payload
   */
  private async compressDelta(
    delta: DeltaPayload,
    compressionType: DeltaCompressionType
  ): Promise<DeltaPayload> {
    if (compressionType === 'none') {
      return delta;
    }

    const dataToCompress = JSON.stringify(delta.operations);
    const compressed = await new Promise<Uint8Array>((resolve, reject) => {
      compress(
        new TextEncoder().encode(dataToCompress),
        { level: compressionType === 'gzip' ? 6 : 9 },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });

    return {
      ...delta,
      operations: [], // Clear original operations
      compressedData: this.arrayBufferToBase64(compressed),
      compressionType,
      compressionRatio: compressed.length / dataToCompress.length
    };
  }

  /**
   * Decompress delta payload
   */
  private async decompressDelta(delta: DeltaPayload): Promise<DeltaPayload> {
    if (!delta.compressedData || delta.compressionType === 'none') {
      return delta;
    }

    const compressed = this.base64ToArrayBuffer(delta.compressedData);
    const decompressed = await new Promise<Uint8Array>((resolve, reject) => {
      decompress(compressed, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const operations = JSON.parse(new TextDecoder().decode(decompressed));
    
    return {
      ...delta,
      operations,
      compressedData: undefined
    };
  }

  /**
   * Calculate checksum for an object using Web Crypto API or fallback
   */
  private async calculateChecksum(data: unknown): Promise<string> {
    const normalized = this.normalizeForChecksum(data);
    const dataString = JSON.stringify(normalized);
    
    // Check if we're in a browser environment with Web Crypto API
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataString);
      
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } else {
      // Fallback for Node.js/test environment - simple hash
      return this.simpleHash(dataString);
    }
  }

  /**
   * Simple hash function for environments without Web Crypto API
   */
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString(16).padStart(64, '0');
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to hex and pad to simulate SHA-256 length
    const hexHash = Math.abs(hash).toString(16);
    return hexHash.padStart(64, '0').substring(0, 64);
  }

  /**
   * Normalize object for consistent checksum calculation
   */
  private normalizeForChecksum(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeForChecksum(item));
    }
    
    if (data && typeof data === 'object') {
      const sorted: Record<string, unknown> = {};
      const dataRecord = data as Record<string, unknown>;
      Object.keys(dataRecord).sort().forEach(key => {
        // Skip metadata fields
        if (!['_syncVersion', '_lastSync', '_localOnly'].includes(key)) {
          sorted[key] = this.normalizeForChecksum(dataRecord[key]);
        }
      });
      return sorted;
    }
    
    return data;
  }

  /**
   * Validate delta before application
   */
  async validateDelta(delta: DeltaPayload): Promise<DeltaValidationResult> {
    const errors: string[] = [];

    // Validate structure
    if (!delta.id || !delta.algorithm) {
      errors.push('Invalid delta structure');
    }

    // Ensure operations is an array
    if (!Array.isArray(delta.operations)) {
      errors.push('Operations must be an array');
      return {
        isValid: false,
        errors,
        warnings: []
      };
    }

    // Validate operations
    for (const op of delta.operations) {
      if (!op.type || !op.path) {
        errors.push(`Invalid operation: ${JSON.stringify(op)}`);
      }
    }

    // Validate checksum format
    if (delta.originalChecksum && !/^[a-f0-9]{64}$/.test(delta.originalChecksum)) {
      errors.push('Invalid original checksum format');
    }

    // Validate compression
    if (delta.compressedData && !delta.compressionType) {
      errors.push('Compressed data without compression type');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
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
        // Return conflict markers for manual resolution
        return {
          ...local,
          _conflict: true,
          local,
          remote,
          base
        } as ConflictableEntity;
      
      case 'merge':
        // Attempt automatic merge
        return this.attemptAutoMerge(local, remote, base);
      
      default:
        return remote;
    }
  }

  /**
   * Attempt automatic merge of conflicting changes
   */
  private attemptAutoMerge(local: SyncableEntity, remote: SyncableEntity, base: SyncableEntity): SyncableEntity {
    const localDelta = this.calculateCustomDelta(base, local);
    const remoteDelta = this.calculateCustomDelta(base, remote);

    // Check for conflicting paths
    const localPaths = new Set(localDelta.map(op => op.path));
    const remotePaths = new Set(remoteDelta.map(op => op.path));
    
    const conflicts = Array.from(localPaths).filter(path => remotePaths.has(path));

    if (conflicts.length === 0) {
      // No conflicts, apply both deltas
      let result = cloneDeep(base);
      result = this.applyCustomDelta(result, localDelta);
      result = this.applyCustomDelta(result, remoteDelta);
      return result;
    }

    // Has conflicts, mark them
    let result = cloneDeep(base);
    
    // Apply non-conflicting changes
    for (const op of [...localDelta, ...remoteDelta]) {
      if (!conflicts.includes(op.path)) {
        result = this.applyCustomDelta(result, [op]);
      }
    }

    // Mark conflicts
    for (const path of conflicts) {
      const localOp = localDelta.find(op => op.path === path);
      const remoteOp = remoteDelta.find(op => op.path === path);
      
      set(result, `${path}_conflict`, {
        local: localOp?.value,
        remote: remoteOp?.value,
        base: get(base, path)
      });
    }

    return result;
  }

  /**
   * Helper methods
   */
  private generateDeltaId(): string {
    return `delta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getEntityType(entity: SyncableEntity): string {
    // SyncableEntity only has id, createdAt, updatedAt, and optional _sync
    // We'll use a generic approach or metadata from _sync
    if (entity._sync && 'entityType' in entity._sync) {
      const syncData = entity._sync as { entityType?: string };
      return syncData.entityType || 'unknown';
    }
    // Fallback: try to infer from constructor name or use unknown
    return entity.constructor?.name?.toLowerCase() || 'unknown';
  }

  private getEntityId(entity: SyncableEntity): string {
    return entity.id || 'unknown';
  }

  private createEmptyDelta(entity?: SyncableEntity): DeltaPayload {
    return {
      id: this.generateDeltaId(),
      entityType: entity ? this.getEntityType(entity) : 'unknown',
      entityId: entity ? this.getEntityId(entity) : 'unknown',
      operations: [],
      algorithm: 'json-patch',
      timestamp: Date.now()
    };
  }

  private createFullReplacementDelta(
    data: unknown,
    originalChecksum?: string,
    modifiedChecksum?: string
  ): DeltaPayload {
    // Try to extract entity info if data is a SyncableEntity
    const entityType = this.isSyncableEntity(data) ? this.getEntityType(data) : 'unknown';
    const entityId = this.isSyncableEntity(data) ? this.getEntityId(data) : 'unknown';
    
    return {
      id: this.generateDeltaId(),
      entityType,
      entityId,
      operations: [{
        type: 'replace',
        path: '',
        value: data
      }],
      algorithm: 'custom',
      originalChecksum,
      modifiedChecksum,
      timestamp: Date.now(),
      metadata: {
        fullReplacement: true
      }
    };
  }

  private mapJsonPatchOp(op: string): DeltaOperation['type'] {
    switch (op) {
      case 'add': return 'add';
      case 'remove': return 'remove';
      case 'replace': return 'replace';
      case 'move': return 'move';
      case 'copy': return 'copy';
      default: return 'replace';
    }
  }

  private mapToJsonPatchOp(type: DeltaOperation['type']): string {
    switch (type) {
      case 'add': return 'add';
      case 'remove': return 'remove';
      case 'replace': return 'replace';
      case 'move': return 'move';
      case 'copy': return 'copy';
      default: return 'replace';
    }
  }

  /**
   * Cache management
   */
  private getCachedDelta(key: string): DeltaPayload | null {
    const cached = this.checksumCache[key];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data as unknown as DeltaPayload;
    }
    return null;
  }

  private cacheDelta(key: string, delta: DeltaPayload): void {
    this.checksumCache[key] = {
      checksum: key,
      timestamp: Date.now(),
      data: delta as unknown as Record<string, unknown>
    };
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const key in this.checksumCache) {
        if (now - this.checksumCache[key].timestamp > this.CACHE_TTL) {
          delete this.checksumCache[key];
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Performance tracking
   */
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
      success: metrics.success !== false
    };
    
    this.performanceMetrics.set(key, performanceEntry);

    // Emit performance event
    eventEmitter.emit('performance:delta', {
      operation,
      metrics: performanceEntry
    });

    // Clean old metrics
    this.cleanOldMetrics();
  }

  private cleanOldMetrics(): void {
    const cutoff = Date.now() - (60 * 60 * 1000); // 1 hour
    for (const [key, metric] of this.performanceMetrics) {
      if (metric.timestamp < cutoff) {
        this.performanceMetrics.delete(key);
      }
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(operation?: string): Record<string, unknown> | null {
    const relevantMetrics = Array.from(this.performanceMetrics.values())
      .filter(m => !operation || m.operation === operation);

    if (relevantMetrics.length === 0) {
      return null;
    }

    const durations = relevantMetrics.map(m => m.duration || 0);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    
    return {
      operation,
      count: relevantMetrics.length,
      avgDuration,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalOperations: relevantMetrics.reduce((sum, m) => sum + (m.operationCount || 0), 0)
    };
  }

  /**
   * Clear all caches and metrics
   */
  clearCache(): void {
    this.checksumCache = {};
    this.performanceMetrics.clear();
  }

  /**
   * Helper methods for browser-compatible array buffer operations
   */
  private arrayBuffersEqual(buf1: Uint8Array, buf2: Uint8Array): boolean {
    if (buf1.length !== buf2.length) return false;
    for (let i = 0; i < buf1.length; i++) {
      if (buf1[i] !== buf2[i]) return false;
    }
    return true;
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    const bytes = Array.from(buffer);
    const binary = bytes.map(byte => String.fromCharCode(byte)).join('');
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Type guard to check if data is a SyncableEntity
   */
  private isSyncableEntity(data: unknown): data is SyncableEntity {
    return (
      typeof data === 'object' &&
      data !== null &&
      'id' in data &&
      'createdAt' in data &&
      'updatedAt' in data
    );
  }
}

// Export singleton instance
export const differentialSync = DifferentialSyncService.getInstance();