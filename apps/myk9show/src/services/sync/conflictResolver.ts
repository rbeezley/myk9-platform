/**
 * Conflict Resolution Service
 * Phase 6.3: Sync & Offline Systems
 *
 * Intelligent conflict resolution with multiple strategies for handling
 * data conflicts in offline-first architecture.
 */

import { errorMonitor } from '../../lib/errorMonitoring';
import { logger } from '@/services/LoggingService';
import type {
  SyncConflict,
  ResolutionStrategy,
  EnhancedConflictResolution,
} from '../../types/sync-types';
import {
  DEFAULT_CONFLICT_RESOLVER_CONFIG,
  CLEANUP_INTERVAL_MS,
  createInitialMetrics,
} from './conflictResolver.constants';
import {
  deepEqual,
  categorizeConflict,
  analyzeFieldConflict,
  resolveFieldConflict,
  selectDefaultFieldValue,
} from './conflictResolver.helpers';
import type {
  ConflictResolverConfig,
  ConflictMetrics,
  MergeResult,
} from './conflictResolver.types';

// Re-export types for external consumers
export type {
  ConflictResolverConfig,
  ConflictMetrics,
  FieldConflict,
  MergeResult,
} from './conflictResolver.types';

/**
 * Advanced Conflict Resolution Engine
 */
export class ConflictResolver {
  private config: ConflictResolverConfig;
  private conflicts = new Map<string, SyncConflict>();
  private metrics: ConflictMetrics;
  private userPreferences = new Map<string, ResolutionStrategy>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(customConfig?: Partial<ConflictResolverConfig>) {
    this.config = {
      ...DEFAULT_CONFLICT_RESOLVER_CONFIG,
      ...customConfig,
    };

    this.metrics = createInitialMetrics();
    this.startCleanupRoutine();
  }

  /**
   * Detect and register a new conflict
   */
  detectConflict(
    entityType: string,
    entityId: string,
    localData: Record<string, unknown>,
    remoteData: Record<string, unknown>,
    baseData?: Record<string, unknown>
  ): SyncConflict | null {
    // Quick check - if data is identical, no conflict
    if (deepEqual(localData, remoteData)) {
      return null;
    }

    const conflictId = `conflict-${entityType}-${entityId}-${Date.now()}`;
    const conflict: SyncConflict = {
      id: conflictId,
      entityType,
      entityId,
      localData,
      remoteData,
      ...(baseData !== undefined && { baseData }),
      detectedAt: new Date(),
      createdAt: new Date(),
      priority: 'medium',
      status: 'pending',
      conflictType: categorizeConflict(localData, remoteData, baseData),
      conflictFields: [],
      lastModified: {
        local: new Date(), // Placeholder - should be actual modification time
        remote: new Date(), // Placeholder - should be actual modification time
      },
      lastModifiedBy: {
        local: 'current-user', // Placeholder - should be actual user
        remote: 'remote-user', // Placeholder - should be actual user
      },
      syncMetadata: {
        localVersion: 1,
        remoteVersion: 1,
        syncAttempts: 0,
      },
    };

    this.conflicts.set(conflictId, conflict);
    this.metrics.totalConflicts++;
    this.metrics.conflictsByEntity[entityType] =
      (this.metrics.conflictsByEntity[entityType] || 0) + 1;

    logger.debug('Conflict detected', 'sync', { conflictId, entityType, entityId });

    // Try auto-resolution if enabled
    if (this.shouldAutoResolve(conflict)) {
      return this.autoResolve(conflict);
    }

    return conflict;
  }

  /**
   * Resolve a conflict with specified strategy
   */
  async resolveConflict(
    conflictId: string,
    strategy: ResolutionStrategy,
    customData?: Record<string, unknown>
  ): Promise<EnhancedConflictResolution> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    const startTime = Date.now();

