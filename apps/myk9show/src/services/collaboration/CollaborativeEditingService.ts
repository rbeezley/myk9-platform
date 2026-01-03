import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import { presenceService } from './PresenceService';

export interface EditLock {
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  lockedAt: Date;
  expiresAt: Date;
  sessionId: string;
}

export interface EditOperation {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'insert' | 'delete' | 'retain' | 'replace';
  position: number;
  content?: string;
  length?: number;
  userId: string;
  timestamp: Date;
  version: number;
}

export interface CollaborativeField {
  entityType: string;
  entityId: string;
  fieldName: string;
  value: string;
  version: number;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  operations: EditOperation[];
}

export interface TypingIndicator {
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  position: number;
  timestamp: Date;
}

export class CollaborativeEditingService {
  private static instance: CollaborativeEditingService;
  private channels: Map<string, RealtimeChannel> = new Map();
  private locks: Map<string, EditLock> = new Map();
  private fields: Map<string, CollaborativeField> = new Map();
  private typingIndicators: Map<string, TypingIndicator> = new Map();
  private lockRenewalInterval: NodeJS.Timeout | null = null;
  private operationQueue: Map<string, EditOperation[]> = new Map();

  private constructor() {}

  static getInstance(): CollaborativeEditingService {
    if (!CollaborativeEditingService.instance) {
      CollaborativeEditingService.instance = new CollaborativeEditingService();
    }
    return CollaborativeEditingService.instance;
  }

  // Entity locking methods
  async requestEditLock(
    entityType: string,
    entityId: string,
    userId: string,
    userName: string,
    timeout = 300000 // 5 minutes default
  ): Promise<boolean> {
    const lockKey = `${entityType}:${entityId}`;
    const existingLock = this.locks.get(lockKey);

    // Check if already locked by someone else
    if (existingLock && existingLock.userId !== userId && existingLock.expiresAt > new Date()) {
      return false;
    }

    const lock: EditLock = {
      entityType,
      entityId,
      userId,
      userName,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + timeout),
      sessionId: this.generateSessionId()
    };

    this.locks.set(lockKey, lock);

    // Broadcast lock to other users
    await this.broadcastLockUpdate(lock, 'acquired');

    // Update presence to show editing status
    await presenceService.updateActivity('editing', `${entityType} ${entityId}`);

    // Start lock renewal if this is our first lock
    if (!this.lockRenewalInterval) {
      this.startLockRenewal();
    }

