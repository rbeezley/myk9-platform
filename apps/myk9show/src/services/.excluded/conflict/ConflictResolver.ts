import { SyncMetadata } from '../../types/sync-types';
import { SyncStatus } from '../../services/sync/types';

// Conflict types and priorities
export enum ConflictType {
  VERSION_MISMATCH = 'version_mismatch',
  FIELD_CONFLICT = 'field_conflict',
  STRUCTURAL_CONFLICT = 'structural_conflict',
  BUSINESS_RULE_VIOLATION = 'business_rule_violation',
  DELETED_ENTITY = 'deleted_entity'
}

export enum ConflictPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

export enum ResolutionStrategy {
  LAST_WRITE_WINS = 'last_write_wins',
  FIELD_MERGE = 'field_merge',
  BUSINESS_RULE_PRIORITY = 'business_rule_priority',
  USER_HIERARCHY = 'user_hierarchy',
  CUSTOM_MERGE = 'custom_merge',
  MANUAL_REQUIRED = 'manual_required'
}

export interface ConflictDetail {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  baseValue?: unknown;
  conflictType: ConflictType;
}

export interface Conflict<T = Record<string, unknown>> {
  id: string;
  entityType: string;
  entityId: string;
  localEntity: T & SyncMetadata;
  remoteEntity: T & SyncMetadata;
  baseEntity?: T & SyncMetadata;
  conflictType: ConflictType;
  priority: ConflictPriority;
  details: ConflictDetail[];
  detectedAt: Date;
  resolvedAt?: Date;
  resolution?: ConflictResolution<T>;
}

export interface ConflictResolution<T = Record<string, unknown>> {
  strategy: ResolutionStrategy;
  resolvedEntity: T & SyncMetadata;
  mergedFields?: string[];
  discardedChanges?: ConflictDetail[];
  resolutionNotes?: string;
  resolvedBy?: string;
  automatic: boolean;
}

export interface ResolutionContext {
  userId: string;
  userRole: string;
  userPermissions: string[];
  timestamp: Date;
  deviceId: string;
}

export interface EntityResolutionConfig {
  entityType: string;
  strategies: ResolutionStrategy[];
  priorityFields: string[];
  readOnlyFields: string[];
  businessRules: BusinessRule[];
  customMergeHandler?: (conflict: Conflict) => Promise<ConflictResolution>;
}

export interface BusinessRule {
  name: string;
  description: string;
  evaluate: (conflict: Conflict) => boolean;
  priority: number;
  resolution: (conflict: Conflict) => Partial<Record<string, unknown>>;
}

export class ConflictResolver {
  private resolutionConfigs: Map<string, EntityResolutionConfig> = new Map();
  private conflictHistory: Conflict[] = [];
  private resolutionHandlers: Map<ResolutionStrategy, ResolutionHandler> = new Map();

  constructor() {
    this.initializeResolutionHandlers();
    this.initializeEntityConfigs();
  }

  /**
   * Initialize resolution handlers for each strategy
   */
  private initializeResolutionHandlers() {
    this.resolutionHandlers.set(
      ResolutionStrategy.LAST_WRITE_WINS,
      new LastWriteWinsHandler()
    );
    this.resolutionHandlers.set(
      ResolutionStrategy.FIELD_MERGE,
      new FieldMergeHandler()
    );
    this.resolutionHandlers.set(
      ResolutionStrategy.BUSINESS_RULE_PRIORITY,
      new BusinessRuleHandler()
    );
    this.resolutionHandlers.set(
      ResolutionStrategy.USER_HIERARCHY,
      new UserHierarchyHandler()
    );
  }

