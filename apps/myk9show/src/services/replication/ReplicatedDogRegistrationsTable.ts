import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  type RowRefetchAdapter,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import type { DogInput } from '@/store/dogStore';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import { fetchLiveIdSet } from './liveIdSet';
import { afterCursorFilter, fetchUpdatedRowsInPages } from './updatedRowPages';
import {
  DOG_REGISTRATION_REPLICA_COLUMNS,
  registrationToRow,
  registrationToUpdatePayload,
  rowToRegistration,
  type DogRegistrationRow,
  type RegistrationEditableFields,
  type ReplicatedDogRegistration,
} from './dogRegistrationRowMapping';

export type { ReplicatedDogRegistration, RegistrationEditableFields };

export const REGISTRATION_STILL_BEING_CREATED =
  'This registration is still being created with its dog. Edit it again once the dog has synced.';

type RegistrationInput = NonNullable<DogInput['registrations']>[number];

/** A registration add with every field the add panels collect (MYK9-1071). */
export type RegistrationAddFields = Partial<RegistrationEditableFields> & {
  organization: string;
  registrationNumber: string;
};

/**
 * Distinct, ordered creation timestamps for a batch.
 *
 * A plain `new Date().toISOString()` per row ties when several registrations are
 * created in the same millisecond — which is the normal case for a batch — and a
 * tie sends the resolver to its `id` (random UUID) tiebreak. Offsetting by index
 * keeps creation ORDER, so the first registration entered stays primary.
 */
export function createRegistrationTimestamps(count: number): string[] {
  const base = Date.now();
  return Array.from({ length: count }, (_, i) => new Date(base + i).toISOString());
}

function normalizeRegistration(
  input: RegistrationInput,
  createdAt: string
): Omit<ReplicatedDogRegistration, 'id'> {
  return {
    dogId: '',
    organization: input.organization || 'AKC',
    registrationNumber: input.number || '',
    registeredName: input.registeredName || null,
    breed: input.type || null,
    status: input.status || 'pending',
    verified: false,
    // Stamped at construction, NOT left for the server default. The identity
    // resolver orders by `created_at`, so without it a dog created offline with
    // several registrations resolved by random UUID rather than creation order
    // until a server round trip (MYK9-90 review round 3).
    createdAt,
  };
}

/**
 * Registrations replica. Since MYK9-1071 it syncs every registration RLS shows
 * this user (dog_registrations_select follows dog visibility, so this matches
 * the dogs replica), and edits queue a full-row UPDATE with the `version` OCC
 * precondition, exactly like dogs.
 */
export class ReplicatedDogRegistrationsTable extends ReplicatedTable<ReplicatedDogRegistration> {
  constructor() {
    super('dog_registrations', { logger });
  }

  protected override rebuildUpdatePayload(
    registration: ReplicatedDogRegistration
  ): Record<string, unknown> {
    return registrationToUpdatePayload(registration);
  }

  /** Reads rows by id the way `sync` does (stale-OCC re-fetch, MYK9-771). */
  protected override getRowRefetchAdapter(): RowRefetchAdapter<
    DogRegistrationRow,
    ReplicatedDogRegistration
  > {
    return {
      fetchRowsById: async ids => {
        const { data, error } = await supabase
          .from('dog_registrations')
          .select(DOG_REGISTRATION_REPLICA_COLUMNS)
          .in('id', ids);
        if (error) throw new Error(`Supabase query failed: ${error.message}`);
        return (data ?? []) as DogRegistrationRow[];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToRegistration,
      rebuildUpdatePayload: registration => registrationToUpdatePayload(registration),
    };
  }


  /** Unscoped: RLS decides, so the replica holds what the online read shows. */
  async sync(): Promise<SyncResult> {
    const adapter: SyncReplicatedTableAdapter<DogRegistrationRow, ReplicatedDogRegistration> = {
      ...this.getRowRefetchAdapter(),
      fetchRemoteRows: async ({ since }) =>
        fetchUpdatedRowsInPages<DogRegistrationRow>((cursor, pageSize) => {
          let query = supabase.from('dog_registrations').select(DOG_REGISTRATION_REPLICA_COLUMNS);
          query = cursor
            ? query.or(afterCursorFilter(cursor))
            : query.gt('updated_at', new Date(since).toISOString());
          return query
            .order('updated_at', { ascending: true })
            .order('id', { ascending: true })
            .limit(pageSize) as unknown as PromiseLike<{
            data: DogRegistrationRow[] | null;
            error: { message: string } | null;
          }>;
        }),
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
    };

    // A replica populated by an earlier build (local creates only) is not empty,
    // so the engine would sync incrementally and never record lastFullSyncAt:
    // isCold() would stay true for good. Force a full sync until one completes.
    const coverageEstablished = !(await this.isCold());
    const result = await syncReplicatedTable(
      this,
      adapter,
      { value: '' },
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
        ...(!coverageEstablished && { forceFullSync: true }),
      }
    );

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    // Registrations are hard-deleted, and a soft-deleted dog's registrations drop
    // out of RLS, so an incremental sync never sees either. Reconcile against the
    // live id set. Side effect only: a failure never fails the download.
    if (result.success) {
      try {
        await this.reconcileDeleted();
      } catch (err) {
        logger.warn(`[${this.getTableName()}] reconcileDeleted skipped`, err);
      }
    }

    return result;
  }

