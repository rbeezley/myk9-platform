/**
 * ReplicatedDogsTable - Offline-first dog data replication for myK9Show
 *
 * Manages dog data with offline support using @myk9/replication.
 *
 * Conflict Resolution:
 * - Server-authoritative for registration data
 * - Local changes to optional fields preserved
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
type DogRow = Database['public']['Tables']['dogs']['Row'];

/**
 * App-level Dog type with camelCase fields and sync metadata
 */
export interface ReplicatedDog {
  id: string;
  name: string;
  callName?: string | undefined;
  breed: string;
  sex?: string | undefined;
  dateOfBirth?: string | undefined;
  ownerId?: string | undefined;
  height?: string | undefined;
  weight?: string | undefined;
  color?: string | undefined;
  microchipNumber?: string | undefined;
  isSpayedNeutered?: boolean | undefined;
  imageUrl?: string | undefined;
  status?: string | undefined;
  deletedAt?: string | null | undefined;
  deleted_at?: string | null | undefined;
  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/**
 * Convert database row to app Dog type
 */
function rowToDog(row: DogRow): ReplicatedDog {
  return {
    id: String(row.id),
    name: row.name,
    callName: row.call_name ?? undefined,
    breed: row.breed,
    sex: row.sex ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    ownerId: row.owner_id ?? undefined,
    height: row.height ?? undefined,
    weight: row.weight ?? undefined,
    color: row.color ?? undefined,
    microchipNumber: row.microchip_number ?? undefined,
    isSpayedNeutered: row.spayed_neutered ?? undefined,
    imageUrl: row.image_url ?? undefined,
    status: row.status ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    deleted_at: row.deleted_at ?? undefined,
  };
}

export class ReplicatedDogsTable extends ReplicatedTable<ReplicatedDog> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;

