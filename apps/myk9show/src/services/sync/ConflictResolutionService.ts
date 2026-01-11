/**
 * Conflict Resolution Service
 * Handles data conflicts between offline and online changes
 * Provides strategies for automatic and manual conflict resolution
 */

import { logger } from '@/services/LoggingService';

export interface ConflictData {
  id: string;
  entity: string;
  entityId: string;
  localData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  timestamp: Date;
  resolved: boolean;
  resolution?: 'local' | 'server' | 'merge' | 'manual';
  resolvedData?: Record<string, unknown>;
  conflictFields: string[];
}

export interface ConflictResolutionStrategy {
  name: string;
  description: string;
  apply: (conflict: ConflictData) => Promise<Record<string, unknown>>;
}

export interface ConflictResolutionResult {
  success: boolean;
  resolvedData?: Record<string, unknown>;
  requiresManualResolution?: boolean;
  error?: string;
}

class ConflictResolutionService {
  private strategies: Map<string, ConflictResolutionStrategy> = new Map();
  private conflicts: Map<string, ConflictData> = new Map();
  private db: IDBDatabase | null = null;
  private dbName = 'ConflictResolutionDB';
  private version = 1;

  constructor() {
    this.initializeDefaultStrategies();
    this.initDB();
  }

  async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadPersistedConflicts();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('conflicts')) {
          const store = db.createObjectStore('conflicts', { keyPath: 'id' });
          store.createIndex('entity', 'entity', { unique: false });
          store.createIndex('resolved', 'resolved', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Register a conflict that needs resolution
   */
  async registerConflict(
    entity: string,
    entityId: string,
    localData: Record<string, unknown>,
    serverData: Record<string, unknown>
  ): Promise<string> {
    const conflictFields = this.identifyConflictFields(localData, serverData);
    
    const conflict: ConflictData = {
      id: `conflict_${entity}_${entityId}_${Date.now()}`,
      entity,
      entityId,
      localData,
      serverData,
      timestamp: new Date(),
      resolved: false,
      conflictFields
    };

    this.conflicts.set(conflict.id, conflict);
    await this.persistConflict(conflict);

    logger.info('Conflict registered', 'sync', { entity, entityId, conflictFields });
    return conflict.id;
  }

  /**
   * Attempt automatic resolution of a conflict
   */
  async resolveConflict(
    conflictId: string, 
    strategyName = 'smart-merge'
  ): Promise<ConflictResolutionResult> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      return { success: false, error: 'Conflict not found' };
    }

    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      return { success: false, error: 'Strategy not found' };
    }

    try {
      const resolvedData = await strategy.apply(conflict);
      
      // Update conflict with resolution
      conflict.resolved = true;
      conflict.resolution = this.getResolutionType(conflict, resolvedData);
      conflict.resolvedData = resolvedData;

      await this.persistConflict(conflict);

      logger.info('Conflict resolved', 'sync', { conflictId, strategyName });
      
      return {
        success: true,
        resolvedData
      };
    } catch (error) {
      logger.error('Failed to resolve conflict', 'sync', { conflictId }, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requiresManualResolution: true
      };
    }
  }

  /**
   * Get all unresolved conflicts
   */
  getUnresolvedConflicts(): ConflictData[] {
    return Array.from(this.conflicts.values())
      .filter(conflict => !conflict.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get conflicts for a specific entity
   */
  getConflictsForEntity(entity: string, entityId?: string): ConflictData[] {
    return Array.from(this.conflicts.values())
      .filter(conflict => 
        conflict.entity === entity && 
        (!entityId || conflict.entityId === entityId)
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Manually resolve a conflict
   */
  async manualResolve(
    conflictId: string,
    resolvedData: Record<string, unknown>
  ): Promise<boolean> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      return false;
    }

    conflict.resolved = true;
    conflict.resolution = 'manual';
    conflict.resolvedData = resolvedData;

    await this.persistConflict(conflict);
    
    logger.info('Conflict manually resolved', 'sync', { conflictId });
    return true;
  }

  /**
   * Clear resolved conflicts older than specified days
   */
  async clearOldConflicts(olderThanDays = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const toDelete = Array.from(this.conflicts.values())
      .filter(conflict => 
        conflict.resolved && 
        conflict.timestamp < cutoffDate
      );

    for (const conflict of toDelete) {
      this.conflicts.delete(conflict.id);
      await this.deleteConflict(conflict.id);
    }

    logger.debug('Cleared old resolved conflicts', 'sync', { count: toDelete.length });
    return toDelete.length;
  }

  /**
   * Initialize default conflict resolution strategies
   */
  private initializeDefaultStrategies(): void {
    // Local wins strategy
    this.strategies.set('local-wins', {
      name: 'Local Wins',
      description: 'Always prefer local changes over server changes',
      apply: async (conflict) => conflict.localData
    });

    // Server wins strategy
    this.strategies.set('server-wins', {
      name: 'Server Wins',
      description: 'Always prefer server changes over local changes',
      apply: async (conflict) => conflict.serverData
    });

    // Last modified wins strategy
    this.strategies.set('last-modified-wins', {
      name: 'Last Modified Wins',
      description: 'Use the data that was modified most recently',
      apply: async (conflict) => {
        const localModified = this.getLastModified(conflict.localData);
        const serverModified = this.getLastModified(conflict.serverData);
        
        return localModified > serverModified ? conflict.localData : conflict.serverData;
      }
    });

    // Smart merge strategy
    this.strategies.set('smart-merge', {
      name: 'Smart Merge',
      description: 'Intelligently merge changes, preferring local for user data and server for system data',
      apply: async (conflict) => {
        const merged = { ...conflict.serverData };
        
        // Merge logic based on field types
        for (const [key, localValue] of Object.entries(conflict.localData)) {
          const serverValue = conflict.serverData[key];
          
          // If values are the same, no conflict
          if (JSON.stringify(localValue) === JSON.stringify(serverValue)) {
            continue;
          }

          // Prefer local changes for user-editable fields
          if (this.isUserEditableField(key)) {
            merged[key] = localValue;
          }
          // Prefer server changes for system fields
          else if (this.isSystemField(key)) {
            merged[key] = serverValue;
          }
          // For other fields, use most recent
          else {
            const localModified = this.getFieldModified(conflict.localData, key);
            const serverModified = this.getFieldModified(conflict.serverData, key);
            merged[key] = localModified > serverModified ? localValue : serverValue;
          }
        }

        return merged;
      }
    });

    // Field-level merge strategy
    this.strategies.set('field-merge', {
      name: 'Field-Level Merge',
      description: 'Merge each field individually using field-specific rules',
      apply: async (conflict) => {
        const merged = { ...conflict.serverData };
        
        for (const field of conflict.conflictFields) {
          const resolution = await this.resolveFieldConflict(
            field,
            conflict.localData[field],
            conflict.serverData[field],
            conflict
          );
          merged[field] = resolution;
        }

        return merged;
      }
    });
  }

  /**
   * Identify fields that have conflicts between local and server data
   */
  private identifyConflictFields(
    localData: Record<string, unknown>,
    serverData: Record<string, unknown>
  ): string[] {
    const conflicts: string[] = [];
    const allKeys = new Set([...Object.keys(localData), ...Object.keys(serverData)]);

    for (const key of allKeys) {
      if (JSON.stringify(localData[key]) !== JSON.stringify(serverData[key])) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }

  /**
   * Get the last modified timestamp from data
   */
  private getLastModified(data: Record<string, unknown>): Date {
    const modifiedField = data.updatedAt || data.lastModified || data.modified;
    if (modifiedField) {
      return new Date(modifiedField as string);
    }
    return new Date(0); // Very old date if no timestamp
  }

  /**
   * Get the modification time for a specific field
   */
  private getFieldModified(data: Record<string, unknown>, field: string): Date {
    // Check for field-specific timestamps
    const fieldTimestamp = data[`${field}_modified`] || data[`${field}UpdatedAt`];
    if (fieldTimestamp) {
      return new Date(fieldTimestamp as string);
    }
    
    // Fallback to general timestamp
    return this.getLastModified(data);
  }

  /**
   * Check if a field is user-editable
   */
  private isUserEditableField(field: string): boolean {
    const userFields = [
      'name', 'description', 'notes', 'comments', 'title',
      'callName', 'breedName', 'color', 'markings',
      'firstName', 'lastName', 'email', 'phone',
      'address', 'city', 'state', 'zip'
    ];
    return userFields.includes(field);
  }

  /**
   * Check if a field is a system field
   */
  private isSystemField(field: string): boolean {
    const systemFields = [
      'id', 'createdAt', 'updatedAt', 'version', 'status',
      'syncedAt', 'serverId', 'hash', 'checksum'
    ];
    return systemFields.includes(field);
  }

  /**
   * Resolve a specific field conflict
   */
  private async resolveFieldConflict(
    field: string,
    localValue: unknown,
    serverValue: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _conflict: ConflictData
  ): Promise<unknown> {
    // Custom field resolution logic
    switch (field) {
      case 'tags':
      case 'categories':
        // Merge arrays
        if (Array.isArray(localValue) && Array.isArray(serverValue)) {
          return [...new Set([...localValue, ...serverValue])];
        }
        break;
        
      case 'notes':
      case 'comments':
        // Concatenate text fields
        if (typeof localValue === 'string' && typeof serverValue === 'string') {
          return `${localValue}\n---\n${serverValue}`;
        }
        break;
        
      default:
        // Use smart merge logic for other fields
        if (this.isUserEditableField(field)) {
          return localValue;
        } else if (this.isSystemField(field)) {
          return serverValue;
        }
    }

    // Default: prefer local changes
    return localValue;
  }

  /**
   * Determine the type of resolution that was applied
   */
  private getResolutionType(
    conflict: ConflictData,
    resolvedData: Record<string, unknown>
  ): 'local' | 'server' | 'merge' {
    const localMatch = JSON.stringify(conflict.localData) === JSON.stringify(resolvedData);
    const serverMatch = JSON.stringify(conflict.serverData) === JSON.stringify(resolvedData);
    
    if (localMatch) return 'local';
    if (serverMatch) return 'server';
    return 'merge';
  }

  /**
   * Persist conflict to IndexedDB
   */
  private async persistConflict(conflict: ConflictData): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conflicts'], 'readwrite');
      const store = transaction.objectStore('conflicts');
      const request = store.put(conflict);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete conflict from IndexedDB
   */
  private async deleteConflict(conflictId: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conflicts'], 'readwrite');
      const store = transaction.objectStore('conflicts');
      const request = store.delete(conflictId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load persisted conflicts from IndexedDB
   */
  private async loadPersistedConflicts(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conflicts'], 'readonly');
      const store = transaction.objectStore('conflicts');
      const request = store.getAll();

      request.onsuccess = () => {
        const conflicts = request.result as ConflictData[];
        for (const conflict of conflicts) {
          this.conflicts.set(conflict.id, conflict);
        }
        logger.debug('Loaded persisted conflicts', 'sync', { count: conflicts.length });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
export const conflictResolutionService = new ConflictResolutionService();