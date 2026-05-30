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

import {
  ReplicatedTable,
  syncReplicatedTable,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';

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
    logger.log(`[${this.getTableName()}] Starting full sync`);

    const adapter: SyncReplicatedTableAdapter<ArmbandRow, ReplicatedArmband> = {
      fetchRemoteRows: async () => {
        const { data, error } = await supabase
          .from('armbands')
          .select('*')
          .eq('is_available', false)
          .order('created_at', { ascending: true });

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        return (data ?? []) as unknown as ArmbandRow[];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToArmband,
      resolveConflict: (_local, remote) => remote,
      shouldCleanupStaleRows: true,
    };

    const result = await syncReplicatedTable(this, adapter, {}, { forceFullSync: true });

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    return result;
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
