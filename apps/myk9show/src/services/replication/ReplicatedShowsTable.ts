/**
 * ReplicatedShowsTable - Offline-first show data replication for myK9Show
 *
 * Manages show/event containers with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative: Show configuration comes from server
 * - Local edits queue as mutations for later sync
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema
 */
type ShowRow = Database['public']['Tables']['shows']['Row'];

/**
 * App-level Show type with camelCase fields and sync metadata
 */
export interface ReplicatedShow {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location?: string;
  status?: string;
  entryOpenDate?: string;
  entryCloseDate?: string;
  preEntryFee?: number;
  dayOfShowFee?: number;
  clubId?: string;
  chairman?: string;
  secretary?: string;
  chiefSteward?: string;
  maxEntriesPerDog?: number;
  maxTotalEntries?: number;
  allowsNonOwnerHandlers?: boolean;
  // Sync metadata
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

/**
 * Convert database row to app Show type
 */
function rowToShow(row: ShowRow): ReplicatedShow {
  return {
    id: String(row.id),
    name: row.name,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location ?? undefined,
    status: row.status ?? undefined,
    entryOpenDate: row.entry_open_date ?? undefined,
    entryCloseDate: row.entry_close_date ?? undefined,
    preEntryFee: row.pre_entry_fee ?? undefined,
    dayOfShowFee: row.day_of_show_fee ?? undefined,
    clubId: row.club_id ?? undefined,
    chairman: row.chairman ?? undefined,
    secretary: row.secretary ?? undefined,
    chiefSteward: row.chief_steward ?? undefined,
    maxEntriesPerDog: row.max_entries_per_dog ?? undefined,
    maxTotalEntries: row.max_total_entries ?? undefined,
    allowsNonOwnerHandlers: row.allow_non_owner_handlers ?? undefined,
  };
}

export class ReplicatedShowsTable extends ReplicatedTable<ReplicatedShow> {
  constructor() {
    super('shows', undefined, { logger });
  }

  /**
   * Sync shows from Supabase
   */
  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      // Get last sync timestamp
      const metadata = await this.getSyncMetadata();

      // Check if cache is empty - if so, force full sync from epoch
      const allCachedShows = await this.getAll();
      const isCacheEmpty = allCachedShows.length === 0;

      // If cache is empty but we have a lastSync timestamp, it means the cache was cleared
      const lastSync = isCacheEmpty ? 0 : (metadata?.lastIncrementalSyncAt || 0);

      logger.log(
        `[${this.getTableName()}] Starting ${isCacheEmpty ? 'FULL (empty cache)' : 'incremental'} sync (since ${new Date(lastSync).toISOString()}), cache: ${allCachedShows.length} shows`
      );

      // Fetch shows updated since last sync
      // Note: myK9Show may not have license_key column, adjust query as needed
      let query = supabase
        .from('shows')
        .select('*')
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      // Add license key filter if available (for multi-tenant isolation)
      if (licenseKey) {
        query = query.eq('club_id', licenseKey);
      }

      const { data: remoteShows, error } = await query;

      if (error) {
        errors.push(error.message);
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteShows || remoteShows.length === 0) {
        logger.log(`[${this.getTableName()}] No updates found`);

        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
          errorMessage: undefined,
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

      // Process each show
      for (const remoteRow of remoteShows) {
        const showId = String(remoteRow.id);
        const remoteShow = rowToShow(remoteRow as ShowRow);
        const localShow = await this.get(showId);

        if (localShow) {
          // Conflict resolution: server always wins for show config
          const resolved = this.resolveConflict(localShow, remoteShow);
          await this.set(showId, resolved);
          conflictsResolved++;
        } else {
          // New show
          await this.set(showId, remoteShow);
        }

        rowsSynced++;
      }

      // Update sync metadata
      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
        errorMessage: undefined,
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
   * Show configuration always comes from server
   */
  protected resolveConflict(_local: ReplicatedShow, remote: ReplicatedShow): ReplicatedShow {
    return remote;
  }

  /**
   * Get all shows sorted by start date
   */
  async getAllShows(): Promise<ReplicatedShow[]> {
    const allShows = await this.getAll();
    return allShows.sort((a, b) =>
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }

  /**
   * Get show by ID
   */
  async getShowById(showId: string): Promise<ReplicatedShow | null> {
    return this.get(showId);
  }

  /**
   * Get shows by club
   */
  async getShowsByClub(clubId: string): Promise<ReplicatedShow[]> {
    const allShows = await this.getAll();
    return allShows
      .filter(show => show.clubId === clubId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  /**
   * Get upcoming shows
   */
  async getUpcomingShows(): Promise<ReplicatedShow[]> {
    const allShows = await this.getAll();
    const now = Date.now();

    return allShows
      .filter(show => new Date(show.startDate).getTime() >= now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  /**
   * Get active shows (currently ongoing)
   */
  async getActiveShows(): Promise<ReplicatedShow[]> {
    const allShows = await this.getAll();
    const now = Date.now();

    return allShows
      .filter(show => {
        const start = new Date(show.startDate).getTime();
        const end = new Date(show.endDate).getTime();
        return start <= now && end >= now;
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  /**
   * Update show (marks as dirty for later sync)
   */
  async updateShow(showId: string, updates: Partial<ReplicatedShow>): Promise<void> {
    const currentShow = await this.get(showId);
    if (!currentShow) {
      throw new Error(`Show ${showId} not found`);
    }

    const updatedShow: ReplicatedShow = {
      ...currentShow,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(showId, updatedShow, true); // Mark as dirty
    logger.log(`[${this.getTableName()}] Updated show ${showId}`);
  }

  /**
   * Create a new show locally (queued for sync)
   */
  async createShow(show: Omit<ReplicatedShow, 'id'>): Promise<ReplicatedShow> {
    const id = crypto.randomUUID();
    const newShow: ReplicatedShow = {
      ...show,
      id,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(id, newShow, true); // Mark as dirty
    logger.log(`[${this.getTableName()}] Created new show ${id}`);
    return newShow;
  }
}

// Singleton export
export const replicatedShowsTable = new ReplicatedShowsTable();
