/**
 * Type definitions for DifferentialSyncService
 *
 * Local interfaces used by the differential sync engine for conflict resolution,
 * delta calculation/application, caching, performance tracking, and JSON Patch operations.
 */

import type { Operation } from 'fast-json-patch';
import type {
  DeltaAlgorithm,
  DeltaCompressionType,
  ConflictResolutionStrategy,
} from '../../types/performance-types';
import type { SyncableEntity } from '../../types/sync-types';

// Extended interfaces for conflict resolution
export interface ConflictableEntity extends SyncableEntity {
  _conflict?: boolean;
  local?: SyncableEntity;
  remote?: SyncableEntity;
  base?: SyncableEntity;
}

export interface ExtendedPatchOperation {
  op: Operation['op'];
  path: string;
  value?: unknown;
  from?: string;
}

export interface DeltaCalculationOptions {
  algorithm?: DeltaAlgorithm;
  compressionType?: DeltaCompressionType;
  includeChecksum?: boolean;
  maxDeltaSize?: number;
  conflictStrategy?: ConflictResolutionStrategy;
}

export interface DeltaApplicationOptions {
  validateChecksum?: boolean;
  rollbackOnError?: boolean;
  trackPerformance?: boolean;
}

export interface ChecksumCache {
  [key: string]: {
    checksum: string;
    timestamp: number;
    data: Record<string, unknown>;
  };
}

export interface DeltaPerformanceMetrics {
  operation: string;
  timestamp: number;
  duration: number;
  operationCount: number;
  algorithm?: string;
  compressionType?: string;
  deltaSize?: number;
  success: boolean;
}

export interface JsonPatchOperationBase {
  op: string;
  path: string;
}

export interface JsonPatchAdd extends JsonPatchOperationBase {
  op: 'add';
  value: unknown;
}

export interface JsonPatchRemove extends JsonPatchOperationBase {
  op: 'remove';
}

export interface JsonPatchReplace extends JsonPatchOperationBase {
  op: 'replace';
  value: unknown;
}

export interface JsonPatchMove extends JsonPatchOperationBase {
  op: 'move';
  from: string;
}

export interface JsonPatchCopy extends JsonPatchOperationBase {
  op: 'copy';
  from: string;
}

export interface JsonPatchTest extends JsonPatchOperationBase {
  op: 'test';
  value: unknown;
}

export type JsonPatchOperation =
  | JsonPatchAdd
  | JsonPatchRemove
  | JsonPatchReplace
  | JsonPatchMove
  | JsonPatchCopy
  | JsonPatchTest;
