/**
 * ReplicatedClubsTable - Offline-first club data replication for myK9Show
 *
 * Manages club/organization data with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative: Club configuration comes from server
 * - Local edits queue as mutations for later sync
 */

import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';

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
  club_number?: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  license_key?: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  // MYK9-572
  authorized_at: string | null;
  // Add other common fields returned by Supabase to avoid type mismatch
  [key: string]: string | null | undefined;
}

/**
 * App-level Club type with camelCase fields and sync metadata
 */
export interface ReplicatedClub {
  id: string;
  name: string;
  email: string;
  phone: string;
  website?: string | undefined;
  description?: string | undefined;
  logoUrl?: string | undefined;
  address?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  zipCode?: string | undefined;
  clubNumber?: string | undefined;
  coverImageUrl?: string | undefined;
  accentColor?: string | undefined;
  // Timestamps
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  // MYK9-572: null = not yet authorized by a site admin. See the matching
  // field on the app-level Club type (club-types.ts) for the full contract —
  // set/cleared only by set_club_authorization(), never written by the
  // client.
  authorizedAt?: string | null | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/**
 * Convert database row to app Club type
 */
export function rowToClub(row: ClubRow): ReplicatedClub {
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
    clubNumber: row.club_number ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    accentColor: row.accent_color ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    authorizedAt: row.authorized_at,
  };
}

export class ReplicatedClubsTable extends ReplicatedTable<ReplicatedClub> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;

  constructor() {
    super('clubs', { logger });
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /**
   * Convert app-level Club to Supabase row format (snake_case).
   * Strips sync metadata fields. Clubs have no FK dependencies.
   */
  private toSupabaseRow(club: ReplicatedClub): Record<string, unknown> {
    return {
      id: club.id,
      name: club.name,
      email: club.email || null,
      phone: club.phone || null,
      website: club.website ?? null,
      description: club.description ?? null,
      logo_url: club.logoUrl ?? null,
      address: club.address ?? null,
      city: club.city ?? null,
      state: club.state ?? null,
      zip_code: club.zipCode ?? null,
      club_number: club.clubNumber ?? null,
      cover_image_url: club.coverImageUrl ?? null,
      accent_color: club.accentColor ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  protected override rebuildUpdatePayload(club: ReplicatedClub): Record<string, unknown> {
    return this.toSupabaseRow(club);
  }

  /**
   * Sync clubs from Supabase.
   * Note: clubs have no license_key scope — all clubs are visible.
   */
  async sync(_syncScopeId?: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<ClubRow, ReplicatedClub> = {
      fetchRemoteRows: async ({ since }) => {
        const { data, error } = await supabase
          .from('clubs')
          .select('*')
          .is('deleted_at', null)
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        return (data ?? []) as unknown as ClubRow[];
      },
      getRemoteId: remote => String(remote.id),
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      toLocalRow: rowToClub,
      rebuildUpdatePayload: club => this.toSupabaseRow(club),
      resolveConflict: (_local, remote) => remote,
    };

    const result = await syncReplicatedTable(
      this,
      adapter,
      {},
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
      }
    );

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    // MYK9-572: reconcile against RLS visibility. The incremental pull above
    // only ever ADDS/UPDATES rows still visible to this caller — it has no
    // tombstone signal for a row that fell OUT of clubs_select (a club whose
    // authorization was revoked, or whose caller's own club_members row
    // lapsed), so without this a revoked club would linger forever in a
    // guest's cached public directory (BrowseClubsPage). Side-effect only
    // and fully guarded: a failure here must never turn a successful
    // download into a failed sync.
    if (result.success) {
      try {
        const removed = await this.reconcileVisibility();
        if (removed > 0) {
          logger.log(`[${this.getTableName()}] reconcileVisibility removed ${removed} stale rows`);
        }
      } catch (err) {
        logger.warn(`[${this.getTableName()}] reconcileVisibility skipped`, err);
      }
    }

    return result;
  }

  /**
   * Remove locally-cached clubs this caller can no longer see under
   * clubs_select — a club whose authorization was revoked, or whose caller's
   * own club_members/club_admin grant lapsed. Strategy mirrors
   * ReplicatedDogsTable.reconcileDeleted(): fetch the complete set of
   * currently-visible ids and drop any non-dirty local row not in it
   * (removeStaleEntries preserves dirty rows, so a pending local edit is
   * never wiped). Unlike dogs, this is a single unpaginated `select('id')` —
   * the clubs table is small, well under PostgREST's page cap.
   *
   * @returns number of stale rows removed.
   */
  async reconcileVisibility(): Promise<number> {
    const { data, error } = await supabase.from('clubs').select('id').is('deleted_at', null);
    if (error || !data) {
      // Any fetch failure → prune nothing. Pruning against a partial/absent
      // set could wipe rows that are still perfectly visible.
      return 0;
    }

    const liveIds = new Set(data.map(row => String((row as { id: string }).id)));
    return this.removeStaleEntries(liveIds);
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
      .filter(
        club =>
          club.name.toLowerCase().includes(term) ||
          club.email?.toLowerCase().includes(term) ||
          club.city?.toLowerCase().includes(term)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Update club (marks as dirty for later sync)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateClub(clubId: string, updates: Partial<ReplicatedClub>): Promise<string | null> {
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
    const mutationId = await this.queueMutation('UPDATE', clubId, this.toSupabaseRow(updatedClub));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated club ${clubId}`);
    return mutationId;
  }

  /**
   * Create a new club locally (queued for sync)
   * Clubs have no FK dependencies — uploaded independently.
   * The mutation ID is available via `lastMutationId`.
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
    const mutationId = await this.queueMutation('INSERT', id, this.toSupabaseRow(newClub));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new club ${id}`);
    return newClub;
  }

  /**
   * Delete club locally (soft delete, queued for sync)
   */
  async deleteClubLocal(clubId: string): Promise<void> {
    await this.queueMutation('DELETE', clubId, {
      id: clubId,
      deleted_at: new Date().toISOString(),
    });
    await this.delete(clubId);
    logger.log(`[${this.getTableName()}] Deleted club ${clubId} from local cache`);
  }
}

// Singleton export
export const replicatedClubsTable = new ReplicatedClubsTable();
