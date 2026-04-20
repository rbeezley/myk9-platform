/**
 * ConflictResolver - Handles merge conflicts between local and remote data
 *
 * Ported from @myk9/q to shared package @myk9/replication.
 */

import type { ConflictStrategy, ConflictResolutionResult, FieldAuthority } from '../types';
import { noopLogger, type Logger } from '../dependencies';

export class ConflictResolver {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || noopLogger;
  }

  /**
   * Resolve conflict using Last-Write-Wins strategy
   */
  resolveLWW<T extends { updated_at?: string; id?: string }>(
    local: T,
    remote: T
  ): ConflictResolutionResult<T> {
    const localTimestamp = local.updated_at || '';
    const remoteTimestamp = remote.updated_at || '';

    if (!localTimestamp && !remoteTimestamp) {
      return {
        resolvedEntity: remote,
        strategy: 'last-write-wins',
        hadConflict: false,
        automatic: true,
      };
    }

    const localTime = localTimestamp ? new Date(localTimestamp).getTime() : 0;
    const remoteTime = remoteTimestamp ? new Date(remoteTimestamp).getTime() : 0;

    if (localTime > remoteTime) {
      this.logger.log(
        `[ConflictResolver] LWW: local wins (${localTimestamp} > ${remoteTimestamp})`
      );
      return {
        resolvedEntity: local,
        strategy: 'last-write-wins',
        hadConflict: true,
        automatic: true,
      };
    }

    if (remoteTime > localTime) {
      this.logger.log(
        `[ConflictResolver] LWW: remote wins (${remoteTimestamp} > ${localTimestamp})`
      );
      return {
        resolvedEntity: remote,
        strategy: 'last-write-wins',
        hadConflict: true,
        automatic: true,
      };
    }

    // Microsecond level check
    if (localTimestamp !== remoteTimestamp) {
      const stringComparison = localTimestamp.localeCompare(remoteTimestamp);
      if (stringComparison > 0) {
        return {
          resolvedEntity: local,
          strategy: 'last-write-wins',
          hadConflict: true,
          automatic: true,
        };
      }
      if (stringComparison < 0) {
        return {
          resolvedEntity: remote,
          strategy: 'last-write-wins',
          hadConflict: true,
          automatic: true,
        };
      }
    }

    // ID tiebreaker
    const localId = String(local.id || '');
    const remoteId = String(remote.id || '');
    if (localId && remoteId && localId !== remoteId) {
      const idComparison = localId.localeCompare(remoteId);
      return {
        resolvedEntity: idComparison > 0 ? local : remote,
        strategy: 'last-write-wins',
        hadConflict: true,
        automatic: true,
      };
    }

    return {
      resolvedEntity: remote,
      strategy: 'last-write-wins',
      hadConflict: false,
      automatic: true,
    };
  }

  resolveServerAuthoritative<T>(_local: T, remote: T): ConflictResolutionResult<T> {
    return {
      resolvedEntity: remote,
      strategy: 'server-authoritative',
      hadConflict: true,
      automatic: true,
    };
  }

  resolveClientAuthoritative<T>(local: T, _remote: T): ConflictResolutionResult<T> {
    return {
      resolvedEntity: local,
      strategy: 'client-authoritative',
      hadConflict: true,
      automatic: true,
    };
  }

  resolveFieldLevel<T extends Record<string, any>>(
    local: T,
    remote: T,
    authority: FieldAuthority
  ): ConflictResolutionResult<T> {
    const merged: Record<string, any> = { ...remote };
    const conflictingFields: string[] = [];

    for (const field of authority.clientFields) {
      if (field in local) {
        const localValue = local[field];
        const remoteValue = remote[field];
        if (
          localValue !== remoteValue &&
          !this.isUndefinedOrNull(localValue) &&
          !this.isUndefinedOrNull(remoteValue)
        ) {
          conflictingFields.push(field);
        }
        // Only overwrite with the local value when it is a real write (not null/undefined).
        // A null/undefined local value means "no local opinion on this field"; keep the
        // server's value so we don't silently clobber real data (B1 fix).
        if (!this.isUndefinedOrNull(localValue)) {
          merged[field] = localValue;
        }
      }
    }

    const hadConflict = conflictingFields.length > 0;
    return {
      resolvedEntity: merged as T,
      strategy: 'field-level-merge',
      hadConflict,
      conflictingFields: hadConflict ? conflictingFields : undefined,
      automatic: true,
    };
  }

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
        if (!authority) throw new Error('Field-level merge requires authority configuration');
        return this.resolveFieldLevel(local, remote, authority);
      default:
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
   */
  findConflictingFields<T extends Record<string, any>>(
    local: T,
    remote: T,
    ignoreFields: string[] = ['updated_at', 'created_at']
  ): string[] {
    const conflicts: string[] = [];
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

    for (const key of allKeys) {
      if (ignoreFields.includes(key)) continue;

      const localValue = local[key];
      const remoteValue = remote[key];

      if (
        !this.isUndefinedOrNull(localValue) &&
        !this.isUndefinedOrNull(remoteValue) &&
        localValue !== remoteValue
      ) {
        if (typeof localValue === 'object' && typeof remoteValue === 'object') {
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
   * Log conflict for monitoring
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
      resolvedData: resolution.resolvedEntity,
    };

    this.logger.log(`[ConflictResolver] Conflict resolved:`, conflictLog);

    if (typeof window !== 'undefined') {
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
}

export const conflictResolver = new ConflictResolver();
