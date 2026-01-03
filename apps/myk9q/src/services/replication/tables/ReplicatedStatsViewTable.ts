/**
 * ReplicatedStatsViewTable.ts
 *
 * Replicated table for `view_stats_summary` - a materialized view that pre-joins
 * shows → trials → classes → entries data for statistics calculations.
 *
 * Unlike regular tables, this is read-only (no writes to IndexedDB from client).
 * The view is regenerated on the server whenever entries are scored.
 *
 * **Phase 4 Day 18** - Statistics Views (Cached Materialized View)
 */

import { ReplicatedTable } from '../ReplicatedTable';
import { supabase } from '../../../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SyncResult } from '../types';
import { logger } from '@/utils/logger';

/**
 * Database schema (snake_case) - matches `view_stats_summary`
 * This is a computed view, not a real table with an `id` column.
 * We'll use `entry_id` as the primary key for IndexedDB storage.
 */
export interface StatsView {
  // Use entry_id as id for IndexedDB compatibility
  id: string;                          // entry_id converted to string

  // Show info
  show_id: string;                     // BIGINT as string
  show_name: string;
  license_key: string;

  // Trial info
  trial_id: string;                    // BIGINT as string
  trial_date: string;                  // ISO date string
  trial_name: string;

  // Class info
  class_id: string;                    // BIGINT as string
  element: string;                     // e.g., 'Scent Work', 'Rally'
  level: string;                       // e.g., 'Novice', 'Advanced'
  judge_name: string;

  // Entry info
  entry_id: string;                    // BIGINT as string (original id)
  armband_number: number;
  dog_call_name: string;
  dog_breed: string;
  handler_name: string;

  // Scoring results
  result_status: 'qualified' | 'nq' | 'excused' | 'absent' | 'withdrawn';
  is_scored: boolean;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  score: number | null;                // total_score
  qualifying_score: number | null;     // points_earned

  // Computed fields
  is_qualified: number;                // 1 if qualified, 0 otherwise (SQL CASE)
  valid_time: number | null;           // search_time_seconds if > 0, else NULL
}

/**
 * ReplicatedStatsViewTable
 *
 * Provides offline-first access to pre-computed statistics view.
 * This is a read-only cache - no client-side writes.
 */
export class ReplicatedStatsViewTable extends ReplicatedTable<StatsView> {
  constructor() {
    super('view_stats_summary');
  }

  /**
   * Fetch all stats view rows from Supabase (for initial sync or refresh)
   * NOTE: This is a VIEW, so we filter by license_key on the query side
   */
  async fetchFromSupabase(licenseKey: string): Promise<StatsView[]> {
    const { data, error } = await supabase
      .from('view_stats_summary')
      .select('*')
      .eq('license_key', licenseKey)
      .eq('is_scored', true); // Only fetch scored entries

    if (error) {
      throw new Error(`Failed to fetch stats view: ${error.message}`);
    }

    // Transform to StatsView type (use entry_id as id)
    return (data || []).map(row => ({
      id: row.entry_id.toString(),                    // Use entry_id as id
      show_id: row.show_id.toString(),
      show_name: row.show_name,
      license_key: row.license_key,
      trial_id: row.trial_id.toString(),
      trial_date: row.trial_date,
      trial_name: row.trial_name,
      class_id: row.class_id.toString(),
      element: row.element,
      level: row.level,
      judge_name: row.judge_name,
      entry_id: row.entry_id.toString(),
      armband_number: row.armband_number,
      dog_call_name: row.dog_call_name,
      dog_breed: row.dog_breed,
      handler_name: row.handler_name,
      result_status: row.result_status as 'qualified' | 'nq' | 'excused' | 'absent' | 'withdrawn',
      is_scored: row.is_scored,
      search_time_seconds: row.search_time_seconds,
      total_faults: row.total_faults,
      final_placement: row.final_placement,
      score: row.score,
      qualifying_score: row.qualifying_score,
      is_qualified: row.is_qualified,
      valid_time: row.valid_time,
    }));
  }

  /**
   * Handle real-time updates from entries table
   * Since view_stats_summary is a view, we watch the `entries` table for changes
   * and invalidate the cache when entries are updated.
   */
  async handleRealtimeEvent(
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ): Promise<void> {
    const { eventType, new: newRecord } = payload;

    // For views, we typically just invalidate the cache on any entry change
    // and let the next sync refresh the data
    if (eventType === 'UPDATE' || eventType === 'INSERT') {
      // Mark sync as stale so next read triggers a refresh
      await this.updateSyncMetadata({
        syncStatus: 'idle',
        lastIncrementalSyncAt: 0, // Force refresh on next read
      });

      // Optionally, we could also update the specific entry in the cache
      // if we have enough information in the payload
      if (newRecord?.is_scored && newRecord?.id) {
        // Entry was scored - we need to refresh the full stats view
        // because aggregate stats may have changed
}
    }
  }

  /**
   * Get all stats for a specific trial
   */
  async getByTrial(trialId: string): Promise<StatsView[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.trial_id === trialId);
  }

  /**
   * Get all stats for a specific class
   */
  async getByClass(classId: string): Promise<StatsView[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.class_id === classId);
  }

  /**
   * Get all stats for a specific show
   */
  async getByShow(showId: string): Promise<StatsView[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.show_id === showId);
  }

  /**
   * Get stats for a specific breed within a trial
   */
  async getByBreed(trialId: string, breed: string): Promise<StatsView[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.trial_id === trialId && stat.dog_breed === breed);
  }

  /**
   * Get qualified entries only
   */
  async getQualified(): Promise<StatsView[]> {
    const all = await this.getAll();
    return all.filter(stat => stat.result_status === 'qualified');
  }

  /**
   * Get fastest times for a specific class
   */
  async getFastestTimes(classId: string, limit: number = 10): Promise<StatsView[]> {
    const classStats = await this.getByClass(classId);

    // Filter qualified with valid times
    const qualified = classStats.filter(
      stat => stat.result_status === 'qualified' && stat.valid_time !== null
    );

    // Sort by valid_time ascending (fastest first)
    qualified.sort((a, b) => (a.valid_time || 0) - (b.valid_time || 0));

    return qualified.slice(0, limit);
  }

  /**
   * Sync method - full sync (views don't support incremental sync)
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    try {
const data = await this.fetchFromSupabase(licenseKey);

      // Clear old data first (full replacement for views)
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
      logger.error('[ReplicatedStatsViewTable] ❌ Sync failed:', errorMessage);

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
  }

  /**
   * Conflict resolution: Server-authoritative (views are always read-only)
   */
  protected resolveConflict(_local: StatsView, remote: StatsView): StatsView {
    return remote; // Server wins (always)
  }

  /**
   * Helper to clear all data for the table (for full replacement sync)
   */
  private async clearTable(): Promise<void> {
    const all = await this.getAll();
    const ids = all.map(item => item.id);
    if (ids.length > 0) {
      await this.batchDelete(ids);
    }
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const replicatedStatsViewTable = new ReplicatedStatsViewTable();
