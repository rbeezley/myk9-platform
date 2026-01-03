/**
 * ReplicatedClassesTable - Offline-first class data replication
 *
 * Manages class definitions (Novice A, Masters B, etc.) with offline support.
 *
 * Conflict Resolution:
 * - Server-authoritative: All class configuration comes from server
 * - Use case: Judges/stewards modify class status, no client conflicts
 *
 * **Phase 3 Day 12** - Core table migration
 */

import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';
import type { SyncOptions } from '../SyncEngine';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

export interface Class {
  id: string;  // bigserial returned as string by Supabase
  trial_id: number;  // bigint returned as number by Supabase (within safe integer range)
  element: string;
  level: string;
  section?: string;
  judge_name?: string;
  class_status?: string;
  briefing_time?: string;
  break_until?: string;
  start_time?: string;
  class_order?: number;
  self_checkin_enabled?: boolean;
  realtime_results_enabled?: boolean;
  is_scoring_finalized?: boolean;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  area_count?: number;
  actual_start_time?: string;
  actual_end_time?: string;
  planned_start_time?: string;
  results_released_at?: string;
  last_result_at?: string;  // Timestamp of last synced result (for stale data detection)
  license_key: string;
  created_at?: string;
  updated_at?: string;
}

export class ReplicatedClassesTable extends ReplicatedTable<Class> {
  constructor() {
    super('classes'); // TTL managed by feature flags
  }