  /**
   * Initialize entity-specific resolution configurations
   */
  private initializeEntityConfigs() {
    // Show configuration
    this.resolutionConfigs.set('show', {
      entityType: 'show',
      strategies: [
        ResolutionStrategy.BUSINESS_RULE_PRIORITY,
        ResolutionStrategy.USER_HIERARCHY,
        ResolutionStrategy.FIELD_MERGE
      ],
      priorityFields: ['status', 'judgeAssignments', 'schedule'],
      readOnlyFields: ['id', 'createdAt', 'organizationId'],
      businessRules: [
        {
          name: 'show_status_progression',
          description: 'Show status can only progress forward',
          evaluate: (conflict) => {
            const statusOrder = ['draft', 'published', 'in_progress', 'completed', 'cancelled'];
            const localStatus = (conflict.localEntity as Record<string, unknown>).status as string;
            const remoteStatus = (conflict.remoteEntity as Record<string, unknown>).status as string;
            return statusOrder.indexOf(localStatus) !== statusOrder.indexOf(remoteStatus);
          },
          priority: ConflictPriority.HIGH,
          resolution: (conflict) => {
            const statusOrder = ['draft', 'published', 'in_progress', 'completed', 'cancelled'];
            const localIndex = statusOrder.indexOf((conflict.localEntity as Record<string, unknown>).status as string);
            const remoteIndex = statusOrder.indexOf((conflict.remoteEntity as Record<string, unknown>).status as string);
            return {
              status: localIndex > remoteIndex ? (conflict.localEntity as Record<string, unknown>).status : (conflict.remoteEntity as Record<string, unknown>).status
            };
          }
        }
      ]
    });

    // Entry/Registration configuration
    this.resolutionConfigs.set('registration', {
      entityType: 'registration',
      strategies: [
        ResolutionStrategy.BUSINESS_RULE_PRIORITY,
        ResolutionStrategy.LAST_WRITE_WINS
      ],
      priorityFields: ['status', 'paymentStatus', 'checkInStatus'],
      readOnlyFields: ['id', 'showId', 'dogId', 'createdAt'],
      businessRules: [
        {
          name: 'registration_status_lock',
          description: 'Confirmed registrations cannot be reverted',
          evaluate: (conflict) => {
            return conflict.remoteEntity.status === 'confirmed' && 
                   conflict.localEntity.status !== 'confirmed';
          },
          priority: ConflictPriority.CRITICAL,
          resolution: (conflict) => ({
            status: conflict.remoteEntity.status
          })
        }
      ]
    });

    // Score configuration
    this.resolutionConfigs.set('score', {
      entityType: 'score',
      strategies: [
        ResolutionStrategy.USER_HIERARCHY,
        ResolutionStrategy.BUSINESS_RULE_PRIORITY
      ],
      priorityFields: ['score', 'placement', 'qualified'],
      readOnlyFields: ['id', 'entryId', 'judgeId', 'createdAt'],
      businessRules: [
        {
          name: 'judge_score_authority',
          description: 'Judge scores take precedence',
          evaluate: (conflict) => {
            const context = conflict as Conflict<Record<string, unknown>>;
            const modifiedBy = (context.remoteEntity as Record<string, unknown>)._modifiedBy as { role?: string } | undefined;
            return modifiedBy?.role === 'judge';
          },
          priority: ConflictPriority.CRITICAL,
          resolution: (conflict) => ({
            ...conflict.remoteEntity
          })
        }
      ]
    });

    // Users configuration
    this.resolutionConfigs.set('person', {
      entityType: 'person',
      strategies: [
        ResolutionStrategy.FIELD_MERGE,
        ResolutionStrategy.LAST_WRITE_WINS
      ],
      priorityFields: ['email', 'phone', 'roles'],
      readOnlyFields: ['id', 'createdAt'],
      businessRules: []
    });

    // Dog configuration
    this.resolutionConfigs.set('dog', {
      entityType: 'dog',
      strategies: [
        ResolutionStrategy.FIELD_MERGE,
        ResolutionStrategy.USER_HIERARCHY
      ],
      priorityFields: ['registrationNumber', 'titles', 'healthRecords'],
      readOnlyFields: ['id', 'breedId', 'createdAt'],
      businessRules: [
        {
          name: 'title_accumulation',
          description: 'Titles can only be added, not removed',
          evaluate: (conflict) => {
            return ((conflict.localEntity as Record<string, unknown>).titles as unknown[] || []).length !== ((conflict.remoteEntity as Record<string, unknown>).titles as unknown[] || []).length;
          },
          priority: ConflictPriority.HIGH,
          resolution: (conflict) => {
            const allTitles = new Set([
              ...((conflict.localEntity as Record<string, unknown>).titles as unknown[] || []),
              ...((conflict.remoteEntity as Record<string, unknown>).titles as unknown[] || [])
            ]);
            return {
              titles: Array.from(allTitles)
            };
          }
        }
      ]
    });
  }