    return true;
  }

  async releaseEditLock(entityType: string, entityId: string, userId: string): Promise<void> {
    const lockKey = `${entityType}:${entityId}`;
    const lock = this.locks.get(lockKey);

    if (lock && lock.userId === userId) {
      this.locks.delete(lockKey);
      
      // Broadcast lock release
      await this.broadcastLockUpdate(lock, 'released');

      // Update presence to show no longer editing
      await presenceService.updateActivity('viewing');

      // Stop lock renewal if no more locks
      if (this.locks.size === 0 && this.lockRenewalInterval) {
        clearInterval(this.lockRenewalInterval);
        this.lockRenewalInterval = null;
      }
    }
  }

  getEditLock(entityType: string, entityId: string): EditLock | null {
    const lockKey = `${entityType}:${entityId}`;
    const lock = this.locks.get(lockKey);
    
    // Check if lock is expired
    if (lock && lock.expiresAt <= new Date()) {
      this.locks.delete(lockKey);
      return null;
    }

    return lock || null;
  }

  isEntityLocked(entityType: string, entityId: string, excludeUserId?: string): boolean {
    const lock = this.getEditLock(entityType, entityId);
    return lock !== null && lock.userId !== excludeUserId;
  }

  // Collaborative field editing
  async initializeField(
    entityType: string,
    entityId: string,
    fieldName: string,
    initialValue: string,
    userId: string
  ): Promise<void> {
    const fieldKey = `${entityType}:${entityId}:${fieldName}`;
    
    if (!this.fields.has(fieldKey)) {
      const field: CollaborativeField = {
        entityType,
        entityId,
        fieldName,
        value: initialValue,
        version: 0,
        lastModifiedBy: userId,
        lastModifiedAt: new Date(),
        operations: []
      };

      this.fields.set(fieldKey, field);
      await this.ensureFieldChannel(entityType, entityId, fieldName);
    }
  }

  async applyOperation(
    entityType: string,
    entityId: string,
    fieldName: string,
    operation: Omit<EditOperation, 'id' | 'timestamp' | 'version'>,
    userId: string
  ): Promise<boolean> {
    const fieldKey = `${entityType}:${entityId}:${fieldName}`;
    const field = this.fields.get(fieldKey);

    if (!field) {
      return false;
    }

    const fullOperation: EditOperation = {
      ...operation,
      id: this.generateOperationId(),
      timestamp: new Date(),
      version: field.version + 1,
      userId
    };

    // Apply operation to field
    const newValue = this.applyOperationToString(field.value, fullOperation);
    
    field.value = newValue;
    field.version = fullOperation.version;
    field.lastModifiedBy = userId;
    field.lastModifiedAt = new Date();
    field.operations.push(fullOperation);

    // Keep only recent operations (last 100)
    if (field.operations.length > 100) {
      field.operations = field.operations.slice(-100);
    }

    // Broadcast operation to other users
    await this.broadcastOperation(fullOperation);

    return true;
  }

  // Typing indicators
  async updateTypingIndicator(
    entityType: string,
    entityId: string,
    fieldName: string,
    position: number,
    userId: string,
    userName: string
  ): Promise<void> {
    const indicator: TypingIndicator = {
      userId,
      userName,
      entityType,
      entityId,
      fieldName,
      position,
      timestamp: new Date()
    };

    const key = `${userId}:${entityType}:${entityId}:${fieldName}`;
    this.typingIndicators.set(key, indicator);

    // Broadcast typing indicator
    await this.broadcastTypingIndicator(indicator);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      this.typingIndicators.delete(key);
    }, 3000);
  }

  getTypingIndicators(
    entityType: string,
    entityId: string,
    fieldName: string,
    excludeUserId?: string
  ): TypingIndicator[] {
    return Array.from(this.typingIndicators.values()).filter(indicator =>
      indicator.entityType === entityType &&
      indicator.entityId === entityId &&
      indicator.fieldName === fieldName &&
      indicator.userId !== excludeUserId &&
      (Date.now() - indicator.timestamp.getTime()) < 5000 // Active within 5 seconds
    );
  }

  // Field synchronization
  getFieldValue(entityType: string, entityId: string, fieldName: string): string | null {
    const fieldKey = `${entityType}:${entityId}:${fieldName}`;
    return this.fields.get(fieldKey)?.value || null;
  }

  getFieldVersion(entityType: string, entityId: string, fieldName: string): number {
    const fieldKey = `${entityType}:${entityId}:${fieldName}`;
    return this.fields.get(fieldKey)?.version || 0;
  }

  // Conflict resolution
  async resolveConflict(
    entityType: string,
    entityId: string,
    fieldName: string,
    localValue: string,
    remoteValue: string,
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<string> {
    switch (resolution) {
      case 'local':
        return localValue;
      case 'remote':
        return remoteValue;
      case 'merge':
        return this.mergeValues(localValue, remoteValue);
      default:
        return localValue;
    }
  }

  private mergeValues(local: string, remote: string): string {
    // Simple merge strategy - could be enhanced with more sophisticated algorithms
    if (local === remote) {
      return local;
    }

    // For now, concatenate with a separator
    return `${local}\n---MERGE---\n${remote}`;
  }

  private applyOperationToString(value: string, operation: EditOperation): string {
    switch (operation.operation) {
      case 'insert':
        return value.slice(0, operation.position) + 
               (operation.content || '') + 
               value.slice(operation.position);
      
      case 'delete':
        return value.slice(0, operation.position) + 
               value.slice(operation.position + (operation.length || 0));
      
      case 'replace':
        return value.slice(0, operation.position) + 
               (operation.content || '') + 
               value.slice(operation.position + (operation.length || 0));
      
      case 'retain':
        return value; // No change
      
      default:
        return value;
    }
  }

  private async broadcastLockUpdate(lock: EditLock, action: 'acquired' | 'released'): Promise<void> {
    const channelKey = `locks:${lock.entityType}`;
    const channel = this.channels.get(channelKey) || await this.ensureLockChannel(lock.entityType);

    await channel.send({
      type: 'broadcast',
      event: 'lock_update',
      payload: { lock, action }
    });
  }

  private async broadcastOperation(operation: EditOperation): Promise<void> {
    const channelKey = `field:${operation.entityType}:${operation.entityId}`;
    const channel = this.channels.get(channelKey);

    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'operation',
        payload: operation
      });
    }
  }

  private async broadcastTypingIndicator(indicator: TypingIndicator): Promise<void> {
    const channelKey = `field:${indicator.entityType}:${indicator.entityId}`;
    const channel = this.channels.get(channelKey);

    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: indicator
      });
    }
  }

  private async ensureLockChannel(entityType: string): Promise<RealtimeChannel> {
    const channelKey = `locks:${entityType}`;
    
    if (!this.channels.has(channelKey)) {
      const channel = supabase.channel(channelKey);
      
      channel
        .on('broadcast', { event: 'lock_update' }, (payload) => {
          this.handleLockUpdate(payload.payload);
        })
        .subscribe();

      this.channels.set(channelKey, channel);
    }

    return this.channels.get(channelKey)!;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async ensureFieldChannel(entityType: string, entityId: string, fieldName: string): Promise<void> {
    const channelKey = `field:${entityType}:${entityId}`;
    
    if (!this.channels.has(channelKey)) {
      const channel = supabase.channel(channelKey);
      
      channel
        .on('broadcast', { event: 'operation' }, (payload) => {
          this.handleRemoteOperation(payload.payload as EditOperation);
        })
        .on('broadcast', { event: 'typing' }, (payload) => {
          this.handleRemoteTyping(payload.payload as TypingIndicator);
        })
        .subscribe();

      this.channels.set(channelKey, channel);
    }
  }

  private handleLockUpdate(payload: { lock: EditLock; action: 'acquired' | 'released' }): void {
    const { lock, action } = payload;
    const lockKey = `${lock.entityType}:${lock.entityId}`;

    if (action === 'acquired') {
      this.locks.set(lockKey, lock);
    } else {
      this.locks.delete(lockKey);
    }
  }

  private handleRemoteOperation(operation: EditOperation): void {
    const fieldKey = `${operation.entityType}:${operation.entityId}:${operation.entityType}`;
    const field = this.fields.get(fieldKey);

    if (field && operation.userId !== presenceService.getActiveUsers().find(u => u.status === 'online')?.id) {
      // Apply remote operation
      field.value = this.applyOperationToString(field.value, operation);
      field.version = Math.max(field.version, operation.version);
      field.lastModifiedBy = operation.userId;
      field.lastModifiedAt = operation.timestamp;
      field.operations.push(operation);
    }
  }

  private handleRemoteTyping(indicator: TypingIndicator): void {
    const key = `${indicator.userId}:${indicator.entityType}:${indicator.entityId}:${indicator.fieldName}`;
    this.typingIndicators.set(key, indicator);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.typingIndicators.delete(key);
    }, 5000);
  }

  private startLockRenewal(): void {
    this.lockRenewalInterval = setInterval(() => {
      const now = new Date();
      
      for (const [, lock] of this.locks.entries()) {
        // Renew locks that expire in the next minute
        if (lock.expiresAt.getTime() - now.getTime() < 60000) {
          lock.expiresAt = new Date(now.getTime() + 300000); // Extend by 5 minutes
          this.broadcastLockUpdate(lock, 'acquired');
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async cleanup(): Promise<void> {
    // Clear renewal interval
    if (this.lockRenewalInterval) {
      clearInterval(this.lockRenewalInterval);
    }

    // Release all locks
    for (const [, lock] of this.locks.entries()) {
      await this.releaseEditLock(lock.entityType, lock.entityId, lock.userId);
    }

    // Unsubscribe from all channels
    for (const channel of this.channels.values()) {
      await channel.unsubscribe();
    }

    this.channels.clear();
    this.locks.clear();
    this.fields.clear();
    this.typingIndicators.clear();
  }
}

export const collaborativeEditingService = CollaborativeEditingService.getInstance();