  /**
   * Sync classes from Supabase
   *
   * OPTIMIZED: Uses batch operations to minimize IndexedDB transactions
   * Previously: 2 transactions per class (N classes = 2N transactions)
   * Now: 1 batch transaction for all classes (N classes = 1 transaction)
   */
  async sync(licenseKey: string, options?: Partial<SyncOptions>): Promise<SyncResult> {
    const startTime = Date.now();
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      // Get last sync timestamp (single read transaction)
      const metadata = await this.getSyncMetadata();

      // Check if cache is empty FOR THIS SHOW - if so, force full sync from epoch
      // CRITICAL: Pass licenseKey to filter by current show (multi-tenant isolation)
      // Without this, cache from other shows would cause incremental sync to miss data
      const allCachedClasses = await this.getAll(licenseKey);
      const isCacheEmpty = allCachedClasses.length === 0;

      // If cache is empty but we have a lastSync timestamp, it means the cache was cleared
      // Reset to epoch (0) to fetch all data
      const lastSync = options?.forceFullSync || isCacheEmpty ? 0 : (metadata?.lastIncrementalSyncAt || 0);

      logger.log(
        `[${this.tableName}] Starting ${options?.forceFullSync ? 'FULL' : isCacheEmpty ? 'FULL (empty cache)' : 'incremental'} sync (since ${new Date(lastSync).toISOString()}), cache: ${allCachedClasses.length} classes`
      );

      // Fetch classes updated since last sync (or all classes if full sync)
      // Join through: classes → trials → shows.license_key
      let query = supabase
        .from('classes')
        .select(`
          *,
          trials!inner(
            show_id,
            shows!inner(
              license_key
            )
          )
        `)
        .eq('trials.shows.license_key', licenseKey);

      // Always apply updated_at filter (use epoch for full sync)
      // This ensures we fetch all records when cache is empty (lastSync = 0)
      query = query.gt('updated_at', new Date(lastSync).toISOString());

      const { data: rawClasses, error } = await query.order('updated_at', { ascending: true });

      // Flatten the response and extract license_key from nested trials.shows
      const remoteClasses = rawClasses?.map((rawClass) => {
        // Extract license_key from nested structure
        const extractedLicenseKey = (rawClass.trials as { shows?: { license_key?: string } })?.shows?.license_key;

        // Remove nested trials object and add license_key at top level
        const { trials: _trials, ...classData } = rawClass;
        return {
          ...classData,
          license_key: extractedLicenseKey || licenseKey, // Fall back to provided licenseKey
        };
      }) || [];

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteClasses || remoteClasses.length === 0) {
        logger.log(`[${this.tableName}] No updates found`);

        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
          errorMessage: undefined,
        });

        return {
          tableName: this.tableName,
          success: true,
          operation: 'incremental-sync',
          rowsAffected: 0,
          conflictsResolved: 0,
          duration: Date.now() - startTime,
        };
      }

      // OPTIMIZED: Build map of local classes for conflict resolution (already fetched above)
      const localClassesMap = new Map<string, Class>();
      for (const cls of allCachedClasses) {
        localClassesMap.set(String(cls.id), cls);
      }

      // Process all remote classes and collect for batch write
      const classesToCache: Class[] = [];

      for (const remoteClass of remoteClasses) {
        // Convert ID to string for consistent IndexedDB key format
        const classId = String(remoteClass.id);
        const localClass = localClassesMap.get(classId);

        if (localClass) {
          // Conflict resolution: server always wins for class config
          const resolved = this.resolveConflict(localClass, remoteClass);
          classesToCache.push(resolved);
          conflictsResolved++;
        } else {
          // New class
          classesToCache.push({ ...remoteClass, id: classId });
        }

        rowsSynced++;
      }

      // Single batch write for all classes (1 transaction instead of N*2)
      if (classesToCache.length > 0) {
        await this.batchSet(classesToCache);
        logger.log(`[${this.tableName}] Batch cached ${classesToCache.length} classes`);
      }

      // Update sync metadata (single write transaction at the end)
      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
        errorMessage: undefined,
        conflictCount: conflictsResolved,
      });

      const duration = Date.now() - startTime;
      logger.log(
        `[${this.tableName}] Sync complete: ${rowsSynced} rows, ${conflictsResolved} conflicts, ${duration}ms`
      );

      return {
        tableName: this.tableName,
        success: true,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update sync metadata with error (best effort - don't re-throw if this fails)
      try {
        await this.updateSyncMetadata({
          syncStatus: 'error',
          errorMessage,
        });
      } catch (metadataError) {
        logger.error(`[${this.tableName}] Failed to update error metadata:`, metadataError);
      }

      logger.error(`[${this.tableName}] Sync failed:`, error);

      return {
        tableName: this.tableName,
        success: false,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Conflict resolution: Server-authoritative
   * Class configuration always comes from server
   */
  protected resolveConflict(_local: Class, remote: Class): Class {
    // Server always wins for class configuration
    // Judges/stewards modify on server, no client conflicts
    return remote;
  }

  /**
   * Get all classes for a trial
   * OPTIMIZED: Uses IndexedDB index for O(log n) performance
   */
  async getByTrialId(trialId: string): Promise<Class[]> {
    // Use indexed query for much better performance
    const classes = await this.queryByField('trial_id', trialId);

    // Sort by class_order
    return classes.sort((a, b) => (a.class_order || 0) - (b.class_order || 0));
  }

  /**
   * Get a single class by ID
   */
  async getClassById(classId: string): Promise<Class | null> {
    const cls = await this.get(classId);
    return cls || null;
  }

  /**
   * Get classes by element (e.g., "Scent Work")
   */
  async getByElement(element: string): Promise<Class[]> {
    const allClasses = await this.getAll();
    return allClasses
      .filter((cls) => cls.element === element)
      .sort((a, b) => (a.class_order || 0) - (b.class_order || 0));
  }

  /**
   * Get classes by level (e.g., "Novice", "Masters")
   */
  async getByLevel(level: string): Promise<Class[]> {
    const allClasses = await this.getAll();
    return allClasses
      .filter((cls) => cls.level === level)
      .sort((a, b) => (a.class_order || 0) - (b.class_order || 0));
  }

  /**
   * Get classes with self-checkin enabled
   */
  async getSelfCheckinEnabled(): Promise<Class[]> {
    const allClasses = await this.getAll();
    return allClasses
      .filter((cls) => cls.self_checkin_enabled === true)
      .sort((a, b) => (a.class_order || 0) - (b.class_order || 0));
  }

  /**
   * Update class status (e.g., "briefing", "in-progress", "completed")
   * Queues mutation for offline support
   */
  async updateClassStatus(
    classId: string,
    status: string,
    additionalFields?: Partial<Class>
  ): Promise<void> {
    // Get current class
    const currentClass = await this.get(classId);
    if (!currentClass) {
      throw new Error(`Class ${classId} not found`);
    }

    // Update local cache optimistically
    const updatedClass: Class = {
      ...currentClass,
      class_status: status,
      ...additionalFields,
      updated_at: new Date().toISOString(),
    };

    await this.set(classId, updatedClass, true); // Mark as dirty

    logger.log(
      `[${this.tableName}] Updated class ${classId} status to "${status}"`
    );
  }
}

// Singleton export
export const replicatedClassesTable = new ReplicatedClassesTable();