  /**
   * Detect conflicts between local and remote entities
   */
  async detectConflicts<T extends { id: string }>(
    localEntity: T & SyncMetadata,
    remoteEntity: T & SyncMetadata,
    baseEntity?: T & SyncMetadata
  ): Promise<Conflict<T> | null> {
    // No conflict if versions match
    if (localEntity._version === remoteEntity._version) {
      return null;
    }

    // Version mismatch - analyze changes
    const conflicts: ConflictDetail[] = [];
    const entityType = this.getEntityType(localEntity as unknown as Record<string, unknown>);
    const config = this.resolutionConfigs.get(entityType);

    // Compare each field
    const allFields = new Set([
      ...Object.keys(localEntity),
      ...Object.keys(remoteEntity)
    ]);

    for (const field of Array.from(allFields)) {
      // Skip metadata fields
      if (field.startsWith('_') || config?.readOnlyFields.includes(field)) {
        continue;
      }

      const localValue = (localEntity as unknown as Record<string, unknown>)[field];
      const remoteValue = (remoteEntity as unknown as Record<string, unknown>)[field];
      const baseValue = baseEntity ? (baseEntity as unknown as Record<string, unknown>)[field] : undefined;

      if (!this.valuesEqual(localValue, remoteValue)) {
        conflicts.push({
          field,
          localValue,
          remoteValue,
          baseValue,
          conflictType: this.determineConflictType(field, localValue, remoteValue)
        });
      }
    }

    if (conflicts.length === 0) {
      return null;
    }

    // Determine overall conflict type and priority
    const conflictType = this.determineOverallConflictType(conflicts);
    const priority = this.calculatePriority(entityType, conflicts, config);

    return {
      id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      entityType,
      entityId: localEntity.id,
      localEntity,
      remoteEntity,
      baseEntity,
      conflictType,
      priority,
      details: conflicts,
      detectedAt: new Date()
    };
  }

  /**
   * Resolve a conflict using configured strategies
   */
  async resolveConflict<T extends { id: string }>(
    conflict: Conflict<T>,
    context: ResolutionContext,
    strategy?: ResolutionStrategy
  ): Promise<ConflictResolution<T>> {
    const config = this.resolutionConfigs.get(conflict.entityType);
    if (!config) {
      throw new Error(`No resolution config for entity type: ${conflict.entityType}`);
    }

    // Determine resolution strategy
    const selectedStrategy = strategy || this.selectBestStrategy(conflict, config, context);
    
    // Check if manual resolution is required
    if (selectedStrategy === ResolutionStrategy.MANUAL_REQUIRED || 
        conflict.priority === ConflictPriority.CRITICAL) {
      return {
        strategy: ResolutionStrategy.MANUAL_REQUIRED,
        resolvedEntity: conflict.localEntity,
        automatic: false,
        resolutionNotes: 'Manual resolution required due to critical conflicts'
      };
    }

    // Get appropriate handler
    const handler = this.resolutionHandlers.get(selectedStrategy);
    if (!handler) {
      throw new Error(`No handler for strategy: ${selectedStrategy}`);
    }

    // Apply resolution
    const resolution = await handler.resolve(conflict, config, context);
    
    // Record resolution
    conflict.resolution = resolution;
    conflict.resolvedAt = new Date();
    this.conflictHistory.push(conflict);

    return resolution;
  }

