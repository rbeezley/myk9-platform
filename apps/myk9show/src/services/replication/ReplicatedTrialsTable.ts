/**
 * ReplicatedTrialsTable - Offline-first trial data replication for myK9Show
 *
 * Manages trial data with offline support using @myk9/replication.
 * Trials are date-specific events within a show.
 */

import {
  ReplicatedTable,
  syncReplicatedTable,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
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
  trialType?: string | undefined;
  plannedStartTime?: string | undefined;
  actualStartTime?: string | undefined;
  actualEndTime?: string | undefined;
  eventNumber?: string | undefined;
  displayOrder?: number | undefined;
  category?: string | undefined;
  imageUrl?: string | undefined;

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
    trialType: row.trial_type ?? undefined,
    plannedStartTime: row.planned_start_time ?? undefined,
    actualStartTime: row.actual_start_time ?? undefined,
    actualEndTime: row.actual_end_time ?? undefined,
    eventNumber: row.event_number ?? undefined,
    displayOrder: row.display_order ?? undefined,
    category: row.category ?? undefined,
    imageUrl: row.image_url ?? undefined,

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

  /** Map UI trial status to DB CHECK constraint values.
   *  Allowed: 'upcoming', 'in_progress', 'completed', 'cancelled' (migration 071). */
  private mapTrialStatusToDb(uiStatus: string | undefined): string {
    switch (uiStatus) {
      case 'In Progress':
      case 'in_progress':
        return 'in_progress';
      case 'Completed':
      case 'completed':
        return 'completed';
      case 'Cancelled':
      case 'cancelled':
        return 'cancelled';
      case 'Scheduled':
      case 'Upcoming':
      case 'upcoming':
      default:
        return 'upcoming';
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
      trial_type: trial.trialType ?? null,
      planned_start_time: trial.plannedStartTime ?? null,
      actual_start_time: trial.actualStartTime ?? null,
      actual_end_time: trial.actualEndTime ?? null,
      event_number: trial.eventNumber ?? null,
      display_order: trial.displayOrder ?? null,
      category: trial.category ?? null,
      image_url: trial.imageUrl ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  async sync(licenseKey: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<TrialRow, ReplicatedTrial> = {
      fetchRemoteRows: async ({ scope, since }) => {
        let query = supabase
          .from('trials')
          .select('*')
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        if (scope.value) {
          query = query.eq('show_id', scope.value);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        return data ?? [];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToTrial,
      resolveConflict: (_local, remote) => remote,
    };

    const result = await syncReplicatedTable(this, adapter, { value: licenseKey });

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    return result;
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
