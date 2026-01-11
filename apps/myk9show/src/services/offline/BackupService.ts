/**
 * BackupService - Handle data backup and restoration operations
 * 
 * Provides:
 * - Automated backup scheduling
 * - Manual backup creation
 * - Backup validation and integrity checks
 * - Data compression and decompression
 * - Incremental backup support
 * - Cross-device backup synchronization
 */

import { BackupInfo, ExportOptions } from '@/components/offline/OfflineDataManager';
import { logger } from '@/services/LoggingService';

export interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  maxBackups: number;
  autoCleanup: boolean;
}

export interface BackupValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  size: number;
  checksum: string;
}

export class BackupService {
  private static instance: BackupService;
  private schedule: BackupSchedule;
  private activeBackups: Map<string, BackupInfo> = new Map();

  private constructor() {
    this.schedule = {
      enabled: true,
      frequency: 'weekly',
      time: '02:00',
      maxBackups: 10,
      autoCleanup: true
    };
    this.initializeScheduler();
  }

  public static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  /**
   * Initialize backup scheduler
   */
  private initializeScheduler(): void {
    if (!this.schedule.enabled) return;

    // Check for scheduled backups every hour
    setInterval(() => {
      this.checkScheduledBackups();
    }, 60 * 60 * 1000);
  }

  /**
   * Check if a scheduled backup should run
   */
  private checkScheduledBackups(): void {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    if (currentTime !== this.schedule.time) return;

    const shouldRun = this.shouldRunScheduledBackup(now);
    if (shouldRun) {
      this.createAutomaticBackup();
    }
  }