  constructor() {
    super('dogs', undefined, { logger });
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /**
   * Convert app-level Dog to Supabase row format (snake_case).
   * Strips sync metadata fields. Dogs have no FK dependencies.
   */
  private toSupabaseRow(dog: ReplicatedDog): Record<string, unknown> {
    return {
      id: dog.id,
      name: dog.name,
      call_name: dog.callName ?? null,
      breed: dog.breed,
      sex: dog.sex ?? null,
      date_of_birth: dog.dateOfBirth ?? null,
      owner_id: dog.ownerId ?? null,
      height: dog.height ?? null,
      weight: dog.weight ?? null,
      color: dog.color ?? null,
      microchip_number: dog.microchipNumber ?? null,
      spayed_neutered: dog.isSpayedNeutered ?? null,
      image_url: dog.imageUrl ?? null,
      ...(dog.status !== undefined && { status: dog.status }),
      ...(dog.deletedAt !== undefined
        ? { deleted_at: dog.deletedAt }
        : dog.deleted_at !== undefined
          ? { deleted_at: dog.deleted_at }
          : {}),
      updated_at: new Date().toISOString(),
    };
  }

  async sync(licenseKey: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<DogRow, ReplicatedDog> = {
      fetchRemoteRows: async ({ scope, since }) => {
        let query = supabase
          .from('dogs')
          .select('*')
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        if (scope.value) {
          query = query.eq('owner_id', scope.value);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        return data ?? [];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToDog,
      filterLocalRows: (rows, scope) =>
        scope.value ? rows.filter(r => r.ownerId === scope.value) : rows,
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
    };

    const result = await syncReplicatedTable(this, adapter, { value: licenseKey });

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    // Right-to-erasure / tombstone cleanup. The dogs sync is incremental and the
    // dogs_select policy keeps `deleted_at IS NULL` in USING, so RLS hides
    // soft-deleted rows from the sync query — the client never receives the
    // tombstone and a deleted dog would otherwise linger in every cached replica
    // forever. Reconcile against the live id set instead. Side-effect only and
    // fully guarded: a failure here must never turn a successful download into a
    // failed sync.
    if (result.success) {
      try {
        const removed = await this.reconcileDeleted(licenseKey || undefined);
        if (removed > 0) {
          logger.log(`[${this.getTableName()}] reconcileDeleted removed ${removed} stale rows`);
        }
      } catch (err) {
        logger.warn(`[${this.getTableName()}] reconcileDeleted skipped`, err);
      }
    }

    return result;
  }

  /**
   * Remove locally-cached dogs the server no longer exposes to this user —
   * soft-deleted dogs (RLS filters `deleted_at IS NOT NULL` out of every read, so
   * incremental sync can never observe the tombstone), hard-deleted dogs, or dogs
   * that left the user's visibility scope.
   *
   * Strategy: fetch the full set of live, RLS-permitted dog ids (a cheap, index-only
   * `select('id')`) and drop any non-dirty local row not in that set.
   * `removeStaleEntries` preserves dirty rows, so a pending local create/edit is
   * never wiped. On a failed fetch we return 0 and prune nothing — never reconcile
   * against a partial/empty result, which would erase the whole replica.
   *
   * @param scopeValue Optional owner_id scope, mirroring the sync fetch filter.
   * @returns number of stale rows removed.
   */
  async reconcileDeleted(scopeValue?: string): Promise<number> {
    let query = supabase.from('dogs').select('id').is('deleted_at', null);
    if (scopeValue) {
      query = query.eq('owner_id', scopeValue);
    }

    const { data, error } = await query;
    if (error || !data) {
      // Treat any fetch failure as "unknown" — pruning here could wipe the replica.
      return 0;
    }

    const liveIds = new Set<string>(data.map(row => String((row as { id: string }).id)));
    return this.removeStaleEntries(liveIds);
  }

  /**
   * Conflict resolution for dogs - server wins, preserve local image
   */
  protected resolveConflict(local: ReplicatedDog, remote: ReplicatedDog): ReplicatedDog {
    return {
      ...remote,
      imageUrl: remote.imageUrl || local.imageUrl,
    };
  }

  /**
   * Get all dogs
   */
  async getAllDogs(): Promise<ReplicatedDog[]> {
    return this.getAll();
  }

  /**
   * Get dog by ID
   */
  async getDogById(dogId: string): Promise<ReplicatedDog | null> {
    return this.get(dogId);
  }

  /**
   * Get dogs by owner
   */
  async getDogsByOwner(ownerId: string): Promise<ReplicatedDog[]> {
    const allDogs = await this.getAll();
    return allDogs.filter(dog => dog.ownerId === ownerId);
  }

  /**
   * Search dogs by name
   */
  async searchDogs(query: string): Promise<ReplicatedDog[]> {
    const allDogs = await this.getAll();
    const lowerQuery = query.toLowerCase();

    return allDogs.filter(
      dog =>
        dog.name.toLowerCase().includes(lowerQuery) ||
        dog.callName?.toLowerCase().includes(lowerQuery) ||
        dog.breed.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get dogs by breed
   */
  async getDogsByBreed(breed: string): Promise<ReplicatedDog[]> {
    const allDogs = await this.getAll();
    return allDogs.filter(dog => dog.breed.toLowerCase() === breed.toLowerCase());
  }

  /**
   * Update dog (marks as dirty for sync)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateDog(dogId: string, updates: Partial<ReplicatedDog>): Promise<string | null> {
    const dog = await this.get(dogId);
    if (!dog) {
      throw new Error(`Dog ${dogId} not found`);
    }

    const updated: ReplicatedDog = {
      ...dog,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(dogId, updated, true);
    const mutationId = await this.queueMutation('UPDATE', dogId, this.toSupabaseRow(updated));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated dog ${dogId}`);
    return mutationId;
  }

  /**
   * Create a new dog locally (queued for sync)
   * Dogs have no FK dependencies — uploaded independently.
   * The mutation ID is available via `lastMutationId`.
   */
  async createDog(dog: Omit<ReplicatedDog, 'id'>): Promise<ReplicatedDog> {
    const id = crypto.randomUUID();
    const newDog: ReplicatedDog = {
      ...dog,
      id,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(id, newDog, true);
    const mutationId = await this.queueMutation('INSERT', id, this.toSupabaseRow(newDog));
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new dog ${id}`);
    return newDog;
  }
}

// Singleton export
export const replicatedDogsTable = new ReplicatedDogsTable();