  /** Drop clean local rows the server no longer shows; prune nothing on a partial read. */
  async reconcileDeleted(): Promise<number> {
    const liveIds = await fetchLiveIdSet((afterId, pageSize) => {
      let query = supabase.from('dog_registrations').select('id');
      if (afterId !== undefined) query = query.gt('id', afterId);
      return query.order('id', { ascending: true }).limit(pageSize);
    });
    if (!liveIds) return 0;
    // `createLocalRegistrationsForDog` mirrors are never uploaded themselves (the
    // dog's create_dog_with_registrations RPC carries them, under server ids), so
    // they are clean, local-only, and absent from the server set. Keep them: the
    // merged read uses them for creation order (overlayLocalCreationOrder).
    for (const registration of await this.getAllOrThrow()) {
      if (registration._localOnly) liveIds.add(registration.id);
    }
    return this.removeStaleEntries(liveIds);
  }

  /** Server wins: a clean local row takes the server copy (dirty rows are kept by the engine). */
  protected resolveConflict(
    _local: ReplicatedDogRegistration,
    remote: ReplicatedDogRegistration
  ): ReplicatedDogRegistration {
    return remote;
  }

  /** True until this device has completed one registrations sync. */
  async isCold(): Promise<boolean> {
    const metadata = await this.getSyncMetadata();
    return !metadata?.lastFullSyncAt;
  }

  async getRegistrationById(id: string): Promise<ReplicatedDogRegistration | null> {
    return this.get(id);
  }

  async getLocalRegistrationsForDog(dogId: string): Promise<ReplicatedDogRegistration[]> {
    return (await this.getAllOrThrow()).filter(registration => registration.dogId === dogId);
  }

  /**
   * Edit a registration: local write plus a queued full-row UPDATE carrying the
   * row's server version (MYK9-1071). The caller makes sure the row is in the
   * replica first (useReplicaRowForEdit).
   * @returns the mutation id, or null with no MutationManager.
   */
  async updateRegistration(
    id: string,
    updates: Partial<RegistrationEditableFields>
  ): Promise<string | null> {
    const current = await this.get(id);
    if (!current) throw new Error(`Registration ${id} not found`);
    // A local-only row with no INSERT of its own queued is a mirror of a
    // registration the dog's create RPC sends under a SERVER id: an UPDATE of
    // this id would target a row that never exists. Refuse it explicitly.
    if (current._localOnly && (await this.getPendingMutationIdsForRow(id)).length === 0) {
      throw new Error(REGISTRATION_STILL_BEING_CREATED);
    }

    const updated: ReplicatedDogRegistration = {
      ...current,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };
    await this.set(id, updated, true);
    return this.queueMutation('UPDATE', id, registrationToUpdatePayload(updated));
  }

