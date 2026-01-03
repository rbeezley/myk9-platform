// Storage migration utilities for localStorage to IndexedDB
import { createDatabase } from './connection';
import type { MigrationOptions, MigrationProgress, MigrationResult, MigrationError, DatabaseAPI } from './types';

export class StorageMigration {
  private static instance: StorageMigration;
  private db: DatabaseAPI;
  
  constructor(database?: DatabaseAPI) {
    this.db = database || createDatabase();
  }
  
  static getInstance(database?: DatabaseAPI): StorageMigration {
    if (!StorageMigration.instance) {
      StorageMigration.instance = new StorageMigration(database);
    }
    return StorageMigration.instance;
  }
  
  async migrateStore<T>(options: MigrationOptions<T>): Promise<MigrationResult> {
    const startTime = Date.now();
    const errors: MigrationError[] = [];
    
    try {
      console.log(`Starting migration for ${options.localStorageKey} -> ${options.targetStore}`);
      
      // Check if migration already completed
      const migrationStatus = localStorage.getItem(`migration-${options.targetStore}-completed`);
      if (migrationStatus === 'true') {
        console.log(`Migration for ${options.targetStore} already completed`);
        return {
          success: true,
          duration: 0,
          recordCount: 0,
          errors: []
        };
      }
      
      // 1. Create backup
      await this.createBackup(options.localStorageKey);
      
      // 2. Export from localStorage
      const rawData = this.exportFromLocalStorage(options.localStorageKey);
      if (!rawData) {
        console.log(`No data found in localStorage for ${options.localStorageKey}`);
        await this.markComplete(options.targetStore);
        return {
          success: true,
          duration: Date.now() - startTime,
          recordCount: 0,
          errors: []
        };
      }
      
      // 3. Validate and transform data
      options.onProgress?.({
        total: 1,
        processed: 0,
        errors: 0,
        phase: 'validating'
      });
      
      const validatedData = await this.validateAndTransform(
        rawData,
        options.schema,
        options.transformer
      );
      
      // 4. Import to IndexedDB in batches
      options.onProgress?.({
        total: validatedData.length,
        processed: 0,
        errors: 0,
        phase: 'importing'
      });
      
      await this.importToIndexedDB(
        validatedData,
        options.targetStore,
        options.batchSize || 100,
        options.onProgress
      );
      
      // 5. Verify integrity
      options.onProgress?.({
        total: validatedData.length,
        processed: validatedData.length,
        errors: errors.length,
        phase: 'verifying'
      });
      
      const verified = await this.verifyMigration(
        options.localStorageKey,
        options.targetStore
      );
      
      // 6. Mark migration complete
      await this.markComplete(options.targetStore);
      
      console.log(`Migration completed for ${options.targetStore}: ${validatedData.length} records`);
      
      return {
        success: verified,
        duration: Date.now() - startTime,
        recordCount: validatedData.length,
        errors
      };
    } catch (error) {
      console.error(`Migration failed for ${options.targetStore}:`, error);
      await this.rollback(options.localStorageKey);
      throw error;
    }
  }
  
  private async createBackup(key: string): Promise<void> {
    const data = localStorage.getItem(key);
    if (data) {
      const backupKey = `${key}-backup-${Date.now()}`;
      localStorage.setItem(backupKey, data);
      console.log(`Backup created: ${backupKey}`);
    }
  }
  
