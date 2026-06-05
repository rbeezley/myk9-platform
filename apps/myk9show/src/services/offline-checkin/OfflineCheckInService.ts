/**
 * Offline Check-In Service
 *
 * Core service for managing check-in operations in offline-first mode.
 * Handles check-in processing, conflict resolution, and sync coordination.
 */

import { EventEmitter } from '../sync/eventEmitter';
import { getOptimalStorage } from '../database/storage-adapter';
import { logger } from '@/services/LoggingService';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';
import type { StateStorage } from 'zustand/middleware';
import type {
  CheckInEntry,
  CheckInOperation,
  CheckInConflict,
  CheckInStatistics,
  QRScanResult,
  TimeSyncStatus,
  OfflineCheckInQueue,
  ConflictResolution,
  OfflineCheckInServiceConfig,
} from '@/types/offline-checkin-types';
import type { CheckInStatus } from '@myk9/core';
import { generateId } from '@/utils/idUtils';
import { DEFAULT_CONFIG, STORAGE_KEY } from './OfflineCheckInService.constants';
import {
  validateQRChecksum,
  createCheckInEvent,
  validateCheckIn,
  detectArmbandConflicts,
  calculateStatistics,
  buildUpdatedEntry,
  buildCheckInOperation,
  createOfflineQueue,
} from './OfflineCheckInService.helpers';

export class OfflineCheckInService extends EventEmitter {
  private config: OfflineCheckInServiceConfig;
  private storage: StateStorage;
  private entries: Map<string, CheckInEntry> = new Map();
  private operations: Map<string, CheckInOperation> = new Map();
  private conflicts: Map<string, CheckInConflict> = new Map();
  private isInitialized = false;
  private syncInterval: NodeJS.Timeout | undefined;
  private timeSyncInterval: NodeJS.Timeout | undefined;
  private timeSyncStatus: TimeSyncStatus;
  private offlineQueue: OfflineCheckInQueue | null = null;

