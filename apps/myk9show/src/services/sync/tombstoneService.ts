import { logger } from '@/services/LoggingService';

/**
 * Tombstone management service for handling entity deletions in sync systems
 * Implements proper deletion tracking, conflict resolution, and cleanup policies
 */

 
/* eslint-disable @typescript-eslint/no-unused-vars */

export interface Tombstone {
  id: string;
  entityId: string;
  entityType: string;
  deletedAt: Date;
  deletedBy: string;
  clientId: string;
  version: number;
  vectorClock: Record<string, number>;
  reason?: string;
  metadata: TombstoneMetadata;
  cascade?: CascadeInfo[];
}

export interface TombstoneMetadata {
  originalSize: number;
  lastModifiedAt: Date;
  lastModifiedBy: string;
  checksumBeforeDeletion: string;
  relatedEntities: string[]; // IDs of related entities
  backupLocation?: string; // Location of backup data
  restoreData?: unknown; // Minimal data needed for restoration
  tags?: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface CascadeInfo {
  entityId: string;
  entityType: string;
  relationship: 'parent' | 'child' | 'reference';
  action: 'delete' | 'nullify' | 'restrict';
  executed: boolean;
  error?: string;
}

export interface DeletionPolicy {
  entityType: string;
  softDelete: boolean; // Use tombstones vs hard delete
  retentionPeriod: number; // How long to keep tombstones (ms)
  cascadeRules: CascadeRule[];
  requireConfirmation: boolean;
  backupBeforeDelete: boolean;
  allowRestore: boolean;
  cleanupSchedule?: 'immediate' | 'daily' | 'weekly' | 'monthly';
}

export interface CascadeRule {
  relationshipType: string;
  targetEntityType: string;
  action: 'cascade' | 'nullify' | 'restrict' | 'set_default';
  condition?: (entity: unknown) => boolean;
}

export interface DeletionRequest {
  entityId: string;
  entityType: string;
  reason?: string;
  userId: string;
  clientId: string;
  force?: boolean; // Skip confirmation and restrictions
  skipCascade?: boolean;
  customCascadeRules?: CascadeRule[];
}

export interface DeletionResult {
  success: boolean;
  tombstoneId?: string;
  cascadeResults: CascadeResult[];
  warnings: string[];
  errors: string[];
  restorable: boolean;
  affectedEntities: number;
}

export interface CascadeResult {
  entityId: string;
  entityType: string;
  action: string;
  success: boolean;
  error?: string;
  tombstoneId?: string;
}

export interface RestoreRequest {
  tombstoneId: string;
  userId: string;
  restoreRelated?: boolean;
  customData?: unknown;
}

export interface RestoreResult {
  success: boolean;
  restoredEntityId?: string;
  restoredRelated: string[];
  warnings: string[];
  errors: string[];
  dataIntegrityIssues: string[];
}

/**
 * Comprehensive tombstone management service
 */
export class TombstoneService {
  private tombstones: Map<string, Tombstone> = new Map();
  private deletionPolicies: Map<string, DeletionPolicy> = new Map();
  private entityRelationships: Map<string, EntityRelationship[]> = new Map();
  private cleanupSchedule?: number;

  constructor() {
    this.initializeDefaultPolicies();
    this.startCleanupSchedule();
  }

