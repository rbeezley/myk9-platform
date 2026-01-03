// Conflict detection and resolution for sync service
import { db } from '../database/connection';
import type { 
  ConflictResolution, 
  ConflictRecord,
  FieldChange,
  SyncEventMap
} from './types';
import type { BaseConflict } from '../../types/conflict-types';
import { EventEmitter } from './eventEmitter';

// Type alias to ensure compatibility
type Conflict = BaseConflict<Record<string, unknown>>;

export class SyncConflictResolver {
  private eventEmitter: EventEmitter<SyncEventMap>;

  constructor(eventEmitter: EventEmitter<SyncEventMap>) {
    this.eventEmitter = eventEmitter;
  }

  async detectConflicts(entityType: string, entityId: string, remoteData: Record<string, unknown>): Promise<Conflict | null> {
    // Get local entity
    const localData = await this.getLocalEntity(entityType, entityId);
    if (!localData) return null;

    // Get sync metadata to compare versions
    const syncMeta = await this.getSyncMetadata(entityType, entityId);
    
    // If local version is newer than last synced version, we have local changes
    const localSyncData = this.getEntitySyncData(localData);
    const hasLocalChanges = syncMeta && 
      localSyncData.version > (this.getSyncMetaProperty(syncMeta, 'lastSyncedVersion') as number || 0);

    // If remote was modified after our last sync, we have a potential conflict
    const remoteModifiedTimestamp = this.getRemoteTimestamp(remoteData);
    const remoteModified = remoteModifiedTimestamp ? new Date(remoteModifiedTimestamp) : null;
    const lastSynced = this.getSyncMetaProperty(syncMeta, 'lastSyncedAt') as Date | undefined;
    const hasRemoteChanges = !lastSynced || (remoteModified && remoteModified > lastSynced);

    if (!hasLocalChanges || !hasRemoteChanges) {
      return null; // No conflict
    }

    // Detect conflicting fields
    const localChangesJson = this.getSyncMetaProperty(syncMeta, 'localChanges') as string | undefined;
    const conflictFields = this.findConflictingFields(localData, remoteData, localChangesJson);

    if (conflictFields.length === 0) {
      return null; // No actual field conflicts
    }

    // Create conflict record
    const conflict: Conflict = {
      id: `conflict-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      entityType,
      entityId,
      localData,
      serverData: remoteData,
      remoteData,
      conflictFields,
      conflictType: 'version_mismatch',
      priority: 'medium',
      detectedAt: new Date(),
      createdAt: new Date(),
      status: 'detected',
      lastModified: {
        local: remoteModified || new Date(),
        remote: remoteModified || new Date()
      },
      lastModifiedBy: {
        local: 'unknown',
        remote: 'unknown'
      }
    };

    // Save to database
    await this.saveConflict(conflict);

    this.eventEmitter.emit('conflict_detected', {
      type: 'conflict_detected',
      timestamp: new Date(),
      data: conflict as unknown as Record<string, unknown>
    });

    return conflict;
  }

  async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void> {
    const conflictRecord = await db.instance.conflicts.get(conflictId);
    if (!conflictRecord) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    const conflict: Conflict = this.recordToConflict(conflictRecord);

    // Apply resolution strategy
    let resolvedData: Record<string, unknown>;
    
    switch (resolution.strategy) {
      case 'local_wins':
        resolvedData = conflict.localData;
        break;
      case 'remote_wins':
        resolvedData = conflict.remoteData;
        break;
      case 'merge_automatic':
        resolvedData = this.autoMerge(conflict.localData, conflict.remoteData, conflict.conflictFields || []);
        break;
      case 'merge_manual':
        resolvedData = this.manualMerge(conflict.localData, conflict.remoteData, resolution.fieldResolutions);
        break;
      default:
        throw new Error(`Unknown resolution strategy: ${resolution.strategy}`);
    }

    // Update local entity with resolved data
    await this.updateLocalEntity(conflict.entityType, conflict.entityId, resolvedData);

    // Update conflict record
    await db.instance.conflicts.update(conflictId, {
      status: 'resolved',
      resolution: JSON.stringify(resolution)
    });

    // Update sync metadata
    const resolvedSyncData = this.getEntitySyncData(resolvedData);
    await this.updateSyncMetadata(conflict.entityType, conflict.entityId, {
      syncStatus: 'synced',
      lastSyncedVersion: resolvedSyncData.version,
      lastSyncedAt: new Date()
    });

    this.eventEmitter.emit('conflict_resolved', {
      type: 'conflict_resolved',
      timestamp: new Date(),
      data: { conflictId, resolution }
    });
  }

  async getConflicts(status?: 'pending' | 'resolved'): Promise<Conflict[]> {
    let query = db.instance.conflicts.orderBy('detectedAt').reverse();
    
    if (status) {
      query = query.filter((record: ConflictRecord) => record.status === status);
    }

    const records = await query.toArray();
    return records.map((record: ConflictRecord) => this.recordToConflict(record));
  }

  async reset(): Promise<void> {
    await db.instance.conflicts.clear();
  }

  suggestResolution(conflict: Conflict): { strategy: string; confidence: number; reason: string; suggestedData?: Record<string, unknown> } {
    // Basic suggestion logic
    const strategy = 'merge';
    const confidence = 0.8;
    const reason = 'Automatic merge suggestion based on conflict analysis';
    
    // Merge strategy: combine non-conflicting fields
    const suggestedData = { ...conflict.localData, ...conflict.remoteData };
    
    return {
      strategy,
      confidence,
      reason,
      suggestedData
    };
  }

  private findConflictingFields(localData: Record<string, unknown>, remoteData: Record<string, unknown>, localChanges?: string): string[] {
    const conflicting: string[] = [];
    const changes: FieldChange[] = this.parseLocalChanges(localChanges);
    const changedFields = new Set(changes.map(c => c.field));

    // Check each field that was changed locally
    changedFields.forEach(field => {
      const localValue = this.getNestedValue(localData, field);
      const remoteValue = this.getNestedValue(remoteData, field);

      // If the remote value is different from local, we have a conflict
      if (!this.deepEquals(localValue, remoteValue)) {
        conflicting.push(field);
      }
    });

    return conflicting;
  }

  private autoMerge(localData: Record<string, unknown>, remoteData: Record<string, unknown>, conflictFields: string[]): Record<string, unknown> {
    const merged = { ...remoteData }; // Start with remote data

    // For each non-conflicting field, use local value if it's newer
    Object.keys(localData).forEach(key => {
      if (!conflictFields.includes(key) && key !== '_sync') {
        // Use local value for non-conflicting fields
        merged[key] = localData[key];
      }
    });

    // For conflicting fields, use a default strategy (e.g., keep local for user data)
    conflictFields.forEach(field => {
      if (this.isUserEditableField(field)) {
        this.setNestedValue(merged, field, this.getNestedValue(localData, field));
      }
      // Otherwise keep remote value (already in merged)
    });

    return merged;
  }

  private manualMerge(localData: Record<string, unknown>, remoteData: Record<string, unknown>, fieldResolutions: Record<string, unknown>): Record<string, unknown> {
    const merged = { ...remoteData }; // Start with remote data

    // Apply manual field resolutions
    Object.entries(fieldResolutions).forEach(([field, resolution]) => {
      const resolutionData = this.validateFieldResolution(resolution);
      if (resolutionData) {
        switch (resolutionData.strategy) {
          case 'local':
            this.setNestedValue(merged, field, this.getNestedValue(localData, field));
            break;
          case 'remote':
            // Already have remote value
            break;
          case 'custom':
            this.setNestedValue(merged, field, resolutionData.value);
            break;
        }
      }
    });

    return merged;
  }

  private async saveConflict(conflict: Conflict): Promise<void> {
    const record: ConflictRecord = {
      id: conflict.id,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      localData: JSON.stringify(conflict.localData),
      remoteData: JSON.stringify(conflict.remoteData),
      conflictingFields: JSON.stringify(conflict.conflictFields),
      detectedAt: conflict.detectedAt,
      status: 'pending',
      resolution: undefined
    };

    await db.instance.conflicts.add(record);
  }

  private recordToConflict(record: ConflictRecord): Conflict {
    return {
      id: record.id,
      entityType: record.entityType,
      entityId: record.entityId,
      localData: JSON.parse(record.localData),
      serverData: JSON.parse(record.remoteData),
      remoteData: JSON.parse(record.remoteData),
      conflictFields: JSON.parse(record.conflictingFields),
      conflictType: 'version_mismatch',
      priority: 'medium',
      detectedAt: record.detectedAt,
      createdAt: record.detectedAt,
      status: record.status === 'resolved' ? 'resolved' : 'pending',
      lastModified: {
        local: record.detectedAt,
        remote: record.detectedAt
      },
      lastModifiedBy: {
        local: 'unknown',
        remote: 'unknown'
      }
    };
  }

  private async getLocalEntity(entityType: string, entityId: string): Promise<Record<string, unknown> | null> {
    const table = db.instance.table(entityType);
    return table.get(entityId);
  }

  private async updateLocalEntity(entityType: string, entityId: string, data: Record<string, unknown>): Promise<void> {
    const table = db.instance.table(entityType);
    await table.update(entityId, data);
  }

  private async getSyncMetadata(entityType: string, entityId: string): Promise<Record<string, unknown> | null> {
    const metaId = `${entityType}:${entityId}`;
    const result = await db.instance.syncMetadata.get(metaId);
    return result ? (result as unknown as Record<string, unknown>) : null;
  }

  private async updateSyncMetadata(entityType: string, entityId: string, updates: Record<string, unknown>): Promise<void> {
    const metaId = `${entityType}:${entityId}`;
    await db.instance.syncMetadata.update(metaId, updates);
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj as unknown);
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!(key in current)) current[key] = {};
      const nextValue = current[key];
      if (typeof nextValue === 'object' && nextValue !== null) {
        return nextValue as Record<string, unknown>;
      } else {
        current[key] = {};
        return current[key] as Record<string, unknown>;
      }
    }, obj);
    target[lastKey] = value;
  }

  private deepEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object' && typeof b === 'object') {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, index) => this.deepEquals(item, b[index]));
      }
      
      if (Array.isArray(a) || Array.isArray(b)) return false;
      
      const objA = a as Record<string, unknown>;
      const objB = b as Record<string, unknown>;
      const keysA = Object.keys(objA);
      const keysB = Object.keys(objB);
      if (keysA.length !== keysB.length) return false;
      
      return keysA.every(key => this.deepEquals(objA[key], objB[key]));
    }
    
    return false;
  }

  private isUserEditableField(field: string): boolean {
    // Define which fields are user-editable and should prefer local changes
    const userEditableFields = [
      'name', 'title', 'description', 'notes', 'status',
      'email', 'phone', 'address', 'preferences'
    ];
    
    return userEditableFields.some(f => field.includes(f));
  }

  private getSyncMetaProperty(syncMeta: Record<string, unknown> | null, property: string): unknown {
    if (!syncMeta || typeof syncMeta !== 'object') return undefined;
    return syncMeta[property];
  }

  private getRemoteTimestamp(remoteData: Record<string, unknown>): string | undefined {
    if (typeof remoteData.updated_at === 'string') return remoteData.updated_at;
    if (typeof remoteData.lastModified === 'string') return remoteData.lastModified;
    return undefined;
  }

  private parseLocalChanges(localChanges?: string): FieldChange[] {
    if (!localChanges || typeof localChanges !== 'string') return [];
    try {
      const parsed = JSON.parse(localChanges);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private validateFieldResolution(resolution: unknown): { strategy: string; value?: unknown } | null {
    if (!resolution || typeof resolution !== 'object') return null;
    const resObj = resolution as Record<string, unknown>;
    if (typeof resObj.strategy !== 'string') return null;
    return {
      strategy: resObj.strategy,
      value: resObj.value
    };
  }

  private getEntitySyncData(entity: Record<string, unknown>): { version: number } {
    const sync = entity._sync;
    if (sync && typeof sync === 'object') {
      const syncObj = sync as Record<string, unknown>;
      const version = typeof syncObj.version === 'number' ? syncObj.version : 1;
      return { version };
    }
    return { version: 1 };
  }
}