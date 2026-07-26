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
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import type { Database } from '@/types/supabase';
import { selectOwnedDogs } from '@/utils/dogOwnership';

interface DogRegistrationRpcInput {
  organization?: string | null;
  registered_name?: string | null;
  registration_number?: string | null;
  breed?: string | null;
  status?: string | null;
}

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
export function rowToDog(row: DogRow): ReplicatedDog {
  return {
    id: String(row.id),
    // MYK9-90 §5.2 — `dogs.name` is a nullable legacy alias and is NULL for
    // every dog created after that migration, so the replicated read falls back
    // to the (now NOT NULL) call name. This keeps the offline read identical to
    // the online one (`mapDatabaseToDog` applies the same fallback) and stops
    // any surface rendering `dog.name` from going blank. It is NOT a registered
    // name — that lives on `dog_registrations`.
    name: row.name ?? row.call_name ?? '',
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

/**
 * MYK9-90 §5.1 — refuse to create a dog that cannot satisfy the `dogs.call_name`
 * NOT NULL constraint, BEFORE anything is written to IndexedDB or queued.
 *
 * This is the last line of defence, not the first: `addDogSchema` rejects a
 * blank or whitespace-only call name at the form, and `resolveRequiredCallName`
 * rejects it at the mapper. It exists because this layer is the point of no
 * return — past `set` + `queueMutation` the user has been told the dog is saved
 * and, on the offline-first show-day path, there is no rollback and nobody left
 * to correct a mutation that dies at the server whenever sync next runs.
 *
 * A whitespace-only name is rejected here too. Trimming it into `''` and then
 * omitting the column (what `toSupabaseRow` does) is right for an UPDATE and
 * catastrophic for an INSERT.
 */
function assertQueueableCallName(dog: ReplicatedDog): void {
  const callName = dog.callName?.trim() || dog.name?.trim() || '';
  if (!callName) {
    throw new Error('A dog needs a call name.');
  }
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
    // MYK9-90 §5.1 — `dogs.call_name` is NOT NULL after 20260727110000. This
    // method returns `Record<string, unknown>`, so TypeScript cannot catch a
    // null here the way it does on the `DbDogInsert` paths — the queued
    // mutation would only fail when it reached the database, offline, after the
    // user had already been told the dog was saved. `ReplicatedDog.name` is a
    // derived non-empty display alias (see `rowToDog`), so it is the fallback.
    const callName = dog.callName?.trim() || dog.name?.trim() || '';

    return {
      id: dog.id,
      // MYK9-90 §5.3 — `name` is deliberately not written back. `ReplicatedDog.name`
      // is a read-side display alias that falls back to the call name (see
      // `rowToDog`), so writing it would copy the call name into the legacy
      // `dogs.name` column on every sync.
      //
      // Omitted rather than nulled when empty: on an UPDATE that leaves the
      // existing call name in place, and an INSERT with no name at all is
      // already prevented upstream (`mapDogInputToInsert` throws).
      ...(callName && { call_name: callName }),
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

  protected override rebuildUpdatePayload(dog: ReplicatedDog): Record<string, unknown> {
    return this.toSupabaseRow(dog);
  }

  async sync(syncScopeId: string): Promise<SyncResult> {
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
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      toLocalRow: rowToDog,
      rebuildUpdatePayload: dog => this.toSupabaseRow(dog),
      filterLocalRows: (rows, scope) =>
        scope.value ? rows.filter(r => r.ownerId === scope.value) : rows,
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
    };

    const result = await syncReplicatedTable(
      this,
      adapter,
      { value: syncScopeId },
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
      }
    );

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
        const removed = await this.reconcileDeleted(syncScopeId || undefined);
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
   * Strategy: fetch the COMPLETE set of live, RLS-permitted dog ids (a cheap,
   * index-only `select('id')`) and drop any non-dirty local row not in that set.
   * `removeStaleEntries` preserves dirty rows, so a pending local create/edit is
   * never wiped.
   *
   * The id fetch is paginated: PostgREST caps a response at ~1000 rows, and a staff
   * user (is_show_manager → RLS exposes every dog) can exceed that. An unpaginated
   * `select('id')` would silently truncate, and pruning against a partial set would
   * delete every valid cached dog beyond the first page.
   *
   * Pagination is KEYSET (`id > lastId` ordered by `id`), not offset (`.range()`):
   * offset pages can skip or duplicate rows when dogs are inserted/deleted between
   * page fetches, producing an incomplete liveIds set that over-prunes. A keyset
   * cursor on the unique PK is immune to that concurrent-write drift. If ANY page
   * errors we abort and prune nothing — never reconcile against an incomplete result.
   *
   * @param scopeValue Optional owner_id scope, mirroring the sync fetch filter.
   * @returns number of stale rows removed.
   */
  async reconcileDeleted(scopeValue?: string): Promise<number> {
    const PAGE_SIZE = 1000;
    // Bound the loop so a server that keeps returning full pages can't spin forever.
    const MAX_PAGES = 100;
    const liveIds = new Set<string>();
    let lastId: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabase.from('dogs').select('id').is('deleted_at', null);
      if (scopeValue) {
        query = query.eq('owner_id', scopeValue);
      }
      if (lastId !== undefined) {
        // Keyset cursor: fetch the next page strictly after the last id we saw.
        query = query.gt('id', lastId);
      }

      const { data, error } = await query.order('id', { ascending: true }).limit(PAGE_SIZE);
      if (error || !data) {
        // Any fetch failure → abort. Pruning against a partial set could wipe the replica.
        return 0;
      }

      for (const row of data) {
        liveIds.add(String((row as { id: string }).id));
      }

      if (data.length < PAGE_SIZE) {
        // Short page → we have the complete live id set; safe to reconcile.
        return this.removeStaleEntries(liveIds);
      }

      // Advance the cursor to the last id of this full page.
      lastId = String((data[data.length - 1] as { id: string }).id);
    }

    // Hit the page cap without a short page — treat as incomplete and prune nothing.
    logger.warn(
      `[${this.getTableName()}] reconcileDeleted exceeded ${MAX_PAGES} pages; skipping prune`
    );
    return 0;
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
    return selectOwnedDogs(allDogs, ownerId);
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
   * Create a new dog locally with a caller-supplied id (queued for sync).
   * The mutation ID is available via `lastMutationId`.
   */
  async createDogWithId(
    dog: ReplicatedDog,
    options: { dependsOn?: string[] } = {}
  ): Promise<ReplicatedDog> {
    assertQueueableCallName(dog);

    const newDog: ReplicatedDog = {
      ...dog,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(newDog.id, newDog, true);
    const mutationId = await this.queueMutation(
      'INSERT',
      newDog.id,
      this.toSupabaseRow(newDog),
      options.dependsOn
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new dog ${newDog.id}`);
    return newDog;
  }

  async createDogWithRegistrationsRpc(
    dog: ReplicatedDog,
    registrations: DogRegistrationRpcInput[],
    options: { dependsOn?: string[] } = {}
  ): Promise<ReplicatedDog> {
    assertQueueableCallName(dog);

    const newDog: ReplicatedDog = {
      ...dog,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };
    const dogRow = this.toSupabaseRow(newDog);

    await this.set(newDog.id, newDog, true);
    const mutationId = await this.queueMutation('INSERT', newDog.id, dogRow, options.dependsOn, {
      name: 'create_dog_with_registrations',
      args: {
        p_dog: dogRow,
        p_registrations: registrations,
      },
      expectRowId: true,
    });
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new dog ${newDog.id} via registration RPC`);
    return newDog;
  }

  /**
   * Create a new dog locally (queued for sync).
   * Dogs created without an owner dependency are uploaded independently.
   */
  async createDog(dog: Omit<ReplicatedDog, 'id'>): Promise<ReplicatedDog> {
    return this.createDogWithId({ ...dog, id: crypto.randomUUID() });
  }
}

// Singleton export
export const replicatedDogsTable = new ReplicatedDogsTable();
