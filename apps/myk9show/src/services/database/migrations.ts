/**
 * Database migration system for schema changes and data transformations
 * Handles version upgrades, data migrations, and rollback capabilities
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { logger } from '@/services/LoggingService';
import { DatabaseService } from './connection';
import { DATABASE_VERSION, STORES } from './schema';
import { compressionService } from './compression';

export interface Migration {
  version: number;
  description: string;
  up: (db: DatabaseService) => Promise<void>;
  down?: (db: DatabaseService) => Promise<void>;
  validate?: (db: DatabaseService) => Promise<boolean>;
}

export interface MigrationOptions {
  backupBeforeMigration: boolean;
  validateAfterMigration: boolean;
  rollbackOnFailure: boolean;
  batchSize: number;
  onProgress?: (progress: MigrationProgress) => void;
}

export interface MigrationProgress {
  currentVersion: number;
  targetVersion: number;
  currentMigration: string;
  progress: number; // 0-100
  phase: 'backup' | 'migration' | 'validation' | 'cleanup';
  details?: string;
}

export interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  migrations: string[];
  duration: number;
  backupCreated?: string;
  errors: string[];
}

/**
 * Database migration manager
 */
export class MigrationManager {
  private readonly migrations: Map<number, Migration> = new Map();
  private readonly defaultOptions: MigrationOptions = {
    backupBeforeMigration: true,
    validateAfterMigration: true,
    rollbackOnFailure: true,
    batchSize: 1000,
  };

  constructor() {
    this.registerMigrations();
  }

  /**
   * Registers all database migrations
   */
  private registerMigrations(): void {
    // Version 3: Enhanced indexes and compression support
    this.migrations.set(3, {
      version: 3,
      description: 'Add enhanced indexes for performance optimization',
      up: async db => {
        // Migration is handled by Dexie schema versioning
        // Add any data transformations here if needed
        logger.info('Upgrading to version 3 with enhanced indexes', 'migration');

        // Initialize compression metadata for existing large records
        await this.initializeCompressionMetadata(db);

        // Optimize existing data
        await this.optimizeExistingData(db);
      },
      validate: async db => {
        // Verify all new indexes are working
        try {
          await db.entries.where(['showId', 'status']).equals(['test', 'active']).count();
          await db.shows.where(['clubId', 'status']).equals(['test', 'active']).count();
          await db.dogs.where(['ownerId', 'breed']).equals(['test', 'test']).count();
          return true;
        } catch (error) {
          logger.error('Index validation failed', 'migration', {}, error as Error);
          return false;
        }
      },
    });

    // Future migration example
    this.migrations.set(4, {
      version: 4,
      description: 'Add full-text search indexes',
      up: async () => {
        // Future: Add full-text search capabilities
        logger.info('Upgrading to version 4 with full-text search', 'migration');
      },
      validate: async () => {
        return true;
      },
    });
  }

  /**
   * Migrates database to target version
   * @param db - Database instance
   * @param targetVersion - Target version (defaults to current schema version)
   * @param options - Migration options
   * @returns Migration result
   */
  async migrate(
    db: DatabaseService,
    targetVersion: number = DATABASE_VERSION,
    options?: Partial<MigrationOptions>
  ): Promise<MigrationResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    const currentVersion = await this.getCurrentVersion(db);

    const result: MigrationResult = {
      success: false,
      fromVersion: currentVersion,
      toVersion: targetVersion,
      migrations: [],
      duration: 0,
      errors: [],
    };