  /**
   * Performs entity deletion with tombstone creation
   * @param request - Deletion request
   * @returns Deletion result
   */
  async deleteEntity(request: DeletionRequest): Promise<DeletionResult> {
    const { entityId, entityType, reason, userId, clientId, force, skipCascade } = request;
    
    const result: DeletionResult = {
      success: false,
      cascadeResults: [],
      warnings: [],
      errors: [],
      restorable: false,
      affectedEntities: 0
    };

    try {
      // Get deletion policy
      const policy = this.deletionPolicies.get(entityType);
      if (!policy) {
        result.errors.push(`No deletion policy found for entity type: ${entityType}`);
        return result;
      }

      // Check if entity exists and get current data
      const entityData = await this.getEntityData(entityId, entityType);
      if (!entityData) {
        result.errors.push(`Entity not found: ${entityId}`);
        return result;
      }

      // Check for restrictions
      if (!force) {
        const restrictions = await this.checkDeletionRestrictions(entityId, entityType);
        if (restrictions.length > 0) {
          result.errors.push(...restrictions);
          return result;
        }
      }

      // Create backup if required
      let backupLocation: string | undefined;
      if (policy.backupBeforeDelete) {
        backupLocation = await this.createBackup(entityId, entityType, entityData);
        if (!backupLocation) {
          result.warnings.push('Failed to create backup, proceeding with deletion');
        }
      }

      // Handle cascade deletions
      if (!skipCascade && policy.cascadeRules.length > 0) {
        const cascadeResults = await this.executeCascadeDeletions(
          entityId, 
          entityType, 
          policy.cascadeRules,
          userId,
          clientId
        );
        result.cascadeResults = cascadeResults;
        result.affectedEntities += cascadeResults.filter(r => r.success).length;
      }

      // Create tombstone or perform hard delete
      if (policy.softDelete) {
        const tombstone = await this.createTombstone(
          entityId,
          entityType,
          entityData,
          userId,
          clientId,
          reason,
          backupLocation
        );

        result.tombstoneId = tombstone.id;
        result.restorable = policy.allowRestore;
        result.success = true;
      } else {
        // Hard delete - remove entity completely
        await this.performHardDelete(entityId, entityType);
        result.success = true;
        result.restorable = false;
      }

      result.affectedEntities += 1; // The main entity

      // Remove from active storage
      await this.removeFromActiveStorage(entityId, entityType);

    } catch (error) {
      result.errors.push(`Deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Restores an entity from its tombstone
   * @param request - Restore request
   * @returns Restore result
   */
  async restoreEntity(request: RestoreRequest): Promise<RestoreResult> {
    const { tombstoneId, userId, restoreRelated, customData } = request;
    
    const result: RestoreResult = {
      success: false,
      restoredRelated: [],
      warnings: [],
      errors: [],
      dataIntegrityIssues: []
    };

    try {
      // Get tombstone
      const tombstone = this.tombstones.get(tombstoneId);
      if (!tombstone) {
        result.errors.push(`Tombstone not found: ${tombstoneId}`);
        return result;
      }

      // Check if restoration is allowed
      const policy = this.deletionPolicies.get(tombstone.entityType);
      if (!policy?.allowRestore) {
        result.errors.push(`Restoration not allowed for entity type: ${tombstone.entityType}`);
        return result;
      }

      // Check if entity already exists
      const existingEntity = await this.getEntityData(tombstone.entityId, tombstone.entityType);
      if (existingEntity) {
        result.errors.push(`Entity already exists: ${tombstone.entityId}`);
        return result;
      }

      // Prepare restore data
      let restoreData = customData || tombstone.metadata.restoreData;
      
      if (!restoreData && tombstone.metadata.backupLocation) {
        restoreData = await this.loadFromBackup(tombstone.metadata.backupLocation);
      }

      if (!restoreData) {
        result.errors.push('No data available for restoration');
        return result;
      }

      // Validate data integrity
      const integrityIssues = await this.validateDataIntegrity(restoreData, tombstone);
      result.dataIntegrityIssues = integrityIssues;

      // Restore the entity
      await this.restoreToActiveStorage(tombstone.entityId, tombstone.entityType, restoreData);
      result.restoredEntityId = tombstone.entityId;

      // Restore related entities if requested
      if (restoreRelated && tombstone.cascade) {
        for (const cascadeInfo of tombstone.cascade) {
          if (cascadeInfo.action === 'delete' && cascadeInfo.executed) {
            const relatedTombstone = await this.findTombstoneByEntityId(cascadeInfo.entityId);
            if (relatedTombstone) {
              const relatedResult = await this.restoreEntity({
                tombstoneId: relatedTombstone.id,
                userId,
                restoreRelated: false // Prevent infinite recursion
              });
              
              if (relatedResult.success && relatedResult.restoredEntityId) {
                result.restoredRelated.push(relatedResult.restoredEntityId);
              } else {
                result.warnings.push(`Failed to restore related entity: ${cascadeInfo.entityId}`);
              }
            }
          }
        }
      }

      // Remove tombstone
      this.tombstones.delete(tombstoneId);
      await this.removeTombstoneFromStorage(tombstoneId);

      result.success = true;

    } catch (error) {
      result.errors.push(`Restoration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Gets all tombstones for an entity type
   * @param entityType - Entity type filter
   * @param includeExpired - Include expired tombstones
   * @returns Array of tombstones
   */
  getTombstones(entityType?: string, includeExpired = false): Tombstone[] {
    let tombstones = Array.from(this.tombstones.values());

    if (entityType) {
      tombstones = tombstones.filter(t => t.entityType === entityType);
    }

    if (!includeExpired) {
      const now = new Date();
      tombstones = tombstones.filter(t => {
        const policy = this.deletionPolicies.get(t.entityType);
        if (!policy) return true;
        
        const expiry = new Date(t.deletedAt.getTime() + policy.retentionPeriod);
        return expiry > now;
      });
    }

    return tombstones.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  }

  /**
   * Permanently removes expired tombstones
   * @param entityType - Optional entity type filter
   * @returns Number of tombstones cleaned up
   */
  async cleanupExpiredTombstones(entityType?: string): Promise<number> {
    const now = new Date();
    let cleanedUp = 0;

    for (const [tombstoneId, tombstone] of this.tombstones) {
      if (entityType && tombstone.entityType !== entityType) {
        continue;
      }

      const policy = this.deletionPolicies.get(tombstone.entityType);
      if (!policy) continue;

      const expiry = new Date(tombstone.deletedAt.getTime() + policy.retentionPeriod);
      if (expiry <= now) {
        // Clean up backup if exists
        if (tombstone.metadata.backupLocation) {
          await this.cleanupBackup(tombstone.metadata.backupLocation);
        }

        // Remove tombstone
        this.tombstones.delete(tombstoneId);
        await this.removeTombstoneFromStorage(tombstoneId);
        cleanedUp++;
      }
    }

    return cleanedUp;
  }

  /**
   * Sets deletion policy for an entity type
   * @param policy - Deletion policy
   */
  setDeletionPolicy(policy: DeletionPolicy): void {
    this.deletionPolicies.set(policy.entityType, policy);
  }

  /**
   * Gets deletion policy for an entity type
   * @param entityType - Entity type
   * @returns Deletion policy or null
   */
  getDeletionPolicy(entityType: string): DeletionPolicy | null {
    return this.deletionPolicies.get(entityType) || null;
  }

  /**
   * Registers entity relationships for cascade operations
   * @param entityType - Source entity type
   * @param relationships - Array of relationships
   */
  registerEntityRelationships(entityType: string, relationships: EntityRelationship[]): void {
    this.entityRelationships.set(entityType, relationships);
  }

  /**
   * Gets tombstone statistics
   * @returns Tombstone statistics
   */
  getTombstoneStatistics(): TombstoneStatistics {
    const tombstones = Array.from(this.tombstones.values());
    const now = new Date();
    
    const byEntityType = tombstones.reduce((acc, t) => {
      acc[t.entityType] = (acc[t.entityType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const expired = tombstones.filter(t => {
      const policy = this.deletionPolicies.get(t.entityType);
      if (!policy) return false;
      const expiry = new Date(t.deletedAt.getTime() + policy.retentionPeriod);
      return expiry <= now;
    }).length;

    const restorable = tombstones.filter(t => {
      const policy = this.deletionPolicies.get(t.entityType);
      return policy?.allowRestore && t.metadata.restoreData;
    }).length;

    return {
      totalTombstones: tombstones.length,
      expiredTombstones: expired,
      restorableTombstones: restorable,
      tombstonesByType: byEntityType,
      oldestTombstone: tombstones.length > 0 ? 
        Math.min(...tombstones.map(t => t.deletedAt.getTime())) : 0,
      newestTombstone: tombstones.length > 0 ? 
        Math.max(...tombstones.map(t => t.deletedAt.getTime())) : 0,
      totalBackupSize: tombstones.reduce((sum, t) => sum + t.metadata.originalSize, 0)
    };
  }

  // Private methods

  private initializeDefaultPolicies(): void {
    // Dog deletion policy
    this.setDeletionPolicy({
      entityType: 'dog',
      softDelete: true,
      retentionPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
      cascadeRules: [
        {
          relationshipType: 'entries',
          targetEntityType: 'entry',
          action: 'cascade'
        },
        {
          relationshipType: 'health_records',
          targetEntityType: 'health_record',
          action: 'cascade'
        }
      ],
      requireConfirmation: true,
      backupBeforeDelete: true,
      allowRestore: true,
      cleanupSchedule: 'weekly'
    });

    // Show deletion policy
    this.setDeletionPolicy({
      entityType: 'show',
      softDelete: true,
      retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
      cascadeRules: [
        {
          relationshipType: 'entries',
          targetEntityType: 'entry',
          action: 'cascade'
        },
        {
          relationshipType: 'trials',
          targetEntityType: 'trial',
          action: 'cascade'
        }
      ],
      requireConfirmation: true,
      backupBeforeDelete: true,
      allowRestore: true,
      cleanupSchedule: 'monthly'
    });

    // Entry deletion policy
    this.setDeletionPolicy({
      entityType: 'entry',
      softDelete: true,
      retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      cascadeRules: [],
      requireConfirmation: false,
      backupBeforeDelete: false,
      allowRestore: true,
      cleanupSchedule: 'weekly'
    });
  }

  private async createTombstone(
    entityId: string,
    entityType: string,
    entityData: unknown,
    userId: string,
    clientId: string,
    reason?: string,
    backupLocation?: string
  ): Promise<Tombstone> {
    const tombstoneId = `tombstone_${entityId}_${Date.now()}`;
    
    const tombstone: Tombstone = {
      id: tombstoneId,
      entityId,
      entityType,
      deletedAt: new Date(),
      deletedBy: userId,
      clientId,
      version: 1,
      vectorClock: { [clientId]: 1 },
      reason,
      metadata: {
        originalSize: JSON.stringify(entityData).length,
        lastModifiedAt: entityData.updatedAt || entityData.modifiedAt || new Date(),
        lastModifiedBy: entityData.updatedBy || entityData.modifiedBy || userId,
        checksumBeforeDeletion: await this.calculateChecksum(entityData),
        relatedEntities: await this.findRelatedEntities(entityId, entityType),
        backupLocation,
        restoreData: this.extractRestoreData(entityData),
        priority: this.determinePriority(entityType, entityData)
      }
    };

    this.tombstones.set(tombstoneId, tombstone);
    await this.persistTombstone(tombstone);

    return tombstone;
  }

  private async executeCascadeDeletions(
    entityId: string,
    entityType: string,
    cascadeRules: CascadeRule[],
    userId: string,
    clientId: string
  ): Promise<CascadeResult[]> {
    const results: CascadeResult[] = [];
    // const relationships = this.entityRelationships.get(entityType) || [];

    for (const rule of cascadeRules) {
      const relatedEntities = await this.findEntitiesByRelationship(entityId, rule);
      
      for (const relatedEntity of relatedEntities) {
        const result: CascadeResult = {
          entityId: relatedEntity.id,
          entityType: rule.targetEntityType,
          action: rule.action,
          success: false
        };

        try {
          switch (rule.action) {
            case 'cascade': {
              const deleteResult = await this.deleteEntity({
                entityId: relatedEntity.id,
                entityType: rule.targetEntityType,
                reason: `Cascade delete from ${entityType}:${entityId}`,
                userId,
                clientId,
                force: true
              });
              result.success = deleteResult.success;
              result.tombstoneId = deleteResult.tombstoneId;
              if (!deleteResult.success) {
                result.error = deleteResult.errors.join(', ');
              }
              break;
            }

            case 'nullify':
              await this.nullifyRelationship(relatedEntity.id, rule.targetEntityType, entityId);
              result.success = true;
              break;

            case 'restrict':
              throw new Error(`Cannot delete ${entityType}:${entityId} - related ${rule.targetEntityType} exists`);

            case 'set_default':
              await this.setDefaultValue(relatedEntity.id, rule.targetEntityType, entityId);
              result.success = true;
              break;
          }
        } catch (error) {
          result.error = error instanceof Error ? error.message : 'Unknown error';
        }

        results.push(result);
      }
    }

    return results;
  }

  private async checkDeletionRestrictions(entityId: string, entityType: string): Promise<string[]> {
    const restrictions: string[] = [];
    const relationships = this.entityRelationships.get(entityType) || [];

    for (const relationship of relationships) {
      if (relationship.onDelete === 'restrict') {
        const relatedCount = await this.countRelatedEntities(entityId, relationship);
        if (relatedCount > 0) {
          restrictions.push(
            `Cannot delete ${entityType}:${entityId} - ${relatedCount} related ${relationship.targetType} entities exist`
          );
        }
      }
    }

    return restrictions;
  }

  private async calculateChecksum(data: unknown): Promise<string> {
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    const encoder = new TextEncoder();
    const dataArray = encoder.encode(jsonString);
    
    if (crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataArray);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Simple fallback hash
      let hash = 0;
      for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString(16);
    }
  }

  private extractRestoreData(entityData: unknown): unknown {
    // Extract essential data needed for restoration
    // This could be a subset of the full data to save space
    const data = entityData as Record<string, unknown>;
    const { id, name, type, status, createdAt } = data;
    return { id, name, type, status, createdAt };
  }

  private determinePriority(entityType: string, entityData: unknown): 'low' | 'medium' | 'high' | 'critical' {
    // Determine deletion priority based on entity type and data
    if (entityType === 'show' && entityData.status === 'in_progress') {
      return 'critical';
    }
    if (entityType === 'dog' && entityData.achievements?.length > 0) {
      return 'high';
    }
    if (entityType === 'entry' && entityData.score) {
      return 'medium';
    }
    return 'low';
  }

  private startCleanupSchedule(): void {
    // Run cleanup every hour
    this.cleanupSchedule = window.setInterval(async () => {
      try {
        const cleaned = await this.cleanupExpiredTombstones();
        if (cleaned > 0) {
          logger.debug(`Cleaned up ${cleaned} expired tombstones`, 'sync', {});
        }
      } catch (error) {
        logger.error('Tombstone cleanup failed:', 'sync', {}, error as Error);
      }
    }, 60 * 60 * 1000);
  }

  // Stub methods that would be implemented based on your storage layer
  private async getEntityData(_entityId: string, _entityType: string): Promise<unknown> {
    // Implementation depends on your data layer
    return null;
  }

  private async removeFromActiveStorage(_entityId: string, _entityType: string): Promise<void> {
    // Implementation depends on your data layer
  }

  private async restoreToActiveStorage(_entityId: string, _entityType: string, _data: unknown): Promise<void> {
    // Implementation depends on your data layer
  }

  private async createBackup(entityId: string, _entityType: string, _data: unknown): Promise<string> {
    // Implementation depends on your backup strategy
    return `backup_${entityId}_${Date.now()}`;
  }

  private async loadFromBackup(_backupLocation: string): Promise<unknown> {
    // Implementation depends on your backup strategy
    return null;
  }

  private async cleanupBackup(_backupLocation: string): Promise<void> {
    // Implementation depends on your backup strategy
  }

  private async persistTombstone(_tombstone: Tombstone): Promise<void> {
    // Implementation depends on your storage layer
  }

  private async removeTombstoneFromStorage(_tombstoneId: string): Promise<void> {
    // Implementation depends on your storage layer
  }

  private async findTombstoneByEntityId(entityId: string): Promise<Tombstone | null> {
    for (const tombstone of this.tombstones.values()) {
      if (tombstone.entityId === entityId) {
        return tombstone;
      }
    }
    return null;
  }

  private async findRelatedEntities(_entityId: string, _entityType: string): Promise<string[]> {
    // Implementation depends on your relationship mapping
    return [];
  }

  private async findEntitiesByRelationship(_entityId: string, _rule: CascadeRule): Promise<unknown[]> {
    // Implementation depends on your relationship queries
    return [];
  }

  private async countRelatedEntities(_entityId: string, _relationship: EntityRelationship): Promise<number> {
    // Implementation depends on your relationship queries
    return 0;
  }

  private async nullifyRelationship(_entityId: string, _entityType: string, _deletedEntityId: string): Promise<void> {
    // Implementation depends on your data layer
  }

  private async setDefaultValue(_entityId: string, _entityType: string, _deletedEntityId: string): Promise<void> {
    // Implementation depends on your data layer
  }

  private async performHardDelete(_entityId: string, _entityType: string): Promise<void> {
    // Implementation depends on your data layer
  }

  private async validateDataIntegrity(data: unknown, tombstone: Tombstone): Promise<string[]> {
    const issues: string[] = [];
    
    // Validate checksum if possible
    const currentChecksum = await this.calculateChecksum(data);
    if (currentChecksum !== tombstone.metadata.checksumBeforeDeletion) {
      issues.push('Data checksum mismatch - data may have been corrupted');
    }

    return issues;
  }
}

export interface EntityRelationship {
  targetType: string;
  relationshipType: string;
  onDelete: 'cascade' | 'nullify' | 'restrict' | 'set_default';
  foreignKey: string;
}

export interface TombstoneStatistics {
  totalTombstones: number;
  expiredTombstones: number;
  restorableTombstones: number;
  tombstonesByType: Record<string, number>;
  oldestTombstone: number;
  newestTombstone: number;
  totalBackupSize: number;
}

// Export singleton instance
export const tombstoneService = new TombstoneService();