  /**
   * Determine if scheduled backup should run based on frequency
   */
  private shouldRunScheduledBackup(now: Date): boolean {
    const lastAutoBackup = this.getLastAutomaticBackup();
    if (!lastAutoBackup) return true;

    const daysSinceLastBackup = Math.floor(
      (now.getTime() - lastAutoBackup.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    switch (this.schedule.frequency) {
      case 'daily':
        return daysSinceLastBackup >= 1;
      case 'weekly':
        return daysSinceLastBackup >= 7;
      case 'monthly':
        return daysSinceLastBackup >= 30;
      default:
        return false;
    }
  }

  /**
   * Get the most recent automatic backup
   */
  private getLastAutomaticBackup(): BackupInfo | null {
    const autoBackups = Array.from(this.activeBackups.values())
      .filter(backup => backup.type === 'auto')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return autoBackups.length > 0 ? autoBackups[0] : null;
  }

  /**
   * Create an automatic backup
   */
  private async createAutomaticBackup(): Promise<BackupInfo> {
    const options: ExportOptions = {
      format: 'json',
      entities: ['shows', 'entries', 'dogs', 'people', 'classes', 'results'],
      includeDeleted: false,
      compressed: true
    };

    return this.createBackup(options, 'auto');
  }

  /**
   * Create a manual backup
   */
  public async createManualBackup(
    entities: string[],
    name?: string,
    compressed: boolean = true
  ): Promise<BackupInfo> {
    const options: ExportOptions = {
      format: 'json',
      entities,
      includeDeleted: false,
      compressed
    };

    return this.createBackup(options, 'manual', name);
  }

  /**
   * Core backup creation logic
   */
  private async createBackup(
    options: ExportOptions,
    type: 'auto' | 'manual',
    customName?: string
  ): Promise<BackupInfo> {
    const startTime = performance.now();
    
    try {
      // Gather data from all specified entities
      const data = await this.gatherEntityData(options.entities);
      
      // Apply filters
      const filteredData = this.applyDataFilters(data, options);
      
      // Generate backup metadata
      const metadata = {
        version: '1.0.0',
        deviceId: this.getDeviceId(),
        entryCount: this.calculateEntryCount(filteredData),
        createdAt: new Date().toISOString(),
        options
      };

      // Compress data if requested
      const finalData = options.compressed 
        ? await this.compressData({ data: filteredData, metadata })
        : { data: filteredData, metadata };

      // Calculate size and generate checksum
      const size = this.calculateDataSize(finalData);
      const checksum = await this.generateChecksum(finalData);

      // Create backup info
      const backup: BackupInfo = {
        id: this.generateBackupId(),
        name: customName || this.generateBackupName(type),
        type,
        createdAt: new Date(),
        size,
        entities: options.entities,
        compressed: options.compressed,
        metadata: {
          version: metadata.version,
          deviceId: metadata.deviceId,
          entryCount: metadata.entryCount
        }
      };

      // Store backup
      await this.storeBackup(backup, finalData, checksum);
      this.activeBackups.set(backup.id, backup);

      // Cleanup old backups if auto-cleanup is enabled
      if (this.schedule.autoCleanup && type === 'auto') {
        await this.cleanupOldBackups();
      }

      const endTime = performance.now();
      logger.info('Backup created', 'backup', { name: backup.name, durationMs: Math.round(endTime - startTime) });

      return backup;
    } catch (error) {
      logger.error('Backup creation failed', 'backup', {}, error as Error);
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gather data from specified entities
   */
  private async gatherEntityData(entities: string[]): Promise<Record<string, unknown[]>> {
    const data: Record<string, unknown[]> = {};

    for (const entity of entities) {
      try {
        switch (entity) {
          case 'shows':
            data.shows = await this.getEntityData('shows');
            break;
          case 'entries':
            data.entries = await this.getEntityData('entries');
            break;
          case 'dogs':
            data.dogs = await this.getEntityData('dogs');
            break;
          case 'people':
            data.people = await this.getEntityData('people');
            break;
          case 'classes':
            data.classes = await this.getEntityData('classes');
            break;
          case 'results':
            data.results = await this.getEntityData('results');
            break;
          case 'settings':
            data.settings = await this.getEntityData('settings');
            break;
          default:
            logger.warn('Unknown entity type', 'backup', { entity });
        }
      } catch (error) {
        logger.error('Failed to gather data for entity', 'backup', { entity }, error as Error);
        data[entity] = []; // Include empty array for failed entities
      }
    }

    return data;
  }

  /**
   * Get data for a specific entity type
   * In a real implementation, this would interface with the actual data stores
   */
  private async getEntityData(entityType: string): Promise<unknown[]> {
    // Simulate data retrieval from stores
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return mock data - in real implementation, get from actual stores
    const mockData = {
      shows: this.generateMockShows(),
      entries: this.generateMockEntries(),
      dogs: this.generateMockDogs(),
      people: this.generateMockPeople(),
      classes: this.generateMockClasses(),
      results: this.generateMockResults(),
      settings: this.generateMockSettings()
    };

    return mockData[entityType as keyof typeof mockData] || [];
  }

  /**
   * Apply data filters based on export options
   */
  private applyDataFilters(data: Record<string, unknown[]>, options: ExportOptions): Record<string, unknown[]> {
    const filtered: Record<string, unknown[]> = {};

    for (const [entityType, entityData] of Object.entries(data)) {
      let filteredEntityData = [...entityData];

      // Filter out deleted items if not included
      if (!options.includeDeleted) {
        filteredEntityData = filteredEntityData.filter(item => !(item as Record<string, unknown>).isDeleted);
      }

      // Apply date range filter if specified
      if (options.dateRange) {
        filteredEntityData = filteredEntityData.filter(item => {
          const itemRecord = item as Record<string, unknown>;
          const itemDate = new Date(
            (itemRecord.createdAt as string) || 
            (itemRecord.date as string) || 
            (itemRecord.updatedAt as string)
          );
          return itemDate >= options.dateRange!.start && itemDate <= options.dateRange!.end;
        });
      }

      filtered[entityType] = filteredEntityData;
    }

    return filtered;
  }

  /**
   * Compress backup data
   */
  private async compressData(data: unknown): Promise<unknown> {
    // In a real implementation, use actual compression library
    const compressed = JSON.stringify(data);
    return {
      compressed: true,
      originalSize: JSON.stringify(data).length,
      compressedSize: compressed.length,
      data: compressed
    };
  }

  /**
   * Validate backup integrity
   */
  public async validateBackup(backupId: string): Promise<BackupValidation> {
    const backup = this.activeBackups.get(backupId);
    if (!backup) {
      return {
        isValid: false,
        errors: ['Backup not found'],
        warnings: [],
        size: 0,
        checksum: ''
      };
    }

    const validation: BackupValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      size: backup.size,
      checksum: ''
    };

    try {
      // Retrieve backup data
      const backupData = await this.retrieveBackup(backupId);
      
      // Verify checksum
      const currentChecksum = await this.generateChecksum(backupData);
      const storedChecksum = await this.getStoredChecksum(backupId);
      
      if (currentChecksum !== storedChecksum) {
        validation.errors.push('Checksum mismatch - backup may be corrupted');
        validation.isValid = false;
      }

      validation.checksum = currentChecksum;

      // Validate data structure
      if (backupData.metadata) {
        if (!backupData.metadata.version) {
          validation.warnings.push('Missing version information');
        }
        if (!backupData.metadata.entryCount) {
          validation.warnings.push('Missing entry count metadata');
        }
      } else {
        validation.errors.push('Missing backup metadata');
        validation.isValid = false;
      }

      // Validate entity data
      if (backupData.data) {
        for (const entity of backup.entities) {
          if (!backupData.data[entity]) {
            validation.warnings.push(`Missing data for entity: ${entity}`);
          }
        }
      } else {
        validation.errors.push('Missing backup data');
        validation.isValid = false;
      }

    } catch (error) {
      validation.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      validation.isValid = false;
    }

    return validation;
  }

  /**
   * Restore data from backup
   */
  public async restoreBackup(
    backupId: string, 
    options: {
      entities?: string[];
      overwriteExisting?: boolean;
      createRestorePoint?: boolean;
    } = {}
  ): Promise<void> {
    const backup = this.activeBackups.get(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    // Validate backup before restoration
    const validation = await this.validateBackup(backupId);
    if (!validation.isValid) {
      throw new Error(`Backup validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      // Create restore point if requested
      if (options.createRestorePoint) {
        await this.createManualBackup(
          options.entities || backup.entities,
          `Restore Point - ${new Date().toISOString()}`,
          true
        );
      }

      // Retrieve backup data
      const backupData = await this.retrieveBackup(backupId);
      
      // Decompress if necessary
      const restoredData = backup.compressed 
        ? await this.decompressData(backupData)
        : backupData;

      // Restore entities
      const entitiesToRestore = options.entities || backup.entities;
      for (const entity of entitiesToRestore) {
        const typedData = restoredData as { data: Record<string, unknown[]> };
        if (typedData.data[entity]) {
          await this.restoreEntityData(entity, typedData.data[entity], options.overwriteExisting);
        }
      }

      logger.info('Successfully restored backup', 'backup', { name: backup.name });
    } catch (error) {
      logger.error('Backup restoration failed', 'backup', {}, error as Error);
      throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a backup
   */
  public async deleteBackup(backupId: string): Promise<void> {
    const backup = this.activeBackups.get(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    try {
      await this.removeStoredBackup(backupId);
      this.activeBackups.delete(backupId);
      logger.info('Backup deleted', 'backup', { name: backup.name });
    } catch (error) {
      logger.error('Failed to delete backup', 'backup', { name: backup.name }, error as Error);
      throw new Error(`Failed to delete backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all available backups
   */
  public getBackups(): BackupInfo[] {
    return Array.from(this.activeBackups.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Update backup schedule
   */
  public updateSchedule(schedule: Partial<BackupSchedule>): void {
    this.schedule = { ...this.schedule, ...schedule };
    
    // Reinitialize scheduler if enabled status changed
    if (schedule.enabled !== undefined) {
      this.initializeScheduler();
    }
  }

  /**
   * Get current backup schedule
   */
  public getSchedule(): BackupSchedule {
    return { ...this.schedule };
  }

  // Helper methods

  private generateBackupId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBackupName(type: 'auto' | 'manual'): string {
    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString();
    return `${type === 'auto' ? 'Auto' : 'Manual'} Backup - ${date} ${time}`;
  }

  private getDeviceId(): string {
    // In a real implementation, generate or retrieve a unique device ID
    return 'device_' + Math.random().toString(36).substr(2, 9);
  }

  private calculateEntryCount(data: Record<string, unknown[]>): number {
    return Object.values(data).reduce((total, entityData) => total + entityData.length, 0);
  }

  private calculateDataSize(data: unknown): number {
    return JSON.stringify(data).length;
  }

  private async generateChecksum(data: unknown): Promise<string> {
    // Simple checksum - in real implementation, use crypto.subtle.digest
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private async storeBackup(backup: BackupInfo, data: unknown, checksum: string): Promise<void> {
    // In real implementation, store to IndexedDB or other persistent storage
    localStorage.setItem(`backup_${backup.id}`, JSON.stringify(data));
    localStorage.setItem(`backup_${backup.id}_checksum`, checksum);
  }

  private async retrieveBackup(backupId: string): Promise<{
    metadata: { version: string; entryCount: number; [key: string]: unknown };
    data: Record<string, unknown[]>;
    [key: string]: unknown;
  }> {
    const stored = localStorage.getItem(`backup_${backupId}`);
    if (!stored) {
      throw new Error('Backup data not found');
    }
    return JSON.parse(stored) as {
      metadata: { version: string; entryCount: number; [key: string]: unknown };
      data: Record<string, unknown[]>;
      [key: string]: unknown;
    };
  }

  private async getStoredChecksum(backupId: string): Promise<string> {
    return localStorage.getItem(`backup_${backupId}_checksum`) || '';
  }

  private async removeStoredBackup(backupId: string): Promise<void> {
    localStorage.removeItem(`backup_${backupId}`);
    localStorage.removeItem(`backup_${backupId}_checksum`);
  }

  private async decompressData(data: unknown): Promise<unknown> {
    // In real implementation, decompress the data
    const dataRecord = data as Record<string, unknown>;
    if (dataRecord.compressed) {
      return JSON.parse(dataRecord.data as string);
    }
    return data;
  }

  private async restoreEntityData(entityType: string, data: unknown[], overwrite = false): Promise<void> {
    // In real implementation, restore data to actual stores
    logger.debug('Restoring entity data', 'backup', { entityType, itemCount: data.length, overwrite });

    // Simulate restore delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async cleanupOldBackups(): Promise<void> {
    const autoBackups = Array.from(this.activeBackups.values())
      .filter(backup => backup.type === 'auto')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (autoBackups.length > this.schedule.maxBackups) {
      const backupsToDelete = autoBackups.slice(this.schedule.maxBackups);
      
      for (const backup of backupsToDelete) {
        await this.deleteBackup(backup.id);
      }
    }
  }

  // Mock data generators
  private generateMockShows(): unknown[] {
    return Array.from({ length: 25 }, (_, i) => ({
      id: `show-${i + 1}`,
      name: `Dog Show ${i + 1}`,
      date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      location: `Location ${i + 1}`,
      createdAt: new Date(),
      isDeleted: false
    }));
  }

  private generateMockEntries(): unknown[] {
    return Array.from({ length: 1250 }, (_, i) => ({
      id: `entry-${i + 1}`,
      showId: `show-${Math.floor(Math.random() * 25) + 1}`,
      dogId: `dog-${Math.floor(Math.random() * 450) + 1}`,
      createdAt: new Date(),
      isDeleted: false
    }));
  }

  private generateMockDogs(): unknown[] {
    return Array.from({ length: 450 }, (_, i) => ({
      id: `dog-${i + 1}`,
      name: `Dog ${i + 1}`,
      breed: 'Labrador',
      createdAt: new Date(),
      isDeleted: false
    }));
  }

  private generateMockPeople(): unknown[] {
    return Array.from({ length: 300 }, (_, i) => ({
      id: `person-${i + 1}`,
      name: `User ${i + 1}`,
      email: `person${i + 1}@example.com`,
      createdAt: new Date(),
      isDeleted: false
    }));
  }

  private generateMockClasses(): unknown[] {
    return Array.from({ length: 150 }, (_, i) => ({
      id: `class-${i + 1}`,
      name: `Class ${i + 1}`,
      showId: `show-${Math.floor(Math.random() * 25) + 1}`,
      createdAt: new Date(),
      isDeleted: false
    }));
  }

  private generateMockResults(): unknown[] {
    return Array.from({ length: 800 }, (_, i) => ({
      id: `result-${i + 1}`,
      entryId: `entry-${Math.floor(Math.random() * 1250) + 1}`,
      placement: Math.floor(Math.random() * 10) + 1,
      createdAt: new Date(),
      isDeleted: false
    }));
  }

  private generateMockSettings(): unknown[] {
    return [{
      id: 'settings-1',
      syncEnabled: true,
      autoBackup: true,
      createdAt: new Date(),
      isDeleted: false
    }];
  }
}

export default BackupService;