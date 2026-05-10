/**
 * ReplicatedWaitlistEntriesTable - Offline-first waitlist data replication for myK9Show
 *
 * Manages waitlist entry data with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative: Waitlist positions and offers are managed server-side,
 *   so the server is always the source of truth.
 *
 * Sync Strategy:
 * - Incremental sync (waitlist_entries has updated_at column)
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';

/**
 * Database row type for waitlist_entries table
 */
interface WaitlistEntryRow {
  id: string;
  class_id: string;
  dog_id: string;
  exhibitor_id: string;
  handler_id: string | null;
  position: number;
  status: string | null;
  offered_at: string | null;
  offer_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * App-level WaitlistEntry type with camelCase fields and sync metadata
 */
export interface ReplicatedWaitlistEntry {
  id: string;
  classId: string;
  dogId: string;
  exhibitorId?: string | undefined;
  handlerId?: string | undefined;
  position: number;
  status: string; // 'waiting' | 'offered' | 'accepted' | 'expired' | 'declined'
  offeredAt?: string | undefined;
  offerExpiresAt?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/**
 * Convert database row to app WaitlistEntry type
 */
function rowToWaitlistEntry(row: WaitlistEntryRow): ReplicatedWaitlistEntry {
  return {
    id: String(row.id),
    classId: String(row.class_id),
    dogId: String(row.dog_id),
    exhibitorId: row.exhibitor_id ? String(row.exhibitor_id) : undefined,
    handlerId: row.handler_id ? String(row.handler_id) : undefined,
    position: row.position,
    status: row.status ?? 'waiting',
    offeredAt: row.offered_at ?? undefined,
    offerExpiresAt: row.offer_expires_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export class ReplicatedWaitlistEntriesTable extends ReplicatedTable<ReplicatedWaitlistEntry> {
  constructor() {
    super('waitlist_entries', undefined, { logger });
  }

  /**
   * Sync waitlist entries from Supabase.
   * Incremental sync using updated_at column.
   */
  async sync(_licenseKey?: string): Promise<SyncResult> {
    const startTime = Date.now();
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      const metadata = await this.getSyncMetadata();
      const allCached = await this.getAll();
      const isCacheEmpty = allCached.length === 0;
      const lastSync = isCacheEmpty ? 0 : metadata?.lastIncrementalSyncAt || 0;

      logger.log(`[${this.getTableName()}] Starting incremental sync`);

      const { data: remoteRows, error } = await supabase
        .from('waitlist_entries')
        .select('*')
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteRows || remoteRows.length === 0) {
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

      for (const remoteRow of remoteRows) {
        const entryId = String(remoteRow.id);
        const remoteEntry = rowToWaitlistEntry(remoteRow as unknown as WaitlistEntryRow);
        const localEntry = await this.get(entryId);

        if (localEntry) {
          const resolved = this.resolveConflict(localEntry, remoteEntry);
          await this.set(entryId, resolved);
          conflictsResolved++;
        } else {
          await this.set(entryId, remoteEntry);
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
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration,
      };
    } catch (error) {
      const errorMessage = getSyncErrorMessage(error);

      await this.updateSyncMetadata({
        syncStatus: 'error',
        errorMessage,
      });

      if (!isAbortSyncError(error)) {
        logger.error(`[${this.getTableName()}] Sync failed:`, error);
      }

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

  /**
   * Conflict resolution: Server-authoritative
   * Waitlist positions and offers are managed server-side, server always wins.
   */
  protected resolveConflict(
    _local: ReplicatedWaitlistEntry,
    remote: ReplicatedWaitlistEntry
  ): ReplicatedWaitlistEntry {
    return remote;
  }

  /**
   * Get all waitlist entries for a specific class
   */
  async getByClass(classId: string): Promise<ReplicatedWaitlistEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.classId === classId);
  }

  /**
   * Get all waitlist entries for a specific dog
   */
  async getByDog(dogId: string): Promise<ReplicatedWaitlistEntry[]> {
    const all = await this.getAll();
    return all.filter(e => e.dogId === dogId);
  }

  /**
   * Get a waitlist entry by ID
   */
  async getById(id: string): Promise<ReplicatedWaitlistEntry | null> {
    return this.get(id);
  }
}

// Singleton export
export const replicatedWaitlistEntriesTable = new ReplicatedWaitlistEntriesTable();
