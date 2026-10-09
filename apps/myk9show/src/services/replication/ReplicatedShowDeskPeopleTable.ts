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
import { supabase } from '@/services/database/supabaseClient';
import { PEOPLE_REPLICA_COLUMNS } from '@/services/database/users/peopleColumns';
import type { PersonPrivatePatch } from '@/services/database/users/personPrivate';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import { fetchLiveIdSet } from './liveIdSet';
import { afterCursorFilter, fetchUpdatedRowsInPages } from './updatedRowPages';
import {
  applyPersonColumns,
  buildQueuedPersonDelta,
  rowToPerson,
  type PersonReplicaRow,
  type ReplicatedShowDeskPerson,
} from './personRowMapping';

export type { ReplicatedShowDeskPerson };

/** The RPC a queued person save goes through, and its OCC argument (MYK9-1071). */
export const PERSON_QUEUED_UPDATE_RPC = 'update_person_details_versioned';

export interface ShowDeskPersonInput {
  id?: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  status?: string;
  /** The show whose add-entry flow created this person (MYK9-1059). INSERT only. */
  createdFromShowId?: string | null;
}

/**
 * People replica. Since MYK9-1071 it syncs every person RLS shows this user
 * (their own row for an exhibitor, the directory for staff), and a person save
 * queues the changed fields through `update_person_details_versioned`.
 */
export class ReplicatedShowDeskPeopleTable extends ReplicatedTable<ReplicatedShowDeskPerson> {
  private _lastMutationId: string | null = null;

  constructor() {
    super('people', { logger });
  }

  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /** Reads rows by id the way `sync` does (refusal re-pull). */
  protected override getRowRefetchAdapter(): RowRefetchAdapter<
    PersonReplicaRow,
    ReplicatedShowDeskPerson
  > {
    return {
      fetchRowsById: async ids => {
        const { data, error } = await supabase
          .from('people')
          .select(PEOPLE_REPLICA_COLUMNS)
          .is('deleted_at', null)
          .in('id', ids);
        if (error) throw new Error(`Supabase query failed: ${error.message}`);
        return (data ?? []) as PersonReplicaRow[];
      },
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToPerson,
    };
  }

  /** The public face of the refetch adapter, for the refusal re-pull (D3). */
  getRefetchAdapter(): RowRefetchAdapter<PersonReplicaRow, ReplicatedShowDeskPerson> {
    return this.getRowRefetchAdapter();
  }

  /** Unscoped: RLS decides (own row for an exhibitor, the directory for staff). */
  async sync(): Promise<SyncResult> {
    const adapter: SyncReplicatedTableAdapter<PersonReplicaRow, ReplicatedShowDeskPerson> = {
      ...this.getRowRefetchAdapter(),
      fetchRemoteRows: async ({ since }) =>
        fetchUpdatedRowsInPages<PersonReplicaRow>((cursor, pageSize) => {
          let query = supabase.from('people').select(PEOPLE_REPLICA_COLUMNS).is('deleted_at', null);
          query = cursor
            ? query.or(afterCursorFilter(cursor))
            : query.gt('updated_at', new Date(since).toISOString());
          return query
            .order('updated_at', { ascending: true })
            .order('id', { ascending: true })
            .limit(pageSize) as unknown as PromiseLike<{
            data: PersonReplicaRow[] | null;
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

    // A soft-deleted person drops out of RLS, so the incremental sync never sees
    // the tombstone. Reconcile against the live id set; never fail the download.
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
      let query = supabase.from('people').select('id').is('deleted_at', null);
      if (afterId !== undefined) query = query.gt('id', afterId);
      return query.order('id', { ascending: true }).limit(pageSize);
    });
    if (!liveIds) return 0;
    // A person created here and not yet uploaded is never stale.
    for (const person of await this.getAllOrThrow()) {
      if (person._localOnly) liveIds.add(person.id);
    }
    return this.removeStaleEntries(liveIds);
  }

  async getPersonById(id: string): Promise<ReplicatedShowDeskPerson | null> {
    return this.get(id);
  }

  async getPeopleByIds(ids: string[]): Promise<ReplicatedShowDeskPerson[]> {
    const wanted = new Set(ids);
    return (await this.getAllOrThrow()).filter(person => wanted.has(person.id));
  }

  /** True until this device has completed one people sync. */
  async isCold(): Promise<boolean> {
    const metadata = await this.getSyncMetadata();
    return !metadata?.lastFullSyncAt;
  }

  async createPerson(input: ShowDeskPersonInput): Promise<ReplicatedShowDeskPerson> {
    const id = input.id ?? crypto.randomUUID();
    const person: ReplicatedShowDeskPerson = {
      id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      zipCode: input.zipCode?.trim() || null,
      status: input.status ?? 'active',
      ...(input.createdFromShowId && { createdFromShowId: input.createdFromShowId }),
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(id, person, true);
    this._lastMutationId = await this.queueMutation('INSERT', id, this.toSupabaseRow(person));
    logger.log(`[${this.getTableName()}] Created show-desk person ${id}`);

    return person;
  }

  /**
   * Queue a person save (MYK9-1071): the changed PERSON_QUEUED_UPDATE_COLUMNS and
   * the private-details patch, through `update_person_details_versioned`. The OCC
   * token is filled at send time (`versionArg`), so a rebase reaches the server.
   * `people` keys outside the allowlist, email included, throw before anything is
   * written. The private patch is sent as given and never stored in the replica.
   * @returns the mutation id; null when nothing changed or no MutationManager.
   */
  async updatePerson(
    id: string,
    peopleUpdates: Record<string, unknown>,
    privatePatch: PersonPrivatePatch = {}
  ): Promise<string | null> {
    const current = await this.get(id);
    if (!current) throw new Error(`Person ${id} not found`);

    const delta = buildQueuedPersonDelta(current, peopleUpdates);
    if (Object.keys(delta).length === 0 && Object.keys(privatePatch).length === 0) return null;

    const updated: ReplicatedShowDeskPerson = {
      ...applyPersonColumns(current, delta),
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };
    await this.set(id, updated, true);
    const mutationId = await this.queueMutation('UPDATE', id, { id, ...delta }, undefined, {
      name: PERSON_QUEUED_UPDATE_RPC,
      args: {
        p_person_id: id,
        p_expected_version: null,
        p_people: delta,
        p_private: privatePatch,
      },
      versionArg: 'p_expected_version',
    });
    this._lastMutationId = mutationId;
    return mutationId;
  }

  /** Server wins: a clean local row takes the server copy (dirty rows are kept by the engine). */
  protected resolveConflict(
    _local: ReplicatedShowDeskPerson,
    remote: ReplicatedShowDeskPerson
  ): ReplicatedShowDeskPerson {
    return remote;
  }

  private toSupabaseRow(person: ReplicatedShowDeskPerson): Record<string, unknown> {
    return {
      id: person.id,
      first_name: person.firstName,
      last_name: person.lastName,
      email: person.email ?? null,
      phone: person.phone ?? null,
      street_address: person.address ?? null,
      city: person.city ?? null,
      state: person.state ?? null,
      zip_code: person.zipCode ?? null,
      status: person.status,
      ...(person.createdFromShowId && { created_from_show_id: person.createdFromShowId }),
      updated_at: new Date().toISOString(),
    };
  }
}

export const replicatedShowDeskPeopleTable = new ReplicatedShowDeskPeopleTable();
