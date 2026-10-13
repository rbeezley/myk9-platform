/**
 * ReplicatedDogRegistrationsTable - the device's copy of every registration
 * this account can read (MYK9-1090).
 *
 * Sync is two passes: an incremental changes pass keyed on (updated_at, id),
 * then an ID pass that fetches rows that came into view without an edit and
 * removes rows that left it (see `dogRegistrationsIdPass.ts`).
 *
 * Writes are queued (plan §3): add, edit and delete write the device row
 * dirty, then queue the INSERT, full-row OCC UPDATE or DELETE, so they work
 * offline and a refusal reaches Retry/Discard. Discard of a refused edit or
 * delete puts the row back (`revertsOnDiscard`, MYK9-1076).
 *
 * Conflict resolution: the dogs rule. A clean row takes the server copy; a
 * dirty row goes through the package's `reconcileDirtyRemoteRow`.
 */
import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  REPLICATION_STORES,
  type MutationManager,
  type RowRefetchAdapter,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { FriendlySaveError } from '@/utils/friendlySaveError';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import { replicatedDogsTable } from './ReplicatedDogsTable';
import {
  asServerBacked,
  buildRegistrationUpdatePayload,
  registrationInsertRow,
  isPlaceholder,
  registrationToDbRow,
  rowToRegistration,
  unsentRegistrationWork,
  visibleRegistrationRows,
  type DogRegistrationReadRow,
  type DogRegistrationRow,
  type ReplicatedDogRegistration,
} from './dogRegistrationRows';
import {
  fetchVisibleRegistrationIds,
  type RegistrationIdPassResult,
  pruneRegistrationsMissingFromServer,
  markServerBacked,
  removeConfirmedDeletes,
  removeResolvedPlaceholders,
  snapshotRegistrationRevisions,
} from './dogRegistrationsIdPass';
import { fetchChangedRegistrations, fetchRegistrationsWhere } from './dogRegistrationsServer';
import { RegistrationDeletionFence } from './registrationDeletionFence';
import {
  cancelUnsentAdd,
  type EditableRegistration,
  hasRefusedInsert,
  queuedWorkBefore,
  listenForConfirmedDeletes,
  loadDogRegistrationsForEdit,
  loadRowForWrite,
} from './dogRegistrationWriteSupport';
import {
  REGISTRATION_COMPARE_POLICY,
  applyRegistrationPatch,
  assertRegistrationPatch,
  createRegistrationTimestamps,
  draftToRegistration,
  normalizeRegistration,
  NEW_REGISTRATION_VERSION,
  registrationAddRefused,
  registrationAwaitsItsDog,
  type RegistrationDraft,
  type RegistrationInput,
} from './dogRegistrationWrites';
export type { DogRegistrationReadRow, DogRegistrationRow, ReplicatedDogRegistration };
export type { RegistrationDraft, RegistrationIdPassResult };
export { createRegistrationTimestamps };

export class ReplicatedDogRegistrationsTable extends ReplicatedTable<ReplicatedDogRegistration> {
  /** Discarding a refused edit or delete puts the row back as the server has it (MYK9-1076). */
  protected override readonly revertsOnDiscard = true;

  /** Ids whose delete was confirmed while a sync pass was reading (MYK9-1129). */
  private readonly deletionFence = new RegistrationDeletionFence();
  private queue: MutationManager | null = null;
  private detachUploadListener: (() => void) | undefined;

  constructor() {
    super('dog_registrations', { logger });
  }

  override setMutationManager(manager: MutationManager): void {
    super.setMutationManager(manager);
    this.queue = manager;
    // A queued DELETE leaves its row marked `_pendingDelete` until the server
    // confirms it; the confirmation removes the row.
    if (!this.detachUploadListener && typeof window !== 'undefined') {
      this.detachUploadListener = listenForConfirmedDeletes(this.getTableName(), ids =>
        this.confirmDeleted(ids)
      );
    }
  }

  /** A server row with these ids was seen: their device-only adds landed (`asServerBacked`). */
  async markServerBacked(seen: ReadonlyMap<string, number | undefined>): Promise<void> {
    const changed = await markServerBacked(await this.init(), this.getTableName(), seen);
    if (changed.length > 0) await this.notifyListeners();
  }

  /** Remove rows whose queued DELETE the server confirmed, and their placeholders. */
  async confirmDeleted(ids: readonly string[]): Promise<void> {
    this.deletionFence.recordDeleted(ids);
    const db = await this.init();
    const removed = await removeConfirmedDeletes(db, this.getTableName(), ids);
    await removeResolvedPlaceholders(db, this.getTableName(), removed);
    await this.notifyListeners();
  }

  /** Never store a row whose delete was confirmed mid-pass; asked inside the write (MYK9-1129). */
  protected override acceptsRemoteRow(id: string): boolean {
    return !this.deletionFence.isFenced(id);
  }

  protected override rebuildUpdatePayload(
    registration: ReplicatedDogRegistration
  ): Record<string, unknown> {
    return buildRegistrationUpdatePayload(registration);
  }

