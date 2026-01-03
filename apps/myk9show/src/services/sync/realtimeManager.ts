// Real-time sync manager using Supabase real-time subscriptions
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SyncEventMap } from './types';
import { SYNCABLE_ENTITIES } from './types';
import { EventEmitter } from './eventEmitter';

export class RealtimeManager {
  private eventEmitter: EventEmitter<SyncEventMap>;
  private channels: Map<string, RealtimeChannel> = new Map();
  private isEnabled = false;

  constructor(eventEmitter: EventEmitter<SyncEventMap>) {
    this.eventEmitter = eventEmitter;
  }

  async enable(): Promise<void> {
    if (this.isEnabled) return;

    try {
      // Subscribe to each entity type
      for (const entityType of Object.keys(SYNCABLE_ENTITIES)) {
        await this.subscribeToEntity(entityType);
      }

      this.isEnabled = true;
      console.log('Real-time sync enabled');
    } catch (error) {
      console.error('Failed to enable real-time sync:', error);
      throw error;
    }
  }

  async disable(): Promise<void> {
    if (!this.isEnabled) return;

    // Unsubscribe from all channels
    this.channels.forEach(async (channel, entityType) => {
      await supabase.removeChannel(channel);
      console.log(`Unsubscribed from ${entityType}`);
    });

    this.channels.clear();
    this.isEnabled = false;
    console.log('Real-time sync disabled');
  }

  async handleEvent(event: Record<string, unknown>): Promise<void> {
    // This method can be used to manually inject events for testing
    await this.processRealtimeEvent(event);
  }

