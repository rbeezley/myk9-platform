/**
 * ReplicatedNationalsRankingsTable.ts
 *
 * Replicated table for `nationals_rankings` - rankings for national competitions.
 *
 * This table is currently DORMANT (not actively used in production) but infrastructure
 * is ready for future nationals events.
 *
 * Automatically updated by trigger when event_statistics are inserted.
 *
 * **Phase 4 Day 19** - Nationals Tables (Dormant)
 */

import { ReplicatedTable } from '../ReplicatedTable';
import { supabase } from '../../../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Database schema (snake_case) - matches `nationals_rankings` table
 */
export interface NationalsRankings {
  id: string;                          // UUID as string
  license_key: string;
  dog_name: string;
  handler_name: string;
  breed: string;
  element: string;                     // Competition element (e.g., 'Scent Work')
  level: string;                       // Class level (e.g., 'Novice', 'Masters')
  total_score: number | null;
  runs_completed: number;
  average_score: number | null;
  rank: number | null;
  created_at: string;                  // ISO timestamp
  updated_at: string;                  // ISO timestamp
}

/**
 * ReplicatedNationalsRankingsTable
 *
 * Provides offline-first access to nationals rankings.
 * Server-authoritative (rankings computed by trigger).
 */
export class ReplicatedNationalsRankingsTable extends ReplicatedTable<NationalsRankings> {
  constructor() {
    super('nationals_rankings');
  }

  /**
   * Fetch all nationals rankings from Supabase for a license key
   */
  async fetchFromSupabase(licenseKey: string): Promise<NationalsRankings[]> {
    const { data, error } = await supabase
      .from('nationals_rankings')
      .select('*')
      .eq('license_key', licenseKey);

    if (error) {
      throw new Error(`Failed to fetch nationals rankings: ${error.message}`);
    }

    // Transform to NationalsRankings type
    return (data || []).map(row => ({
      id: row.id,
      license_key: row.license_key,
      dog_name: row.dog_name,
      handler_name: row.handler_name,
      breed: row.breed,
      element: row.element,
      level: row.level,
      total_score: row.total_score,
      runs_completed: row.runs_completed,
      average_score: row.average_score,
      rank: row.rank,
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
          const ranking = this.transformRow(newRecord);
          await this.set(ranking.id, ranking);
        }
        break;

      case 'UPDATE':
        if (newRecord?.id) {
          const ranking = this.transformRow(newRecord);
          await this.set(ranking.id, ranking);
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
   * Transform raw Supabase row to NationalsRankings type
   */
  private transformRow(row: Record<string, unknown>): NationalsRankings {
    return {
      id: row.id as string,
      license_key: row.license_key as string,
      dog_name: row.dog_name as string,
      handler_name: row.handler_name as string,
      breed: row.breed as string,
      element: row.element as string,
      level: row.level as string,
      total_score: row.total_score as number | null,
      runs_completed: row.runs_completed as number,
      average_score: row.average_score as number | null,
      rank: row.rank as number | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  /**
   * Get rankings for a specific element and level
   */
  async getByElementLevel(element: string, level: string): Promise<NationalsRankings[]> {
    const all = await this.getAll();
    return all
      .filter(ranking => ranking.element === element && ranking.level === level)
      .sort((a, b) => (a.rank || 0) - (b.rank || 0)); // Sort by rank
  }

  /**
   * Get rankings for a specific dog
   */
  async getByDog(dogName: string): Promise<NationalsRankings[]> {
    const all = await this.getAll();
    return all.filter(ranking => ranking.dog_name === dogName);
  }

  /**
   * Get rankings for a specific handler
   */
  async getByHandler(handlerName: string): Promise<NationalsRankings[]> {
    const all = await this.getAll();
    return all.filter(ranking => ranking.handler_name === handlerName);
  }

  /**
   * Get rankings for a specific breed
   */
  async getByBreed(breed: string): Promise<NationalsRankings[]> {
    const all = await this.getAll();
    return all
      .filter(ranking => ranking.breed === breed)
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }

  /**
   * Get top N rankings for a specific element/level
   */
  async getTopRankings(
    element: string,
    level: string,
    limit: number = 10
  ): Promise<NationalsRankings[]> {
    const rankings = await this.getByElementLevel(element, level);
    return rankings.slice(0, limit);
  }

  /**
   * Get all rankings sorted by rank
   */
  async getAllSorted(): Promise<NationalsRankings[]> {
    const all = await this.getAll();
    return all.sort((a, b) => {
      // Sort by element, then level, then rank
      if (a.element !== b.element) {
        return a.element.localeCompare(b.element);
      }
      if (a.level !== b.level) {
        return a.level.localeCompare(b.level);
      }
      return (a.rank || 0) - (b.rank || 0);
    });
  }

  /**
   * Sync method - full sync for nationals rankings
   *
   * DORMANT: Schema mismatch - DB uses mobile_app_lic_key, different columns
   * Skip sync to prevent error spam. Activate when schema is aligned.
   */
  async sync(_licenseKey: string): Promise<import('../types').SyncResult> {
    const startTime = Date.now();

    return {
      tableName: this.tableName,
      success: true,
      operation: 'incremental-sync', // Using valid operation type for dormant skip
      rowsAffected: 0,
      conflictsResolved: 0,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Conflict resolution: Server-authoritative (rankings computed by database trigger)
   */
  protected resolveConflict(_local: NationalsRankings, remote: NationalsRankings): NationalsRankings {
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
export const replicatedNationalsRankingsTable = new ReplicatedNationalsRankingsTable();
