/**
 * ReplicatedClubsTable - Offline-first club data replication for myK9Show
 *
 * Manages club/organization data with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative: Club configuration comes from server
 * - Local edits queue as mutations for later sync
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';

/**
 * Database row type for clubs table
 * Note: Using manual type because Supabase types file has incorrect table name ('club' vs 'clubs')
 */
interface ClubRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  license_key: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

/**
 * App-level Club type with camelCase fields and sync metadata
 */
export interface ReplicatedClub {
  id: string;
  name: string;
  email: string;
  phone: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  // Sync metadata
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

/**
 * Convert database row to app Club type
 */
function rowToClub(row: ClubRow): ReplicatedClub {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    website: row.website ?? undefined,
    description: row.description ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    zipCode: row.zip_code ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export class ReplicatedClubsTable extends ReplicatedTable<ReplicatedClub> {
  constructor() {
    super('clubs', undefined, { logger });
  }

  /**
   * Sync clubs from Supabase
   * Note: Clubs don't have a license_key - all clubs are visible
   */
  async sync(_licenseKey?: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      // Get last sync timestamp
      const metadata = await this.getSyncMetadata();

      // Check if cache is empty - if so, force full sync from epoch
      const allCachedClubs = await this.getAll();
      const isCacheEmpty = allCachedClubs.length === 0;

      // If cache is empty but we have a lastSync timestamp, it means the cache was cleared
      const lastSync = isCacheEmpty ? 0 : (metadata?.lastIncrementalSyncAt || 0);

      logger.log(
        `[${this.getTableName()}] Starting ${isCacheEmpty ? 'FULL (empty cache)' : 'incremental'} sync (since ${new Date(lastSync).toISOString()}), cache: ${allCachedClubs.length} clubs`
      );

      // Fetch clubs updated since last sync (excluding soft-deleted)
      const { data: remoteClubs, error } = await supabase
        .from('clubs')
        .select('*')
        .is('deleted_at', null)
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (error) {
        errors.push(error.message);
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteClubs || remoteClubs.length === 0) {
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

      // Process each club
      for (const remoteRow of remoteClubs) {
        const clubId = String(remoteRow.id);
        const remoteClub = rowToClub(remoteRow as ClubRow);
        const localClub = await this.get(clubId);

        if (localClub) {
          // Conflict resolution: server always wins for club config
          const resolved = this.resolveConflict(localClub, remoteClub);
          await this.set(clubId, resolved);
          conflictsResolved++;
        } else {
          // New club
          await this.set(clubId, remoteClub);
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
   * Club configuration always comes from server
   */
  protected resolveConflict(_local: ReplicatedClub, remote: ReplicatedClub): ReplicatedClub {
    return remote;
  }

  /**
   * Get all clubs sorted by name
   */
  async getAllClubs(): Promise<ReplicatedClub[]> {
    const allClubs = await this.getAll();
    return allClubs.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get club by ID
   */
  async getClubById(clubId: string): Promise<ReplicatedClub | null> {
    return this.get(clubId);
  }

  /**
   * Search clubs by name
   */
  async searchClubs(searchTerm: string): Promise<ReplicatedClub[]> {
    const allClubs = await this.getAll();
    const term = searchTerm.toLowerCase();
    return allClubs
      .filter(club =>
        club.name.toLowerCase().includes(term) ||
        club.email?.toLowerCase().includes(term) ||
        club.city?.toLowerCase().includes(term)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Update club (marks as dirty for later sync)
   */
  async updateClub(clubId: string, updates: Partial<ReplicatedClub>): Promise<void> {
    const currentClub = await this.get(clubId);
    if (!currentClub) {
      throw new Error(`Club ${clubId} not found`);
    }

    const updatedClub: ReplicatedClub = {
      ...currentClub,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(clubId, updatedClub, true); // Mark as dirty
    logger.log(`[${this.getTableName()}] Updated club ${clubId}`);
  }

  /**
   * Create a new club locally (queued for sync)
   */
  async createClub(club: Omit<ReplicatedClub, 'id'>): Promise<ReplicatedClub> {
    const id = crypto.randomUUID();
    const newClub: ReplicatedClub = {
      ...club,
      id,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(id, newClub, true); // Mark as dirty
    logger.log(`[${this.getTableName()}] Created new club ${id}`);
    return newClub;
  }

  /**
   * Delete club locally (soft delete, queued for sync)
   */
  async deleteClubLocal(clubId: string): Promise<void> {
    await this.delete(clubId);
    logger.log(`[${this.getTableName()}] Deleted club ${clubId} from local cache`);
  }
}

// Singleton export
export const replicatedClubsTable = new ReplicatedClubsTable();
