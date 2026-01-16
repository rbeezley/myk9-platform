/**
 * Sync Conflict Resolver - Stub Implementation
 * 
 * This is a temporary stub to resolve import errors.
 * Full implementation will be added when sync functionality is developed.
 */

import { ConflictResolution, ResolutionStrategy, Conflict } from '@/types/conflict-types';
import { logger } from '@/services/LoggingService';

export class SyncConflictResolver {
  /**
   * Resolve conflicts between local and remote data
   */
  static async resolveConflict(
    localData: unknown,
    remoteData: unknown,
    strategy: ResolutionStrategy = 'user_decides'
  ): Promise<ConflictResolution> {
    logger.warn('SyncConflictResolver stub: resolveConflict called but not implemented', 'sync', {});
    
    return {
      conflictId: `stub-${Date.now()}`,
      strategy,
      resolvedEntity: localData, // Default to local for now
      resolvedAt: new Date(),
      resolvedBy: 'system',
      automatic: false
    } as ConflictResolution;
  }

  /**
   * Auto-resolve conflicts using configured strategy
   */
  static async autoResolve(_conflict: Conflict): Promise<ConflictResolution | null> {
    logger.warn('SyncConflictResolver stub: autoResolve called but not implemented', 'sync', {});
    return null;
  }

  /**
   * Check if a conflict can be auto-resolved
   */
  static canAutoResolve(_conflict: Conflict): boolean {
    return false; // Conservative approach - require manual resolution
  }
}