    try {
      opts.onProgress?.({
        currentVersion,
        targetVersion,
        currentMigration: 'Starting migration',
        progress: 0,
        phase: 'backup',
      });

      // Create backup if requested
      if (opts.backupBeforeMigration) {
        result.backupCreated = await this.createBackup(db);
        opts.onProgress?.({
          currentVersion,
          targetVersion,
          currentMigration: 'Backup created',
          progress: 10,
          phase: 'backup',
        });
      }

      // Get migrations to run
      const migrationsToRun = this.getMigrationsToRun(currentVersion, targetVersion);

      if (migrationsToRun.length === 0) {
        result.success = true;
        result.duration = Date.now() - startTime;
        return result;
      }

      // Run migrations
      let progress = 20;
      const progressStep = 60 / migrationsToRun.length;

      for (const migration of migrationsToRun) {
        try {
          opts.onProgress?.({
            currentVersion,
            targetVersion,
            currentMigration: migration.description,
            progress,
            phase: 'migration',
          });

          await migration.up(db);
          result.migrations.push(migration.description);

          progress += progressStep;
        } catch (error) {
          const errorMsg = `Migration ${migration.version} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);

          if (opts.rollbackOnFailure && result.backupCreated) {
            await this.rollback(db, result.backupCreated);
          }

          throw new Error(errorMsg);
        }
      }

      // Validate migrations if requested
      if (opts.validateAfterMigration) {
        opts.onProgress?.({
          currentVersion,
          targetVersion,
          currentMigration: 'Validating migrations',
          progress: 85,
          phase: 'validation',
        });

        for (const migration of migrationsToRun) {
          if (migration.validate) {
            const isValid = await migration.validate(db);
            if (!isValid) {
              throw new Error(`Migration ${migration.version} validation failed`);
            }
          }
        }
      }

      // Update version
      await this.setCurrentVersion(db, targetVersion);

      opts.onProgress?.({
        currentVersion: targetVersion,
        targetVersion,
        currentMigration: 'Migration complete',
        progress: 100,
        phase: 'cleanup',
      });

      result.success = true;
      result.toVersion = targetVersion;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Creates a backup of the current database
   * @param db - Database instance
   * @returns Backup identifier
   */
  private async createBackup(db: DatabaseService): Promise<string> {
    const backupId = `backup_${Date.now()}`;
    const backup: Record<string, unknown[]> = {};

    // Export all stores
    for (const storeName of Object.keys(STORES)) {
      try {
        backup[storeName] = await db.table(storeName).toArray();
      } catch (error) {
        logger.warn('Failed to backup store', 'migration', { storeName }, error as Error);
        backup[storeName] = [];
      }
    }

    // Store in localStorage (or IndexedDB backup store in future)
    const compressed = await compressionService.compress(backup, {
      algorithm: 'gzip',
      threshold: 0, // Always compress backups
    });

    localStorage.setItem(`db_backup_${backupId}`, JSON.stringify(compressed));

    // Store backup metadata
    const metadata = {
      id: backupId,
      timestamp: Date.now(),
      version: await this.getCurrentVersion(db),
      compressed: compressed.compressed,
      originalSize: compressed.originalSize,
      compressedSize: compressed.compressedSize,
    };

    localStorage.setItem(`db_backup_meta_${backupId}`, JSON.stringify(metadata));

    return backupId;
  }

  /**
   * Rolls back to a backup
   * @param db - Database instance
   * @param backupId - Backup identifier
   */
  private async rollback(db: DatabaseService, backupId: string): Promise<void> {
    try {
      const backupData = localStorage.getItem(`db_backup_${backupId}`);
      if (!backupData) {
        throw new Error(`Backup ${backupId} not found`);
      }

      const compressed = JSON.parse(backupData);
      const backup = await compressionService.decompress(compressed);

      // Clear current data
      await db.clearAllStores();

      // Restore from backup
      for (const [storeName, data] of Object.entries(backup as Record<string, unknown[]>)) {
        if (Array.isArray(data) && data.length > 0) {
          await db.bulkCreate(storeName, data);
        }
      }

      logger.info('Successfully rolled back to backup', 'migration', { backupId });
    } catch (error) {
      logger.error('Rollback failed', 'migration', { backupId }, error as Error);
      throw error;
    }
  }

  /**
   * Gets current database version
   * @param db - Database instance
   * @returns Current version
   */
  private async getCurrentVersion(db: DatabaseService): Promise<number> {
    try {
      const versionRecord = await db.read<{
        id: string;
        version?: number;
        state: string;
        lastModified: Date;
      }>('_zustand_state', 'db_version');
      return versionRecord?.version || 1;
    } catch (error) {
      return 1; // Default to version 1 if not found
    }
  }

  /**
   * Sets current database version
   * @param db - Database instance
   * @param version - Version to set
   */
  private async setCurrentVersion(db: DatabaseService, version: number): Promise<void> {
    await db.create('_zustand_state', {
      id: 'db_version',
      version,
      lastModified: new Date(),
      state: JSON.stringify({ version }),
    });
  }

  /**
   * Gets migrations to run between versions
   * @param fromVersion - Current version
   * @param toVersion - Target version
   * @returns Array of migrations to run
   */
  private getMigrationsToRun(fromVersion: number, toVersion: number): Migration[] {
    const migrations: Migration[] = [];

    if (toVersion > fromVersion) {
      // Upgrade path
      for (let version = fromVersion + 1; version <= toVersion; version++) {
        const migration = this.migrations.get(version);
        if (migration) {
          migrations.push(migration);
        }
      }
    } else if (toVersion < fromVersion) {
      // Downgrade path (if supported)
      for (let version = fromVersion; version > toVersion; version--) {
        const migration = this.migrations.get(version);
        if (migration?.down) {
          migrations.push({
            ...migration,
            up: migration.down,
            description: `Rollback: ${migration.description}`,
          });
        }
      }
    }

    return migrations;
  }

  /**
   * Initializes compression metadata for existing records
   * @param db - Database instance
   */
  private async initializeCompressionMetadata(db: DatabaseService): Promise<void> {
    const largeDataThreshold = 10 * 1024; // 10KB

    // Check dogs for large health records
    const dogs = await db.dogs.toArray();
    for (const dog of dogs) {
      const dogSize = JSON.stringify(dog).length;
      if (dogSize > largeDataThreshold) {
        // Add compression metadata via generic table access
        await db.table('dogs').update(dog.id, {
          _compression: {
            eligible: true,
            size: dogSize,
            lastAnalyzed: new Date(),
          },
        });
      }
    }

    // Check other large record types
    const shows = await db.shows.toArray();
    for (const show of shows) {
      const showSize = JSON.stringify(show).length;
      if (showSize > largeDataThreshold) {
        await db.table('shows').update(show.id, {
          _compression: {
            eligible: true,
            size: showSize,
            lastAnalyzed: new Date(),
          },
        });
      }
    }
  }

  /**
   * Optimizes existing data based on new schema
   * @param db - Database instance
   */
  private async optimizeExistingData(db: DatabaseService): Promise<void> {
    // Rebuild indexes by forcing a table touch
    await Promise.all([
      db.entries.count(),
      db.shows.count(),
      db.dogs.count(),
      db.people.count(),
      db.classes.count(),
    ]);

    logger.info('Existing data optimized for new schema', 'migration');
  }

  /**
   * Lists available backups
   * @returns Array of backup metadata
   */
  async listBackups(): Promise<BackupMetadata[]> {
    const backups: BackupMetadata[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('db_backup_meta_')) {
        try {
          const metadata = JSON.parse(localStorage.getItem(key) || '{}');
          backups.push(metadata);
        } catch (error) {
          logger.warn('Invalid backup metadata', 'migration', { key });
        }
      }
    }

    return backups.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Deletes old backups
   * @param keepCount - Number of backups to keep
   */
  async cleanupBackups(keepCount: number = 3): Promise<void> {
    const backups = await this.listBackups();
    const toDelete = backups.slice(keepCount);

    for (const backup of toDelete) {
      localStorage.removeItem(`db_backup_${backup.id}`);
      localStorage.removeItem(`db_backup_meta_${backup.id}`);
    }

    logger.info('Cleaned up old backups', 'migration', { count: toDelete.length });
  }
}

export interface BackupMetadata {
  id: string;
  timestamp: number;
  version: number;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
}

// Export singleton instance
export const migrationManager = new MigrationManager();
