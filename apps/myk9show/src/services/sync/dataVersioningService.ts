/**
 * Data versioning service for tracking changes and maintaining version history
 * Implements vector clocks, logical timestamps, and version conflict detection
 */

 
/* eslint-disable @typescript-eslint/no-unused-vars */

export interface VersionVector {
  [clientId: string]: number;
}

export interface VersionedData<T = unknown> {
  id: string;
  data: T;
  version: number;
  vectorClock: VersionVector;
  timestamp: Date;
  clientId: string;
  userId?: string;
  operation: 'create' | 'update' | 'delete';
  parentVersion?: number;
  hash: string; // Content hash for integrity verification
  metadata: VersionMetadata;
}

export interface VersionMetadata {
  entityType: string;
  changesSummary: string[];
  conflictsWith?: string[]; // Version IDs that conflict with this version
  mergedFrom?: string[]; // Version IDs that were merged to create this version
  size: number; // Data size in bytes
  compressed: boolean;
  tags?: string[];
}

export interface VersionHistory<T = unknown> {
  entityId: string;
  entityType: string;
  versions: VersionedData<T>[];
  currentVersion: number;
  branchingPoints: number[];
  mergePoints: MergePoint[];
  totalSize: number;
}

export interface MergePoint {
  version: number;
  mergedVersions: number[];
  strategy: string;
  timestamp: Date;
  conflicts: string[];
}

export interface VersionDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: 'added' | 'modified' | 'removed';
}

export interface VersionConflict {
  entityId: string;
  conflictingVersions: number[];
  conflictType: 'concurrent' | 'divergent' | 'orphaned';
  affectedFields: string[];
  severity: 'low' | 'medium' | 'high';
  autoResolvable: boolean;
}

/**
 * Advanced data versioning service
 */
export class DataVersioningService {
  private versionHistories: Map<string, VersionHistory> = new Map();
  private vectorClocks: Map<string, VersionVector> = new Map();
  private clientId: string;
  private compressionThreshold = 5120; // 5KB

  constructor(clientId?: string) {
    this.clientId = clientId || this.generateClientId();
    this.initializeVectorClock();
  }

  /**
   * Creates a new version of an entity
   * @param entityId - Entity identifier
   * @param entityType - Type of entity
   * @param data - Entity data
   * @param operation - Operation type
   * @param userId - User who made the change
   * @returns Version information
   */
  async createVersion<T>(
    entityId: string,
    entityType: string,
    data: T,
    operation: 'create' | 'update' | 'delete',
    userId?: string
  ): Promise<VersionedData<T>> {
    const history = this.getOrCreateHistory(entityId, entityType);
    const vectorClock = this.incrementVectorClock();
    const version = history.currentVersion + 1;
    
    // Calculate content hash
    const hash = await this.calculateHash(data);
    
    // Determine changes from previous version
    const changesSummary = operation === 'create' ? ['Entity created'] : 
                          operation === 'delete' ? ['Entity deleted'] :
                          await this.calculateChanges(entityId, data);

    // Create versioned data
    const versionedData: VersionedData<T> = {
      id: `${entityId}_v${version}`,
      data,
      version,
      vectorClock: { ...vectorClock },
      timestamp: new Date(),
      clientId: this.clientId,
      userId,
      operation,
      parentVersion: operation === 'create' ? undefined : history.currentVersion,
      hash,
      metadata: {
        entityType,
        changesSummary,
        size: JSON.stringify(data).length,
        compressed: false
      }
    };

    // Compress large data if needed
    if (versionedData.metadata.size > this.compressionThreshold) {
      versionedData.data = await this.compressData(data) as T;
      versionedData.metadata.compressed = true;
    }

    // Add to history
    history.versions.push(versionedData);
    history.currentVersion = version;
    history.totalSize += versionedData.metadata.size;

    // Detect conflicts
    await this.detectConflicts(entityId, versionedData);

    // Cleanup old versions if needed
    await this.cleanupOldVersions(entityId);

    return versionedData;
  }

