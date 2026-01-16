/**
 * ReplicatedTrialsTable - Offline-first trial data replication for myK9Show
 *
 * Manages trial data with offline support using @myk9/replication.
 * Trials are date-specific events within a show.
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema
 */
type TrialRow = Database['public']['Tables']['trials']['Row'];

/**
 * App-level Trial type with camelCase fields and sync metadata
 */
export interface ReplicatedTrial {
  id: string;
  showId?: string;
  name: string;
  date: string;
  trialNumber?: string;
  status?: string;
  maxEntriesPerDog?: number;
  maxTotalEntries?: number;
  maxEntriesPerHandler?: number;

  // Extra fields for scoring
  trial_date?: string;
  trial_number?: string;

  // Sync metadata
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

/**
 * Convert database row to app Trial type
 */
function rowToTrial(row: TrialRow): ReplicatedTrial {
  return {
    id: String(row.id),
    showId: row.show_id ?? undefined,
    name: row.name,
    date: row.date,
    trialNumber: row.trial_number ?? undefined,
    status: row.status ?? undefined,
    maxEntriesPerDog: row.max_entries_per_dog ?? undefined,
    maxTotalEntries: row.max_total_entries ?? undefined,
    maxEntriesPerHandler: row.max_entries_per_handler ?? undefined,

    // Map additional fields (from any as they might be missing in older types)
    trial_date: row.date,
    trial_number: row.trial_number ?? undefined,
  };
}

export class ReplicatedTrialsTable extends ReplicatedTable<ReplicatedTrial> {
  constructor() {
    super('trials', undefined, { logger });
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

      let query = supabase
        .from('trials')
        .select('*')
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      // Filter by show ID if provided as license key
      if (licenseKey) {
        query = query.eq('show_id', licenseKey);
      }

      const { data: remoteTrials, error } = await query;

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteTrials || remoteTrials.length === 0) {
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

      for (const remoteRow of remoteTrials) {
        const trialId = String(remoteRow.id);
        const remoteTrial = rowToTrial(remoteRow);
        const localTrial = await this.get(trialId);

        if (localTrial) {
          const resolved = this.resolveConflict(localTrial, remoteTrial);
          await this.set(trialId, resolved);
          conflictsResolved++;
        } else {
          await this.set(trialId, remoteTrial);
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

  protected resolveConflict(_local: ReplicatedTrial, remote: ReplicatedTrial): ReplicatedTrial {
    return remote;
  }

  /**
   * Get trials by show ID
   */
  async getTrialsByShow(showId: string): Promise<ReplicatedTrial[]> {
    const allTrials = await this.getAll();
    return allTrials
      .filter(trial => trial.showId === showId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Get trial by ID
   */
  async getTrialById(trialId: string): Promise<ReplicatedTrial | null> {
    return this.get(trialId);
  }

  /**
   * Get trials by date
   */
  async getTrialsByDate(date: string): Promise<ReplicatedTrial[]> {
    const allTrials = await this.getAll();
    return allTrials.filter(trial => trial.date === date);
  }
}

// Singleton export
export const replicatedTrialsTable = new ReplicatedTrialsTable();
