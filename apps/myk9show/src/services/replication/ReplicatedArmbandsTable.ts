/**
 * ReplicatedArmbandsTable - Offline-first armband data replication for myK9Show
 *
 * Manages armband assignment data with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative: Armbands are assigned via RPC (assign_armband),
 *   so the server is always the source of truth.
 *
 * Sync Strategy:
 * - Full sync (no updated_at column on armbands table)
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';

/**
 * Database row type for armbands table
 */
interface ArmbandRow {
  id: string;
  show_id: string;
  trial_id: string | null;
  dog_id: string | null;
  entry_id: string | null;
  armband_number: string;
  assigned_at: string | null;
  is_available: boolean | null;
  created_at: string | null;
}

/**
 * App-level Armband type with camelCase fields and sync metadata
 */
export interface ReplicatedArmband {
  id: string;
  showId: string;
  trialId?: string | undefined;
  dogId?: string | undefined;
  entryId?: string | undefined;
  armbandNumber: string;
  assignedAt?: string | undefined;
  isAvailable?: boolean | undefined;
  createdAt?: string | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/**
 * Convert database row to app Armband type
 */
function rowToArmband(row: ArmbandRow): ReplicatedArmband {
  return {
    id: String(row.id),
    showId: String(row.show_id),
    trialId: row.trial_id ? String(row.trial_id) : undefined,
    dogId: row.dog_id ? String(row.dog_id) : undefined,
    entryId: row.entry_id ? String(row.entry_id) : undefined,
    armbandNumber: String(row.armband_number),
    assignedAt: row.assigned_at ?? undefined,
    isAvailable: row.is_available ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

export class ReplicatedArmbandsTable extends ReplicatedTable<ReplicatedArmband> {
  constructor() {
    super('armbands', undefined, { logger });
  }

  /**
   * Sync armbands from Supabase.
   * Full sync — armbands table has no updated_at column.
   */
  async sync(_licenseKey?: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      logger.log(`[${this.getTableName()}] Starting full sync`);

      // Full sync: fetch all armbands (only assigned ones, not available pool)
      const { data: remoteRows, error } = await supabase
        .from('armbands')
        .select('*')
        .eq('is_available', false)
        .order('created_at', { ascending: true });

      if (error) {
        errors.push(error.message);
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteRows || remoteRows.length === 0) {
        logger.log(`[${this.getTableName()}] No armbands found`);

        // Clear local cache since there are no remote armbands
        await this.clear();

        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
        });

        return {
          tableName: this.getTableName(),
          success: true,
          operation: 'full-sync',
          rowsAffected: 0,
          conflictsResolved: 0,
          duration: Date.now() - startTime,
        };
      }

      // Build a set of remote IDs for pruning
      const remoteIds = new Set(remoteRows.map(r => String(r.id)));

      // Prune local armbands that no longer exist remotely
      const localArmbands = await this.getAll();
      for (const local of localArmbands) {
        if (!remoteIds.has(local.id)) {
          await this.delete(local.id);
        }
      }

      // Process each armband
      for (const remoteRow of remoteRows) {
        const armbandId = String(remoteRow.id);
        const remoteArmband = rowToArmband(remoteRow as unknown as ArmbandRow);
        const localArmband = await this.get(armbandId);

        if (localArmband) {
          const resolved = this.resolveConflict(localArmband, remoteArmband);
          await this.set(armbandId, resolved);
          conflictsResolved++;
        } else {
          await this.set(armbandId, remoteArmband);
        }

        rowsSynced++;
      }

      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
      });

      const duration = Date.now() - startTime;
      logger.log(
        `[${this.getTableName()}] Sync complete: ${rowsSynced} rows, ${conflictsResolved} conflicts, ${duration}ms`
      );

      return {
        tableName: this.getTableName(),
        success: true,
        operation: 'full-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      await this.updateSyncMetadata({
        syncStatus: 'error',
        errorMessage,
      });

      logger.error(`[${this.getTableName()}] Sync failed:`, error);

      return {
        tableName: this.getTableName(),
        success: false,
        operation: 'full-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Conflict resolution: Server-authoritative
   * Armbands are assigned via RPC, server always wins.
   */
  protected resolveConflict(
    _local: ReplicatedArmband,
    remote: ReplicatedArmband
  ): ReplicatedArmband {
    return remote;
  }

  /**
   * Get all armbands for a specific show
   */
  async getByShow(showId: string): Promise<ReplicatedArmband[]> {
    const all = await this.getAll();
    return all.filter(a => a.showId === showId);
  }

  /**
   * Get all armbands for a specific dog
   */
  async getByDog(dogId: string): Promise<ReplicatedArmband[]> {
    const all = await this.getAll();
    return all.filter(a => a.dogId === dogId);
  }

  /**
   * Look up an armband by number within a show
   */
  async lookupByArmbandNumber(
    showId: string,
    armbandNumber: string
  ): Promise<ReplicatedArmband | null> {
    const showArmbands = await this.getByShow(showId);
    return showArmbands.find(a => a.armbandNumber === armbandNumber) ?? null;
  }
}

// Singleton export
export const replicatedArmbandsTable = new ReplicatedArmbandsTable();
