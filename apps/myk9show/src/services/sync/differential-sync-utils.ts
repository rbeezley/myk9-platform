/**
 * Pure utility functions for DifferentialSyncService
 *
 * These are stateless helpers extracted from the DifferentialSyncService class
 * for delta ID generation, JSON Patch operation mapping, binary encoding/decoding,
 * checksum normalization, and type guards.
 */

import { compress, decompress } from 'fflate';
import type {
  DeltaPayload,
  DeltaOperation,
  DeltaCompressionType,
  DeltaValidationResult,
} from '../../types/performance-types';
import type { SyncableEntity } from '../../types/sync-types';

/**
 * Generate a unique delta identifier
 */
export function generateDeltaId(): string {
  return `delta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Map a JSON Patch operation string to the DeltaOperation type union
 */
export function mapJsonPatchOp(op: string): DeltaOperation['type'] {
  switch (op) {
    case 'add':
      return 'add';
    case 'remove':
      return 'remove';
    case 'replace':
      return 'replace';
    case 'move':
      return 'move';
    case 'copy':
      return 'copy';
    default:
      return 'replace';
  }
}

/**
 * Reverse mapping: DeltaOperation type to JSON Patch operation string
 */
export function mapToJsonPatchOp(type: DeltaOperation['type']): string {
  switch (type) {
    case 'add':
      return 'add';
    case 'remove':
      return 'remove';
    case 'replace':
      return 'replace';
    case 'move':
      return 'move';
    case 'copy':
      return 'copy';
    default:
      return 'replace';
  }
}

/**
 * Compare two Uint8Arrays for equality
 */
export function arrayBuffersEqual(buf1: Uint8Array, buf2: Uint8Array): boolean {
  if (buf1.length !== buf2.length) return false;
  for (let i = 0; i < buf1.length; i++) {
    if (buf1[i] !== buf2[i]) return false;
  }
  return true;
}

/**
 * Encode a Uint8Array to a base64 string
 */
export function arrayBufferToBase64(buffer: Uint8Array): string {
  const bytes = Array.from(buffer);
  const binary = bytes.map(byte => String.fromCharCode(byte)).join('');
  return btoa(binary);
}

/**
 * Decode a base64 string to a Uint8Array
 */
export function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Simple hash function for environments without Web Crypto API.
 * Produces a 64-character hex string to simulate SHA-256 length.
 */
export function simpleHash(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString(16).padStart(64, '0');

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to hex and pad to simulate SHA-256 length
  const hexHash = Math.abs(hash).toString(16);
  return hexHash.padStart(64, '0').substring(0, 64);
}

/**
 * Normalize an object for consistent checksum calculation.
 * Sorts keys alphabetically and strips sync metadata fields.
 */
export function normalizeForChecksum(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(item => normalizeForChecksum(item));
  }

  if (data && typeof data === 'object') {
    const sorted: Record<string, unknown> = {};
    const dataRecord = data as Record<string, unknown>;
    Object.keys(dataRecord)
      .sort()
      .forEach(key => {
        // Skip metadata fields
        if (!['_syncVersion', '_lastSync', '_localOnly'].includes(key)) {
          sorted[key] = normalizeForChecksum(dataRecord[key]);
        }
      });
    return sorted;
  }

  return data;
}

/**
 * Type guard to check if data is a SyncableEntity
 */
export function isSyncableEntity(data: unknown): data is SyncableEntity {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'createdAt' in data &&
    'updatedAt' in data
  );
}

// === Delta Processing ===

/**
 * Recursively process deep-object-diff changes into DeltaOperation array.
 */
export function processCustomChanges(
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
      operations.push({ type: 'remove', path: currentPath, value: null });
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      processCustomChanges(value as Record<string, unknown>, operations, currentPath);
    } else {
      operations.push({ type: 'replace', path: currentPath, value });
    }
  }
}

// === Compression ===

/**
 * Compress a delta payload's operations using fflate.
 */
export async function compressDelta(
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
    operations: [],
    compressedData: arrayBufferToBase64(compressed),
    compressionType,
    compressionRatio: compressed.length / dataToCompress.length,
  };
}

/**
 * Decompress a delta payload's operations.
 */
export async function decompressDelta(delta: DeltaPayload): Promise<DeltaPayload> {
  if (!delta.compressedData || delta.compressionType === 'none') {
    return delta;
  }

  const compressed = base64ToArrayBuffer(delta.compressedData);
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
    compressedData: undefined,
  };
}

// === Checksum ===

/**
 * Calculate a SHA-256 checksum for an object (falls back to simpleHash in non-browser).
 */
export async function calculateChecksum(data: unknown): Promise<string> {
  const normalized = normalizeForChecksum(data);
  const dataString = JSON.stringify(normalized);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    return simpleHash(dataString);
  }
}

// === Validation ===

/**
 * Validate delta structure before application.
 */
export async function validateDelta(delta: DeltaPayload): Promise<DeltaValidationResult> {
  const errors: string[] = [];

  if (!delta.id || !delta.algorithm) {
    errors.push('Invalid delta structure');
  }

  if (!Array.isArray(delta.operations)) {
    errors.push('Operations must be an array');
    return { isValid: false, errors, warnings: [] };
  }

  for (const op of delta.operations) {
    if (!op.type || !op.path) {
      errors.push(`Invalid operation: ${JSON.stringify(op)}`);
    }
  }

  if (delta.originalChecksum && !/^[a-f0-9]{64}$/.test(delta.originalChecksum)) {
    errors.push('Invalid original checksum format');
  }

  if (delta.compressedData && !delta.compressionType) {
    errors.push('Compressed data without compression type');
  }

  return { isValid: errors.length === 0, errors, warnings: [] };
}

// === Entity Helpers ===

/**
 * Extract the entity type from a SyncableEntity.
 */
export function getEntityType(entity: SyncableEntity): string {
  if (entity._sync && 'entityType' in entity._sync) {
    const syncData = entity._sync as { entityType?: string };
    return syncData.entityType || 'unknown';
  }
  return entity.constructor?.name?.toLowerCase() || 'unknown';
}

/**
 * Extract the entity id from a SyncableEntity.
 */
export function getEntityId(entity: SyncableEntity): string {
  return entity.id || 'unknown';
}

/**
 * Create an empty (no-op) delta payload.
 */
export function createEmptyDelta(entity?: SyncableEntity): DeltaPayload {
  return {
    id: generateDeltaId(),
    entityType: entity ? getEntityType(entity) : 'unknown',
    entityId: entity ? getEntityId(entity) : 'unknown',
    operations: [],
    algorithm: 'json-patch',
    timestamp: Date.now(),
  };
}

/**
 * Create a full-replacement delta when patch size exceeds limits.
 */
export function createFullReplacementDelta(
  data: unknown,
  originalChecksum?: string,
  modifiedChecksum?: string
): DeltaPayload {
  const entityType = isSyncableEntity(data) ? getEntityType(data) : 'unknown';
  const entityId = isSyncableEntity(data) ? getEntityId(data) : 'unknown';

  return {
    id: generateDeltaId(),
    entityType,
    entityId,
    operations: [{ type: 'replace', path: '', value: data }],
    algorithm: 'custom',
    originalChecksum,
    modifiedChecksum,
    timestamp: Date.now(),
    metadata: { fullReplacement: true },
  };
}