  /**
   * Batch resolve multiple conflicts
   */
  async batchResolveConflicts<T extends { id: string }>(
    conflicts: Conflict<T>[],
    context: ResolutionContext,
    strategy?: ResolutionStrategy
  ): Promise<ConflictResolution<T>[]> {
    // Group conflicts by entity type for optimized processing
    const groupedConflicts = this.groupConflictsByType(conflicts);
    const resolutions: ConflictResolution<T>[] = [];

    for (const typeConflicts of groupedConflicts.values()) {
      // Process conflicts in priority order
      const sortedConflicts = typeConflicts.sort((a, b) => b.priority - a.priority);
      
      for (const conflict of sortedConflicts) {
        const resolution = await this.resolveConflict(conflict, context, strategy);
        resolutions.push(resolution as ConflictResolution<T>);
      }
    }

    return resolutions;
  }

  /**
   * Get conflict history
   */
  getConflictHistory(
    entityType?: string,
    entityId?: string,
    limit?: number
  ): Conflict[] {
    let history = [...this.conflictHistory];

    if (entityType) {
      history = history.filter(c => c.entityType === entityType);
    }

    if (entityId) {
      history = history.filter(c => c.entityId === entityId);
    }

    // Sort by most recent first
    history.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

    if (limit) {
      history = history.slice(0, limit);
    }

    return history;
  }

  /**
   * Helper methods
   */
  private getEntityType(entity: Record<string, unknown>): string {
    // Determine entity type from object structure
    if ('showDate' in entity && 'venue' in entity) return 'show';
    if ('dogId' in entity && 'showId' in entity) return 'registration';
    if ('breed' in entity && 'registrationNumber' in entity) return 'dog';
    if ('email' in entity && 'firstName' in entity) return 'person';
    if ('score' in entity && 'judgeId' in entity) return 'score';
    return 'unknown';
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, index) => this.valuesEqual(val, b[index]));
    }

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => this.valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
    }

    return false;
  }

  private determineConflictType(field: string, localValue: unknown, remoteValue: unknown): ConflictType {
    if (localValue == null || remoteValue == null) {
      return ConflictType.DELETED_ENTITY;
    }
    if (typeof localValue !== typeof remoteValue) {
      return ConflictType.STRUCTURAL_CONFLICT;
    }
    return ConflictType.FIELD_CONFLICT;
  }

  private determineOverallConflictType(conflicts: ConflictDetail[]): ConflictType {
    if (conflicts.some(c => c.conflictType === ConflictType.STRUCTURAL_CONFLICT)) {
      return ConflictType.STRUCTURAL_CONFLICT;
    }
    if (conflicts.some(c => c.conflictType === ConflictType.DELETED_ENTITY)) {
      return ConflictType.DELETED_ENTITY;
    }
    return ConflictType.FIELD_CONFLICT;
  }

  private calculatePriority(
    entityType: string,
    conflicts: ConflictDetail[],
    config?: EntityResolutionConfig
  ): ConflictPriority {
    let maxPriority = ConflictPriority.LOW;

    // Check if any priority fields are affected
    if (config?.priorityFields) {
      const hasPriorityConflict = conflicts.some(c => 
        config.priorityFields.includes(c.field)
      );
      if (hasPriorityConflict) {
        maxPriority = Math.max(maxPriority, ConflictPriority.HIGH);
      }
    }

    // Check for structural conflicts
    if (conflicts.some(c => c.conflictType === ConflictType.STRUCTURAL_CONFLICT)) {
      maxPriority = Math.max(maxPriority, ConflictPriority.HIGH);
    }

    // Check for deleted entities
    if (conflicts.some(c => c.conflictType === ConflictType.DELETED_ENTITY)) {
      maxPriority = ConflictPriority.CRITICAL;
    }

    return maxPriority;
  }

  private selectBestStrategy(
    conflict: Conflict,
    config: EntityResolutionConfig,
    context: ResolutionContext
  ): ResolutionStrategy {
    // Check business rules first
    for (const rule of config.businessRules) {
      if (rule.evaluate(conflict)) {
        return ResolutionStrategy.BUSINESS_RULE_PRIORITY;
      }
    }

    // Try each configured strategy in order
    for (const strategy of config.strategies) {
      const handler = this.resolutionHandlers.get(strategy);
      if (handler && handler.canHandle(conflict, config, context)) {
        return strategy;
      }
    }

    // Default to manual resolution if no strategy can handle
    return ResolutionStrategy.MANUAL_REQUIRED;
  }

  private groupConflictsByType<T extends { id: string }>(conflicts: Conflict<T>[]): Map<string, Conflict<T>[]> {
    const grouped = new Map<string, Conflict<T>[]>();
    
    for (const conflict of conflicts) {
      const group = grouped.get(conflict.entityType) || [];
      group.push(conflict);
      grouped.set(conflict.entityType, group);
    }

    return grouped;
  }
}