  private async subscribeToEntity(entityType: string): Promise<void> {
    const channel = supabase
      .channel(`${entityType}_changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: entityType
        },
        (payload) => this.processRealtimeEvent({
          ...payload,
          entityType
        })
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to real-time updates for ${entityType}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Failed to subscribe to ${entityType}:`, status);
        }
      });

    this.channels.set(entityType, channel);
  }

  private async processRealtimeEvent(payload: Record<string, unknown>): Promise<void> {
    const eventType = this.getPayloadProperty(payload, 'eventType');
    const newRecord = this.getPayloadProperty(payload, 'new') as Record<string, unknown> | undefined;
    const oldRecord = this.getPayloadProperty(payload, 'old') as Record<string, unknown> | undefined;
    const entityType = this.getPayloadProperty(payload, 'entityType') as string | undefined;

    if (!entityType || typeof entityType !== 'string') {
      console.warn('Invalid entityType in realtime event:', payload);
      return;
    }

    try {
      switch (eventType) {
        case 'INSERT':
          if (newRecord) {
            await this.handleInsert(entityType, newRecord);
          }
          break;
        case 'UPDATE':
          if (newRecord) {
            await this.handleUpdate(entityType, newRecord, oldRecord);
          }
          break;
        case 'DELETE':
          if (oldRecord) {
            await this.handleDelete(entityType, oldRecord);
          }
          break;
        default:
          console.warn(`Unknown real-time event type: ${eventType}`);
      }

      this.eventEmitter.emit('realtime_event', {
        type: 'realtime_event',
        timestamp: new Date(),
        entityType,
        data: payload
      });

    } catch (error) {
      console.error(`Failed to process real-time event for ${entityType}:`, error);
    }
  }

  private async handleInsert(entityType: string, record: Record<string, unknown>): Promise<void> {
    const recordId = this.getRecordId(record);
    if (!recordId) {
      console.warn('Insert record missing id:', record);
      return;
    }
    
    // Check if we already have this record locally
    const localRecord = await this.getLocalRecord(entityType, recordId);
    
    if (!localRecord) {
      // New record from remote, add it locally
      await this.addLocalRecord(entityType, record);
      console.log(`Added new ${entityType} from real-time: ${recordId}`);
    } else {
      // Record exists locally, check for conflicts
      await this.handlePotentialConflict(entityType, record, localRecord);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async handleUpdate(entityType: string, newRecord: Record<string, unknown>, _oldRecord?: Record<string, unknown>): Promise<void> {
    const recordId = this.getRecordId(newRecord);
    if (!recordId) {
      console.warn('Update record missing id:', newRecord);
      return;
    }
    
    const localRecord = await this.getLocalRecord(entityType, recordId);
    
    if (!localRecord) {
      // Record doesn't exist locally, add it
      await this.addLocalRecord(entityType, newRecord);
      console.log(`Added ${entityType} from real-time update: ${recordId}`);
    } else {
      // Check for conflicts and merge if possible
      await this.handlePotentialConflict(entityType, newRecord, localRecord);
    }
  }

  private async handleDelete(entityType: string, record: Record<string, unknown>): Promise<void> {
    const recordId = this.getRecordId(record);
    if (!recordId) {
      console.warn('Delete record missing id:', record);
      return;
    }
    
    const localRecord = await this.getLocalRecord(entityType, recordId);
    
    if (localRecord) {
      // Check if local record has pending changes
      const syncMeta = await this.getSyncMetadata(entityType, recordId);
      const hasLocalChanges = this.getSyncMetaProperty(syncMeta, 'syncStatus') === 'pending';
      
      if (hasLocalChanges) {
        // Create a conflict for deletion
        await this.createDeletionConflict(entityType, record, localRecord);
      } else {
        // Safe to delete locally
        await this.deleteLocalRecord(entityType, recordId);
        console.log(`Deleted ${entityType} from real-time: ${recordId}`);
      }
    }
  }

  private async handlePotentialConflict(
    entityType: string, 
    remoteRecord: Record<string, unknown>, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _localRecord: Record<string, unknown>
  ): Promise<void> {
    const recordId = this.getRecordId(remoteRecord);
    if (!recordId) {
      console.warn('Remote record missing id:', remoteRecord);
      return;
    }
    
    // Check if local record has pending changes
    const syncMeta = await this.getSyncMetadata(entityType, recordId);
    const hasLocalChanges = this.getSyncMetaProperty(syncMeta, 'syncStatus') === 'pending';
    
    if (hasLocalChanges) {
      // Import conflict resolver to detect conflicts
      const { SyncConflictResolver } = await import('./SyncConflictResolver');
      const conflictResolver = new SyncConflictResolver(this.eventEmitter);
      
      await conflictResolver.detectConflicts(
        entityType, 
        recordId, 
        remoteRecord
      );
      
      // Conflict detection and handling is managed by the conflict resolver
      // Safe to update after conflict detection
      await this.updateLocalRecord(entityType, remoteRecord);
    } else {
      // No local changes, safe to update
      await this.updateLocalRecord(entityType, remoteRecord);
      console.log(`Updated ${entityType} from real-time: ${recordId}`);
    }
  }

  private async createDeletionConflict(
    entityType: string, 
    deletedRecord: Record<string, unknown>, 
    localRecord: Record<string, unknown>
  ): Promise<void> {
    const recordId = this.getRecordId(deletedRecord);
    if (!recordId) {
      console.warn('Deleted record missing id:', deletedRecord);
      return;
    }
    
    // Import conflict resolver to create conflict
    const { SyncConflictResolver } = await import('./SyncConflictResolver');
    const conflictResolver = new SyncConflictResolver(this.eventEmitter);
    
    // Create a special conflict for deletion
    const conflictData = {
      id: `deletion-conflict-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      entityType,
      entityId: recordId,
      localData: localRecord,
      remoteData: null, // Represents deletion
      conflictingFields: ['__deleted__'],
      detectedAt: new Date(),
      status: 'pending' as const
    };

    console.log(`Created deletion conflict for ${entityType}:${recordId}`, conflictData, conflictResolver);
  }

  private async getLocalRecord(entityType: string, recordId: string): Promise<Record<string, unknown> | null> {
    try {
      const { db } = await import('../database/connection');
      const table = db.instance.table(entityType);
      return await table.get(recordId);
    } catch (error) {
      console.error(`Failed to get local record ${entityType}:${recordId}:`, error);
      return null;
    }
  }

  private async addLocalRecord(entityType: string, record: Record<string, unknown>): Promise<void> {
    try {
      const { db } = await import('../database/connection');
      const table = db.instance.table(entityType);
      
      // Add sync metadata
      const recordWithSync = {
        ...record,
        _sync: {
          version: 1,
          lastModified: new Date(),
          lastModifiedBy: 'remote',
          lastSyncedVersion: 1,
          lastSyncedAt: new Date(),
          localChanges: [],
          syncStatus: 'synced'
        }
      };
      
      await table.add(recordWithSync);
    } catch (error) {
      console.error(`Failed to add local record ${entityType}:${record.id}:`, error);
    }
  }

  private async updateLocalRecord(entityType: string, record: Record<string, unknown>): Promise<void> {
    const recordId = this.getRecordId(record);
    if (!recordId) {
      console.warn('Update record missing id:', record);
      return;
    }
    
    try {
      const { db } = await import('../database/connection');
      const table = db.instance.table(entityType);
      
      // Update with sync metadata
      const syncData = this.getSyncData(record);
      const updateData = {
        ...record,
        _sync: {
          version: syncData?.version || 1,
          lastModified: new Date(),
          lastModifiedBy: 'remote',
          lastSyncedVersion: syncData?.version || 1,
          lastSyncedAt: new Date(),
          localChanges: [],
          syncStatus: 'synced'
        }
      };
      
      await table.update(recordId, updateData);
    } catch (error) {
      console.error(`Failed to update local record ${entityType}:${recordId}:`, error);
    }
  }

  private async deleteLocalRecord(entityType: string, recordId: string): Promise<void> {
    try {
      const { db } = await import('../database/connection');
      const table = db.instance.table(entityType);
      await table.delete(recordId);
    } catch (error) {
      console.error(`Failed to delete local record ${entityType}:${recordId}:`, error);
    }
  }

  private async getSyncMetadata(entityType: string, entityId: string): Promise<Record<string, unknown> | null> {
    try {
      const { db } = await import('../database/connection');
      const metaId = `${entityType}:${entityId}`;
      const result = await db.instance.syncMetadata.get(metaId);
      return result ? (result as unknown as Record<string, unknown>) : null;
    } catch (error) {
      console.error(`Failed to get sync metadata for ${entityType}:${entityId}:`, error);
      return null;
    }
  }

  private getPayloadProperty(payload: Record<string, unknown>, property: string): unknown {
    return payload[property];
  }

  private getRecordId(record: Record<string, unknown>): string | null {
    const id = record.id;
    return typeof id === 'string' ? id : null;
  }

  private getSyncMetaProperty(syncMeta: Record<string, unknown> | null, property: string): unknown {
    if (!syncMeta || typeof syncMeta !== 'object') return undefined;
    return syncMeta[property];
  }

  private getSyncData(record: Record<string, unknown>): { version?: number } | null {
    const sync = record._sync;
    if (sync && typeof sync === 'object') {
      const syncObj = sync as Record<string, unknown>;
      return {
        version: typeof syncObj.version === 'number' ? syncObj.version : undefined
      };
    }
    return null;
  }
}