  /** Add one registration with every field the add panels collect (queued INSERT). */
  async addRegistration(
    dogId: string,
    fields: RegistrationAddFields,
    options: { dependsOn?: string[] } = {}
  ): Promise<ReplicatedDogRegistration> {
    const createdAt = new Date().toISOString();
    const registration: ReplicatedDogRegistration = {
      status: 'pending',
      verified: false,
      ...fields,
      id: crypto.randomUUID(),
      dogId,
      createdAt,
      _version: 1,
      _lastModified: new Date(createdAt),
      _syncStatus: 'pending',
      _localOnly: true,
    };
    await this.set(registration.id, registration, true);
    await this.queueMutation(
      'INSERT',
      registration.id,
      registrationToRow(registration),
      options.dependsOn
    );
    return registration;
  }

  async createRegistrationsForDog(
    dogId: string,
    registrations: RegistrationInput[],
    options: { dependsOn?: string[] } = {}
  ): Promise<ReplicatedDogRegistration[]> {
    const saved: ReplicatedDogRegistration[] = [];

    // `createdAt` comes from `creationTimestamps`, NOT from a per-row
    // `new Date()`: rows created in the same millisecond would tie, and a tie
    // sends the resolver back to its random-UUID tiebreak.
    const createdAts = createRegistrationTimestamps(registrations.length);
    for (const [index, input] of registrations.entries()) {
      const normalized = normalizeRegistration(input, createdAts[index]!);
      const registration: ReplicatedDogRegistration = {
        ...normalized,
        dogId,
        id: crypto.randomUUID(),
        _version: 1,
        _lastModified: new Date(normalized.createdAt),
        _syncStatus: 'pending',
        _localOnly: true,
      };

      await this.set(registration.id, registration, true);
      await this.queueMutation(
        'INSERT',
        registration.id,
        this.toSupabaseRow(registration),
        options.dependsOn
      );
      saved.push(registration);
    }

    return saved;
  }

  async createLocalRegistrationsForDog(
    dogId: string,
    registrations: RegistrationInput[]
  ): Promise<ReplicatedDogRegistration[]> {
    const saved: ReplicatedDogRegistration[] = [];

    // `createdAt` comes from `creationTimestamps`, NOT from a per-row
    // `new Date()`: rows created in the same millisecond would tie, and a tie
    // sends the resolver back to its random-UUID tiebreak.
    const createdAts = createRegistrationTimestamps(registrations.length);
    for (const [index, input] of registrations.entries()) {
      const normalized = normalizeRegistration(input, createdAts[index]!);
      const registration: ReplicatedDogRegistration = {
        ...normalized,
        dogId,
        id: crypto.randomUUID(),
        _version: 1,
        _lastModified: new Date(normalized.createdAt),
        _syncStatus: 'pending',
        _localOnly: true,
      };

      await this.set(registration.id, registration, false);
      saved.push(registration);
    }

    return saved;
  }

  async getPendingMutationIdsForDog(dogId: string): Promise<string[]> {
    const registrations = await this.getLocalRegistrationsForDog(dogId);
    const pendingIds = await Promise.all(
      registrations.map(registration => this.getPendingMutationIdsForRow(registration.id))
    );

    return pendingIds.flat();
  }

  /**
   * This device's UNSENT registration rows for these dogs: local-only rows (a
   * queued add, or a mirror of a dog's create RPC) and queued edits. The
   * registration readers stay on PostgREST and overlay exactly these (MYK9-1071),
   * so a row the server has, or has since deleted, is never read from here.
   */
  async getRegistrationsForDogs(dogIds: string[]): Promise<Record<string, unknown>[]> {
    if (dogIds.length === 0) return [];

    const dogIdSet = new Set(dogIds);
    const registrations = await this.getAllOrThrow();
    return registrations
      .filter(
        registration =>
          dogIdSet.has(registration.dogId) &&
          (registration._localOnly === true || registration._syncStatus === 'pending')
      )
      .map(registration => this.toSupabaseRow(registration));
  }

  async getRegistrationsForDog(dogId: string): Promise<Record<string, unknown>[]> {
    return this.getRegistrationsForDogs([dogId]);
  }

  toSupabaseRow(registration: ReplicatedDogRegistration): Record<string, unknown> {
    return registrationToRow(registration);
  }
}

export const replicatedDogRegistrationsTable = new ReplicatedDogRegistrationsTable();
