/**
 * ReplicatedEntriesTable - Offline-first entry data replication for myK9Show
 *
 * Manages entry/registration data with offline support using @myk9/replication.
 * Entries represent a dog+handler registered for a specific class.
 *
 * Conflict Resolution:
 * - Last-write-wins for most fields
 * - Check-in status: local takes precedence (offline check-ins are authoritative)
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema
 */
type EntryRow = Database['public']['Tables']['entries']['Row'];

/**
 * App-level Entry type with camelCase fields and sync metadata
 */
export interface ReplicatedEntry {
  id: string;
  classId?: string;
  showId?: string;
  dogId?: string;
  handlerId?: string;
  armband?: string;
  handler?: string;
  status?: string;
  entryStatus?: string;
  jumpHeight?: string;
  entryFee?: number;
  totalFees?: number;
  paymentStatus?: string;
  runOrder?: number;
  moveUpRequested?: boolean;
  preferredJudge?: string;
  specialRequests?: string;
  submittedAt?: string;

  // Extra fields for scoring/display (camelCase)
  isScored?: boolean;
  resultStatus?: string;
  resultText?: string;
  searchTimeSeconds?: number;
  totalPoints?: number;
  finalPlacement?: string;
  dogCallName?: string;
  dogBreed?: string;
  handlerName?: string;
  armbandNumber?: string;

  // Extra fields for scoring/display (snake_case for Compatibility)
  is_scored?: boolean;
  result_status?: string;
  result_text?: string;
  search_time_seconds?: number;
  total_points?: number;
  final_placement?: string;
  dog_call_name?: string;
  dog_breed?: string;
  handler_name?: string;
  armband_number?: string;
  class_id?: string;
  entry_status?: string;
  element?: string;
  level?: string;
  areas?: number;
  timeLimit?: string;
  timeLimit2?: string;
  timeLimit3?: string;

  // Sync metadata
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

/**
 * Convert database row to app Entry type
 */
function rowToEntry(row: EntryRow): ReplicatedEntry {
  // Cast to Record for accessing fields not in the Supabase schema type
  const dbRow = row as EntryRow & Record<string, unknown>;
  return {
    id: String(row.id),
    classId: row.class_id ?? undefined,
    showId: row.show_id ?? undefined,
    dogId: row.dog_id ?? undefined,
    handlerId: row.handler_id ?? undefined,
    armband: row.armband ?? undefined,
    handler: row.handler ?? undefined,
    status: (dbRow.status as string | undefined) ?? undefined,
    entryStatus: row.entry_status ?? undefined,
    jumpHeight: row.jump_height ?? undefined,
    entryFee: row.entry_fee ?? undefined,
    totalFees: (dbRow.total_fees as number | undefined) ?? undefined,
    paymentStatus: row.payment_status ?? undefined,
    runOrder: row.run_order ?? undefined,
    moveUpRequested: row.move_up_requested ?? undefined,
    preferredJudge: row.preferred_judge ?? undefined,
    specialRequests: row.special_requests ?? undefined,
    submittedAt: row.submitted_at ?? undefined,

    // CamelCase fields
    isScored: (dbRow.is_scored as boolean | undefined) ?? false,
    resultStatus: (dbRow.result_status as string | undefined) ?? undefined,
    resultText: (dbRow.result_text as string | undefined) ?? undefined,
    searchTimeSeconds: (dbRow.search_time_seconds as number | undefined) ?? undefined,
    totalPoints: (dbRow.total_points as number | undefined) ?? undefined,
    finalPlacement: dbRow.final_placement != null ? String(dbRow.final_placement) : undefined,
    dogCallName: (dbRow.dog_call_name as string | undefined) ?? undefined,
    dogBreed: (dbRow.dog_breed as string | undefined) ?? undefined,
    handlerName: row.handler ?? undefined,
    armbandNumber: row.armband ?? undefined,

    // Snake_case fields (compatibility)
    is_scored: (dbRow.is_scored as boolean | undefined) ?? false,
    result_status: (dbRow.result_status as string | undefined) ?? undefined,
    result_text: (dbRow.result_text as string | undefined) ?? undefined,
    search_time_seconds: (dbRow.search_time_seconds as number | undefined) ?? undefined,
    total_points: (dbRow.total_points as number | undefined) ?? undefined,
    final_placement: dbRow.final_placement != null ? String(dbRow.final_placement) : undefined,
    dog_call_name: (dbRow.dog_call_name as string | undefined) ?? undefined,
    dog_breed: (dbRow.dog_breed as string | undefined) ?? undefined,
    handler_name: row.handler ?? undefined,
    armband_number: row.armband ?? undefined,
    class_id: row.class_id ?? undefined,
    entry_status: row.entry_status ?? undefined,
    element: (dbRow.element as string | undefined) ?? undefined,
    level: (dbRow.level as string | undefined) ?? undefined,
    areas: (dbRow.area_count as number | undefined) ?? undefined,
    timeLimit: dbRow.time_limit_seconds ? String(dbRow.time_limit_seconds as number) : undefined,
    timeLimit2: dbRow.time_limit_area2_seconds ? String(dbRow.time_limit_area2_seconds as number) : undefined,
    timeLimit3: dbRow.time_limit_area3_seconds ? String(dbRow.time_limit_area3_seconds as number) : undefined,
  };
}

export class ReplicatedEntriesTable extends ReplicatedTable<ReplicatedEntry> {
  constructor() {
    super('entries', undefined, { logger });
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

      // Filter by show_id if provided
      let query = supabase
        .from('entries')
        .select('*')
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (licenseKey) {
        query = query.eq('show_id', licenseKey);
      }

      const { data: remoteEntries, error } = await query;

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteEntries || remoteEntries.length === 0) {
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

      for (const remoteRow of remoteEntries) {
        const entryId = String(remoteRow.id);
        const remoteEntry = rowToEntry(remoteRow);
        const localEntry = await this.get(entryId);

        if (localEntry) {
          const resolved = this.resolveConflict(localEntry, remoteEntry);
          await this.set(entryId, resolved);
          conflictsResolved++;
        } else {
          await this.set(entryId, remoteEntry);
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

  /**
   * Conflict resolution for entries - server wins
   */
  protected resolveConflict(_local: ReplicatedEntry, remote: ReplicatedEntry): ReplicatedEntry {
    return remote;
  }

  /**
   * Get entries by class ID
   */
  async getEntriesByClass(classId: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.classId === classId);
  }

  /**
   * Get entries by show ID
   */
  async getEntriesByShow(showId: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.showId === showId);
  }

  /**
   * Get entries by armband number
   */
  async getEntriesByArmband(armband: string): Promise<ReplicatedEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.armband === armband);
  }

  /**
   * Get entry by ID
   */
  async getEntryById(entryId: string): Promise<ReplicatedEntry | null> {
    return this.get(entryId);
  }

  /**
   * Update entry status (offline-first)
   */
  async updateEntryStatus(entryId: string, status: string): Promise<void> {
    const entry = await this.get(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    const updated: ReplicatedEntry = {
      ...entry,
      status,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    logger.log(`[${this.getTableName()}] Updated entry ${entryId} status to ${status}`);
  }

  /**
   * Update entry (marks as dirty for sync)
   */
  async updateEntry(entryId: string, updates: Partial<ReplicatedEntry>): Promise<void> {
    const entry = await this.get(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    const updated: ReplicatedEntry = {
      ...entry,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(entryId, updated, true);
    logger.log(`[${this.getTableName()}] Updated entry ${entryId}`);
  }
}

// Singleton export
export const replicatedEntriesTable = new ReplicatedEntriesTable();