  private exportFromLocalStorage(key: string): unknown {
    const data = localStorage.getItem(key);
    if (!data) return null;
    
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error(`Failed to parse localStorage data for ${key}:`, error);
      return null;
    }
  }
  
  private async validateAndTransform<T>(
    rawData: unknown,
    schema?: unknown,
    transformer?: (data: unknown) => T
  ): Promise<T[]> {
    let data = rawData;
    
    // Handle different localStorage formats
    if (rawData && typeof rawData === 'object' && 'state' in rawData) {
      // Zustand persist format
      data = (rawData as Record<string, unknown>).state;
    }
    
    // Extract array data
    let records: unknown[] = [];
    if (Array.isArray(data)) {
      records = data;
    } else if (data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>;
      if (dataObj.dogs && Array.isArray(dataObj.dogs)) {
        records = dataObj.dogs;
      } else if (dataObj.people && Array.isArray(dataObj.people)) {
        records = dataObj.people;
      } else if (dataObj.shows && Array.isArray(dataObj.shows)) {
        records = dataObj.shows;
      } else if (dataObj.clubs && Array.isArray(dataObj.clubs)) {
        records = dataObj.clubs;
      } else if (dataObj.entries && Array.isArray(dataObj.entries)) {
        records = dataObj.entries;
      } else if (dataObj.registrations && Array.isArray(dataObj.registrations)) {
        records = dataObj.registrations;
      } else if (dataObj.trials && Array.isArray(dataObj.trials)) {
        records = dataObj.trials;
      } else if (dataObj.classes && Array.isArray(dataObj.classes)) {
        records = dataObj.classes;
      } else if (dataObj.competitions && Array.isArray(dataObj.competitions)) {
        records = dataObj.competitions;
      } else if (dataObj.achievements && Array.isArray(dataObj.achievements)) {
        records = dataObj.achievements;
      } else if (dataObj.results && Array.isArray(dataObj.results)) {
        records = dataObj.results;
      } else if (dataObj.templates && Array.isArray(dataObj.templates)) {
        records = dataObj.templates;
      } else if (dataObj.classTemplates && Array.isArray(dataObj.classTemplates)) {
        records = dataObj.classTemplates;
      } else if (dataObj.showTemplates && Array.isArray(dataObj.showTemplates)) {
        records = dataObj.showTemplates;
      } else if (dataObj.armbands && Array.isArray(dataObj.armbands)) {
        records = dataObj.armbands;
      } else {
        // Assume the data itself is the records
        records = [data];
      }
    } else {
      records = [data];
    }
    
    // Transform data if transformer provided
    if (transformer) {
      records = records.map(transformer);
    }
    
    // Ensure each record has an ID
    records = records.map((record, index) => {
      const typedRecord = record as Record<string, unknown>;
      if (!typedRecord.id) {
        typedRecord.id = `migrated-${Date.now()}-${index}`;
      }
      return typedRecord;
    });
    
    return records as T[];
  }
  
  private async importToIndexedDB<T>(
    data: T[],
    storeName: string,
    batchSize: number,
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<void> {
    const total = data.length;
    let processed = 0;
    
    // Process in batches to avoid overwhelming IndexedDB
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      try {
        await this.db.bulkCreate(storeName, batch);
        processed += batch.length;
        
        onProgress?.({
          total,
          processed,
          errors: 0,
          phase: 'importing'
        });
      } catch (error) {
        console.error(`Failed to import batch starting at index ${i}:`, error);
        
        // Try individual inserts for failed batch
        for (const item of batch) {
          try {
            await this.db.create(storeName, item as Record<string, unknown> & { id: string });
            processed++;
          } catch (itemError) {
            console.error(`Failed to import individual item:`, itemError, item);
          }
        }
        
        onProgress?.({
          total,
          processed,
          errors: 1,
          phase: 'importing'
        });
      }
    }
  }
  
  private async verifyMigration(localStorageKey: string, storeName: string): Promise<boolean> {
    try {
      const localData = this.exportFromLocalStorage(localStorageKey);
      if (!localData) return true; // No data to verify
      
      const indexedDBCount = await this.db.count(storeName);
      
      // Extract count from localStorage data
      let expectedCount = 0;
      if (Array.isArray(localData)) {
        expectedCount = localData.length;
      } else if (localData && typeof localData === 'object' && 'state' in localData) {
        const stateData = (localData as Record<string, unknown>).state;
        if (Array.isArray(stateData)) {
          expectedCount = stateData.length;
        } else {
          // Count records in nested objects
          if (stateData && typeof stateData === 'object') {
            for (const key of Object.keys(stateData as object)) {
              const value = (stateData as Record<string, unknown>)[key];
              if (Array.isArray(value)) {
                expectedCount = value.length;
                break;
              }
            }
          }
        }
      }
      
      const isValid = indexedDBCount >= expectedCount;
      console.log(`Migration verification for ${storeName}: ${indexedDBCount}/${expectedCount} records`);
      
      return isValid;
    } catch (error) {
      console.error(`Verification failed for ${storeName}:`, error);
      return false;
    }
  }
  
  private async markComplete(storeName: string): Promise<void> {
    localStorage.setItem(`migration-${storeName}-completed`, 'true');
    localStorage.setItem(`migration-${storeName}-date`, new Date().toISOString());
  }
  
  private async rollback(localStorageKey: string): Promise<void> {
    console.log(`Rolling back migration for ${localStorageKey}`);
    // Find the most recent backup
    const backupKeys = Object.keys(localStorage)
      .filter(key => key.startsWith(`${localStorageKey}-backup-`))
      .sort()
      .reverse();
    
    if (backupKeys.length > 0) {
      const latestBackup = localStorage.getItem(backupKeys[0]);
      if (latestBackup) {
        localStorage.setItem(localStorageKey, latestBackup);
        console.log(`Restored from backup: ${backupKeys[0]}`);
      }
    }
  }
  
  // Utility methods
  async getMigrationStatus(storeName: string): Promise<{
    completed: boolean;
    date?: string;
  }> {
    const completed = localStorage.getItem(`migration-${storeName}-completed`) === 'true';
    const date = localStorage.getItem(`migration-${storeName}-date`) || undefined;
    
    return { completed, date };
  }
  
  async resetMigration(storeName: string): Promise<void> {
    localStorage.removeItem(`migration-${storeName}-completed`);
    localStorage.removeItem(`migration-${storeName}-date`);
    await this.db.clearStore(storeName);
  }
  
  async listBackups(localStorageKey: string): Promise<string[]> {
    return Object.keys(localStorage)
      .filter(key => key.startsWith(`${localStorageKey}-backup-`))
      .sort()
      .reverse();
  }
  
  async cleanupBackups(localStorageKey: string, keepCount: number = 3): Promise<void> {
    const backups = await this.listBackups(localStorageKey);
    const toDelete = backups.slice(keepCount);
    
    toDelete.forEach(key => {
      localStorage.removeItem(key);
    });
    
    console.log(`Cleaned up ${toDelete.length} old backups for ${localStorageKey}`);
  }
}

// Export factory function for creating migration service
export const createMigrationService = (database?: DatabaseAPI) => 
  StorageMigration.getInstance(database);