  /**
   * Reads rows by id with the sync's own column list, so a refused full-row
   * UPDATE can re-fetch its row and rebase or surface (MYK9-771), Discard can
   * re-fetch the server's copy, and the ID pass can fetch rows that came into view.
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
      dirtyRowComparePolicy: REGISTRATION_COMPARE_POLICY,
    };
  }

  /**
   * Changes pass, then (only after a successful one) the ID pass. No scope:
   * RLS decides which registrations this account sees, the dogs parity rule.
   */
  async sync(): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);
    const fence = this.deletionFence.open();
    const downloaded = new Map<string, number | undefined>();
    try {
      const adapter: SyncReplicatedTableAdapter<DogRegistrationRow, ReplicatedDogRegistration> = {
        ...this.getRowRefetchAdapter(),
        fetchRemoteRows: async ({ since }) => {
          const rows = await fetchChangedRegistrations(since);
          for (const row of rows) downloaded.set(String(row.id), row.version);
          return rows;
        },
        getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
        resolveConflict: (local, remote) => this.resolveConflict(local, remote),
      };

      const result = await syncReplicatedTable(
        this,
        adapter,
        {},
        { incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS }
      );

      if (!result.success && result.error && !isAbortSyncError(result.error)) {
        logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
        return { ...result, error: getSyncErrorMessage(result.error) };
      }
      if (!result.success) return result;
      await this.markServerBacked(downloaded);

      // Side effect only: a failure here never turns a good download into a
      // failed sync.
      try {
        const idPass = await this.reconcileWithServerIds(fence);
        if (idPass && idPass.removed + idPass.fetched > 0) {
          logger.log(`[${this.getTableName()}] ID pass`, idPass);
        }
      } catch (err) {
        logger.warn(`[${this.getTableName()}] ID pass skipped`, err);
      }
      // After the downloads are stored, so a twin the changes pass or the
      // hydration just brought is seen.
      try {
        await this.removeResolvedPlaceholders();
      } catch (err) {
        logger.warn(`[${this.getTableName()}] Placeholder cleanup skipped`, err);
      }
      return result;
    } finally {
      this.deletionFence.close(fence);
    }
  }

  /** Remove placeholders whose server twin is here, or whose dog is gone (by content). */
  async removeResolvedPlaceholders(): Promise<number> {
    const deleted = await removeResolvedPlaceholders(await this.init(), this.getTableName());
    if (deleted.length > 0) await this.notifyListeners();
    return deleted.length;
  }

  /**
   * The ID pass. Snapshot local revisions, read every visible id, then fetch
   * server ids this device lacks and remove local ids the server no longer
   * shows (guarded, see `pruneRegistrationsMissingFromServer`). Returns `null`
   * when the id read was incomplete (a page failed or the page cap was hit):
   * nothing is fetched or removed then. A fetched row this device confirmed
   * deleted since the pass began is not stored (`RegistrationDeletionFence`).
   */
  async reconcileWithServerIds(fence?: number): Promise<RegistrationIdPassResult | null> {
    const token = fence ?? this.deletionFence.open();
    try {
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
      await this.markServerBacked(new Map([...serverIds].map(id => [id, undefined])));

      const localIds = await this.getAllLocalIds();
      const missing = [...serverIds].filter(id => !localIds.has(id));
      const fetchedRows = missing.length > 0 ? await fetchRegistrationsWhere('id', missing) : [];
      const fetched = await this.applyServerRows(fetchedRows);
      return { removed: deleted.length, fetched };
    } finally {
      if (fence === undefined) this.deletionFence.close(token);
    }
  }

  /**
   * Store rows the server returned as clean copies, carrying `version` as the
   * row's server token. Used by the ID pass and to load rows a write needs. A
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
   * Add a registration to a dog (Manage registrations, add-entry inline add,
   * Edit dog): written dirty under a new id, then an INSERT is queued. When
   * the dog's own create is still queued, the INSERT waits for it.
   */
  async addRegistration(draft: RegistrationDraft): Promise<ReplicatedDogRegistration> {
    const dogId = String(draft.dog_id);
    const dependsOn = await replicatedDogsTable.getPendingMutationIdsForRow(dogId);
    const [createdAt] = createRegistrationTimestamps(1);
    return this.queueNewRegistration(
      { ...draftToRegistration(draft, createdAt!), dogId, id: crypto.randomUUID() },
      dependsOn
    );
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
      const registration = { ...normalizeRegistration(input, createdAts[index]!), dogId };
      saved.push(
        await this.queueNewRegistration(
          { ...registration, id: crypto.randomUUID() },
          options.dependsOn
        )
      );
    }
    return saved;
  }

  private async queueNewRegistration(
    fields: Omit<ReplicatedDogRegistration, '_version' | '_lastModified'>,
    dependsOn?: string[]
  ): Promise<ReplicatedDogRegistration> {
    const registration: ReplicatedDogRegistration = {
      ...fields,
      _version: 1,
      _lastModified: new Date(fields.createdAt),
      _syncStatus: 'pending',
      _localOnly: true,
      _queuedAdd: true,
    };
    // Starts with the token the INSERT will create (NEW_REGISTRATION_VERSION),
    // so a later edit carries an OCC precondition: clean with it, then dirty.
    // The clean seed holds no device-only flags, so a sync's merge against it
    // keeps them until `markServerBacked` clears both together.
    await this.set(
      registration.id,
      asServerBacked(registration),
      false,
      undefined,
      NEW_REGISTRATION_VERSION
    );
    await this.set(registration.id, registration, true);
    await this.queueMutation(
      'INSERT',
      registration.id,
      this.toSupabaseRow(registration),
      dependsOn && dependsOn.length > 0 ? dependsOn : undefined
    );
    return registration;
  }

  /**
   * Edit a registration: a full-row OCC UPDATE whose payload is built only
   * from `REGISTRATION_UPDATE_COLUMNS`. `patch` is in column names; a key
   * outside that list throws before anything is written or queued.
   */
  async updateRegistration(
    id: string,
    patch: Readonly<Record<string, unknown>>
  ): Promise<ReplicatedDogRegistration> {
    assertRegistrationPatch(patch);
    const row = await loadRowForWrite(this, id);
    const updated = applyRegistrationPatch(row.data, patch);
    if (row.data._pendingDelete === true) {
      throw new FriendlySaveError('This registration is being deleted.');
    }
    if (isPlaceholder(row.data)) throw registrationAwaitsItsDog();
    // An add the server refused cannot be edited: discard it and add again.
    if (row.data._localOnly === true && (await hasRefusedInsert(this, this.queue, id))) {
      throw registrationAddRefused();
    }
    const dependsOn = await queuedWorkBefore(this, row.data);
    await this.set(id, updated, true);
    await this.queueMutation(
      'UPDATE',
      id,
      { id, ...buildRegistrationUpdatePayload(updated) },
      dependsOn.length > 0 ? dependsOn : undefined
    );
    return updated;
  }

  /**
   * Delete a registration (MYK9-1075). The row stays, marked `_pendingDelete`
   * and hidden from every reader, until the server confirms the queued DELETE
   * (no version check: the person deleting means it). Deleting an add that has
   * not uploaded cancels its INSERT and removes the row: nothing is sent.
   */
  async deleteRegistration(id: string): Promise<void> {
    const row = await loadRowForWrite(this, id);
    if (row.data._pendingDelete === true) return;
    if (isPlaceholder(row.data)) throw registrationAwaitsItsDog();
    if (row.data._localOnly === true) {
      await cancelUnsentAdd(this, this.queue, id);
      return;
    }
    const dependsOn = await queuedWorkBefore(this, row.data);
    await this.set(
      id,
      { ...row.data, _pendingDelete: true, _lastModified: new Date(), _syncStatus: 'pending' },
      true
    );
    await this.queueMutation('DELETE', id, { id }, dependsOn.length > 0 ? dependsOn : undefined);
  }

  /**
   * One dog's registrations, for a write built on what exists (Edit dog's
   * registration fields); see `loadDogRegistrationsForEdit`.
   */
  async getRegistrationsForEdit(
    dogId: string
  ): Promise<{ registrations: EditableRegistration[]; server: boolean }> {
    return loadDogRegistrationsForEdit(this, dogId);
  }

  /**
   * Write placeholder rows for a dog created on this device. Pass the
   * `createdAts` the dog's upload carries, so the placeholders and the server
   * rows agree on creation order (MYK9-90).
   */
  async createLocalRegistrationsForDog(
    dogId: string,
    registrations: RegistrationInput[],
    createdAts: readonly string[] = createRegistrationTimestamps(registrations.length)
  ): Promise<ReplicatedDogRegistration[]> {
    const saved: ReplicatedDogRegistration[] = [];
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
        _placeholderOf: dogId,
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
   * caller decides what an empty answer means. The readers use it only as a
   * labelled offline copy when the server cannot be reached.
   */
  async getRegistrationsForDogs(dogIds: string[]): Promise<Record<string, unknown>[]> {
    if (dogIds.length === 0) return [];
    return visibleRegistrationRows(await this.getAllOrThrow(), dogIds).map(registrationToDbRow);
  }

  /** Unsent work only (`unsentRegistrationWork`), merged into a server read by `mergeUnsentWork`. */
  async getUnsentWorkForDogs(dogIds: string[]): Promise<ReplicatedDogRegistration[]> {
    if (dogIds.length === 0) return [];
    const tx = (await this.init()).transaction(REPLICATION_STORES.REPLICATED_TABLES, 'readonly');
    const stored = (await tx.store.index('tableName').getAll(this.getTableName())) as Parameters<
      typeof unsentRegistrationWork
    >[0];
    await tx.done;
    return unsentRegistrationWork(stored, dogIds);
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
    return registrationInsertRow(registration);
  }
}

export const replicatedDogRegistrationsTable = new ReplicatedDogRegistrationsTable();
