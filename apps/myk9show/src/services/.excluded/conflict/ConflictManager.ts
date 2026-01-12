import { SyncMetadata, SyncStatus } from '../../types/sync-types';
import { 
import { logger } from '@/services/LoggingService';
  Conflict, 
  ConflictResolution, 
  ResolutionStrategy, 
  ResolutionContext,
  ConflictPriority,
  conflictResolver
} from './ConflictResolver';
import { conflictDetector } from './ConflictDetector';

export interface ConflictManagerOptions {
  enableAutoResolution: boolean;
  autoResolutionStrategies: ResolutionStrategy[];
  maxAutoResolutionPriority: ConflictPriority;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface ConflictStats {
  totalConflicts: number;
  resolvedConflicts: number;
  pendingConflicts: number;
  autoResolvedConflicts: number;
  manualResolvedConflicts: number;
  criticalConflicts: number;
  conflictsByType: Record<string, number>;
  conflictsByEntity: Record<string, number>;
  averageResolutionTime: number;
}

export interface ConflictNotification {
  conflictId: string;
  entityType: string;
  entityId: string;
  priority: ConflictPriority;
  requiresManualResolution: boolean;
  affectedFields: string[];
  detectedAt: Date;
}

export type ConflictEventType =
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'conflict_failed'
  | 'manual_resolution_required';

export interface ConflictEvent {
  type: ConflictEventType;
  conflictId: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export type ConflictEventHandler = (event: ConflictEvent) => void;

export class ConflictManager {
  private static instance: ConflictManager;
  private options: ConflictManagerOptions;
  private pendingConflicts: Map<string, Conflict<{ id: string }>> = new Map();
  private resolvedConflicts: Map<string, ConflictResolution<{ id: string }>> = new Map();
  private eventHandlers: Map<ConflictEventType, Set<ConflictEventHandler>> = new Map();
  private resolutionQueue: Array<{ conflict: Conflict<{ id: string }>; context: ResolutionContext }> = [];
  private isProcessingQueue = false;
  private conflictStats: ConflictStats = this.initializeStats();

  static getInstance(options?: Partial<ConflictManagerOptions>): ConflictManager {
    if (!ConflictManager.instance) {
      ConflictManager.instance = new ConflictManager(options);
    }
    return ConflictManager.instance;
  }

  constructor(options: Partial<ConflictManagerOptions> = {}) {
    this.options = {
      enableAutoResolution: true,
      autoResolutionStrategies: [
        ResolutionStrategy.BUSINESS_RULE_PRIORITY,
        ResolutionStrategy.USER_HIERARCHY,
        ResolutionStrategy.FIELD_MERGE,
        ResolutionStrategy.LAST_WRITE_WINS
      ],
      maxAutoResolutionPriority: ConflictPriority.HIGH,
      batchSize: 10,
      retryAttempts: 3,
      retryDelay: 1000,
      ...options
    };

    // Initialize event handler maps
    Object.values(['conflict_detected', 'conflict_resolved', 'conflict_failed', 'manual_resolution_required'] as ConflictEventType[])
      .forEach(type => this.eventHandlers.set(type, new Set()));
  }

