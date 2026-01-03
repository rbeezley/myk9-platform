/**
 * ReplicatedTrialsTable - Offline-first trial data replication
 *
 * Manages trial instances (individual competitions within a show) with offline support.
 *
 * Conflict Resolution:
 * - Server-authoritative: All trial configuration comes from server
 * - Use case: Trial secretaries modify trials, no client conflicts
 *
 * **Phase 3 Day 13** - Core table migration
 */

import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

export interface Trial {
  id: string;
  show_id: string;
  trial_date: string;
  trial_number?: number;
  element: string;
  organization: string;
  competition_type?: string;
  trial_status?: string;
  judge_name?: string;
  secretary_name?: string;
  weather_conditions?: string;
  notes?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  planned_start_time?: string;
  license_key: string;
  created_at?: string;
  updated_at?: string;
}

export class ReplicatedTrialsTable extends ReplicatedTable<Trial> {
  constructor() {
    super('trials'); // TTL managed by feature flags
  }

  /**
   * Sync trials from Supabase
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      // Get last sync timestamp
      const metadata = await this.getSyncMetadata();

      // Check if cache is empty FOR THIS SHOW - if so, force full sync from epoch
      // CRITICAL: Pass licenseKey to filter by current show (multi-tenant isolation)
      // Without this, cache from other shows would cause incremental sync to miss data
      const allCachedTrials = await this.getAll(licenseKey);
      const isCacheEmpty = allCachedTrials.length === 0;

      // If cache is empty but we have a lastSync timestamp, it means the cache was cleared
      // Reset to epoch (0) to fetch all data
      const lastSync = isCacheEmpty ? 0 : (metadata?.lastIncrementalSyncAt || 0);

      logger.log(
        `[${this.tableName}] Starting ${isCacheEmpty ? 'FULL (empty cache)' : 'incremental'} sync (since ${new Date(lastSync).toISOString()}), cache: ${allCachedTrials.length} trials`
      );

      // Fetch trials updated since last sync
      // Join through: trials → shows.license_key
      const { data: rawTrials, error } = await supabase
        .from('trials')
        .select(`
          *,
          shows!inner(
            license_key
          )
        `)
        .eq('shows.license_key', licenseKey)
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      // Flatten the response and extract license_key from nested shows
      const remoteTrials = rawTrials?.map((rawTrial) => {
        // Extract license_key from nested structure
        const extractedLicenseKey = (rawTrial.shows as { license_key?: string })?.license_key;

        // Remove nested shows object and add license_key at top level
        const { shows: _shows, ...trialData } = rawTrial;
        return {
          ...trialData,
          license_key: extractedLicenseKey || licenseKey, // Fall back to provided licenseKey
        };
      }) || [];

      if (error) {
        errors.push(error.message);
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteTrials || remoteTrials.length === 0) {
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

      // Process each trial
      for (const remoteTrial of remoteTrials) {
        // Convert ID to string for consistent IndexedDB key format (bigserial returns as number)
        const trialId = String(remoteTrial.id);
        const localTrial = await this.get(trialId);

        if (localTrial) {
          // Conflict resolution: server always wins for trial config
          const resolved = this.resolveConflict(localTrial, remoteTrial);
          await this.set(trialId, resolved);
          conflictsResolved++;
        } else {
          // New trial
          await this.set(trialId, remoteTrial);
        }

        rowsSynced++;
      }

      // Update sync metadata
      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
        errorMessage: undefined,
        conflictCount: (metadata?.conflictCount || 0) + conflictsResolved,
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
      errors.push(errorMessage);

      // Update sync metadata with error
      await this.updateSyncMetadata({
        syncStatus: 'error',
        errorMessage,
      });

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
   * Trial configuration always comes from server
   */
  protected resolveConflict(_local: Trial, remote: Trial): Trial {
    // Server always wins for trial configuration
    // Trial secretaries modify on server, no client conflicts
    return remote;
  }

  /**
   * Get all trials for a show
   */
  async getByShowId(showId: string): Promise<Trial[]> {
    const allTrials = await this.getAll();
    return allTrials
      .filter((trial) => trial.show_id === showId)
      .sort((a, b) => new Date(a.trial_date).getTime() - new Date(b.trial_date).getTime());
  }

  /**
   * Get a single trial by ID
   */
  async getTrialById(trialId: string): Promise<Trial | null> {
    const trial = await this.get(trialId);
    return trial || null;
  }

  /**
   * Get trials by element (e.g., "Scent Work", "Rally")
   */
  async getByElement(element: string): Promise<Trial[]> {
    const allTrials = await this.getAll();
    return allTrials
      .filter((trial) => trial.element === element)
      .sort((a, b) => new Date(a.trial_date).getTime() - new Date(b.trial_date).getTime());
  }

  /**
   * Get trials by organization (e.g., "AKC", "UKC")
   */
  async getByOrganization(organization: string): Promise<Trial[]> {
    const allTrials = await this.getAll();
    return allTrials
      .filter((trial) => trial.organization === organization)
      .sort((a, b) => new Date(a.trial_date).getTime() - new Date(b.trial_date).getTime());
  }

  /**
   * Get trials by date range
   */
  async getByDateRange(startDate: string, endDate: string): Promise<Trial[]> {
    const allTrials = await this.getAll();
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return allTrials
      .filter((trial) => {
        const trialDate = new Date(trial.trial_date).getTime();
        return trialDate >= start && trialDate <= end;
      })
      .sort((a, b) => new Date(a.trial_date).getTime() - new Date(b.trial_date).getTime());
  }

  /**
   * Get trials by status
   */
  async getByStatus(status: string): Promise<Trial[]> {
    const allTrials = await this.getAll();
    return allTrials
      .filter((trial) => trial.trial_status === status)
      .sort((a, b) => new Date(a.trial_date).getTime() - new Date(b.trial_date).getTime());
  }

  /**
   * Update trial status (e.g., "upcoming", "in-progress", "completed")
   * Queues mutation for offline support
   */
  async updateTrialStatus(
    trialId: string,
    status: string,
    additionalFields?: Partial<Trial>
  ): Promise<void> {
    // Get current trial
    const currentTrial = await this.get(trialId);
    if (!currentTrial) {
      throw new Error(`Trial ${trialId} not found`);
    }

    // Update local cache optimistically
    const updatedTrial: Trial = {
      ...currentTrial,
      trial_status: status,
      ...additionalFields,
      updated_at: new Date().toISOString(),
    };

    await this.set(trialId, updatedTrial, true); // Mark as dirty

    logger.log(
      `[${this.tableName}] Updated trial ${trialId} status to "${status}"`
    );
  }
}

// Singleton export
export const replicatedTrialsTable = new ReplicatedTrialsTable();