  /**
   * Gets version history for an entity
   * @param entityId - Entity identifier
   * @returns Version history or null if not found
   */
  getVersionHistory<T = unknown>(entityId: string): VersionHistory<T> | null {
    return this.versionHistories.get(entityId) as VersionHistory<T> || null;
  }

  /**
   * Gets a specific version of an entity
   * @param entityId - Entity identifier
   * @param version - Version number
   * @returns Versioned data or null if not found
   */
  async getVersion<T = unknown>(entityId: string, version: number): Promise<VersionedData<T> | null> {
    const history = this.versionHistories.get(entityId);
    if (!history) return null;

    const versionedData = history.versions.find(v => v.version === version);
    if (!versionedData) return null;

    // Decompress data if needed
    if (versionedData.metadata.compressed) {
      const decompressedData = await this.decompressData(versionedData.data);
      return {
        ...versionedData,
        data: decompressedData
      } as VersionedData<T>;
    }

    return versionedData as VersionedData<T>;
  }

  /**
   * Gets the current version of an entity
   * @param entityId - Entity identifier
   * @returns Current version or null if not found
   */
  async getCurrentVersion<T = unknown>(entityId: string): Promise<VersionedData<T> | null> {
    const history = this.versionHistories.get(entityId);
    if (!history) return null;

    return await this.getVersion<T>(entityId, history.currentVersion);
  }

