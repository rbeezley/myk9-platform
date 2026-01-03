/**
 * ReplicatedEventStatisticsTable.ts
 *
 * Replicated table for `event_statistics` - statistics for national events and competitions.
 *
 * This table is currently DORMANT (not actively used in production) but infrastructure
 * is ready for future nationals events.
 *
 * **Phase 4 Day 19** - Nationals Tables (Dormant)
 */

import { ReplicatedTable } from '../ReplicatedTable';
import { supabase } from '../../../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';

/**
 * Database schema (snake_case) - matches `event_statistics` table
 */
export interface EventStatistics {
  id: string;                          // UUID as string
  license_key: string;
  trial_id: string;                    // UUID as string
  class_id: string;                    // UUID as string
  entry_id: string;                    // UUID as string
  dog_name: string;
  handler_name: string;
  breed: string;
  element: string;                     // Competition element (e.g., 'Scent Work')
  level: string;                       // Class level (e.g., 'Novice', 'Masters')
  score: number | null;
  time: number | null;                 // Run time in seconds
  placement: number | null;
  qualified: boolean;
  trial_date: string;                  // ISO date string
  results_released: boolean;
  created_at: string;                  // ISO timestamp
  updated_at: string;                  // ISO timestamp
}

/**
 * ReplicatedEventStatisticsTable
 *
 * Provides offline-first access to nationals event statistics.
 * Server-authoritative (no client writes).
 */
export class ReplicatedEventStatisticsTable extends ReplicatedTable<EventStatistics> {
  // Track if dormant message has been logged this session (avoid log spam)
  private static dormantLoggedOnce = false;

  constructor() {
    super('event_statistics');
  }

  /**
   * Fetch all event statistics from Supabase for a license key
   */
  async fetchFromSupabase(licenseKey: string): Promise<EventStatistics[]> {
    const { data, error } = await supabase
      .from('event_statistics')
      .select('*')
      .eq('license_key', licenseKey);

    if (error) {
      throw new Error(`Failed to fetch event statistics: ${error.message}`);
    }

    // Transform to EventStatistics type
    return (data || []).map(row => ({
      id: row.id,
      license_key: row.license_key,
      trial_id: row.trial_id,
      class_id: row.class_id,
      entry_id: row.entry_id,
      dog_name: row.dog_name,
      handler_name: row.handler_name,
      breed: row.breed,
      element: row.element,
      level: row.level,
      score: row.score,
      time: row.time,
      placement: row.placement,
      qualified: row.qualified,
      trial_date: row.trial_date,
      results_released: row.results_released,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  /**
   * Handle real-time updates from Supabase
   */
  async handleRealtimeEvent(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ): Promise<void> {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        if (newRecord?.id) {
          const stat = this.transformRow(newRecord);
          await this.set(stat.id, stat);
        }
        break;

      case 'UPDATE':
        if (newRecord?.id) {
          const stat = this.transformRow(newRecord);
          await this.set(stat.id, stat);
        }
        break;

      case 'DELETE':
        if (oldRecord?.id) {
          await this.delete(oldRecord.id as string);
        }
        break;
    }
  }

  /**
   * Transform raw Supabase row to EventStatistics type
   */
  private transformRow(row: Record<string, unknown>): EventStatistics {
    return {
      id: row.id as string,
      license_key: row.license_key as string,
      trial_id: row.trial_id as string,
      class_id: row.class_id as string,
      entry_id: row.entry_id as string,
      dog_name: row.dog_name as string,
      handler_name: row.handler_name as string,
      breed: row.breed as string,
      element: row.element as string,
      level: row.level as string,
      score: row.score as number | null,
      time: row.time as number | null,
      placement: row.placement as number | null,
      qualified: row.qualified as boolean,
      trial_date: row.trial_date as string,
      results_released: row.results_released as boolean,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  /**
   * Get statistics for a specific trial
   */
  async getByTrial(trialId: string): Promise<EventStatistics[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.trial_id === trialId);
  }

  /**
   * Get statistics for a specific class
   */
  async getByClass(classId: string): Promise<EventStatistics[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.class_id === classId);
  }

  /**
   * Get statistics for a specific entry
   */
  async getByEntry(entryId: string): Promise<EventStatistics[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.entry_id === entryId);
  }

  /**
   * Get statistics by breed
   */
  async getByBreed(breed: string): Promise<EventStatistics[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.breed === breed);
  }

  /**
   * Get statistics by element and level
   */
  async getByElementLevel(element: string, level: string): Promise<EventStatistics[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.element === element && stat.level === level);
  }

  /**
   * Get only qualified entries
   */
  async getQualified(): Promise<EventStatistics[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.qualified);
  }

  /**
   * Get only released results
   */
  async getReleasedResults(): Promise<EventStatistics[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.results_released);
  }

  /**
   * Sync method - full sync for event statistics
   *
   * NOTE: This table is DORMANT - it doesn't exist in the database yet.
   * The sync returns success with 0 rows to prevent error spam.
   * When the table is created, remove the early return check.
   */
  async sync(_licenseKey: string): Promise<import('../types').SyncResult> {
    const startTime = Date.now();

    // DORMANT TABLE CHECK: event_statistics doesn't exist in database yet
    // Return success with 0 rows to prevent error spam during sync
    // TODO: Remove this check when event_statistics migration is created
    if (!ReplicatedEventStatisticsTable.dormantLoggedOnce) {
       
      logger.log('[ReplicatedEventStatisticsTable] ⏸️ Skipping sync - table is dormant (not yet in database)');
      ReplicatedEventStatisticsTable.dormantLoggedOnce = true;
    }
    return {
      tableName: this.tableName,
      success: true,
      operation: 'incremental-sync', // Using valid operation type for dormant skip
      rowsAffected: 0,
      conflictsResolved: 0,
      duration: Date.now() - startTime,
    };

    // Original sync code (activate when table exists):
    /*
    try {
      const data = await this.fetchFromSupabase(licenseKey);

      // Clear old data first (full replacement)
      await this.clearTable();

      // Insert fresh data
      await this.batchSet(data);

      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
      });

      return {
        tableName: this.tableName,
        success: true,
        operation: 'full-sync',
        rowsAffected: data.length,
        conflictsResolved: 0,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[ReplicatedEventStatisticsTable] ❌ Sync failed:', errorMessage);

      return {
        tableName: this.tableName,
        success: false,
        operation: 'full-sync',
        rowsAffected: 0,
        conflictsResolved: 0,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
    */
  }

  /**
   * Conflict resolution: Server-authoritative (statistics are read-only from client)
   */
  protected resolveConflict(_local: EventStatistics, remote: EventStatistics): EventStatistics {
    return remote; // Server wins (always)
  }

  // NOTE: clearTable() method removed while table is dormant.
  // Re-add when activating this table:
  // private async clearTable(): Promise<void> {
  //   const all = await this.getAll();
  //   const ids = all.map(item => item.id);
  //   if (ids.length > 0) await this.batchDelete(ids);
  // }
}

/**
 * Singleton instance for use throughout the application
 */
export const replicatedEventStatisticsTable = new ReplicatedEventStatisticsTable();
