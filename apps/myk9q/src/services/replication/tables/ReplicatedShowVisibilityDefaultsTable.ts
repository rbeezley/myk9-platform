/**
 * ReplicatedShowVisibilityDefaultsTable - Offline-first show visibility config
 *
 * Manages show-level default visibility settings for result fields
 * (time, scores, placements, etc.) with offline support.
 *
 * Conflict Resolution:
 * - Server-authoritative: All visibility config comes from server
 * - Use case: Show admins configure visibility, no client conflicts
 *
 * **Phase 3 Day 15** - Visibility config tables
 */

import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

export interface ShowVisibilityDefaults {
  id: string;
  show_id: string;

  // Field visibility flags
  show_time?: boolean;
  show_faults?: boolean;
  show_placement?: boolean;
  show_score?: boolean;
  show_judge_comments?: boolean;
  show_handler_info?: boolean;
  show_dog_info?: boolean;

  // Access control
  public_access?: boolean;
  exhibitor_access?: boolean;
  require_authentication?: boolean;

  license_key: string;
  created_at?: string;
  updated_at?: string;
}

export class ReplicatedShowVisibilityDefaultsTable extends ReplicatedTable<ShowVisibilityDefaults> {
  constructor() {
    super('show_result_visibility_defaults'); // TTL managed by feature flags
  }

  /**
   * Sync visibility defaults from Supabase
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

      // Fetch visibility defaults updated since last sync
      const { data: remoteDefaults, error } = await supabase
        .from('show_result_visibility_defaults')
        .select('*')
        .eq('license_key', licenseKey)
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (error) {
        errors.push(error.message);
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteDefaults || remoteDefaults.length === 0) {
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

      // Process each default
      for (const remoteDefault of remoteDefaults) {
        // Convert ID to string for consistent IndexedDB key format
        const defaultId = String(remoteDefault.id);
        const localDefault = await this.get(defaultId);

        if (localDefault) {
          // Conflict resolution: server always wins
          const resolved = this.resolveConflict(localDefault, remoteDefault);
          await this.set(defaultId, resolved);
          conflictsResolved++;
        } else {
          // New default
          await this.set(defaultId, remoteDefault);
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
  protected resolveConflict(_local: ShowVisibilityDefaults, remote: ShowVisibilityDefaults): ShowVisibilityDefaults {
    // Server always wins for visibility config
    return remote;
  }

  /**
   * Get visibility defaults for a show
   */
  async getByShowId(showId: string): Promise<ShowVisibilityDefaults | null> {
    const allDefaults = await this.getAll();
    return allDefaults.find((def) => def.show_id === showId) || null;
  }
}

// Singleton export
export const replicatedShowVisibilityDefaultsTable = new ReplicatedShowVisibilityDefaultsTable();
