/**
 * ConflictResolver - Handles merge conflicts between local and remote data
 *
 * Conflict Resolution Strategies:
 * 1. Last-Write-Wins (LWW): Compare timestamps, newer wins
 * 2. Server-Authoritative: Server data always wins (for scores, placements)
 * 3. Client-Authoritative: Client data always wins (for check-in status, UI state)
 * 4. Field-Level Merge: Merge specific fields based on authority rules
 *
 * **Phase 2 Day 8-9** - Conflict resolution infrastructure
 */

import { logger } from '@/utils/logger';
import type { ConflictStrategy } from './types';

export interface ConflictResolutionResult<T> {
  resolved: T;
  strategy: ConflictStrategy;
  hadConflict: boolean;
  conflictingFields?: string[];
}

export interface FieldAuthority {
  /** Fields where server is authoritative (e.g., scores, placements) */
  serverFields: string[];

  /** Fields where client is authoritative (e.g., check-in status, UI state) */
  clientFields: string[];
}

export class ConflictResolver {
  /**
   * Resolve conflict using Last-Write-Wins strategy
   * Compares updated_at timestamps with microsecond precision
   *
   * Day 25-26 Fix: Handle timestamp precision edge cases
   * - PostgreSQL timestamps have microsecond precision (e.g., 2025-11-10T14:23:45.123456Z)
   * - JavaScript Date only has millisecond precision (e.g., 1699628625123)
   * - If milliseconds match, compare full string to catch microsecond differences
   * - If exact timestamp match, use ID lexicographic comparison for determinism
   */
  resolveLWW<T extends { updated_at?: string; id?: string }>(
    local: T,
    remote: T
  ): ConflictResolutionResult<T> {
    const localTimestamp = local.updated_at || '';
    const remoteTimestamp = remote.updated_at || '';

    // Fast path: No timestamps
    if (!localTimestamp && !remoteTimestamp) {
      return {
        resolved: remote, // Server wins if no timestamps
        strategy: 'last-write-wins',
        hadConflict: false,
      };
    }

    // Convert to milliseconds for primary comparison
    const localTime = localTimestamp ? new Date(localTimestamp).getTime() : 0;
    const remoteTime = remoteTimestamp ? new Date(remoteTimestamp).getTime() : 0;

    // Primary comparison: milliseconds
    if (localTime > remoteTime) {
      logger.log(
        `[ConflictResolver] LWW: local wins (local: ${localTimestamp}, remote: ${remoteTimestamp})`
      );
      return {
        resolved: local,
        strategy: 'last-write-wins',
        hadConflict: true,
      };
    }

    if (remoteTime > localTime) {
      logger.log(
        `[ConflictResolver] LWW: remote wins (local: ${localTimestamp}, remote: ${remoteTimestamp})`
      );
      return {
        resolved: remote,
        strategy: 'last-write-wins',
        hadConflict: true,
      };
    }

    // Edge case: Milliseconds match (same millisecond, different microseconds)
    // Compare full ISO string to detect microsecond differences
    if (localTimestamp !== remoteTimestamp) {
      // String comparison (lexicographic) works for ISO timestamps
      // e.g., "2025-11-10T14:23:45.123456Z" > "2025-11-10T14:23:45.123123Z"
      const stringComparison = localTimestamp.localeCompare(remoteTimestamp);

      if (stringComparison > 0) {
        logger.warn(
          `[ConflictResolver] LWW: Microsecond-level conflict detected! Local wins by microseconds (local: ${localTimestamp}, remote: ${remoteTimestamp})`
        );
        return {
          resolved: local,
          strategy: 'last-write-wins',
          hadConflict: true,
        };
      }

      if (stringComparison < 0) {
        logger.warn(
          `[ConflictResolver] LWW: Microsecond-level conflict detected! Remote wins by microseconds (local: ${localTimestamp}, remote: ${remoteTimestamp})`
        );
        return {
          resolved: remote,
          strategy: 'last-write-wins',
          hadConflict: true,
        };
      }
    }

    // Edge case: Exact timestamp match (truly simultaneous writes)
    // Use ID lexicographic comparison for deterministic resolution
    const localId = local.id || '';
    const remoteId = remote.id || '';

    if (localId && remoteId && localId !== remoteId) {
      const idComparison = localId.localeCompare(remoteId);
      const winner = idComparison > 0 ? 'local' : 'remote';

      logger.warn(
        `[ConflictResolver] LWW: EXACT timestamp match! Using ID tiebreaker (${winner} wins) - local_id: ${localId}, remote_id: ${remoteId}`
      );

      return {
        resolved: idComparison > 0 ? local : remote,
        strategy: 'last-write-wins',
        hadConflict: true,
      };
    }

    // Final fallback: Timestamps and IDs match, no conflict
    return {
      resolved: remote, // Server wins on exact match
      strategy: 'last-write-wins',
      hadConflict: false,
    };
  }

  /**
   * Resolve conflict with server-authoritative strategy
   * Server data always wins (for scores, placements, official data)
   */
  resolveServerAuthoritative<T>(
    _local: T,
    remote: T
  ): ConflictResolutionResult<T> {
    logger.log('[ConflictResolver] Server-authoritative: server wins');

    return {
      resolved: remote,
      strategy: 'server-authoritative',
      hadConflict: true,
    };
  }

  /**
   * Resolve conflict with client-authoritative strategy
   * Client data always wins (for check-in status, UI state, user preferences)
   */
  resolveClientAuthoritative<T>(
    local: T,
    _remote: T
  ): ConflictResolutionResult<T> {
    logger.log('[ConflictResolver] Client-authoritative: client wins');

    return {
      resolved: local,
      strategy: 'client-authoritative',
      hadConflict: true,
    };
  }

