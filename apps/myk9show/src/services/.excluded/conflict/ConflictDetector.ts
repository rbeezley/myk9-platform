import { SyncMetadata } from '../../types/sync-types';
import { Conflict, ConflictType, ConflictPriority, ConflictDetail } from './ConflictResolver';

export interface ConflictDetectionResult<T> {
  hasConflict: boolean;
  conflict?: Conflict<T>;
  conflictCount: number;
  highPriorityConflicts: number;
  criticalConflicts: number;
}

export interface FieldComparisonOptions {
  ignoreFields?: string[];
  priorityFields?: string[];
  customComparators?: Map<string, (a: unknown, b: unknown) => boolean>;
  deepComparison?: boolean;
}

export class ConflictDetector {
  private static instance: ConflictDetector;

  static getInstance(): ConflictDetector {
    if (!ConflictDetector.instance) {
      ConflictDetector.instance = new ConflictDetector();
    }
    return ConflictDetector.instance;
  }

  /**
   * Quick conflict check based on version and timestamp
   */
  hasVersionConflict<T>(
    localEntity: T & SyncMetadata,
    remoteEntity: T & SyncMetadata
  ): boolean {
    // No conflict if versions match
    if (localEntity._version === remoteEntity._version) {
      return false;
    }

    // Check if entities diverged from same base version
    const localModified = new Date(localEntity._lastModified);
    const remoteModified = new Date(remoteEntity._lastModified);
    
    // If one was clearly modified after the other, no conflict
    const timeDiff = Math.abs(localModified.getTime() - remoteModified.getTime());
    if (timeDiff > 60000) { // 1 minute threshold
      return false;
    }

    return true;
  }

  /**
   * Deep field-level conflict detection
   */
  async detectFieldConflicts<T extends { id: string }>(
    localEntity: T & SyncMetadata,
    remoteEntity: T & SyncMetadata,
    baseEntity?: T & SyncMetadata,
    options: FieldComparisonOptions = {}
  ): Promise<ConflictDetectionResult<T>> {
    const conflicts: ConflictDetail[] = [];
    const entityFields = this.getComparableFields(localEntity, remoteEntity, options);

    for (const field of entityFields) {
      const localValue = (localEntity as unknown as Record<string, unknown>)[field];
      const remoteValue = (remoteEntity as unknown as Record<string, unknown>)[field];
      const baseValue = baseEntity ? (baseEntity as unknown as Record<string, unknown>)[field] : undefined;

      const hasConflict = await this.compareFieldValues(
        field,
        localValue,
        remoteValue,
        baseValue,
        options
      );

      if (hasConflict) {
        conflicts.push({
          field,
          localValue,
          remoteValue,
          baseValue,
          conflictType: this.classifyFieldConflict(field, localValue, remoteValue, baseValue)
        });
      }
    }

    if (conflicts.length === 0) {
      return {
        hasConflict: false,
        conflictCount: 0,
        highPriorityConflicts: 0,
        criticalConflicts: 0
      };
    }

    // Analyze conflict severity
    const priorityFields = options.priorityFields || [];
    let highPriorityConflicts = 0;
    let criticalConflicts = 0;

    conflicts.forEach(conflict => {
      if (priorityFields.includes(conflict.field)) {
        highPriorityConflicts++;
      }
      if (conflict.conflictType === ConflictType.STRUCTURAL_CONFLICT ||
          conflict.conflictType === ConflictType.DELETED_ENTITY) {
        criticalConflicts++;
      }
    });

    // Create conflict object
    const conflict: Conflict<T> = {
      id: this.generateConflictId(),
      entityType: this.inferEntityType(localEntity),
      entityId: localEntity.id,
      localEntity,
      remoteEntity,
      baseEntity,
      conflictType: this.determineOverallConflictType(conflicts),
      priority: this.calculateConflictPriority(conflicts, priorityFields),
      details: conflicts,
      detectedAt: new Date()
    };

    return {
      hasConflict: true,
      conflict,
      conflictCount: conflicts.length,
      highPriorityConflicts,
      criticalConflicts
    };
  }

