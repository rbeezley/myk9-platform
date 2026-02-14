/**
 * Pure utility functions for DifferentialSyncService
 *
 * These are stateless helpers extracted from the DifferentialSyncService class
 * for delta ID generation, JSON Patch operation mapping, binary encoding/decoding,
 * checksum normalization, and type guards.
 */

import type { DeltaOperation } from '../../types/performance-types';
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
    case 'add': return 'add';
    case 'remove': return 'remove';
    case 'replace': return 'replace';
    case 'move': return 'move';
    case 'copy': return 'copy';
    default: return 'replace';
  }
}

/**
 * Reverse mapping: DeltaOperation type to JSON Patch operation string
 */
export function mapToJsonPatchOp(type: DeltaOperation['type']): string {
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
    hash = ((hash << 5) - hash) + char;
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
    Object.keys(dataRecord).sort().forEach(key => {
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
