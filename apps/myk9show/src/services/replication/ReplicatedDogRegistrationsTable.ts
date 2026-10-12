/**
 * ReplicatedDogRegistrationsTable - the device's copy of every registration
 * this account can read (MYK9-1090).
 *
 * Sync is two passes: an incremental changes pass keyed on (updated_at, id),
 * then an ID pass that fetches rows that came into view without an edit and
 * removes rows that left it (see `dogRegistrationsIdPass.ts`). Writes in this
 * release still go straight to PostgREST; each one is mirrored here at once
 * (`applyServerRows` / `removeDeletedOnServer`) so the replica-backed readers
 * show it without waiting for a sync.
 *
 * Conflict resolution: the dogs rule. A clean row takes the server copy; a
 * dirty row goes through the package's `reconcileDirtyRemoteRow`.
 */
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
import type { DogInput } from '@/store/dogStore';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import {
  DOG_REGISTRATION_SELECT,
  DOG_REGISTRATIONS_PAGE_SIZE,
  buildRegistrationUpdatePayload,
  registrationToDbRow,
  rowToRegistration,
  visibleRegistrationRows,
  type DogRegistrationReadRow,
  type DogRegistrationRow,
  type ReplicatedDogRegistration,
} from './dogRegistrationRows';
import {
  fetchVisibleRegistrationIds,
  pruneRegistrationsMissingFromServer,
  snapshotRegistrationRevisions,
} from './dogRegistrationsIdPass';

export type { DogRegistrationReadRow, DogRegistrationRow, ReplicatedDogRegistration };

type RegistrationInput = NonNullable<DogInput['registrations']>[number];

/**
 * What the replica can say about some dogs' registrations. `warm` is an
 * answer, an empty one included. `cold` (never fully synced on this device)
 * and `unreadable` are not: the caller asks the server or reports an error,
 * never "no registrations".
 */
export type RegistrationReplicaRead =
  | { state: 'warm'; rows: DogRegistrationReadRow[] }
  | { state: 'cold' }
  | { state: 'unreadable'; error: unknown };

/** Outcome of one ID pass; `null` from `reconcileWithServerIds` means it was skipped. */
export interface RegistrationIdPassResult {
  removed: number;
  fetched: number;
}

async function fetchRegistrationsWhere(
  column: 'id' | 'dog_id',
  values: readonly string[]
): Promise<DogRegistrationRow[]> {
  const rows: DogRegistrationRow[] = [];
  // Batched: the filter travels in the URL (MYK9-272).
  for (const batch of chunk(values, ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('dog_registrations')
      .select(DOG_REGISTRATION_SELECT)
      .in(column, batch);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as DogRegistrationRow[]));
  }
  return rows;
}

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

export class ReplicatedDogRegistrationsTable extends ReplicatedTable<ReplicatedDogRegistration> {
  constructor() {
    super('dog_registrations', { logger });
  }

  protected override rebuildUpdatePayload(
    registration: ReplicatedDogRegistration
  ): Record<string, unknown> {
    return buildRegistrationUpdatePayload(registration);
  }

  /**
   * Reads rows by id with the sync's own column list, so a refused full-row
   * UPDATE can re-fetch its row and rebase or surface (MYK9-771), and the ID
   * pass can fetch rows that came into view.
   */
  protected override getRowRefetchAdapter(): RowRefetchAdapter<
    DogRegistrationRow,
    ReplicatedDogRegistration
  > {
    return {
      fetchRowsById: ids => fetchRegistrationsWhere('id', ids),
      getRemoteId: remote => String(remote.id),
      toLocalRow: rowToRegistration,
      rebuildUpdatePayload: buildRegistrationUpdatePayload,
    };
  }

  /**
   * Changes pass, then (only after a successful one) the ID pass. No scope:
   * RLS decides which registrations this account sees, the dogs parity rule.
   */
  async sync(): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    const adapter: SyncReplicatedTableAdapter<DogRegistrationRow, ReplicatedDogRegistration> = {
      ...this.getRowRefetchAdapter(),
      fetchRemoteRows: ({ since }) => this.fetchChangedRows(since),
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
    };

