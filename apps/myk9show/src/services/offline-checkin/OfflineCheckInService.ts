/**
 * Offline Check-In Service
 * 
 * Core service for managing check-in operations in offline-first mode.
 * Handles check-in processing, conflict resolution, and sync coordination.
 */

import { EventEmitter } from '../sync/eventEmitter';
import { syncService } from '../sync/syncService';
import { getOptimalStorage } from '../database/storage-adapter';
import { logger } from '@/services/LoggingService';
import type { StateStorage } from 'zustand/middleware';
import type {
  CheckInEntry,
  CheckInOperation,
  CheckInConflict,
  CheckInValidationResult,
  CheckInEvent,
  CheckInEventType,
  CheckInStatistics,
  OfflineCheckInServiceConfig,
  QRScanResult,
  TimeSyncStatus,
  OfflineCheckInQueue,
  ConflictResolution
} from '@/types/offline-checkin-types';
import type { CheckInStatus } from '@/types/check-in-types';
import { generateId } from '@/utils/idUtils';

const DEFAULT_CONFIG: OfflineCheckInServiceConfig = {
  enableQRScanning: true,
  enableBarcodeScanning: true,
  enableManualEntry: true,
  autoResolveConflicts: true,
  conflictResolutionStrategy: 'timestamp',
  maxRetries: 3,
  retryDelay: 1000,
  syncInterval: 30000, // 30 seconds
  validationStrict: true,
  enableTimeSync: true,
  timeSyncInterval: 300000 // 5 minutes
};

export class OfflineCheckInService extends EventEmitter {
  private config: OfflineCheckInServiceConfig;
  private storage: StateStorage;
  private entries: Map<string, CheckInEntry> = new Map();
  private operations: Map<string, CheckInOperation> = new Map();
  private conflicts: Map<string, CheckInConflict> = new Map();
  private isInitialized = false;
  private syncInterval?: NodeJS.Timeout;
  private timeSyncInterval?: NodeJS.Timeout;
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
      syncSource: 'manual'
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load persisted data
      await this.loadPersistedData();
      
      // Initialize offline queue
      await this.initializeOfflineQueue();
      
      // Start sync interval
      if (this.config.syncInterval > 0) {
        this.startSyncInterval();
      }
      
      // Start time sync
      if (this.config.enableTimeSync) {
        this.startTimeSyncInterval();
      }

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
    
    // Save current state
    await this.persistData();
    
