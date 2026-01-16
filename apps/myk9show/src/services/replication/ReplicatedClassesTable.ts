/**
 * ReplicatedClassesTable - Offline-first class data replication for myK9Show
 *
 * Manages class data with offline support using @myk9/replication.
 * Classes are competition categories within a trial.
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema
 */
type ClassRow = Database['public']['Tables']['classes']['Row'];

/**
 * App-level Class type with camelCase fields and sync metadata
 */
export interface ReplicatedClass {
  id: string;
  trialId?: string;
  name: string;
  description?: string;
  entryFee?: number;
  jumpHeights?: string[];
  maxEntries?: number;
  allowsWaitlist?: boolean;
  maxDogsPerHandler?: number;
  level?: string;
  breedRestrictions?: string[];
  ageMin?: number;
  ageMax?: number;
  heightMin?: number;
  heightMax?: number;
  handlerAgeMin?: number;
  handlerAgeMax?: number;
  startTime?: string;
  estimatedDuration?: number;

  // Scent Work specific fields (camelCase)
  element?: string;
  section?: string;
  areaCount?: number;
  timeLimitSeconds?: number;
  timeLimitArea2Seconds?: number;
  timeLimitArea3Seconds?: number;
  judgeName?: string;
  classStatus?: string;
  classOrder?: number;
  isCompleted?: boolean;

  // Scent Work specific fields (snake_case for Compatibility with older hooks)
  trial_id?: string;
  area_count?: number;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;

  // Sync metadata
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

/**
 * Convert database row to app Class type
 */
function rowToClass(row: ClassRow): ReplicatedClass {
  // Cast to Record for accessing fields not in the Supabase schema type
  const dbRow = row as ClassRow & Record<string, unknown>;
  return {
    id: String(row.id),
    trialId: row.trial_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    entryFee: row.entry_fee ?? undefined,
    jumpHeights: row.jump_heights ?? undefined,
    maxEntries: row.max_entries ?? undefined,
    allowsWaitlist: row.allow_waitlist ?? undefined,
    maxDogsPerHandler: row.max_dogs_per_handler ?? undefined,
    level: row.level ?? undefined,
    breedRestrictions: row.breed_restrictions ?? undefined,
    ageMin: row.age_min ?? undefined,
    ageMax: row.age_max ?? undefined,
    heightMin: row.height_min ?? undefined,
    heightMax: row.height_max ?? undefined,
    handlerAgeMin: row.handler_age_min ?? undefined,
    handlerAgeMax: row.handler_age_max ?? undefined,
    startTime: row.start_time ?? undefined,
    estimatedDuration: row.estimated_duration ?? undefined,

    // CamelCase fields
    element: (dbRow.element as string | undefined) ?? undefined,
    section: (dbRow.section as string | undefined) ?? undefined,
    areaCount: (dbRow.area_count as number | undefined) ?? undefined,
    timeLimitSeconds: (dbRow.time_limit_seconds as number | undefined) ?? undefined,
    timeLimitArea2Seconds: (dbRow.time_limit_area2_seconds as number | undefined) ?? undefined,
    timeLimitArea3Seconds: (dbRow.time_limit_area3_seconds as number | undefined) ?? undefined,
    judgeName: (dbRow.judge_name as string | undefined) ?? undefined,
    classStatus: (dbRow.class_status as string | undefined) ?? undefined,
    classOrder: (dbRow.class_order as number | undefined) ?? undefined,
    isCompleted: (dbRow.is_completed as boolean | undefined) ?? false,

    // Snake_case fields (compatibility)
    trial_id: row.trial_id ?? undefined,
    area_count: (dbRow.area_count as number | undefined) ?? undefined,
    time_limit_seconds: (dbRow.time_limit_seconds as number | undefined) ?? undefined,
    time_limit_area2_seconds: (dbRow.time_limit_area2_seconds as number | undefined) ?? undefined,
    time_limit_area3_seconds: (dbRow.time_limit_area3_seconds as number | undefined) ?? undefined,
  };
}

export class ReplicatedClassesTable extends ReplicatedTable<ReplicatedClass> {
  constructor() {
    super('classes', undefined, { logger });
  }

  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      const metadata = await this.getSyncMetadata();
      const allCached = await this.getAll();
      const isCacheEmpty = allCached.length === 0;
      const lastSync = isCacheEmpty ? 0 : (metadata?.lastIncrementalSyncAt || 0);

      logger.log(`[${this.getTableName()}] Starting sync`);

      // Filter by trial_id if provided as license key
      let query = supabase
        .from('classes')
        .select('*')
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (licenseKey) {
        query = query.eq('trial_id', licenseKey);
      }

      const { data: remoteClasses, error } = await query;

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteClasses || remoteClasses.length === 0) {
        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
        });

        return {
          tableName: this.getTableName(),
          success: true,
          operation: 'incremental-sync',
          rowsAffected: 0,
          conflictsResolved: 0,
          duration: Date.now() - startTime,
        };
      }

      for (const remoteRow of remoteClasses) {
        const classId = String(remoteRow.id);
        const remoteClass = rowToClass(remoteRow);
        const localClass = await this.get(classId);

        if (localClass) {
          const resolved = this.resolveConflict(localClass, remoteClass);
          await this.set(classId, resolved);
          conflictsResolved++;
        } else {
          await this.set(classId, remoteClass);
        }

        rowsSynced++;
      }

      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
      });

      return {
        tableName: this.getTableName(),
        success: true,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.getTableName()}] Sync failed:`, error);

      return {
        tableName: this.getTableName(),
        success: false,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  protected resolveConflict(_local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass {
    return remote;
  }

  /**
   * Get classes by trial ID
   */
  async getClassesByTrial(trialId: string): Promise<ReplicatedClass[]> {
    const allClasses = await this.getAll();
    return allClasses.filter(cls => cls.trialId === trialId);
  }

  /**
   * Get class by ID
   */
  async getClassById(classId: string): Promise<ReplicatedClass | null> {
    return this.get(classId);
  }

  /**
   * Update class (marks as dirty for sync)
   */
  async updateClass(classId: string, updates: Partial<ReplicatedClass>): Promise<void> {
    const currentClass = await this.get(classId);
    if (!currentClass) {
      throw new Error(`Class ${classId} not found`);
    }

    const updatedClass: ReplicatedClass = {
      ...currentClass,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(classId, updatedClass, true);
    logger.log(`[${this.getTableName()}] Updated class ${classId}`);
  }
}

// Singleton export
export const replicatedClassesTable = new ReplicatedClassesTable();