  constructor(config: Partial<OfflineCheckInServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = getOptimalStorage('checkin');
    this.timeSyncStatus = {
      lastSyncAt: new Date(),
      serverTimeOffset: 0,
      isAccurate: true,
      accuracy: 0,
      syncSource: 'manual',
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadPersistedData();
      await this.initializeOfflineQueue();

      if (this.config.syncInterval > 0) this.startSyncInterval();
      if (this.config.enableTimeSync) this.startTimeSyncInterval();

      this.isInitialized = true;
      this.emit('initialized', {});
      logger.info('OfflineCheckInService initialized successfully', 'checkin');
    } catch (error) {
      logger.error('Failed to initialize OfflineCheckInService', 'checkin', {}, error as Error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
    if (this.timeSyncInterval) {
      clearInterval(this.timeSyncInterval);
      this.timeSyncInterval = undefined;
    }
    await this.persistData();
    this.isInitialized = false;
    this.emit('shutdown', {});
  }

  async checkInEntry(
    entryId: string,
    newStatus: CheckInStatus,
    performedBy: string,
    options: {
      method?: 'qr_scan' | 'manual_entry' | 'bulk_operation';
      gateId?: string;
      deviceId?: string;
      handlerChange?: string;
      specialRequests?: string;
      scratchReason?: string;
      notes?: string;
    } = {}
  ): Promise<CheckInOperation> {
    try {
      const entry = this.entries.get(entryId);
      if (!entry) throw new Error(`Entry ${entryId} not found`);

      const validationResults = await validateCheckIn(
        entryId,
        newStatus,
        this.entries,
        classId => this.loadEntriesForClass(classId),
        () => this.getCurrentTime()
      );
      const hasErrors = validationResults.some(r => r.status === 'error');

      if (hasErrors && this.config.validationStrict) {
        const errorMessages = validationResults
          .filter(r => r.status === 'error')
          .map(r => r.message)
          .join(', ');
        throw new Error(`Check-in validation failed: ${errorMessages}`);
      }

      const operation = buildCheckInOperation(
        entryId,
        entry,
        newStatus,
        performedBy,
        this.getCurrentTime(),
        validationResults,
        options
      );

      const updatedEntry = buildUpdatedEntry(
        entry,
        newStatus,
        operation.performedAt,
        performedBy,
        options
      );

      this.operations.set(operation.id, operation);
      this.entries.set(entryId, updatedEntry);
      await this.addToOfflineQueue(operation);
      await this.persistData();

      this.emitEvent('check_in_completed', {
        entryId,
        operationId: operation.id,
        newStatus,
        performedBy,
        gateId: options.gateId,
      });

      if (navigator.onLine) {
        this.syncOperation(operation).catch(error => {
          logger.warn('Failed to sync operation immediately', 'checkin', {}, error as Error);
        });
      }

      return operation;
    } catch (error) {
      this.emitEvent('check_in_failed', {
        entryId,
        error: error instanceof Error ? error.message : 'Unknown error',
        performedBy,
        gateId: options.gateId,
      });
      throw error;
    }
  }

  async scanQRCode(qrData: string, performedBy: string, gateId?: string): Promise<QRScanResult> {
    const result: QRScanResult = {
      success: false,
      scannedAt: this.getCurrentTime(),
      scannerType: 'camera',
    };

    try {
      const parsedData = JSON.parse(qrData);

      if (!parsedData.entryId || !parsedData.armband) {
        result.error = 'Invalid QR code format';
        return result;
      }

      if (parsedData.checksum && !validateQRChecksum()) {
        result.error = 'QR code checksum validation failed';
        return result;
      }

      const entry = this.entries.get(parsedData.entryId);
      if (!entry) {
        result.error = `Entry ${parsedData.entryId} not found`;
        return result;
      }

      if (entry.armband !== parsedData.armband) {
        result.error = 'Armband mismatch between QR code and entry';
        return result;
      }

      result.success = true;
      result.data = qrData;
      result.entryId = parsedData.entryId;
      result.armband = parsedData.armband;

      if (entry.checkInStatus === 'no-status') {
        await this.checkInEntry(parsedData.entryId, 'checked-in', performedBy, {
          method: 'qr_scan',
          ...(gateId !== undefined && { gateId }),
        });
      }

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Failed to parse QR code';
      return result;
    }
  }

  async bulkCheckIn(
    entryIds: string[],
    newStatus: CheckInStatus,
    performedBy: string,
    gateId?: string
  ): Promise<{ successful: string[]; failed: { entryId: string; error: string }[] }> {
    const successful: string[] = [];
    const failed: { entryId: string; error: string }[] = [];

    for (const entryId of entryIds) {
      try {
        await this.checkInEntry(entryId, newStatus, performedBy, {
          method: 'bulk_operation',
          ...(gateId !== undefined && { gateId }),
        });
        successful.push(entryId);
      } catch (error) {
        failed.push({
          entryId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.emitEvent('bulk_operation_completed', {
      totalEntries: entryIds.length,
      successful: successful.length,
      failed: failed.length,
      performedBy,
      gateId,
    });

    return { successful, failed };
  }

  // Entry management
  async loadEntry(entryId: string): Promise<CheckInEntry | null> {
    return this.entries.get(entryId) || null;
  }

  async loadEntriesForClass(classId: string): Promise<CheckInEntry[]> {
    return Array.from(this.entries.values()).filter(entry => entry.classId === classId);
  }

  async loadEntriesForShow(showId: string): Promise<CheckInEntry[]> {
    return Array.from(this.entries.values()).filter(entry => entry.showId === showId);
  }

  async loadEntriesByStatus(status: CheckInStatus): Promise<CheckInEntry[]> {
    return Array.from(this.entries.values()).filter(entry => entry.checkInStatus === status);
  }

  async addEntry(
    entry: Omit<CheckInEntry, 'id' | 'createdAt' | 'updatedAt' | '_sync'>
  ): Promise<CheckInEntry> {
    const newEntry: CheckInEntry = {
      ...entry,
      id: generateId(),
      createdAt: this.getCurrentTime(),
      updatedAt: this.getCurrentTime(),
      _sync: {
        _version: 1,
        _lastModified: this.getCurrentTime().toISOString(),
        _lastModifiedBy: 'system',
        _syncStatus: 'pending',
      },
    };
    this.entries.set(newEntry.id, newEntry);
    await this.persistData();
    return newEntry;
  }

  // Conflict management
  async detectConflicts(): Promise<CheckInConflict[]> {
    return detectArmbandConflicts(this.entries, this.operations, () => this.getCurrentTime());
  }

  async resolveConflict(conflictId: string, resolution: unknown): Promise<void> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);
    if (!resolution || typeof resolution !== 'object') throw new Error('Invalid resolution format');

    const typedResolution = resolution as ConflictResolution;
    conflict.resolvedAt = this.getCurrentTime();
    conflict.resolution = typedResolution;
    conflict.status = 'resolved';

    this.conflicts.set(conflictId, conflict);
    await this.persistData();
    this.emitEvent('conflict_resolved', { conflictId, resolution: typedResolution.strategy });
  }

  async getStatistics(): Promise<CheckInStatistics> {
    return calculateStatistics(this.entries, this.operations, this.conflicts.size, () =>
      this.getCurrentTime()
    );
  }

  // Private utility methods
  private getCurrentTime(): Date {
    return new Date(Date.now() + this.timeSyncStatus.serverTimeOffset);
  }

  private emitEvent(
    type: Parameters<typeof createCheckInEvent>[0],
    data: Record<string, unknown>
  ): void {
    this.emit(
      'checkin-event',
      createCheckInEvent(type, data, () => this.getCurrentTime())
    );
  }

  private async syncOperation(operation: CheckInOperation): Promise<void> {
    try {
      await updateReplicatedCheckInStatus(operation.entryId, operation.newStatus);

      operation.isSynced = true;
      operation.syncedAt = this.getCurrentTime();
      this.operations.set(operation.id, operation);

      const entry = this.entries.get(operation.entryId);
      if (entry) {
        if (!entry._sync) {
          entry._sync = {
            _version: 1,
            _lastModified: new Date().toISOString(),
            _lastModifiedBy: 'system',
            _syncStatus: 'synced',
          };
        } else {
          entry._sync._syncStatus = 'synced';
        }
        this.entries.set(operation.entryId, entry);
      }

      await this.persistData();
    } catch (error) {
      operation.syncError = error instanceof Error ? error.message : 'Sync failed';
      this.operations.set(operation.id, operation);
      throw error;
    }
  }

  private async persistData(): Promise<void> {
    try {
      const data = {
        entries: Array.from(this.entries.entries()),
        operations: Array.from(this.operations.entries()),
        conflicts: Array.from(this.conflicts.entries()),
        timeSyncStatus: this.timeSyncStatus,
        offlineQueue: this.offlineQueue,
      };
      await this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to persist check-in data', 'checkin', {}, error as Error);
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      const dataStr = await this.storage.getItem(STORAGE_KEY);
      if (!dataStr) return;

      const data = JSON.parse(dataStr);
      if (data.entries) this.entries = new Map(data.entries);
      if (data.operations) this.operations = new Map(data.operations);
      if (data.conflicts) this.conflicts = new Map(data.conflicts);
      if (data.timeSyncStatus) this.timeSyncStatus = data.timeSyncStatus;
      if (data.offlineQueue) this.offlineQueue = data.offlineQueue;
    } catch (error) {
      logger.error('Failed to load persisted check-in data', 'checkin', {}, error as Error);
    }
  }

  private async initializeOfflineQueue(): Promise<void> {
    if (!this.offlineQueue) {
      this.offlineQueue = createOfflineQueue(this.config, () => this.getCurrentTime());
    }
  }

  private async addToOfflineQueue(operation: CheckInOperation): Promise<void> {
    if (!this.offlineQueue) await this.initializeOfflineQueue();

    this.offlineQueue!.operations.push(operation);
    if (!this.offlineQueue!._sync) {
      this.offlineQueue!._sync = {
        _version: 1,
        _lastModified: this.getCurrentTime().toISOString(),
        _lastModifiedBy: 'system',
        _syncStatus: 'pending',
      };
    } else {
      this.offlineQueue!._sync._lastModified = this.getCurrentTime().toISOString();
    }
  }

  private startSyncInterval(): void {
    this.syncInterval = setInterval(async () => {
      if (navigator.onLine && this.offlineQueue?.operations.length) {
        await this.processSyncQueue();
      }
    }, this.config.syncInterval);
  }

  private startTimeSyncInterval(): void {
    this.timeSyncInterval = setInterval(async () => {
      await this.syncTime();
    }, this.config.timeSyncInterval);
  }

  private async processSyncQueue(): Promise<void> {
    if (!this.offlineQueue || this.offlineQueue.isProcessing) return;
    this.offlineQueue.isProcessing = true;

    try {
      for (const operation of this.offlineQueue.operations) {
        if (!operation.isSynced) await this.syncOperation(operation);
      }
      this.offlineQueue.operations = this.offlineQueue.operations.filter(op => !op.isSynced);
      this.offlineQueue.lastProcessedAt = this.getCurrentTime();
    } catch (error) {
      this.offlineQueue.processingErrors.push(
        error instanceof Error ? error.message : 'Unknown sync error'
      );
      this.offlineQueue.retryCount++;
    } finally {
      this.offlineQueue.isProcessing = false;
      await this.persistData();
    }
  }

  private async syncTime(): Promise<void> {
    try {
      this.timeSyncStatus = {
        lastSyncAt: new Date(),
        serverTimeOffset: 0,
        isAccurate: true,
        accuracy: 100,
        syncSource: 'server',
      };
    } catch (error) {
      logger.error('Time sync failed', 'checkin', {}, error as Error);
      this.timeSyncStatus.isAccurate = false;
    }
  }
}

// Export singleton instance
export const offlineCheckInService = new OfflineCheckInService();
