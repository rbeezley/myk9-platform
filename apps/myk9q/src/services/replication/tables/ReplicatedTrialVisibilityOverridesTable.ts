/**
 * ReplicatedTrialVisibilityOverridesTable - Offline-first trial visibility overrides
 *
 * Manages trial-level visibility overrides that supersede show defaults
 * with offline support.
 *
 * Conflict Resolution:
 * - Server-authoritative: All visibility config comes from server
 * - Use case: Trial admins override show defaults, no client conflicts
 *
 * **Phase 3 Day 15** - Visibility config tables
 */

import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

export interface TrialVisibilityOverrides {
  id: string;
  trial_id: string;

  // Field visibility flags (null = inherit from show)
  show_time?: boolean | null;
  show_faults?: boolean | null;
  show_placement?: boolean | null;
  show_score?: boolean | null;
  show_judge_comments?: boolean | null;
  show_handler_info?: boolean | null;
  show_dog_info?: boolean | null;

  // Access control (null = inherit from show)
  public_access?: boolean | null;
  exhibitor_access?: boolean | null;
  require_authentication?: boolean | null;

  license_key: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Raw override from Supabase with joined data
 */
interface RawOverrideWithJoins extends Omit<TrialVisibilityOverrides, 'license_key'> {
  trials?: {
    show_id?: number;
    shows?: {
      license_key?: string;
    };
  };
}

export class ReplicatedTrialVisibilityOverridesTable extends ReplicatedTable<TrialVisibilityOverrides> {
  constructor() {
    super('trial_result_visibility_overrides'); // TTL managed by feature flags
  }

  /**
   * Sync visibility overrides from Supabase
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      // Get last sync timestamp
      const metadata = await this.getSyncMetadata();
      const lastSync = metadata?.lastIncrementalSyncAt || 0;

      logger.log(
        `[${this.tableName}] Starting incremental sync (since ${new Date(lastSync).toISOString()})...`
      );

      // Fetch visibility overrides updated since last sync
      // JOIN through trials → shows to filter by license_key
      // (table doesn't have license_key column directly)
      const { data: remoteOverrides, error } = await supabase
        .from('trial_result_visibility_overrides')
        .select(`
          *,
          trials!inner(
            show_id,
            shows!inner(
              license_key
            )
          )
        `)
        .eq('trials.shows.license_key', licenseKey)
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (error) {
        errors.push(error.message);
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteOverrides || remoteOverrides.length === 0) {
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

      // Process each override
      for (const rawOverride of remoteOverrides) {
        const typedRawOverride = rawOverride as RawOverrideWithJoins;

        // Extract license_key from nested structure (trials → shows)
        const extractedLicenseKey = typedRawOverride.trials?.shows?.license_key;

        // Flatten the response (remove nested trials object from join)
        const { trials: _trials, ...overrideData } = typedRawOverride;

        // Create properly typed override with license_key
        const remoteOverride: TrialVisibilityOverrides = {
          ...overrideData,
          id: String(overrideData.id),
          license_key: extractedLicenseKey || licenseKey, // Fall back to provided licenseKey
        };

        // Convert ID to string for consistent IndexedDB key format
        const overrideId = remoteOverride.id;
        const localOverride = await this.get(overrideId);

        if (localOverride) {
          // Conflict resolution: server always wins
          const resolved = this.resolveConflict(localOverride, remoteOverride);
          await this.set(overrideId, resolved);
          conflictsResolved++;
        } else {
          // New override
          await this.set(overrideId, remoteOverride);
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
   */
  protected resolveConflict(_local: TrialVisibilityOverrides, remote: TrialVisibilityOverrides): TrialVisibilityOverrides {
    // Server always wins for visibility config
    return remote;
  }

  /**
   * Get visibility overrides for a trial
   */
  async getByTrialId(trialId: string): Promise<TrialVisibilityOverrides | null> {
    const allOverrides = await this.getAll();
    return allOverrides.find((override) => override.trial_id === trialId) || null;
  }
}

// Singleton export
export const replicatedTrialVisibilityOverridesTable = new ReplicatedTrialVisibilityOverridesTable();