  /**
   * Compares two versions and returns differences
   * @param entityId - Entity identifier
   * @param version1 - First version number
   * @param version2 - Second version number
   * @returns Array of differences
   */
  async compareVersions(entityId: string, version1: number, version2: number): Promise<VersionDiff[]> {
    const v1 = await this.getVersion(entityId, version1);
    const v2 = await this.getVersion(entityId, version2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    return this.calculateDifferences(v1.data, v2.data);
  }

  /**
   * Merges multiple versions into a new version
   * @param entityId - Entity identifier
   * @param versionIds - Version numbers to merge
   * @param strategy - Merge strategy
   * @param userId - User performing the merge
   * @returns New merged version
   */
  async mergeVersions<T>(
    entityId: string,
    versionIds: number[],
    strategy: 'last_wins' | 'field_merge' | 'manual',
    userId?: string,
    manualResolution?: Partial<T>
  ): Promise<VersionedData<T>> {
    const history = this.getOrCreateHistory(entityId, 'unknown');
    const versionsToMerge = await Promise.all(
      versionIds.map(v => this.getVersion<T>(entityId, v))
    );

    if (versionsToMerge.some(v => !v)) {
      throw new Error('Some versions not found for merging');
    }

    const validVersions = versionsToMerge.filter(Boolean) as VersionedData<T>[];
    
    let mergedData: T;
    let changesSummary: string[];

    switch (strategy) {
      case 'last_wins': {
        const latest = validVersions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
        mergedData = latest.data;
        changesSummary = [`Merged ${validVersions.length} versions using last-wins strategy`];
        break;
      }

      case 'field_merge':
        mergedData = await this.performFieldMerge(validVersions);
        changesSummary = [`Field-level merge of ${validVersions.length} versions`];
        break;

      case 'manual': {
        if (!manualResolution) {
          throw new Error('Manual resolution data required for manual merge strategy');
        }
        mergedData = manualResolution as T;
        break;
      }

      default:
        throw new Error(`Unknown merge strategy: ${strategy}`);
    }

    // Create merged version
    const mergedVersion = await this.createVersion(
      entityId,
      history.entityType,
      mergedData,
      'update',
      userId
    );

    // Update metadata
    mergedVersion.metadata.mergedFrom = versionIds.map(String);

    // Record merge point
    history.mergePoints.push({
      version: mergedVersion.version,
      mergedVersions: versionIds,
      strategy,
      timestamp: new Date(),
      conflicts: [] // TODO: Extract from merge process
    });

    return mergedVersion;
  }

  /**
   * Checks if two versions can be automatically merged
   * @param entityId - Entity identifier
   * @param version1 - First version number
   * @param version2 - Second version number
   * @returns True if auto-mergeable
   */
  async canAutoMerge(entityId: string, version1: number, version2: number): Promise<boolean> {
    const v1 = await this.getVersion(entityId, version1);
    const v2 = await this.getVersion(entityId, version2);

    if (!v1 || !v2) return false;

    // Check for conflicting changes
    const diffs = this.calculateDifferences(v1.data, v2.data);
    const conflictingFields = diffs.filter(diff => 
      diff.changeType === 'modified' && 
      diff.oldValue !== diff.newValue
    );

    // Auto-mergeable if no conflicting field modifications
    return conflictingFields.length === 0;
  }

  /**
   * Gets all version conflicts for an entity
   * @param entityId - Entity identifier
   * @returns Array of conflicts
   */
  getVersionConflicts(entityId: string): VersionConflict[] {
    const history = this.versionHistories.get(entityId);
    if (!history) return [];

    const conflicts: VersionConflict[] = [];
    
    // Find concurrent versions (same parent)
    const versionsByParent = new Map<number | undefined, number[]>();
    for (const version of history.versions) {
      const parent = version.parentVersion;
      if (!versionsByParent.has(parent)) {
        versionsByParent.set(parent, []);
      }
      versionsByParent.get(parent)!.push(version.version);
    }

    // Identify conflicts
    for (const [, versions] of versionsByParent) {
      if (versions.length > 1) {
        conflicts.push({
          entityId,
          conflictingVersions: versions,
          conflictType: 'concurrent',
          affectedFields: [], // TODO: Calculate affected fields
          severity: 'medium',
          autoResolvable: false // TODO: Determine based on changes
        });
      }
    }

    return conflicts;
  }

  /**
   * Resolves version conflicts
   * @param entityId - Entity identifier
   * @param conflictStrategy - Resolution strategy
   * @param userId - User resolving conflict
   * @returns Resolved version
   */
  async resolveConflicts<T>(
    entityId: string,
    conflictStrategy: 'auto_merge' | 'manual_select' | 'create_branch',
    userId?: string,
    selectedVersion?: number
  ): Promise<VersionedData<T>> {
    const conflicts = this.getVersionConflicts(entityId);
    if (conflicts.length === 0) {
      throw new Error('No conflicts found to resolve');
    }

    const conflict = conflicts[0]; // Resolve first conflict
    
    switch (conflictStrategy) {
      case 'auto_merge':
        return await this.mergeVersions<T>(entityId, conflict.conflictingVersions, 'field_merge', userId);

      case 'manual_select': {
        if (selectedVersion === undefined) {
          throw new Error('Selected version required for manual selection strategy');
        }
        
        const selected = await this.getVersion<T>(entityId, selectedVersion);
        if (!selected) {
          throw new Error('Selected version not found');
        }
        
        // Create new version from selected
        return await this.createVersion(
          entityId,
          selected.metadata.entityType,
          selected.data,
          'update',
          userId
        );
      }

      case 'create_branch':
        // TODO: Implement branching
        throw new Error('Branching not yet implemented');

      default:
        throw new Error(`Unknown conflict strategy: ${conflictStrategy}`);
    }
  }

  /**
   * Gets version statistics for an entity
   * @param entityId - Entity identifier
   * @returns Version statistics
   */
  getVersionStatistics(entityId: string): VersionStatistics | null {
    const history = this.versionHistories.get(entityId);
    if (!history) return null;

    const versions = history.versions;
    const operations = versions.reduce((acc, v) => {
      acc[v.operation] = (acc[v.operation] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const uniqueAuthors = new Set(versions.map(v => v.userId).filter(Boolean)).size;
    const averageSize = versions.length > 0 ? 
      versions.reduce((sum, v) => sum + v.metadata.size, 0) / versions.length : 0;

    return {
      totalVersions: versions.length,
      currentVersion: history.currentVersion,
      totalSize: history.totalSize,
      averageSize,
      operations,
      uniqueAuthors,
      branchingPoints: history.branchingPoints.length,
      mergePoints: history.mergePoints.length,
      oldestVersion: versions[0]?.timestamp,
      newestVersion: versions[versions.length - 1]?.timestamp
    };
  }

  /**
   * Purges old versions based on retention policy
   * @param entityId - Entity identifier
   * @param retentionPolicy - Retention policy
   */
  async purgeOldVersions(
    entityId: string,
    retentionPolicy: VersionRetentionPolicy
  ): Promise<number> {
    const history = this.versionHistories.get(entityId);
    if (!history) return 0;

    const versionsToRemove: VersionedData[] = [];
    const now = new Date();

    // Apply retention rules
    if (retentionPolicy.maxVersions) {
      const excess = history.versions.length - retentionPolicy.maxVersions;
      if (excess > 0) {
        versionsToRemove.push(...history.versions.slice(0, excess));
      }
    }

    if (retentionPolicy.maxAge) {
      const cutoffDate = new Date(now.getTime() - retentionPolicy.maxAge);
      versionsToRemove.push(
        ...history.versions.filter(v => v.timestamp < cutoffDate)
      );
    }

    if (retentionPolicy.maxSize) {
      let totalSize = 0;
      for (let i = history.versions.length - 1; i >= 0; i--) {
        totalSize += history.versions[i].metadata.size;
        if (totalSize > retentionPolicy.maxSize) {
          versionsToRemove.push(...history.versions.slice(0, i));
          break;
        }
      }
    }

    // Remove duplicates and preserve important versions
    const versionsToRemoveSet = new Set(versionsToRemove.map(v => v.version));
    
    // Never remove current version or merge points
    versionsToRemoveSet.delete(history.currentVersion);
    history.mergePoints.forEach(mp => versionsToRemoveSet.delete(mp.version));

    // Remove versions
    history.versions = history.versions.filter(v => !versionsToRemoveSet.has(v.version));
    
    // Recalculate total size
    history.totalSize = history.versions.reduce((sum, v) => sum + v.metadata.size, 0);

    return versionsToRemoveSet.size;
  }

  // Private methods

  private getOrCreateHistory(entityId: string, entityType: string): VersionHistory {
    let history = this.versionHistories.get(entityId);
    if (!history) {
      history = {
        entityId,
        entityType,
        versions: [],
        currentVersion: 0,
        branchingPoints: [],
        mergePoints: [],
        totalSize: 0
      };
      this.versionHistories.set(entityId, history);
    }
    return history;
  }

  private initializeVectorClock(): void {
    const clock: VersionVector = {};
    clock[this.clientId] = 0;
    this.vectorClocks.set('global', clock);
  }

  private incrementVectorClock(): VersionVector {
    const clock = this.vectorClocks.get('global') || {};
    clock[this.clientId] = (clock[this.clientId] || 0) + 1;
    this.vectorClocks.set('global', clock);
    return { ...clock };
  }

  private async calculateHash(data: unknown): Promise<string> {
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    const encoder = new TextEncoder();
    const dataArray = encoder.encode(jsonString);
    
    if (crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataArray);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Fallback simple hash for environments without crypto.subtle
      let hash = 0;
      for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString(16);
    }
  }

  private async calculateChanges<T>(entityId: string, newData: T): Promise<string[]> {
    const currentVersion = await this.getCurrentVersion(entityId);
    if (!currentVersion) return ['Initial version'];

    const diffs = this.calculateDifferences(currentVersion.data, newData);
    return diffs.map(diff => 
      `${diff.changeType === 'added' ? 'Added' : 
        diff.changeType === 'removed' ? 'Removed' : 'Modified'} ${diff.field}`
    );
  }

  private calculateDifferences(oldData: unknown, newData: unknown): VersionDiff[] {
    const diffs: VersionDiff[] = [];
    const allKeys = new Set([
      ...Object.keys((oldData as Record<string, unknown>) || {}),
      ...Object.keys((newData as Record<string, unknown>) || {})
    ]);

    for (const key of allKeys) {
      const oldValue = (oldData as Record<string, unknown>)?.[key];
      const newValue = (newData as Record<string, unknown>)?.[key];

      if (oldValue === undefined && newValue !== undefined) {
        diffs.push({
          field: key,
          oldValue: undefined,
          newValue,
          changeType: 'added'
        });
      } else if (oldValue !== undefined && newValue === undefined) {
        diffs.push({
          field: key,
          oldValue,
          newValue: undefined,
          changeType: 'removed'
        });
      } else if (oldValue !== newValue) {
        diffs.push({
          field: key,
          oldValue,
          newValue,
          changeType: 'modified'
        });
      }
    }

    return diffs;
  }

  private async detectConflicts<T>(entityId: string, newVersion: VersionedData<T>): Promise<void> {
    const history = this.versionHistories.get(entityId);
    if (!history) return;

    // Check for concurrent modifications
    const concurrentVersions = history.versions.filter(v => 
      v.parentVersion === newVersion.parentVersion && 
      v.version !== newVersion.version
    );

    if (concurrentVersions.length > 0) {
      // Mark conflicts in metadata
      newVersion.metadata.conflictsWith = concurrentVersions.map(v => v.id);
      
      // Also mark the conflicting versions
      for (const conflictingVersion of concurrentVersions) {
        if (!conflictingVersion.metadata.conflictsWith) {
          conflictingVersion.metadata.conflictsWith = [];
        }
        conflictingVersion.metadata.conflictsWith.push(newVersion.id);
      }
    }
  }

  private async cleanupOldVersions(entityId: string): Promise<void> {
    // Basic cleanup - keep last 10 versions
    const history = this.versionHistories.get(entityId);
    if (!history || history.versions.length <= 10) return;

    const versionsToKeep = history.versions.slice(-10);
    const removedSize = history.versions
      .slice(0, -10)
      .reduce((sum, v) => sum + v.metadata.size, 0);

    history.versions = versionsToKeep;
    history.totalSize -= removedSize;
  }

  private async compressData<T>(data: T): Promise<T> {
    // Simple compression simulation - in real implementation, use actual compression
    const jsonString = JSON.stringify(data);
    // This would be actual compression logic
    return data; // Return uncompressed for now
  }

  private async decompressData<T>(data: T): Promise<T> {
    // Simple decompression simulation
    return data; // Return as-is for now
  }

  private async performFieldMerge<T>(versions: VersionedData<T>[]): Promise<T> {
    if (versions.length === 0) {
      throw new Error('No versions to merge');
    }

    if (versions.length === 1) {
      return versions[0].data;
    }

    // Start with the first version
    const merged = { ...versions[0].data } as Record<string, unknown>;

    // Apply changes from subsequent versions
    for (let i = 1; i < versions.length; i++) {
      const version = versions[i];
      const data = version.data as Record<string, unknown>;

      // Simple field-level merge - prefer non-null values
      for (const key of Object.keys(data)) {
        if (data[key] !== null && data[key] !== undefined) {
          merged[key] = data[key];
        }
      }
    }

    return merged as T;
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export interface VersionRetentionPolicy {
  maxVersions?: number; // Maximum number of versions to keep
  maxAge?: number; // Maximum age in milliseconds
  maxSize?: number; // Maximum total size in bytes
  keepMergePoints?: boolean; // Always keep merge point versions
  keepTaggedVersions?: boolean; // Keep versions with specific tags
}

export interface VersionStatistics {
  totalVersions: number;
  currentVersion: number;
  totalSize: number;
  averageSize: number;
  operations: Record<string, number>;
  uniqueAuthors: number;
  branchingPoints: number;
  mergePoints: number;
  oldestVersion?: Date;
  newestVersion?: Date;
}

// Export singleton instance
export const dataVersioningService = new DataVersioningService();