/**
 * Base resolution handler interface
 */
abstract class ResolutionHandler {
  abstract canHandle(
    conflict: Conflict,
    config: EntityResolutionConfig,
    context: ResolutionContext
  ): boolean;

  abstract resolve<T extends { id: string }>(
    conflict: Conflict<T>,
    config: EntityResolutionConfig,
    context: ResolutionContext
  ): Promise<ConflictResolution<T>>;
}

/**
 * Last Write Wins resolution handler
 */
class LastWriteWinsHandler extends ResolutionHandler {
  canHandle(): boolean {
    return true; // Can always apply last-write-wins
  }

   
  async resolve<T extends { id: string }>(
    conflict: Conflict<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    config: EntityResolutionConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: ResolutionContext
  ): Promise<ConflictResolution<T>> {
    const localModified = new Date(conflict.localEntity._lastModified);
    const remoteModified = new Date(conflict.remoteEntity._lastModified);
    
    const winner = localModified > remoteModified ? 
      conflict.localEntity : conflict.remoteEntity;

    return {
      strategy: ResolutionStrategy.LAST_WRITE_WINS,
      resolvedEntity: {
        ...winner,
        _version: Math.max(conflict.localEntity._version, conflict.remoteEntity._version) + 1,
        _lastModified: new Date().toISOString(),
        _syncStatus: 'pending' as SyncStatus
      },
      automatic: true,
      resolutionNotes: `Applied last-write-wins strategy. Winner: ${
        winner === conflict.localEntity ? 'local' : 'remote'
      }`
    };
  }
}

/**
 * Field Merge resolution handler
 */
class FieldMergeHandler extends ResolutionHandler {
  canHandle(conflict: Conflict): boolean {
    // Can merge if conflicts are on different fields
    const conflictedFields = new Set(conflict.details.map(d => d.field));
    return conflictedFields.size < Object.keys(conflict.localEntity).length;
  }