  /**
   * Batch conflict detection for multiple entity pairs
   */
  async batchDetectConflicts<T extends { id: string }>(
    entityPairs: Array<{
      local: T & SyncMetadata;
      remote: T & SyncMetadata;
      base?: T & SyncMetadata;
    }>,
    options: FieldComparisonOptions = {}
  ): Promise<ConflictDetectionResult<T>[]> {
    const results: ConflictDetectionResult<T>[] = [];

    // Process in batches to avoid memory issues
    const batchSize = 50;
    for (let i = 0; i < entityPairs.length; i += batchSize) {
      const batch = entityPairs.slice(i, i + batchSize);
      const batchPromises = batch.map(pair =>
        this.detectFieldConflicts(pair.local, pair.remote, pair.base, options)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Smart conflict detection using machine learning-like heuristics
   */
  async detectSmartConflicts<T extends { id: string }>(
    localEntity: T & SyncMetadata,
    remoteEntity: T & SyncMetadata,
    historicalData?: Array<T & SyncMetadata>
  ): Promise<ConflictDetectionResult<T>> {
    // Start with basic field detection
    const basicResult = await this.detectFieldConflicts(localEntity, remoteEntity);

    if (!basicResult.hasConflict) {
      return basicResult;
    }

    // Enhance with smart analysis
    const enhancedConflict = await this.enhanceConflictWithSmartAnalysis(
      basicResult.conflict!,
      historicalData
    );

    return {
      ...basicResult,
      conflict: enhancedConflict
    };
  }

  /**
   * Private helper methods
   */
  private getComparableFields<T extends { id: string }>(
    localEntity: T & SyncMetadata,
    remoteEntity: T & SyncMetadata,
    options: FieldComparisonOptions
  ): string[] {
    const allFields = new Set([
      ...Object.keys(localEntity),
      ...Object.keys(remoteEntity)
    ]);

    // Remove metadata fields and ignored fields
    const comparableFields = Array.from(allFields).filter(field => {
      if (field.startsWith('_')) return false;
      if (options.ignoreFields?.includes(field)) return false;
      return true;
    });

    return comparableFields;
  }

  private async compareFieldValues(
    field: string,
    localValue: unknown,
    remoteValue: unknown,
    baseValue: unknown,
    options: FieldComparisonOptions
  ): Promise<boolean> {
    // Use custom comparator if available
    const customComparator = options.customComparators?.get(field);
    if (customComparator) {
      return !customComparator(localValue, remoteValue);
    }

    // Three-way comparison if base exists
    if (baseValue !== undefined) {
      const localChanged = !this.deepEquals(localValue, baseValue);
      const remoteChanged = !this.deepEquals(remoteValue, baseValue);
      
      // Conflict only if both changed and to different values
      return localChanged && remoteChanged && !this.deepEquals(localValue, remoteValue);
    }

    // Two-way comparison
    return !this.deepEquals(localValue, remoteValue);
  }

  private deepEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, index) => this.deepEquals(val, b[index]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => this.deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
    }

    // Handle dates
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    return false;
  }

  private classifyFieldConflict(
    field: string,
    localValue: unknown,
    remoteValue: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    baseValue?: unknown
  ): ConflictType {
    // Check for null/undefined (deletion)
    if (localValue == null || remoteValue == null) {
      return ConflictType.DELETED_ENTITY;
    }

    // Check for type mismatch (structural)
    if (typeof localValue !== typeof remoteValue) {
      return ConflictType.STRUCTURAL_CONFLICT;
    }

    // Check for array/object structural changes
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      // Significant array structure change
      if (Math.abs(localValue.length - remoteValue.length) > localValue.length * 0.5) {
        return ConflictType.STRUCTURAL_CONFLICT;
      }
    }

    // Business logic conflicts (field-specific)
    if (this.isBusinessLogicField(field)) {
      return ConflictType.BUSINESS_RULE_VIOLATION;
    }

    return ConflictType.FIELD_CONFLICT;
  }

  private isBusinessLogicField(field: string): boolean {
    const businessFields = [
      'status', 'paymentStatus', 'checkInStatus', 'qualified',
      'placement', 'score', 'judgeAssignments', 'roles'
    ];
    return businessFields.includes(field);
  }

