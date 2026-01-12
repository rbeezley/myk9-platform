import { logger } from '@/services/LoggingService';

/**
 * Advanced conflict resolution strategies for synchronization
 * Implements various algorithms for handling data conflicts during sync operations
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
 

export interface ConflictData<T = unknown> {
  entityType: string;
  entityId: string;
  localVersion: T;
  remoteVersion: T;
  ancestorVersion?: T; // Common ancestor for 3-way merge
  timestamp: Date;
  conflictType: ConflictType;
  metadata: ConflictMetadata;
}

export interface ConflictMetadata {
  localModifiedAt: Date;
  remoteModifiedAt: Date;
  localModifiedBy: string;
  remoteModifiedBy: string;
  conflictFields: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoResolvable: boolean;
}

export type ConflictType = 
  | 'concurrent_edit'      // Both versions modified simultaneously
  | 'edit_delete'          // One side edited, other deleted
  | 'delete_edit'          // One side deleted, other edited
  | 'create_create'        // Same entity created on both sides
  | 'field_conflict'       // Specific field conflicts
  | 'dependency_conflict'  // Related entity conflicts
  | 'schema_mismatch';     // Different data structure versions

export interface ResolutionResult<T = unknown> {
  success: boolean;
  resolvedData?: T;
  strategy: string;
  manualResolutionRequired: boolean;
  confidence: number; // 0-1, how confident the resolution is
  explanation: string;
  appliedChanges: Change[];
  warnings: string[];
}

export interface Change {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  source: 'local' | 'remote' | 'merged';
  reason: string;
}

export interface ResolutionStrategy<T = unknown> {
  name: string;
  description: string;
  canResolve: (conflict: ConflictData<T>) => boolean;
  resolve: (conflict: ConflictData<T>) => Promise<ResolutionResult<T>>;
  priority: number; // Higher number = higher priority
}

/**
 * Comprehensive conflict resolution service
 */
export class ConflictResolutionService {
  private strategies: Map<string, ResolutionStrategy> = new Map();
  private fieldPriorities: Map<string, number> = new Map();
  private userPreferences: ResolutionPreferences = {};

  constructor() {
    this.registerDefaultStrategies();
    this.initializeFieldPriorities();
  }

  /**
   * Resolves a conflict using the best available strategy
   * @param conflict - Conflict data to resolve
   * @returns Resolution result
   */
  async resolveConflict<T>(conflict: ConflictData<T>): Promise<ResolutionResult<T>> {
    // Find applicable strategies
    const applicableStrategies = Array.from(this.strategies.values())
      .filter(strategy => strategy.canResolve(conflict))
      .sort((a, b) => b.priority - a.priority);

    if (applicableStrategies.length === 0) {
      return {
        success: false,
        strategy: 'none',
        manualResolutionRequired: true,
        confidence: 0,
        explanation: 'No automatic resolution strategy available',
        appliedChanges: [],
        warnings: ['Manual intervention required']
      };
    }

    // Try strategies in priority order
    for (const strategy of applicableStrategies) {
      try {
        const result = await strategy.resolve(conflict);
        
        // If resolution was successful and has good confidence, use it
        if (result.success && result.confidence >= 0.7) {
          return result as ResolutionResult<T>;
        }
        
        // Store partial results for fallback
        if (result.success && !result.manualResolutionRequired) {
          return result as ResolutionResult<T>;
        }
      } catch (error) {
        logger.warn(`Strategy ${strategy.name} failed:`, 'sync', {}, error as Error);
      }
    }

    // If no strategy worked well, require manual resolution
    return {
      success: false,
      strategy: 'failed',
      manualResolutionRequired: true,
      confidence: 0,
      explanation: 'All automatic resolution strategies failed',
      appliedChanges: [],
      warnings: ['Complex conflict requires manual resolution']
    };
  }

