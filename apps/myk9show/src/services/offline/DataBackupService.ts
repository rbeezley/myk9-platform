import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export interface BackupOptions {
  includeMetadata: boolean;
  compressData: boolean;
  includeUserPreferences: boolean;
  includeCache: boolean;
  filename?: string;
  password?: string;
}

export interface BackupMetadata {
  version: string;
  timestamp: Date;
  appVersion: string;
  dataTypes: string[];
  itemCounts: Record<string, number>;
  checksum: string;
}

export interface BackupResult {
  success: boolean;
  filename: string;
  fileSize: number;
  itemCount: number;
  timestamp: Date;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  itemsRestored: number;
  warnings: string[];
  errors: string[];
}

export interface BackupData {
  metadata: BackupMetadata;
  state?: Record<string, unknown>;
  cache?: Record<string, unknown>;
  [key: string]: unknown;
}

class DataBackupService {
  private readonly BACKUP_VERSION = '1.0.0';
  private readonly APP_VERSION = '1.0.0'; // Should come from package.json

  /**
   * Create a full backup of all application data
   */
  async createBackup(options: BackupOptions): Promise<BackupResult> {
    try {
      const timestamp = new Date();
      const backupData = await this.gatherBackupData(options);
      
      // Create ZIP archive if compression is enabled
      if (options.compressData) {
        return await this.createCompressedBackup(backupData, options, timestamp);
      } else {
        return await this.createSimpleBackup(backupData, options, timestamp);
      }
    } catch (error) {
      return {
        success: false,
        filename: '',
        fileSize: 0,
        itemCount: 0,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Restore data from a backup file
   */
  async restoreFromBackup(
    file: File,
    options: { 
      mergeWithExisting: boolean;
      password?: string;
      selectiveRestore?: string[];
    }
  ): Promise<RestoreResult> {
    const result: RestoreResult = {
      success: false,
      itemsRestored: 0,
      warnings: [],
      errors: []
    };

    try {
      let backupData: BackupData;

      // Check if it's a ZIP file (compressed backup)
      if (file.name.endsWith('.zip')) {
        backupData = await this.extractCompressedBackup(file);
      } else {
        // Simple JSON backup
        const text = await file.text();
        backupData = JSON.parse(text);
      }

      // Validate backup
      const validation = this.validateBackup(backupData);
      if (!validation.isValid) {
        result.errors.push(...validation.errors);
        return result;
      }

      // Add version compatibility warnings
      if (validation.warnings.length > 0) {
        result.warnings.push(...validation.warnings);
      }

      // Restore data
      const restored = await this.restoreData(backupData, options);
      result.itemsRestored = restored.itemCount;
      result.warnings.push(...restored.warnings);
      result.errors.push(...restored.errors);
      result.success = restored.errors.length === 0;

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Get information about a backup file without restoring it
   */
  async getBackupInfo(file: File): Promise<{
    metadata: BackupMetadata;
    isValid: boolean;
    errors: string[];
  }> {
    try {
      let backupData: BackupData;

      if (file.name.endsWith('.zip')) {
        backupData = await this.extractCompressedBackup(file);
      } else {
        const text = await file.text();
        backupData = JSON.parse(text);
      }

      const validation = this.validateBackup(backupData);
      
      return {
        metadata: backupData.metadata,
        isValid: validation.isValid,
        errors: validation.errors
      };
    } catch (error) {
      return {
        metadata: {} as BackupMetadata,
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Clean up old data to free storage space
   */
  async cleanupOldData(options: {
    removeOldShows?: boolean;
    oldShowsThresholdDays?: number;
    removeCache?: boolean;
    removeCompletedEntries?: boolean;
  }): Promise<{
    itemsRemoved: number;
    spaceFreed: number; // bytes
    summary: string[];
  }> {
    const summary: string[] = [];
    let itemsRemoved = 0;
    let spaceFreed = 0;

    // Clean up old shows
    if (options.removeOldShows) {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - (options.oldShowsThresholdDays || 365));
      
      const showsData = localStorage.getItem('show-store');
      if (showsData) {
        const parsed = JSON.parse(showsData);
        const originalCount = parsed.state.shows.length;
        const originalSize = showsData.length;
        
        parsed.state.shows = parsed.state.shows.filter((show: Record<string, unknown>) => {
          const dateField = show.date || show.startDate;
          if (!dateField || typeof dateField !== 'string') {
            return false;
          }
          return new Date(dateField) > threshold;
        });
        
        const removedShows = originalCount - parsed.state.shows.length;
        if (removedShows > 0) {
          localStorage.setItem('show-store', JSON.stringify(parsed));
          const newSize = JSON.stringify(parsed).length;
          
          itemsRemoved += removedShows;
          spaceFreed += originalSize - newSize;
          summary.push(`Removed ${removedShows} old shows`);
        }
      }
    }

    // Clean up cache
    if (options.removeCache) {
      const cacheKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('cache-') || key.startsWith('query-')
      );
      
      let cacheSize = 0;
      cacheKeys.forEach(key => {
        cacheSize += localStorage.getItem(key)?.length || 0;
        localStorage.removeItem(key);
      });
      
      if (cacheKeys.length > 0) {
        itemsRemoved += cacheKeys.length;
        spaceFreed += cacheSize * 2; // UTF-16 approximation
        summary.push(`Cleared ${cacheKeys.length} cache entries`);
      }
    }

    return {
      itemsRemoved,
      spaceFreed,
      summary
    };
  }

  private async gatherBackupData(options: BackupOptions): Promise<BackupData> {
    const backupData: BackupData = {
      metadata: {
        version: this.BACKUP_VERSION,
        timestamp: new Date(),
        appVersion: this.APP_VERSION,
        dataTypes: [],
        itemCounts: {},
        checksum: ''
      }
    };

    // Gather data from localStorage
    const storeKeys = ['dog-store', 'people-store', 'show-store', 'club-store'];
    
    for (const key of storeKeys) {
      const data = localStorage.getItem(key);
      if (data) {
        backupData[key] = JSON.parse(data);
        const entityType = key.replace('-store', '');
        backupData.metadata.dataTypes.push(entityType);
        const storeData = backupData[key] as Record<string, unknown>;
        const state = storeData.state as Record<string, unknown>;
        const entityArray = state?.[entityType + 's'];
        backupData.metadata.itemCounts[entityType] = 
          Array.isArray(entityArray) ? entityArray.length : 0;
      }
    }

    // Include user preferences if requested
    if (options.includeUserPreferences) {
      const preferences = localStorage.getItem('user-preferences');
      if (preferences) {
        backupData['user-preferences'] = JSON.parse(preferences);
        backupData.metadata.dataTypes.push('preferences');
      }
    }

    // Include cache if requested
    if (options.includeCache) {
      const cacheKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('cache-') || key.startsWith('query-')
      );
      
      if (cacheKeys.length > 0) {
        backupData.cache = {};
        cacheKeys.forEach(key => {
          const data = localStorage.getItem(key);
          if (data) {
            try {
              backupData.cache![key] = JSON.parse(data);
            } catch {
              backupData.cache![key] = data;
            }
          }
        });
        backupData.metadata.dataTypes.push('cache');
        backupData.metadata.itemCounts.cache = cacheKeys.length;
      }
    }

    // Generate checksum
    backupData.metadata.checksum = this.generateChecksum(JSON.stringify(backupData));

    return backupData;
  }

  private async createSimpleBackup(
    backupData: BackupData, 
    options: BackupOptions, 
    timestamp: Date
  ): Promise<BackupResult> {
    const filename = options.filename || 
      `myK9Show-backup-${timestamp.toISOString().split('T')[0]}.json`;
    
    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    saveAs(blob, filename);

    return {
      success: true,
      filename,
      fileSize: blob.size,
      itemCount: Object.values(backupData.metadata.itemCounts)
        .reduce((sum: number, count: number) => sum + count, 0),
      timestamp
    };
  }

  private async createCompressedBackup(
    backupData: BackupData,
    options: BackupOptions,
    timestamp: Date
  ): Promise<BackupResult> {
    const zip = new JSZip();
    
    // Add main backup data
    zip.file('backup.json', JSON.stringify(backupData, null, 2));
    
    // Add metadata file
    zip.file('metadata.json', JSON.stringify(backupData.metadata, null, 2));
    
    // Add readme
    const readme = this.generateReadme(backupData.metadata);
    zip.file('README.txt', readme);

    // Note: Password protection would require additional setup with JSZip-utils
    // For now, we'll generate without password protection

    const zipBlob = await zip.generateAsync({ type: 'blob' }) as Blob;
    
    const filename = options.filename || 
      `myK9Show-backup-${timestamp.toISOString().split('T')[0]}.zip`;
    
    saveAs(zipBlob, filename);

    return {
      success: true,
      filename,
      fileSize: zipBlob.size,
      itemCount: Object.values(backupData.metadata.itemCounts)
        .reduce((sum: number, count: number) => sum + count, 0),
      timestamp
    };
  }

  private async extractCompressedBackup(file: File): Promise<BackupData> {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(file);
    
    const backupFile = zipContent.file('backup.json');
    if (!backupFile) {
      throw new Error('Invalid backup file: missing backup.json');
    }
    
    const backupText = await backupFile.async('text');
    return JSON.parse(backupText);
  }

  private validateBackup(backupData: BackupData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for required fields
    if (!backupData.metadata) {
      errors.push('Missing backup metadata');
    } else {
      if (!backupData.metadata.version) {
        errors.push('Missing backup version');
      }
      if (!backupData.metadata.timestamp) {
        errors.push('Missing backup timestamp');
      }
    }

    // Version compatibility check
    if (backupData.metadata?.version !== this.BACKUP_VERSION) {
      warnings.push(
        `Backup version ${backupData.metadata?.version} may not be fully compatible with current version ${this.BACKUP_VERSION}`
      );
    }

    // Data integrity check
    if (backupData.metadata?.checksum) {
      const currentChecksum = this.generateChecksum(
        JSON.stringify({ ...backupData, metadata: { ...backupData.metadata, checksum: '' } })
      );
      if (currentChecksum !== backupData.metadata.checksum) {
        warnings.push('Backup checksum mismatch - data may be corrupted');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async restoreData(
    backupData: BackupData,
    options: { mergeWithExisting: boolean; selectiveRestore?: string[] }
  ): Promise<{
    itemCount: number;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];
    let itemCount = 0;

    const storeKeys = ['dog-store', 'people-store', 'show-store', 'club-store'];
    
    for (const key of storeKeys) {
      if (backupData[key]) {
        // Check if selective restore is requested
        const entityType = key.replace('-store', '');
        if (options.selectiveRestore && !options.selectiveRestore.includes(entityType)) {
          continue;
        }

        try {
          if (options.mergeWithExisting) {
            // Merge with existing data
            const existing = localStorage.getItem(key);
            if (existing) {
              const existingData = JSON.parse(existing);
              const backupStoreData = backupData[key];
              
              // Simple merge - could be enhanced with conflict resolution
              const backupState = (backupStoreData as Record<string, unknown>).state;
              const existingState = (existingData as Record<string, unknown>).state;
              
              if (existingState && backupState) {
                const entityKey = entityType + 's';
                const existingArray = (existingState as Record<string, unknown>)[entityKey];
                const backupArray = (backupState as Record<string, unknown>)[entityKey];
                
                if (Array.isArray(existingArray) && Array.isArray(backupArray)) {
                  // Merge arrays, avoiding duplicates by ID
                  const existingIds = new Set(existingArray.map((item: { id: string }) => item.id));
                  const newItems = backupArray.filter(
                    (item: { id: string }) => !existingIds.has(item.id)
                  );
                  existingArray.push(...newItems);
                  itemCount += newItems.length;
                }
              }
              localStorage.setItem(key, JSON.stringify(existingData));
            } else {
              localStorage.setItem(key, JSON.stringify(backupData[key]));
              itemCount += backupData.metadata.itemCounts[entityType] || 0;
            }
          } else {
            // Replace existing data
            localStorage.setItem(key, JSON.stringify(backupData[key]));
            itemCount += backupData.metadata.itemCounts[entityType] || 0;
          }
        } catch (error) {
          errors.push(`Failed to restore ${entityType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Restore user preferences if present
    if (backupData['user-preferences']) {
      try {
        localStorage.setItem('user-preferences', JSON.stringify(backupData['user-preferences']));
        itemCount += 1;
      } catch (error) {
        errors.push(`Failed to restore preferences: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Restore cache if present (optional)
    if (backupData.cache) {
      try {
        Object.entries(backupData.cache).forEach(([key, value]) => {
          localStorage.setItem(key, JSON.stringify(value));
        });
        itemCount += Object.keys(backupData.cache).length;
      } catch (error) {
        warnings.push(`Failed to restore some cache data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { itemCount, warnings, errors };
  }

  private generateChecksum(data: string): string {
    // Simple hash function - in production, use a proper hash like SHA-256
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private generateReadme(metadata: BackupMetadata): string {
    return `MyK9Show Data Backup
=====================

Backup Information:
- Created: ${metadata.timestamp}
- App Version: ${metadata.appVersion}
- Backup Version: ${metadata.version}
- Data Types: ${metadata.dataTypes.join(', ')}

Item Counts:
${Object.entries(metadata.itemCounts)
  .map(([type, count]) => `- ${type}: ${count}`)
  .join('\n')}

To restore this backup:
1. Open MyK9Show application
2. Go to Settings > Data Management
3. Choose "Restore from Backup"
4. Select this backup file
5. Choose restore options (merge or replace)

Note: This backup contains all your show data, dog profiles, and application settings. Keep it in a safe place.
`;
  }
}

export const dataBackupService = new DataBackupService();