    try {
      const resolution = await this.applyResolutionStrategy(conflict, strategy, customData);

      // Update conflict status
      conflict.status = 'resolved';

      // Update metrics
      this.updateResolutionMetrics(strategy, Date.now() - startTime);

      // Store user preference if applicable
      if (this.config.enableUserPreferences && strategy !== 'user_decides') {
        this.userPreferences.set(conflict.entityType, strategy);
      }

      logger.debug('Conflict resolved', 'sync', { conflictId, strategy });
      return resolution;
    } catch (error) {
      conflict.status = 'escalated'; // Use valid status instead of 'rejected'
      errorMonitor.captureError(error as Error, {
        additionalData: { conflictId, strategy },
      });
      throw error;
    }
  }

  /**
   * Apply resolution strategy to conflict
   */
  private async applyResolutionStrategy(
    conflict: SyncConflict,
    strategy: ResolutionStrategy,
    customData?: Record<string, unknown>
  ): Promise<EnhancedConflictResolution> {
    const resolution: EnhancedConflictResolution = {
      conflictId: conflict.id,
      strategy,
      resolvedAt: new Date(),
      resolvedBy: 'system',
      automatic: true,
      confidence: 0,
      fieldResolutions: [],
    };

    switch (strategy) {
      case 'newest_wins':
        resolution.resolvedEntity = conflict.remoteData;
        resolution.confidence = 0.9;
        resolution.resolutionNotes = 'Remote data is more recent';
        break;

      case 'local_wins':
        resolution.resolvedEntity = conflict.localData;
        resolution.confidence = 0.9;
        resolution.resolutionNotes = 'Local data was created first';
        break;

      case 'merge_automatic': {
        const mergeResult = await this.performSmartMerge(conflict);
        resolution.resolvedEntity = mergeResult.mergedData;
        resolution.confidence = mergeResult.confidence;
        resolution.resolutionNotes = 'Automatic merge based on field analysis';
        resolution.fieldResolutions = mergeResult.conflicts.map(fc => ({
          field: fc.fieldName,
          strategy: 'manual' as const, // Use allowed strategy value
          value: fc.suggestion, // Map suggestion to value
          reason: fc.reason,
          confidence: fc.confidence,
        }));
        break;
      }

      case 'user_decides':
        if (!customData) {
          throw new Error('Manual resolution requires custom data');
        }
        resolution.resolvedEntity = customData;
        resolution.confidence = 1.0;
        resolution.resolutionNotes = 'Manual resolution by user';
        break;

      case 'retry_later':
        // Keep base data if available, otherwise use empty object
        resolution.resolvedEntity = conflict.baseData ?? {};
        resolution.confidence = 0.7;
        resolution.resolutionNotes = 'Both versions rejected, using base data';
        break;

      default:
        throw new Error(`Unknown resolution strategy: ${strategy}`);
    }

    return resolution;
  }

  /**
   * Perform intelligent merge of conflicting data
   */
  private async performSmartMerge(conflict: SyncConflict): Promise<MergeResult> {
    const local = conflict.localData as Record<string, unknown>;
    const remote = conflict.remoteData as Record<string, unknown>;
    const base = conflict.baseData as Record<string, unknown> | undefined;

    const result: MergeResult = {
      success: true,
      mergedData: {},
      conflicts: [],
      warnings: [],
      confidence: 1.0,
    };

    // Get all unique field names
    const allFields = new Set([
      ...Object.keys(local),
      ...Object.keys(remote),
      ...(base ? Object.keys(base) : []),
    ]);

    for (const fieldName of allFields) {
      const localValue = local[fieldName];
      const remoteValue = remote[fieldName];
      const baseValue = base?.[fieldName];

      // If values are the same, no conflict
      if (deepEqual(localValue, remoteValue)) {
        result.mergedData[fieldName] = localValue;
        continue;
      }

      // Analyze field conflict
      const fieldConflict = analyzeFieldConflict(fieldName, localValue, remoteValue, baseValue);

      // Apply field-level resolution
      const fieldResolution = resolveFieldConflict(fieldConflict);

      if (fieldResolution.confidence >= this.config.autoResolveThreshold) {
        result.mergedData[fieldName] = fieldResolution.value;
        result.confidence = Math.min(result.confidence, fieldResolution.confidence);
      } else {
        // Add to unresolved conflicts
        result.conflicts.push(fieldConflict);
        result.success = false;

        // Use a default value for now
        result.mergedData[fieldName] = selectDefaultFieldValue(
          fieldName,
          localValue,
          remoteValue,
          this.userPreferences
        );
      }
    }

    // Adjust overall confidence based on conflicts
    if (result.conflicts.length > 0) {
      result.confidence *= Math.max(0.3, 1 - result.conflicts.length * 0.2);
    }

    return result;
  }

  /**
   * Check if conflict should be auto-resolved
   */
  private shouldAutoResolve(conflict: SyncConflict): boolean {
    if (!this.config.enableSmartMerging) {
      return false;
    }

    // Check user preferences
    const userPreference = this.userPreferences.get(conflict.entityType);
    if (userPreference && userPreference !== 'user_decides') {
      return true;
    }

    // Auto-resolve simple conflicts
    if (conflict.conflictFields.length === 0) {
      return false;
    }

    // For now, auto-resolve based on conflict type since conflictFields is just string[]
    return conflict.conflictFields.length <= 2; // Simple heuristic for auto-resolution
  }

  /**
   * Auto-resolve conflict
   */
  private autoResolve(conflict: SyncConflict): SyncConflict {
    const userPreference = this.userPreferences.get(conflict.entityType);
    const strategy = userPreference || this.config.defaultStrategy;

    this.resolveConflict(conflict.id, strategy)
      .then(() => {
        this.metrics.autoResolvedConflicts++;
        logger.debug('Auto-resolved conflict', 'sync', { conflictId: conflict.id, strategy });
      })
      .catch(error => {
        logger.error(
          'Failed to auto-resolve conflict',
          'sync',
          { conflictId: conflict.id },
          error as Error
        );
      });

    return conflict;
  }

  /**
   * Update resolution metrics
   */
  private updateResolutionMetrics(strategy: ResolutionStrategy, timeMs: number): void {
    this.metrics.resolvedConflicts++;
    this.metrics.conflictsByStrategy[strategy] =
      (this.metrics.conflictsByStrategy[strategy] || 0) + 1;

    this.metrics.averageResolutionTime = (this.metrics.averageResolutionTime + timeMs) / 2;

    if (strategy !== 'user_decides') {
      this.metrics.autoResolvedConflicts++;
    } else {
      this.metrics.manualResolvedConflicts++;
    }
  }

  /**
   * Start cleanup routine for old conflicts
   */
  private startCleanupRoutine(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldConflicts();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Clean up old resolved conflicts
   */
  private cleanupOldConflicts(): void {
    const cutoff = Date.now() - this.config.maxConflictAge;
    const toDelete: string[] = [];

    this.conflicts.forEach((conflict, id) => {
      if (conflict.status === 'resolved' && conflict.detectedAt.getTime() < cutoff) {
        toDelete.push(id);
      }
    });

    toDelete.forEach(id => this.conflicts.delete(id));

    if (toDelete.length > 0) {
      logger.debug('Cleaned up old conflicts', 'sync', { count: toDelete.length });
    }
  }

  /**
   * Get all pending conflicts
   */
  getPendingConflicts(): SyncConflict[] {
    return Array.from(this.conflicts.values()).filter(conflict => conflict.status === 'pending');
  }

  /**
   * Get conflict by ID
   */
  getConflict(conflictId: string): SyncConflict | undefined {
    return this.conflicts.get(conflictId);
  }

  /**
   * Get conflicts by entity
   */
  getConflictsByEntity(entityType: string, entityId?: string): SyncConflict[] {
    return Array.from(this.conflicts.values()).filter(
      conflict =>
        conflict.entityType === entityType && (!entityId || conflict.entityId === entityId)
    );
  }

  /**
   * Get conflict metrics
   */
  getMetrics(): ConflictMetrics {
    return { ...this.metrics };
  }

  /**
   * Set user preference for entity type
   */
  setUserPreference(entityType: string, strategy: ResolutionStrategy): void {
    this.userPreferences.set(entityType, strategy);
    logger.debug('User preference set', 'sync', { entityType, strategy });
  }

  /**
   * Get user preferences
   */
  getUserPreferences(): Map<string, ResolutionStrategy> {
    return new Map(this.userPreferences);
  }

  /**
   * Clear all conflicts
   */
  clearConflicts(): void {
    this.conflicts.clear();
    this.metrics = createInitialMetrics();
    logger.debug('All conflicts cleared', 'sync');
  }

  /**
   * Get configuration
   */
  getConfig(): ConflictResolverConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ConflictResolverConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Cleanup and destroy resolver
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.conflicts.clear();
    this.userPreferences.clear();

    logger.debug('Conflict resolver destroyed', 'sync');
  }
}

// Create singleton instance
export const conflictResolver = new ConflictResolver();

export default ConflictResolver;