  /**
   * Analyzes a conflict to determine its characteristics
   * @param localData - Local version of data
   * @param remoteData - Remote version of data
   * @param entityType - Type of entity
   * @param entityId - Entity identifier
   * @returns Conflict analysis
   */
  analyzeConflict<T extends Record<string, any>>(
    localData: T,
    remoteData: T,
    entityType: string,
    entityId: string,
    ancestorData?: T
  ): ConflictData<T> {
    const conflictFields = this.findConflictingFields(localData, remoteData);
    const conflictType = this.determineConflictType(localData, remoteData, ancestorData);
    const severity = this.assessConflictSeverity(conflictFields, entityType);

    return {
      entityType,
      entityId,
      localVersion: localData,
      remoteVersion: remoteData,
      ancestorVersion: ancestorData,
      timestamp: new Date(),
      conflictType,
      metadata: {
        localModifiedAt: new Date(localData.updatedAt || localData.modifiedAt || Date.now()),
        remoteModifiedAt: new Date(remoteData.updatedAt || remoteData.modifiedAt || Date.now()),
        localModifiedBy: localData.modifiedBy || 'unknown',
        remoteModifiedBy: remoteData.modifiedBy || 'unknown',
        conflictFields,
        severity,
        autoResolvable: this.isAutoResolvable(conflictFields, conflictType, severity)
      }
    };
  }