    this.isInitialized = false;
    this.emit('shutdown', {});
  }

  // Core check-in operations
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
      if (!entry) {
        throw new Error(`Entry ${entryId} not found`);
      }

      // Validate the check-in operation
      const validationResults = await this.validateCheckIn(entryId, newStatus);
      const hasErrors = validationResults.some(r => r.status === 'error');
      
      if (hasErrors && this.config.validationStrict) {
        const errorMessages = validationResults
          .filter(r => r.status === 'error')
          .map(r => r.message)
          .join(', ');
        throw new Error(`Check-in validation failed: ${errorMessages}`);
      }

      // Create operation record
      const operation: CheckInOperation = {
        id: generateId(),
        entryId,
        operationType: this.getOperationType(newStatus),
        previousStatus: entry.checkInStatus,
        newStatus,
        performedBy,
        performedAt: this.getCurrentTime(),
        method: options.method || 'manual_entry',
        gateId: options.gateId,
        deviceId: options.deviceId,
        handlerChange: options.handlerChange,
        specialRequests: options.specialRequests,
        scratchReason: options.scratchReason,
        notes: options.notes,
        validationChecks: validationResults,
        hasWarnings: validationResults.some(r => r.status === 'warning'),
        hasErrors,
        isSynced: false
      };

      // Update entry
      const updatedEntry: CheckInEntry = {
        ...entry,
        checkInStatus: newStatus,
        checkInTime: operation.performedAt,
        checkInGate: options.gateId,
        checkInStewardId: performedBy,
        handlerChange: options.handlerChange || entry.handlerChange,
        specialRequests: options.specialRequests || entry.specialRequests,
        isScratched: newStatus === 'pulled',
        scratchReason: options.scratchReason || entry.scratchReason,
        updatedAt: operation.performedAt,
        _sync: {
          _version: (entry._sync?._version || 0) + 1,
          _lastModified: operation.performedAt.toISOString(),
          _lastModifiedBy: performedBy,
          _syncStatus: 'pending'
        }
      };

      // Store operation and updated entry
      this.operations.set(operation.id, operation);
      this.entries.set(entryId, updatedEntry);

      // Add to offline queue for sync
      await this.addToOfflineQueue(operation);

      // Persist data
      await this.persistData();

      // Emit events
      this.emitEvent('check_in_completed', {
        entryId,
        operationId: operation.id,
        newStatus,
        performedBy,
        gateId: options.gateId
      });

      // Attempt immediate sync if online
      if (navigator.onLine) {
        this.syncOperation(operation).catch(error => {
          logger.warn('Failed to sync operation immediately', 'checkin', {}, error as Error);
        });
      }

      return operation;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.emitEvent('check_in_failed', {
        entryId,
        error: errorMessage,
        performedBy,
        gateId: options.gateId
      });
      
      throw error;
    }
  }

  async scanQRCode(qrData: string, performedBy: string, gateId?: string): Promise<QRScanResult> {
    const result: QRScanResult = {
      success: false,
      scannedAt: this.getCurrentTime(),
      scannerType: 'camera'
    };

    try {
      // Parse QR code data (assuming JSON format)
      const parsedData = JSON.parse(qrData);
      
      if (!parsedData.entryId || !parsedData.armband) {
        result.error = 'Invalid QR code format';
        return result;
      }

      // Validate checksum if present
      if (parsedData.checksum && !this.validateQRChecksum()) {
        result.error = 'QR code checksum validation failed';
        return result;
      }

      // Check if entry exists
      const entry = this.entries.get(parsedData.entryId);
      if (!entry) {
        result.error = `Entry ${parsedData.entryId} not found`;
        return result;
      }

      // Verify armband matches
      if (entry.armband !== parsedData.armband) {
        result.error = 'Armband mismatch between QR code and entry';
        return result;
      }

      result.success = true;
      result.data = qrData;
      result.entryId = parsedData.entryId;
      result.armband = parsedData.armband;

      // Automatically check in if not already checked in
      if (entry.checkInStatus === 'none') {
        await this.checkInEntry(parsedData.entryId, 'checked-in', performedBy, {
          method: 'qr_scan',
          gateId
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
          gateId
        });
        successful.push(entryId);
      } catch (error) {
        failed.push({
          entryId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.emitEvent('bulk_operation_completed', {
      totalEntries: entryIds.length,
      successful: successful.length,
      failed: failed.length,
      performedBy,
      gateId
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

  async addEntry(entry: Omit<CheckInEntry, 'id' | 'createdAt' | 'updatedAt' | '_sync'>): Promise<CheckInEntry> {
    const newEntry: CheckInEntry = {
      ...entry,
      id: generateId(),
      createdAt: this.getCurrentTime(),
      updatedAt: this.getCurrentTime(),
      _sync: {
        _version: 1,
        _lastModified: this.getCurrentTime().toISOString(),
        _lastModifiedBy: 'system',
        _syncStatus: 'pending'
      }
    };

    this.entries.set(newEntry.id, newEntry);
    await this.persistData();

    return newEntry;
  }

  // Validation
  private async validateCheckIn(
    entryId: string,
    newStatus: CheckInStatus
  ): Promise<CheckInValidationResult[]> {
    const results: CheckInValidationResult[] = [];
    const entry = this.entries.get(entryId);

    if (!entry) {
      results.push({
        check: 'entry_exists',
        status: 'error',
        message: 'Entry not found',
        details: { entryId }
      });
      return results;
    }

    // Check if already checked in
    if (entry.checkInStatus === 'checked-in' && newStatus === 'checked-in') {
      results.push({
        check: 'duplicate_checkin',
        status: 'warning',
        message: 'Entry is already checked in',
        details: { currentStatus: entry.checkInStatus, checkInTime: entry.checkInTime }
      });
    }

    // Check armband uniqueness for this class
    const classEntries = await this.loadEntriesForClass(entry.classId);
    const armbandConflict = classEntries.find(
      e => e.id !== entryId && e.armband === entry.armband && e.checkInStatus === 'checked-in'
    );
    
    if (armbandConflict && newStatus === 'checked-in') {
      results.push({
        check: 'armband_unique',
        status: 'error',
        message: `Armband ${entry.armband} is already checked in for another entry`,
        details: { conflictingEntryId: armbandConflict.id }
      });
    }

    // Check time window
    const now = this.getCurrentTime();
    if (entry.estimatedStartTime) {
      const timeDiff = entry.estimatedStartTime.getTime() - now.getTime();
      const hoursUntilStart = timeDiff / (1000 * 60 * 60);
      
      if (hoursUntilStart > 2 && newStatus === 'checked-in') {
        results.push({
          check: 'time_window',
          status: 'warning',
          message: 'Check-in is more than 2 hours before class start',
          details: { hoursUntilStart, estimatedStartTime: entry.estimatedStartTime }
        });
      }
      
      if (hoursUntilStart < -0.5 && newStatus === 'checked-in') {
        results.push({
          check: 'time_window',
          status: 'error',
          message: 'Class has already started',
          details: { hoursUntilStart, estimatedStartTime: entry.estimatedStartTime }
        });
      }
    }

    // Always pass basic validation if no errors
    if (results.length === 0 || !results.some(r => r.status === 'error')) {
      results.push({
        check: 'entry_exists',
        status: 'pass',
        message: 'Entry validation passed'
      });
    }

    return results;
  }

  // Conflict management
  async detectConflicts(): Promise<CheckInConflict[]> {
    const conflicts: CheckInConflict[] = [];
    const processedArmbands = new Map<string, string[]>(); // classId -> entryIds[]

    for (const entry of this.entries.values()) {
      if (entry.checkInStatus !== 'checked-in') continue;

      const key = `${entry.classId}-${entry.armband}`;
      if (!processedArmbands.has(key)) {
        processedArmbands.set(key, []);
      }
      
      processedArmbands.get(key)!.push(entry.id);
    }

    // Check for duplicate armbands
    for (const [key, entryIds] of processedArmbands.entries()) {
      if (entryIds.length > 1) {
        const [classId, armband] = key.split('-');
        const conflictEntries = entryIds.map(id => this.entries.get(id)!);
        
        conflicts.push({
          id: generateId(),
          type: 'armband_conflict',
          entryId: entryIds[0], // Primary entry
          conflictingData: {
            armband,
            classId,
            conflictingEntries: conflictEntries
          },
          detectedAt: this.getCurrentTime(),
          status: 'pending',
          priority: 'high',
          originalOperation: this.operations.get(entryIds[0]) || {} as CheckInOperation
        });
      }
    }

    return conflicts;
  }

  async resolveConflict(conflictId: string, resolution: unknown): Promise<void> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    // Type guard for resolution
    if (!resolution || typeof resolution !== 'object') {
      throw new Error('Invalid resolution format');
    }
    
    const typedResolution = resolution as ConflictResolution;
    
    conflict.resolvedAt = this.getCurrentTime();
    conflict.resolution = typedResolution;
    conflict.status = 'resolved';

    this.conflicts.set(conflictId, conflict);
    await this.persistData();

    this.emitEvent('conflict_resolved', {
      conflictId,
      resolution: typedResolution.strategy
    });
  }

  // Statistics
  async getStatistics(): Promise<CheckInStatistics> {
    const allEntries = Array.from(this.entries.values());
    const totalEntries = allEntries.length;
    
    const statusCounts = allEntries.reduce((acc, entry) => {
      acc[entry.checkInStatus] = (acc[entry.checkInStatus] || 0) + 1;
      return acc;
    }, {} as Record<CheckInStatus, number>);

    const operations = Array.from(this.operations.values());
    const checkInTimes = operations
      .filter(op => op.operationType === 'check_in')
      .map(op => op.performedAt.getTime());

    let averageCheckInTime = 0;
    if (checkInTimes.length > 1) {
      const intervals = checkInTimes
        .sort((a, b) => a - b)
        .slice(1)
        .map((time, i) => time - checkInTimes[i]);
      averageCheckInTime = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    }

    return {
      totalEntries,
      checkedInCount: statusCounts['checked-in'] || 0,
      scratchedCount: statusCounts['pulled'] || 0,
      absentCount: 0, // Will implement when we add absent status
      conflictCount: this.conflicts.size,
      averageCheckInTime,
      checkInRate: checkInTimes.length > 0 ? (checkInTimes.length / (Date.now() - Math.min(...checkInTimes))) * 60000 : 0,
      gateStatistics: {}, // Will implement with gate integration
      timeSeriesData: [], // Will implement with time series tracking
      errorRate: operations.filter(op => op.hasErrors).length / Math.max(operations.length, 1),
      conflictRate: this.conflicts.size / Math.max(totalEntries, 1),
      syncSuccessRate: operations.filter(op => op.isSynced).length / Math.max(operations.length, 1),
      lastUpdated: this.getCurrentTime()
    };
  }

  // Sync operations
  private async syncOperation(operation: CheckInOperation): Promise<void> {
    try {
      await syncService.addToQueue({
        entityType: 'entries',
        entityId: operation.entryId,
        operation: 'update',
        data: {
          checkInStatus: operation.newStatus,
          checkInTime: operation.performedAt,
          checkInGate: operation.gateId,
          checkInStewardId: operation.performedBy,
          handlerChange: operation.handlerChange,
          specialRequests: operation.specialRequests,
          scratchReason: operation.scratchReason
        },
        priority: "medium" // High priority for check-in operations
      });

      operation.isSynced = true;
      operation.syncedAt = this.getCurrentTime();
      this.operations.set(operation.id, operation);
      
      // Update entry sync status
      const entry = this.entries.get(operation.entryId);
      if (entry) {
        if (!entry._sync) {
          entry._sync = {
            _version: 1,
            _lastModified: new Date().toISOString(),
            _lastModifiedBy: 'system',
            _syncStatus: 'synced'
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

  // Utility methods
  private getOperationType(status: CheckInStatus): CheckInOperation['operationType'] {
    switch (status) {
      case 'checked-in':
        return 'check_in';
      case 'pulled':
        return 'scratch';
      default:
        return 'check_in';
    }
  }

  private getCurrentTime(): Date {
    return new Date(Date.now() + this.timeSyncStatus.serverTimeOffset);
  }

  private validateQRChecksum(): boolean {
    // Implement checksum validation logic
    return true; // Placeholder
  }

  private emitEvent(type: CheckInEventType, data: Record<string, unknown>): void {
    const event: CheckInEvent = {
      type,
      timestamp: this.getCurrentTime(),
      data,
      source: 'service',
      priority: 'medium'
    };
    
    this.emit('checkin-event', event);
  }

  // Persistence
  private async persistData(): Promise<void> {
    try {
      const data = {
        entries: Array.from(this.entries.entries()),
        operations: Array.from(this.operations.entries()),
        conflicts: Array.from(this.conflicts.entries()),
        timeSyncStatus: this.timeSyncStatus,
        offlineQueue: this.offlineQueue
      };
      
      await this.storage.setItem('offline-checkin-data', JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to persist check-in data', 'checkin', {}, error as Error);
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      const dataStr = await this.storage.getItem('offline-checkin-data');
      if (!dataStr) return;

      const data = JSON.parse(dataStr);
      
      if (data.entries) {
        this.entries = new Map(data.entries);
      }
      
      if (data.operations) {
        this.operations = new Map(data.operations);
      }
      
      if (data.conflicts) {
        this.conflicts = new Map(data.conflicts);
      }
      
      if (data.timeSyncStatus) {
        this.timeSyncStatus = data.timeSyncStatus;
      }
      
      if (data.offlineQueue) {
        this.offlineQueue = data.offlineQueue;
      }
    } catch (error) {
      logger.error('Failed to load persisted check-in data', 'checkin', {}, error as Error);
    }
  }

  private async initializeOfflineQueue(): Promise<void> {
    if (!this.offlineQueue) {
      this.offlineQueue = {
        id: generateId(),
        operations: [],
        queuedAt: this.getCurrentTime(),
        processingErrors: [],
        retryCount: 0,
        maxRetries: this.config.maxRetries,
        isProcessing: false,
        createdAt: this.getCurrentTime(),
        updatedAt: this.getCurrentTime(),
        _sync: {
          _version: 1,
          _lastModified: this.getCurrentTime().toISOString(),
          _lastModifiedBy: 'system',
          _syncStatus: 'pending'
        }
      };
    }
  }

  private async addToOfflineQueue(operation: CheckInOperation): Promise<void> {
    if (!this.offlineQueue) {
      await this.initializeOfflineQueue();
    }
    
    this.offlineQueue!.operations.push(operation);
    if (!this.offlineQueue!._sync) {
      this.offlineQueue!._sync = {
        _version: 1,
        _lastModified: this.getCurrentTime().toISOString(),
        _lastModifiedBy: 'system',
        _syncStatus: 'pending'
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
        if (!operation.isSynced) {
          await this.syncOperation(operation);
        }
      }
      
      // Clear synced operations
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
      // In a real implementation, this would sync with a time server
      // For now, we'll assume local time is accurate
      this.timeSyncStatus = {
        lastSyncAt: new Date(),
        serverTimeOffset: 0,
        isAccurate: true,
        accuracy: 100,
        syncSource: 'server'
      };
    } catch (error) {
      logger.error('Time sync failed', 'checkin', {}, error as Error);
      this.timeSyncStatus.isAccurate = false;
    }
  }
}

// Export singleton instance
export const offlineCheckInService = new OfflineCheckInService();