  /**
   * Resolve conflict with field-level merge strategy
   * Merge specific fields based on authority rules
   *
   * Strategy:
   * 1. Start with remote data as base (server is source of truth)
   * 2. Override with client-authoritative fields from local
   * 3. Detect conflicts (fields changed in both local and remote)
   */
  resolveFieldLevel<T extends Record<string, any>>(
    local: T,
    remote: T,
    authority: FieldAuthority
  ): ConflictResolutionResult<T> {
    const merged: Record<string, any> = { ...remote }; // Start with server data
    const conflictingFields: string[] = [];

    // Apply client-authoritative fields
    for (const field of authority.clientFields) {
      if (field in local) {
        // Check if this field has a conflict
        const localValue = local[field];
        const remoteValue = remote[field];

        if (
          localValue !== remoteValue &&
          !this.isUndefinedOrNull(localValue) &&
          !this.isUndefinedOrNull(remoteValue)
        ) {
          conflictingFields.push(field);
          logger.log(
            `[ConflictResolver] Field-level conflict on "${field}": local="${localValue}", remote="${remoteValue}" -> using local`
          );
        }

        merged[field] = localValue;
      }
    }

    // Server-authoritative fields are already in merged (from remote base)
    // Log if server fields changed
    for (const field of authority.serverFields) {
      const localValue = local[field];
      const remoteValue = remote[field];

      if (
        localValue !== remoteValue &&
        !this.isUndefinedOrNull(localValue) &&
        !this.isUndefinedOrNull(remoteValue)
      ) {
        logger.log(
          `[ConflictResolver] Field-level: "${field}" server-authoritative: local="${localValue}", remote="${remoteValue}" -> using remote`
        );
      }
    }

    const hadConflict = conflictingFields.length > 0;

    if (hadConflict) {
      logger.log(
        `[ConflictResolver] Field-level merge: ${conflictingFields.length} conflicts resolved`
      );
    }

    return {
      resolved: merged as T,
      strategy: 'field-level-merge',
      hadConflict,
      conflictingFields: hadConflict ? conflictingFields : undefined,
    };
  }

  /**
   * Auto-resolve conflict based on strategy
   */
  resolve<T extends Record<string, any>>(
    local: T,
    remote: T,
    strategy: ConflictStrategy,
    authority?: FieldAuthority
  ): ConflictResolutionResult<T> {
    switch (strategy) {
      case 'last-write-wins':
        return this.resolveLWW(local, remote);

      case 'server-authoritative':
        return this.resolveServerAuthoritative(local, remote);

      case 'client-authoritative':
        return this.resolveClientAuthoritative(local, remote);

      case 'field-level-merge':
        if (!authority) {
          throw new Error(
            'Field-level merge requires authority configuration'
          );
        }
        return this.resolveFieldLevel(local, remote, authority);

      default:
        // Default to LWW
        logger.log(
          `[ConflictResolver] Unknown strategy "${strategy}", falling back to LWW`
        );
        return this.resolveLWW(local, remote);
    }
  }

  /**
   * Check if value is undefined or null
   */
  private isUndefinedOrNull(value: unknown): boolean {
    return value === undefined || value === null;
  }

  /**
   * Deep compare two objects to find conflicting fields
   * Returns list of field names that differ
   */
  findConflictingFields<T extends Record<string, any>>(
    local: T,
    remote: T,
    ignoreFields: string[] = ['updated_at', 'created_at']
  ): string[] {
    const conflicts: string[] = [];
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

    for (const key of allKeys) {
      // Skip ignored fields
      if (ignoreFields.includes(key)) {
        continue;
      }

      const localValue = local[key];
      const remoteValue = remote[key];

      // Only count as conflict if both have non-null values that differ
      if (
        !this.isUndefinedOrNull(localValue) &&
        !this.isUndefinedOrNull(remoteValue) &&
        localValue !== remoteValue
      ) {
        // Deep compare for objects/arrays
        if (
          typeof localValue === 'object' &&
          typeof remoteValue === 'object'
        ) {
          if (JSON.stringify(localValue) !== JSON.stringify(remoteValue)) {
            conflicts.push(key);
          }
        } else {
          conflicts.push(key);
        }
      }
    }

    return conflicts;
  }

  /**
   * Create a conflict log entry for monitoring/debugging
   */
  logConflict<T>(
    tableName: string,
    rowId: string,
    local: T,
    remote: T,
    resolution: ConflictResolutionResult<T>
  ): void {
    const conflictLog = {
      timestamp: new Date().toISOString(),
      tableName,
      rowId,
      strategy: resolution.strategy,
      conflictingFields: resolution.conflictingFields,
      localData: local,
      remoteData: remote,
      resolvedData: resolution.resolved,
    };

    // Log to console (could send to analytics/monitoring service)
    logger.log('[ConflictResolver] Conflict resolved:', conflictLog);

    // Optionally: Store in IndexedDB for audit trail
    // await this.storeConflictLog(conflictLog);

    // Optionally: Dispatch event for UI notification
    window.dispatchEvent(
      new CustomEvent('replication:conflict-resolved', {
        detail: {
          tableName,
          rowId,
          strategy: resolution.strategy,
          fieldsAffected: resolution.conflictingFields?.length || 0,
        },
      })
    );
  }
}

// Singleton instance
export const conflictResolver = new ConflictResolver();