    // The readers call this replica warm only once a FULL fetch has landed
    // (`lastFullSyncAt`). The engine forces a full fetch only on an empty
    // replica, and an offline dog create leaves placeholder rows in a
    // never-synced one, so force it here until the first full fetch succeeds.
    const metadata = await this.getSyncMetadata();
    const result = await syncReplicatedTable(
      this,
      adapter,
      {},
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS,
        ...(!metadata?.lastFullSyncAt && { forceFullSync: true }),
      }
    );

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    if (result.success) {
      // Side effect only: a failure here never turns a good download into a
      // failed sync.
      try {
        const idPass = await this.reconcileWithServerIds();
        if (idPass && idPass.removed + idPass.fetched > 0) {
          logger.log(`[${this.getTableName()}] ID pass`, idPass);
        }
      } catch (err) {
        logger.warn(`[${this.getTableName()}] ID pass skipped`, err);
      }
    }

    return result;
  }

  /**
   * Rows changed since `since`, paged by keyset on (updated_at, id) until a
   * short page: PostgREST caps a response at max_rows.
   */
  private async fetchChangedRows(since: number): Promise<DogRegistrationRow[]> {
    const rows: DogRegistrationRow[] = [];
    let cursorUpdatedAt: string | null = null;
    let cursorId: string | null = null;
    for (;;) {
      let query = supabase.from('dog_registrations').select(DOG_REGISTRATION_SELECT);
      query =
        cursorUpdatedAt && cursorId
          ? query.or(
              `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
            )
          : query.gt('updated_at', new Date(since).toISOString());
      const { data, error } = await query
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(0, DOG_REGISTRATIONS_PAGE_SIZE - 1);
      if (error) throw new Error(`Supabase query failed: ${error.message}`);

      const page = (data ?? []) as unknown as DogRegistrationRow[];
      rows.push(...page);
      if (page.length < DOG_REGISTRATIONS_PAGE_SIZE) return rows;
      const last = page[page.length - 1];
      if (!last?.updated_at || !last.id) return rows;
      cursorUpdatedAt = String(last.updated_at);
      cursorId = String(last.id);
    }
  }

  /**
   * The ID pass. Snapshot local revisions, read every visible id, then fetch
   * server ids this device lacks and remove local ids the server no longer
   * shows (guarded, see `pruneRegistrationsMissingFromServer`). Returns `null`
   * when the id read was incomplete (a page failed or the page cap was hit):
   * nothing is fetched or removed then.
   */
  async reconcileWithServerIds(): Promise<RegistrationIdPassResult | null> {
    const db = await this.init();
    const snapshot = await snapshotRegistrationRevisions(db, this.getTableName());
    const serverIds = await fetchVisibleRegistrationIds();
    if (!serverIds) {
      logger.warn(`[${this.getTableName()}] ID pass read was incomplete; nothing removed`);
      return null;
    }

    const { deleted } = await pruneRegistrationsMissingFromServer(
      db,
      this.getTableName(),
      serverIds,
      snapshot
    );
    if (deleted.length > 0) await this.notifyListeners();

    const localIds = await this.getAllLocalIds();
    const missing = [...serverIds].filter(id => !localIds.has(id));
    const fetched =
      missing.length > 0
        ? await this.applyServerRows(await fetchRegistrationsWhere('id', missing))
        : 0;
    return { removed: deleted.length, fetched };
  }

  /**
   * Store rows the server returned as clean copies, carrying `version` as the
   * row's server token. Used by the ID pass and to mirror a direct write. A
   * dirty local row is left alone (the package's batchSet guard).
   */
  async applyServerRows(rows: readonly DogRegistrationRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const versions = new Map<string, number>();
    for (const row of rows) {
      if (typeof row.version === 'number') versions.set(String(row.id), row.version);
    }
    await this.batchSet(rows.map(rowToRegistration), versions.size > 0 ? versions : undefined);
    return rows.length;
  }

  /**
   * Mirror a direct server delete. A row holding unsent local work stays.
   * Subscribers hear about it even when nothing local changed (a cold replica
   * never held the row), so a PostgREST-backed reader still refreshes.
   */
  async removeDeletedOnServer(id: string): Promise<void> {
    const { deleted } = await this.deleteRowsIfClean([id]);
    if (deleted.length === 0) await this.notifyListeners();
  }

  /**
   * Re-read one dog's registrations from the server into the replica: for a
   * direct write that creates registrations server-side under ids this device
   * never saw (the online `create_dog_with_registrations` path).
   */
  async refreshDogFromServer(dogId: string): Promise<number> {
    return this.applyServerRows(await fetchRegistrationsWhere('dog_id', [dogId]));
  }

  /** Tell subscribers to re-read, for a write that could not be mirrored. */
  async notifyChanged(): Promise<void> {
    await this.notifyListeners();
  }

  /**
   * These dogs' registrations from the replica, through the shared visibility
   * rule. Warm means a full sync has completed on this device since the store
   * was last cleared; only then is an empty answer "no registrations".
   */
  async readForDogs(dogIds: readonly string[]): Promise<RegistrationReplicaRead> {
    try {
      const read = await this.getAllWithStatus();
      if (!read.ok) return { state: 'unreadable', error: read.error };
      const metadata = await this.getSyncMetadata();
      if (!metadata?.lastFullSyncAt) return { state: 'cold' };
      return {
        state: 'warm',
        rows: visibleRegistrationRows(read.rows, dogIds).map(registrationToDbRow),
      };
    } catch (error) {
      return { state: 'unreadable', error };
    }
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
    const registrations = (await this.getAllOrThrow()).filter(
      registration => registration.dogId === dogId
    );
    const pendingIds = await Promise.all(
      registrations.map(registration => this.getPendingMutationIdsForRow(registration.id))
    );

    return pendingIds.flat();
  }

  /**
   * These dogs' registrations on this device, whatever the sync state: the
   * caller decides what an empty answer means (see `readForDogs`).
   */
  async getRegistrationsForDogs(dogIds: string[]): Promise<Record<string, unknown>[]> {
    if (dogIds.length === 0) return [];
    return visibleRegistrationRows(await this.getAllOrThrow(), dogIds).map(registrationToDbRow);
  }

  async getRegistrationsForDog(dogId: string): Promise<Record<string, unknown>[]> {
    return this.getRegistrationsForDogs([dogId]);
  }

  /** A clean row takes the server's copy (the dogs rule). */
  protected resolveConflict(
    _local: ReplicatedDogRegistration,
    remote: ReplicatedDogRegistration
  ): ReplicatedDogRegistration {
    return remote;
  }

  /** The INSERT payload for a registration created on this device. */
  toSupabaseRow(registration: ReplicatedDogRegistration): Record<string, unknown> {
    return {
      id: registration.id,
      dog_id: registration.dogId,
      organization: registration.organization,
      registration_number: registration.registrationNumber,
      // Carried so the merged local+server list keeps the resolver's ordering.
      // Local creation does not currently assign `isPrimary`, so it is omitted
      // from the mutation payload and the server default remains authoritative.
      created_at: registration.createdAt,
      registered_name: registration.registeredName ?? null,
      breed: registration.breed ?? null,
      status: registration.status ?? 'pending',
      verified: registration.verified ?? false,
      updated_at: new Date().toISOString(),
    };
  }
}

export const replicatedDogRegistrationsTable = new ReplicatedDogRegistrationsTable();