  /**
   * Detect and handle conflicts for entity synchronization
   */
  async handleSyncConflict<T extends { id: string }>(
    localEntity: T & SyncMetadata,
    remoteEntity: T & SyncMetadata,
    baseEntity?: T & SyncMetadata,
    context?: ResolutionContext
  ): Promise<{
    hasConflict: boolean;
    resolvedEntity?: T & SyncMetadata;
    conflict?: Conflict<T>;
    requiresManualResolution: boolean;
  }> {
    // Detect conflicts
    const detectionResult = await conflictDetector.detectFieldConflicts(
      localEntity,
      remoteEntity,
      baseEntity
    );

    if (!detectionResult.hasConflict) {
      return {
        hasConflict: false,
        resolvedEntity: remoteEntity,
        requiresManualResolution: false
      };
    }

    const conflict = detectionResult.conflict!;
    
    // Update stats
    this.updateConflictStats(conflict, 'detected');
    
    // Store pending conflict
    this.pendingConflicts.set(conflict.id, conflict as Conflict<{ id: string }>);
    
    // Emit event
    this.emitEvent('conflict_detected', conflict.id, conflict.entityType, conflict.entityId, {
      conflictCount: detectionResult.conflictCount,
      priority: conflict.priority
    });

    // Try auto-resolution if enabled
    if (this.shouldAutoResolve(conflict)) {
      try {
        const resolution = await this.autoResolveConflict(conflict, context);
        
        if (resolution.strategy !== ResolutionStrategy.MANUAL_REQUIRED) {
          // Auto-resolution successful
          this.resolvedConflicts.set(conflict.id, resolution as ConflictResolution<{ id: string }>);
          this.pendingConflicts.delete(conflict.id);
          this.updateConflictStats(conflict as Conflict<{ id: string }>, 'resolved', true);
          
          this.emitEvent('conflict_resolved', conflict.id, conflict.entityType, conflict.entityId, {
            strategy: resolution.strategy,
            automatic: true
          });
          
          return {
            hasConflict: true,
            resolvedEntity: resolution.resolvedEntity,
            conflict,
            requiresManualResolution: false
          };
        }
      } catch (error) {
        logger.error('Auto-resolution failed:', 'services', {}, error as Error);
        this.emitEvent('conflict_failed', conflict.id, conflict.entityType, conflict.entityId, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Manual resolution required
    this.emitEvent('manual_resolution_required', conflict.id, conflict.entityType, conflict.entityId, {
      priority: conflict.priority,
      conflictCount: detectionResult.conflictCount
    });

    return {
      hasConflict: true,
      conflict,
      requiresManualResolution: true
    };
  }

  /**
   * Manually resolve a conflict
   */
  async resolveConflictManually<T extends { id: string }>(
    conflictId: string,
    strategy: ResolutionStrategy,
    context: ResolutionContext,
    customResolution?: Partial<T>
  ): Promise<ConflictResolution<T>> {
    const conflict = this.pendingConflicts.get(conflictId) as Conflict<T>;
    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    try {
      let resolution: ConflictResolution<T>;

      if (customResolution) {
        // Apply custom resolution
        resolution = {
          strategy: ResolutionStrategy.CUSTOM_MERGE,
          resolvedEntity: {
            ...conflict.remoteEntity,
            ...customResolution,
            _version: Math.max(conflict.localEntity._version, conflict.remoteEntity._version) + 1,
            _lastModified: new Date().toISOString(),
            _syncStatus: 'pending' as SyncStatus
          },
          automatic: false,
          resolvedBy: context.userId,
          resolutionNotes: 'Manual custom resolution'
        };
      } else {
        // Use resolver with specified strategy
        resolution = await conflictResolver.resolveConflict(conflict, context, strategy);
        resolution.automatic = false;
        resolution.resolvedBy = context.userId;
      }

      // Store resolution
      this.resolvedConflicts.set(conflictId, resolution as ConflictResolution<{ id: string }>);
      this.pendingConflicts.delete(conflictId);
      this.updateConflictStats(conflict as Conflict<{ id: string }>, 'resolved', false);

      this.emitEvent('conflict_resolved', conflictId, conflict.entityType, conflict.entityId, {
        strategy: resolution.strategy,
        automatic: false,
        resolvedBy: context.userId
      });

      return resolution;
    } catch (error) {
      this.emitEvent('conflict_failed', conflictId, conflict.entityType, conflict.entityId, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Batch process multiple conflicts
   */
  async batchProcessConflicts<T extends { id: string }>(
    entityPairs: Array<{
      local: T & SyncMetadata;
      remote: T & SyncMetadata;
      base?: T & SyncMetadata;
    }>,
    context: ResolutionContext
  ): Promise<Array<{
    hasConflict: boolean;
    resolvedEntity?: T & SyncMetadata;
    conflict?: Conflict<T>;
    requiresManualResolution: boolean;
  }>> {
    const results = [];
    const batchSize = this.options.batchSize;

    for (let i = 0; i < entityPairs.length; i += batchSize) {
      const batch = entityPairs.slice(i, i + batchSize);
      const batchPromises = batch.map(pair =>
        this.handleSyncConflict(pair.local, pair.remote, pair.base, context)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Queue conflicts for background processing
   */
  queueConflictForResolution<T extends { id: string }>(conflict: Conflict<T>, context: ResolutionContext): void {
    this.resolutionQueue.push({ conflict: conflict as Conflict<{ id: string }>, context });
    
    if (!this.isProcessingQueue) {
      this.processResolutionQueue();
    }
  }

  /**
   * Get pending conflicts
   */
  getPendingConflicts<T extends { id: string } = { id: string }>(
    entityType?: string,
    priority?: ConflictPriority
  ): Conflict<T>[] {
    let conflicts = Array.from(this.pendingConflicts.values());

    if (entityType) {
      conflicts = conflicts.filter(c => c.entityType === entityType);
    }

    if (priority !== undefined) {
      conflicts = conflicts.filter(c => c.priority === priority);
    }

    return conflicts.sort((a, b) => b.priority - a.priority || b.detectedAt.getTime() - a.detectedAt.getTime()) as Conflict<T>[];
  }

  /**
   * Get conflict resolution history
   */
  getResolutionHistory<T extends { id: string } = { id: string }>(
    entityType?: string,
    entityId?: string,
    limit?: number
  ): ConflictResolution<T>[] {
    let resolutions = Array.from(this.resolvedConflicts.values());

    // Filter by entity if specified
    if (entityType || entityId) {
      // TODO: Implement proper entity filtering based on conflict history
      // For now, return all resolutions
    }

    if (limit) {
      resolutions = resolutions.slice(0, limit);
    }

    return resolutions as ConflictResolution<T>[];
  }

  /**
   * Get conflict statistics
   */
  getConflictStats(): ConflictStats {
    return { ...this.conflictStats };
  }

  /**
   * Subscribe to conflict events
   */
  addEventListener(type: ConflictEventType, handler: ConflictEventHandler): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.add(handler);
    }
  }

  /**
   * Unsubscribe from conflict events
   */
  removeEventListener(type: ConflictEventType, handler: ConflictEventHandler): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Clear resolved conflicts (cleanup)
   */
  clearResolvedConflicts(olderThan?: Date): void {
    if (olderThan) {
      for (const [id] of Array.from(this.resolvedConflicts.entries())) {
        // Would need to track resolution time for this to work properly
        // For now, clear all
        this.resolvedConflicts.delete(id);
      }
    } else {
      this.resolvedConflicts.clear();
    }
  }

  /**
   * Private methods
   */
  private shouldAutoResolve<T extends { id: string }>(conflict: Conflict<T>): boolean {
    if (!this.options.enableAutoResolution) {
      return false;
    }

    // Don't auto-resolve critical conflicts
    if (conflict.priority > this.options.maxAutoResolutionPriority) {
      return false;
    }

    return true;
  }

  private async autoResolveConflict<T extends { id: string }>(
    conflict: Conflict<T>,
    context?: ResolutionContext
  ): Promise<ConflictResolution<T>> {
    const defaultContext: ResolutionContext = {
      userId: 'system',
      userRole: 'system',
      userPermissions: [],
      timestamp: new Date(),
      deviceId: 'auto-resolver'
    };

    const resolutionContext = context || defaultContext;

    // Try each auto-resolution strategy in order
    for (const strategy of this.options.autoResolutionStrategies) {
      try {
        const resolution = await conflictResolver.resolveConflict(
          conflict,
          resolutionContext,
          strategy
        );

        if (resolution.strategy !== ResolutionStrategy.MANUAL_REQUIRED) {
          return resolution;
        }
      } catch (error) {
        logger.warn(`Auto-resolution strategy ${strategy} failed:`, 'services', {}, error as Error);
        continue;
      }
    }

    // All strategies failed, require manual resolution
    return {
      strategy: ResolutionStrategy.MANUAL_REQUIRED,
      resolvedEntity: conflict.localEntity,
      automatic: false,
      resolutionNotes: 'All auto-resolution strategies failed'
    };
  }

  private async processResolutionQueue(): Promise<void> {
    if (this.isProcessingQueue || this.resolutionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.resolutionQueue.length > 0) {
        const batch = this.resolutionQueue.splice(0, this.options.batchSize);
        
        const batchPromises = batch.map(async ({ conflict, context }) => {
          let attempts = 0;
          
          while (attempts < this.options.retryAttempts) {
            try {
              const resolution = await this.autoResolveConflict(conflict, context);
              
              if (resolution.strategy !== ResolutionStrategy.MANUAL_REQUIRED) {
                this.resolvedConflicts.set(conflict.id, resolution as ConflictResolution<{ id: string }>);
                this.pendingConflicts.delete(conflict.id);
                this.updateConflictStats(conflict as Conflict<{ id: string }>, 'resolved', true);
                
                this.emitEvent('conflict_resolved', conflict.id, conflict.entityType, conflict.entityId, {
                  strategy: resolution.strategy,
                  automatic: true
                });
              } else {
                this.emitEvent('manual_resolution_required', conflict.id, conflict.entityType, conflict.entityId, {
                  priority: conflict.priority
                });
              }
              
              break;
            } catch (error) {
              attempts++;
              
              if (attempts >= this.options.retryAttempts) {
                this.emitEvent('conflict_failed', conflict.id, conflict.entityType, conflict.entityId, {
                  error: error instanceof Error ? error.message : 'Unknown error'
                });
              } else {
                await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
              }
            }
          }
        });

        await Promise.all(batchPromises);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private emitEvent(
    type: ConflictEventType,
    conflictId: string,
    entityType: string,
    entityId: string,
    data?: Record<string, unknown>
  ): void {
    const event: ConflictEvent = {
      type,
      conflictId,
      entityType,
      entityId,
      data,
      timestamp: new Date()
    };

    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          logger.error('Error in conflict event handler:', 'services', {}, error as Error);
        }
      });
    }
  }

  private updateConflictStats<T extends { id: string }>(
    conflict: Conflict<T>,
    action: 'detected' | 'resolved',
    automatic?: boolean
  ): void {
    if (action === 'detected') {
      this.conflictStats.totalConflicts++;
      this.conflictStats.pendingConflicts++;
      
      if (conflict.priority === ConflictPriority.CRITICAL) {
        this.conflictStats.criticalConflicts++;
      }
      
      // Update by type
      const typeKey = conflict.conflictType;
      this.conflictStats.conflictsByType[typeKey] = 
        (this.conflictStats.conflictsByType[typeKey] || 0) + 1;
      
      // Update by entity
      const entityKey = conflict.entityType;
      this.conflictStats.conflictsByEntity[entityKey] = 
        (this.conflictStats.conflictsByEntity[entityKey] || 0) + 1;
    } else if (action === 'resolved') {
      this.conflictStats.resolvedConflicts++;
      this.conflictStats.pendingConflicts--;
      
      if (automatic) {
        this.conflictStats.autoResolvedConflicts++;
      } else {
        this.conflictStats.manualResolvedConflicts++;
      }
      
      if (conflict.priority === ConflictPriority.CRITICAL) {
        this.conflictStats.criticalConflicts--;
      }
    }

    // Recalculate average resolution time (simplified)
    if (this.conflictStats.resolvedConflicts > 0) {
      this.conflictStats.averageResolutionTime = 
        (this.conflictStats.totalConflicts * 5000) / this.conflictStats.resolvedConflicts; // Placeholder calculation
    }
  }

  private initializeStats(): ConflictStats {
    return {
      totalConflicts: 0,
      resolvedConflicts: 0,
      pendingConflicts: 0,
      autoResolvedConflicts: 0,
      manualResolvedConflicts: 0,
      criticalConflicts: 0,
      conflictsByType: {},
      conflictsByEntity: {},
      averageResolutionTime: 0
    };
  }
}

// Export singleton instance
export const conflictManager = ConflictManager.getInstance();