  /**
   * Registers a custom resolution strategy
   * @param strategy - Resolution strategy to register
   */
  registerStrategy(strategy: ResolutionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Sets user preferences for conflict resolution
   * @param preferences - User preferences
   */
  setUserPreferences(preferences: Partial<ResolutionPreferences>): void {
    Object.assign(this.userPreferences, preferences);
  }

  /**
   * Gets conflict resolution statistics
   * @returns Resolution statistics
   */
  getResolutionStatistics(): ResolutionStatistics {
    // This would typically come from a persistent store
    return {
      totalConflicts: 0,
      autoResolved: 0,
      manualResolved: 0,
      strategiesUsed: {},
      averageResolutionTime: 0,
      conflictTypeDistribution: {} as Record<ConflictType, number>
    };
  }

  // Private methods

  private registerDefaultStrategies(): void {
    // Last Writer Wins strategy
    this.registerStrategy({
      name: 'last_writer_wins',
      description: 'Uses the most recently modified version',
      priority: 3,
      canResolve: (conflict) => conflict.conflictType !== 'delete_edit',
      resolve: async (conflict) => {
        const localTime = conflict.metadata.localModifiedAt.getTime();
        const remoteTime = conflict.metadata.remoteModifiedAt.getTime();
        
        const winner = localTime > remoteTime ? 'local' : 'remote';
        const resolvedData = winner === 'local' ? conflict.localVersion : conflict.remoteVersion;
        
        return {
          success: true,
          resolvedData,
          strategy: 'last_writer_wins',
          manualResolutionRequired: false,
          confidence: 0.8,
          explanation: `Used ${winner} version (modified at ${winner === 'local' ? conflict.metadata.localModifiedAt : conflict.metadata.remoteModifiedAt})`,
          appliedChanges: [{
            field: '_entire_object',
            oldValue: winner === 'local' ? conflict.remoteVersion : conflict.localVersion,
            newValue: resolvedData,
            source: winner,
            reason: 'Most recent modification'
          }],
          warnings: winner === 'remote' ? ['Local changes were overwritten'] : []
        };
      }
    });

    // Field-level merge strategy
    this.registerStrategy({
      name: 'field_level_merge',
      description: 'Merges non-conflicting fields and resolves conflicts by priority',
      priority: 7,
      canResolve: (conflict) => conflict.conflictType === 'concurrent_edit' || conflict.conflictType === 'field_conflict',
      resolve: async (conflict) => {
        const result = await this.performFieldLevelMerge(conflict);
        return result;
      }
    });

    // Three-way merge strategy
    this.registerStrategy({
      name: 'three_way_merge',
      description: 'Uses common ancestor to resolve conflicts intelligently',
      priority: 9,
      canResolve: (conflict) => !!conflict.ancestorVersion && conflict.conflictType === 'concurrent_edit',
      resolve: async (conflict) => {
        const result = await this.performThreeWayMerge(conflict);
        return result;
      }
    });

    // Business rule strategy
    this.registerStrategy({
      name: 'business_rules',
      description: 'Applies domain-specific business rules',
      priority: 10,
      canResolve: (conflict) => this.hasBusinessRules(conflict.entityType),
      resolve: async (conflict) => {
        const result = await this.applyBusinessRules(conflict);
        return result;
      }
    });

    // User preference strategy
    this.registerStrategy({
      name: 'user_preference',
      description: 'Applies user-defined resolution preferences',
      priority: 8,
      canResolve: (conflict) => this.hasUserPreference(conflict),
      resolve: async (conflict) => {
        const result = await this.applyUserPreference(conflict);
        return result;
      }
    });
  }

  private async performFieldLevelMerge<T extends Record<string, any>>(
    conflict: ConflictData<T>
  ): Promise<ResolutionResult<T>> {
    const { localVersion, remoteVersion, metadata } = conflict;
    const mergedData = { ...localVersion };
    const appliedChanges: Change[] = [];
    const warnings: string[] = [];
    let confidence = 0.9;

    for (const field of metadata.conflictFields) {
      const localValue = localVersion[field];
      const remoteValue = remoteVersion[field];
      
      if (localValue === remoteValue) {
        continue; // No conflict
      }

      // Check field priority
      const fieldPriority = this.fieldPriorities.get(field) || 0;
      
      if (fieldPriority > 5) {
        // High priority field - use more recent version
        const localTime = metadata.localModifiedAt.getTime();
        const remoteTime = metadata.remoteModifiedAt.getTime();
        
        if (remoteTime > localTime) {
          (mergedData as any)[field] = remoteValue;
          appliedChanges.push({
            field,
            oldValue: localValue,
            newValue: remoteValue,
            source: 'remote',
            reason: 'High priority field - more recent'
          });
        }
      } else if (fieldPriority < 2) {
        // Low priority field - keep local version
        appliedChanges.push({
          field,
          oldValue: remoteValue,
          newValue: localValue,
          source: 'local',
          reason: 'Low priority field - kept local'
        });
      } else {
        // Medium priority - needs manual resolution
        confidence = Math.min(confidence, 0.5);
        warnings.push(`Field '${field}' requires manual resolution`);
      }
    }

    return {
      success: true,
      resolvedData: mergedData,
      strategy: 'field_level_merge',
      manualResolutionRequired: confidence < 0.7,
      confidence,
      explanation: `Merged ${appliedChanges.length} fields with ${warnings.length} conflicts`,
      appliedChanges,
      warnings
    };
  }

  private async performThreeWayMerge<T extends Record<string, any>>(
    conflict: ConflictData<T>
  ): Promise<ResolutionResult<T>> {
    const { localVersion, remoteVersion, ancestorVersion } = conflict;
    
    if (!ancestorVersion) {
      throw new Error('Three-way merge requires ancestor version');
    }

    const mergedData = { ...localVersion };
    const appliedChanges: Change[] = [];
    const warnings: string[] = [];
    let confidence = 0.95;

    // Compare each field across all three versions
    for (const field of Object.keys(localVersion)) {
      const localValue = localVersion[field];
      const remoteValue = remoteVersion[field];
      const ancestorValue = ancestorVersion[field];

      // No conflict if all versions are the same
      if (localValue === remoteValue && remoteValue === ancestorValue) {
        continue;
      }

      // Local unchanged, remote changed
      if (localValue === ancestorValue && remoteValue !== ancestorValue) {
        (mergedData as any)[field] = remoteValue;
        appliedChanges.push({
          field,
          oldValue: localValue,
          newValue: remoteValue,
          source: 'remote',
          reason: 'Local unchanged, remote modified'
        });
      }
      // Remote unchanged, local changed
      else if (remoteValue === ancestorValue && localValue !== ancestorValue) {
        // Keep local value (already set)
        appliedChanges.push({
          field,
          oldValue: ancestorValue,
          newValue: localValue,
          source: 'local',
          reason: 'Remote unchanged, local modified'
        });
      }
      // Both changed to same value
      else if (localValue === remoteValue && localValue !== ancestorValue) {
        // Keep the value (already set to local, which equals remote)
        appliedChanges.push({
          field,
          oldValue: ancestorValue,
          newValue: localValue,
          source: 'merged',
          reason: 'Both sides changed to same value'
        });
      }
      // Both changed to different values - conflict
      else {
        confidence = Math.min(confidence, 0.6);
        warnings.push(`True conflict in field '${field}': local=${localValue}, remote=${remoteValue}, ancestor=${ancestorValue}`);
        
        // Apply fallback logic (prefer local in this case)
        appliedChanges.push({
          field,
          oldValue: remoteValue,
          newValue: localValue,
          source: 'local',
          reason: 'Conflict resolved by keeping local version'
        });
      }
    }

    return {
      success: true,
      resolvedData: mergedData,
      strategy: 'three_way_merge',
      manualResolutionRequired: confidence < 0.8,
      confidence,
      explanation: `Three-way merge completed with ${warnings.length} unresolved conflicts`,
      appliedChanges,
      warnings
    };
  }

  private async applyBusinessRules<T>(conflict: ConflictData<T>): Promise<ResolutionResult<T>> {
    const { entityType } = conflict;
    
    // Dog-specific business rules
    if (entityType === 'dog') {
      return this.resolveDogConflict(conflict);
    }
    
    // Show-specific business rules
    if (entityType === 'show') {
      return this.resolveShowConflict(conflict);
    }
    
    // Entry-specific business rules
    if (entityType === 'entry') {
      return this.resolveEntryConflict(conflict);
    }

    // Default business rule: preserve critical data integrity
    return {
      success: false,
      strategy: 'business_rules',
      manualResolutionRequired: true,
      confidence: 0,
      explanation: `No specific business rules for entity type: ${entityType}`,
      appliedChanges: [],
      warnings: ['Unknown entity type for business rules']
    };
  }

  private async resolveDogConflict<T>(conflict: ConflictData<T>): Promise<ResolutionResult<T>> {
    const { localVersion, remoteVersion } = conflict;
    const local = localVersion as Record<string, unknown>;
    const remote = remoteVersion as Record<string, unknown>;
    
    // Critical fields that should never be auto-merged
    const criticalFields = ['registrationNumber', 'breed', 'dateOfBirth'];
    
    for (const field of criticalFields) {
      if (local[field] !== remote[field]) {
        return {
          success: false,
          strategy: 'business_rules',
          manualResolutionRequired: true,
          confidence: 0,
          explanation: `Critical dog field '${field}' has conflicting values`,
          appliedChanges: [],
          warnings: [`Manual review required for ${field}: local='${local[field]}', remote='${remote[field]}'`]
        };
      }
    }

    // Auto-resolve non-critical fields by recency
    const merged = { ...local };
    const appliedChanges: Change[] = [];
    
    if (remote.updatedAt > local.updatedAt) {
      // Merge safe fields
      const safeFields = ['weight', 'height', 'notes', 'status'];
      for (const field of safeFields) {
        if (remote[field] !== local[field]) {
          merged[field] = remote[field];
          appliedChanges.push({
            field,
            oldValue: local[field],
            newValue: remote[field],
            source: 'remote',
            reason: 'Non-critical field updated remotely'
          });
        }
      }
    }

    return {
      success: true,
      resolvedData: merged,
      strategy: 'business_rules',
      manualResolutionRequired: false,
      confidence: 0.9,
      explanation: 'Dog business rules applied successfully',
      appliedChanges,
      warnings: []
    };
  }

  private async resolveShowConflict<T>(conflict: ConflictData<T>): Promise<ResolutionResult<T>> {
    // Show-specific conflict resolution logic
    const { localVersion, remoteVersion } = conflict;
    const local = localVersion as Record<string, unknown>;
    const remote = remoteVersion as Record<string, unknown>;

    // Shows in progress should not have major changes merged automatically
    if (local.status === 'in_progress' || remote.status === 'in_progress') {
      return {
        success: false,
        strategy: 'business_rules',
        manualResolutionRequired: true,
        confidence: 0,
        explanation: 'Shows in progress require manual conflict resolution',
        appliedChanges: [],
        warnings: ['Show is in progress - manual review required']
      };
    }

    // Use last writer wins for show metadata
    const merged = remote.updatedAt > local.updatedAt ? remote : local;
    
    return {
      success: true,
      resolvedData: merged,
      strategy: 'business_rules',
      manualResolutionRequired: false,
      confidence: 0.8,
      explanation: 'Show conflict resolved by last modification time',
      appliedChanges: [{
        field: '_entire_object',
        oldValue: merged === local ? remote : local,
        newValue: merged,
        source: merged === local ? 'local' : 'remote',
        reason: 'Show business rule: last writer wins'
      }],
      warnings: []
    };
  }

  private async resolveEntryConflict<T>(conflict: ConflictData<T>): Promise<ResolutionResult<T>> {
    // Entry-specific conflict resolution logic
    const { localVersion, remoteVersion } = conflict;
    const local = localVersion as Record<string, unknown>;
    const remote = remoteVersion as Record<string, unknown>;

    // Entries with scores should not be auto-merged
    if ((local.score !== undefined && local.score !== null) || 
        (remote.score !== undefined && remote.score !== null)) {
      return {
        success: false,
        strategy: 'business_rules',
        manualResolutionRequired: true,
        confidence: 0,
        explanation: 'Entries with scores require manual review',
        appliedChanges: [],
        warnings: ['Scored entries require manual conflict resolution']
      };
    }

    // For unscored entries, merge based on status priority
    const statusPriority = {
      'entered': 1,
      'checked_in': 2,
      'running': 3,
      'completed': 4,
      'cancelled': 0
    };

    const localPriority = statusPriority[local.status as keyof typeof statusPriority] || 0;
    const remotePriority = statusPriority[remote.status as keyof typeof statusPriority] || 0;

    const merged = remotePriority > localPriority ? remote : local;

    return {
      success: true,
      resolvedData: merged,
      strategy: 'business_rules',
      manualResolutionRequired: false,
      confidence: 0.85,
      explanation: 'Entry conflict resolved by status priority',
      appliedChanges: [{
        field: 'status',
        oldValue: merged === local ? remote.status : local.status,
        newValue: merged.status,
        source: merged === local ? 'local' : 'remote',
        reason: 'Entry business rule: higher status priority wins'
      }],
      warnings: []
    };
  }

  private async applyUserPreference<T>(conflict: ConflictData<T>): Promise<ResolutionResult<T>> {
    const preference = this.userPreferences[conflict.entityType];
    if (!preference) {
      throw new Error('No user preference found');
    }

    // Apply user's default resolution strategy
    switch (preference.defaultStrategy) {
      case 'always_local':
        return {
          success: true,
          resolvedData: conflict.localVersion,
          strategy: 'user_preference',
          manualResolutionRequired: false,
          confidence: 1.0,
          explanation: 'User preference: always keep local version',
          appliedChanges: [{
            field: '_entire_object',
            oldValue: conflict.remoteVersion,
            newValue: conflict.localVersion,
            source: 'local',
            reason: 'User preference setting'
          }],
          warnings: []
        };
        
      case 'always_remote':
        return {
          success: true,
          resolvedData: conflict.remoteVersion,
          strategy: 'user_preference',
          manualResolutionRequired: false,
          confidence: 1.0,
          explanation: 'User preference: always keep remote version',
          appliedChanges: [{
            field: '_entire_object',
            oldValue: conflict.localVersion,
            newValue: conflict.remoteVersion,
            source: 'remote',
            reason: 'User preference setting'
          }],
          warnings: []
        };
        
      default:
        throw new Error(`Unknown user preference strategy: ${preference.defaultStrategy}`);
    }
  }

  private findConflictingFields<T extends Record<string, unknown>>(local: T, remote: T): string[] {
    const conflictFields: string[] = [];
    const allFields = new Set([...Object.keys(local), ...Object.keys(remote)]);
    
    for (const field of allFields) {
      if (local[field] !== remote[field]) {
        conflictFields.push(field);
      }
    }
    
    return conflictFields;
  }

  private determineConflictType<T>(local: T, remote: T, ancestor?: T): ConflictType {
    if (!local && !remote) return 'create_create';
    if (!local && remote) return 'delete_edit';
    if (local && !remote) return 'edit_delete';
    
    if (ancestor) {
      // Three-way conflict detection
      return 'concurrent_edit';
    }
    
    return 'field_conflict';
  }

  private assessConflictSeverity(conflictFields: string[], entityType: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalFieldsByType = {
      dog: ['registrationNumber', 'breed', 'dateOfBirth'],
      show: ['eventDate', 'status', 'judgeId'],
      entry: ['dogId', 'classId', 'score']
    };

    const criticalFields = criticalFieldsByType[entityType as keyof typeof criticalFieldsByType] || [];
    
    if (conflictFields.some(field => criticalFields.includes(field))) {
      return 'critical';
    }
    
    if (conflictFields.length > 5) return 'high';
    if (conflictFields.length > 2) return 'medium';
    return 'low';
  }

  private isAutoResolvable(conflictFields: string[], conflictType: ConflictType, severity: string): boolean {
    if (severity === 'critical') return false;
    if (conflictType === 'delete_edit' || conflictType === 'edit_delete') return false;
    if (conflictFields.length > 10) return false;
    return true;
  }

  private initializeFieldPriorities(): void {
    // System fields - highest priority
    this.fieldPriorities.set('id', 10);
    this.fieldPriorities.set('createdAt', 10);
    this.fieldPriorities.set('createdBy', 9);
    
    // Business critical fields
    this.fieldPriorities.set('registrationNumber', 9);
    this.fieldPriorities.set('breed', 8);
    this.fieldPriorities.set('dateOfBirth', 8);
    this.fieldPriorities.set('score', 9);
    this.fieldPriorities.set('placement', 8);
    
    // Important fields
    this.fieldPriorities.set('status', 7);
    this.fieldPriorities.set('name', 6);
    this.fieldPriorities.set('email', 6);
    
    // Regular fields
    this.fieldPriorities.set('notes', 3);
    this.fieldPriorities.set('description', 3);
    this.fieldPriorities.set('comments', 2);
    
    // Low priority fields
    this.fieldPriorities.set('color', 1);
    this.fieldPriorities.set('tags', 1);
  }

  private hasBusinessRules(entityType: string): boolean {
    return ['dog', 'show', 'entry', 'person'].includes(entityType);
  }

  private hasUserPreference(conflict: ConflictData): boolean {
    return !!this.userPreferences[conflict.entityType];
  }
}

export interface ResolutionPreferences {
  [entityType: string]: {
    defaultStrategy: 'always_local' | 'always_remote' | 'merge' | 'manual';
    fieldPreferences?: Record<string, 'local' | 'remote' | 'manual'>;
    autoResolveThreshold?: number; // 0-1, minimum confidence for auto-resolution
  };
}

export interface ResolutionStatistics {
  totalConflicts: number;
  autoResolved: number;
  manualResolved: number;
  strategiesUsed: Record<string, number>;
  averageResolutionTime: number;
  conflictTypeDistribution: Record<ConflictType, number>;
}

// Export singleton instance
export const conflictResolutionService = new ConflictResolutionService();