  async resolve<T extends { id: string }>(
    conflict: Conflict<T>,
    config: EntityResolutionConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: ResolutionContext
  ): Promise<ConflictResolution<T>> {
    const merged = { ...conflict.remoteEntity };
    const mergedFields: string[] = [];
    const discardedChanges: ConflictDetail[] = [];

    for (const detail of conflict.details) {
      // Skip read-only fields
      if (config.readOnlyFields.includes(detail.field)) {
        continue;
      }

      // Use three-way merge if base entity exists
      if (conflict.baseEntity) {
        const baseValue = (conflict.baseEntity as unknown as Record<string, unknown>)[detail.field];
        
        if (this.valuesEqual(baseValue, detail.remoteValue)) {
          // Remote unchanged, use local
          (merged as unknown as Record<string, unknown>)[detail.field] = detail.localValue;
          mergedFields.push(detail.field);
        } else if (this.valuesEqual(baseValue, detail.localValue)) {
          // Local unchanged, use remote (already in merged)
          mergedFields.push(detail.field);
        } else {
          // Both changed - need to decide
          if (config.priorityFields.includes(detail.field)) {
            // Priority field - use more recent
            const useLocal = new Date(conflict.localEntity._lastModified) > 
                           new Date(conflict.remoteEntity._lastModified);
            if (useLocal) {
              (merged as unknown as Record<string, unknown>)[detail.field] = detail.localValue;
            }
          } else {
            // Non-priority field - keep remote
            discardedChanges.push(detail);
          }
        }
      } else {
        // No base - use timestamp comparison for non-priority fields
        if (!config.priorityFields.includes(detail.field)) {
          const useLocal = new Date(conflict.localEntity._lastModified) > 
                         new Date(conflict.remoteEntity._lastModified);
          if (useLocal) {
            (merged as unknown as Record<string, unknown>)[detail.field] = detail.localValue;
            mergedFields.push(detail.field);
          }
        }
      }
    }

    return {
      strategy: ResolutionStrategy.FIELD_MERGE,
      resolvedEntity: {
        ...merged,
        _version: Math.max(conflict.localEntity._version, conflict.remoteEntity._version) + 1,
        _lastModified: new Date().toISOString(),
        _syncStatus: 'pending' as SyncStatus
      },
      mergedFields,
      discardedChanges,
      automatic: true,
      resolutionNotes: `Merged ${mergedFields.length} fields, discarded ${discardedChanges.length} changes`
    };
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

/**
 * Business Rule resolution handler
 */
class BusinessRuleHandler extends ResolutionHandler {
  canHandle(conflict: Conflict, config: EntityResolutionConfig): boolean {
    return config.businessRules.some(rule => rule.evaluate(conflict));
  }

  async resolve<T extends { id: string }>(
    conflict: Conflict<T>,
    config: EntityResolutionConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: ResolutionContext
  ): Promise<ConflictResolution<T>> {
    // Find applicable rules
    const applicableRules = config.businessRules
      .filter(rule => rule.evaluate(conflict))
      .sort((a, b) => b.priority - a.priority);

    if (applicableRules.length === 0) {
      throw new Error('No applicable business rules found');
    }

    // Apply highest priority rule
    const rule = applicableRules[0];
    const ruleResolution = rule.resolution(conflict);

    // Merge rule resolution with remote entity
    const resolved = {
      ...conflict.remoteEntity,
      ...ruleResolution
    };

    return {
      strategy: ResolutionStrategy.BUSINESS_RULE_PRIORITY,
      resolvedEntity: {
        ...resolved,
        _version: Math.max(conflict.localEntity._version, conflict.remoteEntity._version) + 1,
        _lastModified: new Date().toISOString(),
        _syncStatus: 'pending' as SyncStatus
      },
      automatic: true,
      resolutionNotes: `Applied business rule: ${rule.name}`
    };
  }
}

/**
 * User Hierarchy resolution handler
 */
class UserHierarchyHandler extends ResolutionHandler {
  private roleHierarchy = {
    admin: 4,
    secretary: 3,
    judge: 3,
    exhibitor: 1,
    guest: 0
  };

  canHandle(conflict: Conflict, config: EntityResolutionConfig, context: ResolutionContext): boolean {
    // Can handle if we have user context
    return !!context.userRole;
  }

  async resolve<T extends { id: string }>(
    conflict: Conflict<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    config: EntityResolutionConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: ResolutionContext
  ): Promise<ConflictResolution<T>> {
    // Get role priorities
    const localModifiedBy = (conflict.localEntity as unknown as Record<string, unknown>)._modifiedBy as { role?: string } | undefined;
    const remoteModifiedBy = (conflict.remoteEntity as unknown as Record<string, unknown>)._modifiedBy as { role?: string } | undefined;
    const localRole = localModifiedBy?.role || 'guest';
    const remoteRole = remoteModifiedBy?.role || 'guest';
    
    const localPriority = this.roleHierarchy[localRole as keyof typeof this.roleHierarchy] || 0;
    const remotePriority = this.roleHierarchy[remoteRole as keyof typeof this.roleHierarchy] || 0;

    // Higher priority wins
    const winner = localPriority >= remotePriority ? 
      conflict.localEntity : conflict.remoteEntity;

    return {
      strategy: ResolutionStrategy.USER_HIERARCHY,
      resolvedEntity: {
        ...winner,
        _version: Math.max(conflict.localEntity._version, conflict.remoteEntity._version) + 1,
        _lastModified: new Date().toISOString(),
        _syncStatus: 'pending' as SyncStatus
      },
      automatic: true,
      resolutionNotes: `User hierarchy resolution: ${
        winner === conflict.localEntity ? localRole : remoteRole
      } (priority ${Math.max(localPriority, remotePriority)}) wins`
    };
  }
}

// Export singleton instance
export const conflictResolver = new ConflictResolver();