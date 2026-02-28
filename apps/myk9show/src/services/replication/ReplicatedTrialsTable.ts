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
  showId?: string | undefined;
  name: string;
  date: string;
  trialNumber?: string | undefined;
  status?: string | undefined;
  maxEntriesPerDog?: number | undefined;
  maxTotalEntries?: number | undefined;
  maxEntriesPerHandler?: number | undefined;
  sportType?: string | undefined;

  // Extra fields for scoring
  trial_date?: string | undefined;
  trial_number?: string | undefined;

  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
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
    sportType: row.sport_type ?? undefined,

    // Map additional fields (from any as they might be missing in older types)
    trial_date: row.date,
    trial_number: row.trial_number ?? undefined,
  };
}

export class ReplicatedTrialsTable extends ReplicatedTable<ReplicatedTrial> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;

  constructor() {
    super('trials', undefined, { logger });
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /** Map UI trial status to DB CHECK constraint values */
  private mapTrialStatusToDb(uiStatus: string | undefined): string {
    switch (uiStatus) {
      case 'In Progress':
        return 'in_progress';
      case 'Completed':
        return 'completed';
      case 'Cancelled':
        return 'cancelled';
      case 'Scheduled':
      case 'Upcoming':
      default:
        return 'planned';
    }
  }

  /**
   * Convert app-level Trial to Supabase row format (snake_case).
   * Strips sync metadata fields (_version, _lastModified, etc.)
   */
  private toSupabaseRow(trial: ReplicatedTrial): Record<string, unknown> {
    return {
      id: trial.id,
      show_id: trial.showId ?? null,
      name: trial.name,
      date: trial.date,
      trial_number: trial.trialNumber ?? null,
      status: this.mapTrialStatusToDb(trial.status),
      max_entries_per_dog: trial.maxEntriesPerDog ?? null,
      max_total_entries: trial.maxTotalEntries ?? null,
      max_entries_per_handler: trial.maxEntriesPerHandler ?? null,
      sport_type: trial.sportType ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      const metadata = await this.getSyncMetadata();
      const allCached = await this.getAll();
      const isCacheEmpty = allCached.length === 0;
      const lastSync = isCacheEmpty ? 0 : metadata?.lastIncrementalSyncAt || 0;

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

  /**
   * Create a new trial locally (queued for sync)
   * @param trial - Trial data (must include id)
   * @param showMutationId - Optional mutation ID of the parent show (for dependency tracking)
   * The mutation ID is available via `lastMutationId` for dependency tracking.
   */
  async createTrial(trial: ReplicatedTrial, showMutationId?: string): Promise<ReplicatedTrial> {
    const newTrial: ReplicatedTrial = {
      ...trial,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(trial.id, newTrial, true);
    const mutationId = await this.queueMutation(
      'INSERT',
      trial.id,
      this.toSupabaseRow(newTrial),
      showMutationId ? [showMutationId] : undefined
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new trial ${trial.id}`);
    return newTrial;
  }

  /**
   * Update trial (marks as dirty for sync)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateTrial(trialId: string, updates: Partial<ReplicatedTrial>): Promise<string | null> {
    const currentTrial = await this.get(trialId);
    if (!currentTrial) {
      throw new Error(`Trial ${trialId} not found`);
    }

    const updatedTrial: ReplicatedTrial = {
      ...currentTrial,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(trialId, updatedTrial, true);
    const mutationId = await this.queueMutation(
      'UPDATE',
      trialId,
      this.toSupabaseRow(updatedTrial)
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated trial ${trialId}`);
    return mutationId;
  }

  /**
   * Delete a trial locally and queue DELETE mutation for Supabase sync
   */
  async deleteTrial(trialId: string): Promise<string | null> {
    await this.delete(trialId);
    const mutationId = await this.queueMutation('DELETE', trialId, { id: trialId });
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Deleted trial ${trialId}`);
    return mutationId;
  }
}

// Singleton export
export const replicatedTrialsTable = new ReplicatedTrialsTable();