  private determineOverallConflictType(conflicts: ConflictDetail[]): ConflictType {
    // Prioritize conflict types
    if (conflicts.some(c => c.conflictType === ConflictType.DELETED_ENTITY)) {
      return ConflictType.DELETED_ENTITY;
    }
    if (conflicts.some(c => c.conflictType === ConflictType.STRUCTURAL_CONFLICT)) {
      return ConflictType.STRUCTURAL_CONFLICT;
    }
    if (conflicts.some(c => c.conflictType === ConflictType.BUSINESS_RULE_VIOLATION)) {
      return ConflictType.BUSINESS_RULE_VIOLATION;
    }
    return ConflictType.FIELD_CONFLICT;
  }

  private calculateConflictPriority(
    conflicts: ConflictDetail[],
    priorityFields: string[]
  ): ConflictPriority {
    let maxPriority = ConflictPriority.LOW;

    for (const conflict of conflicts) {
      let conflictPriority = ConflictPriority.LOW;

      // High priority for priority fields
      if (priorityFields.includes(conflict.field)) {
        conflictPriority = ConflictPriority.HIGH;
      }

      // Critical for structural and business rule conflicts
      if (conflict.conflictType === ConflictType.STRUCTURAL_CONFLICT ||
          conflict.conflictType === ConflictType.BUSINESS_RULE_VIOLATION) {
        conflictPriority = ConflictPriority.HIGH;
      }

      // Critical for deletions
      if (conflict.conflictType === ConflictType.DELETED_ENTITY) {
        conflictPriority = ConflictPriority.CRITICAL;
      }

      maxPriority = Math.max(maxPriority, conflictPriority);
    }

    return maxPriority;
  }

  private async enhanceConflictWithSmartAnalysis<T extends { id: string }>(
    conflict: Conflict<T>,
    historicalData?: Array<T & SyncMetadata>
  ): Promise<Conflict<T>> {
    // Analyze patterns in historical data
    if (historicalData && historicalData.length > 0) {
      const patterns = this.analyzeHistoricalPatterns(historicalData, conflict);
      
      // Adjust priority based on patterns
      if (patterns.frequentConflictField) {
        conflict.priority = Math.min(conflict.priority + 1, ConflictPriority.CRITICAL);
      }
    }

    return conflict;
  }

  private analyzeHistoricalPatterns<T extends { id: string }>(
    historicalData: Array<T & SyncMetadata>,
    conflict: Conflict<T>
  ): { frequentConflictField: boolean; dataVolatility: number } {
    // Analyze field change frequency
    const fieldChangeFrequency = new Map<string, number>();
    
    for (let i = 1; i < historicalData.length; i++) {
      const prev = historicalData[i - 1];
      const curr = historicalData[i];
      
      for (const field of Object.keys(curr)) {
        if (field.startsWith('_')) continue;
        
        if (!this.deepEquals((prev as unknown as Record<string, unknown>)[field], (curr as unknown as Record<string, unknown>)[field])) {
          fieldChangeFrequency.set(field, (fieldChangeFrequency.get(field) || 0) + 1);
        }
      }
    }

    // Check if any conflict fields are frequently changing
    const frequentConflictField = conflict.details.some(detail => {
      const frequency = fieldChangeFrequency.get(detail.field) || 0;
      return frequency > historicalData.length * 0.3; // 30% threshold
    });

    // Calculate overall data volatility
    const totalChanges = Array.from(fieldChangeFrequency.values()).reduce((a, b) => a + b, 0);
    const dataVolatility = totalChanges / (historicalData.length * Object.keys(historicalData[0]).length);

    return { frequentConflictField, dataVolatility };
  }

  private inferEntityType<T extends { id: string }>(entity: T & SyncMetadata): string {
    // Infer entity type from object structure
    if ('showDate' in entity && 'venue' in entity) return 'show';
    if ('dogId' in entity && 'showId' in entity) return 'registration';
    if ('breed' in entity && 'registrationNumber' in entity) return 'dog';
    if ('email' in entity && 'firstName' in entity) return 'person';
    if ('score' in entity && 'judgeId' in entity) return 'score';
    if ('name' in entity && 'category' in entity) return 'class';
    return 'unknown';
  }

  private generateConflictId(): string {
    return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const conflictDetector = ConflictDetector.getInstance();