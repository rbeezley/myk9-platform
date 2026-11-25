import type { IDBPDatabase } from 'idb';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import {
  compactMutationJournal,
  type MutationBackupParseResult,
  readMutationJournal,
  removeJournalEntries,
  upsertJournalEntries,
} from './mutation-backup';
import type { PendingMutation } from './types';

interface QueuedRows {
  pending: PendingMutation[];
  failed: PendingMutation[];
}

const idsOf = ({ pending, failed }: QueuedRows): Set<string> =>
  new Set([...pending, ...failed].map(mutation => mutation.id));

/**
 * Keeps IndexedDB pending/failed rows and the localStorage journal aligned
 * (see mutation-backup.ts for the journal itself, MYK9-2360).
 *
 * Adding and updating entries is safe anywhere. An entry is removed only by
 * name, for a mutation this code saw in IndexedDB and then saw disappear: so a
 * mutation IndexedDB lost (eviction, a recreated database) keeps its entry until
 * a restore puts it back.
 */
export class MutationBackupStore {
  /** Ids queued when the current upload pass last checked, and the database it read. */
  private passIds: Set<string> | null = null;
  private passDb: IDBPDatabase | null = null;

  constructor(private readonly logger: Logger) {}

  /** Back up every queued mutation (add/update only). */
  async writeCurrent(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.backUp(await this.readQueued());
  }

  private backUp({ pending, failed }: QueuedRows): void {
    upsertJournalEntries(localStorage, [...pending, ...failed]);
    if (pending.length > 0 || failed.length > 0) {
      this.logger.log(
        `[MutationManager] Backed up ${pending.length} pending + ${failed.length} failed mutation(s) to localStorage`
      );
    }
  }

  async backupSafely(): Promise<void> {
    try {
      await this.writeCurrent();
    } catch (error) {
      this.logger.warn('[MutationManager] Failed to backup mutations to localStorage:', error);
    }
  }

  /**
   * Run a queue operation that removes rows, then remove the journal entries of
   * the rows it removed. Only rows matching `isTarget` that were queued before
   * the operation count, so a row that vanished for another reason (eviction, a
   * recreated database) keeps its entry.
   */
  async trackRemovals<R>(
    operation: () => Promise<R>,
    isTarget: (mutation: PendingMutation) => boolean
  ): Promise<R> {
    if (typeof window === 'undefined') return operation();
    const db = await this.database();
    const { pending, failed } = await this.readQueued();
    const result = await operation();
    if ((await this.database()) === db) {
      const after = await this.readQueuedIds();
      const removed = [...pending, ...failed].filter(m => isTarget(m) && !after.has(m.id));
      removeJournalEntries(
        localStorage,
        removed.map(m => m.id)
      );
    }
    await this.backupSafely();
    return result;
  }

  /** Remove the journal entries of one owner, including ones IndexedDB no longer holds. */
  removeOwnedEntries(authUserId: string): void {
    if (typeof window === 'undefined') return;
    const journal = readMutationJournal(localStorage);
    removeJournalEntries(
      localStorage,
      [...journal.mutations, ...journal.failedMutations]
        .filter(mutation => mutation.authUserId === authUserId)
        .map(mutation => mutation.id)
    );
  }

  /**
   * Put back every journal entry IndexedDB lacks. Call ONLY while holding the
   * upload lock, so a flush in any tab has finished removing what it uploaded.
   */
  async restoreUnderLock(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      await this.mergeJournalIntoDatabase(compactMutationJournal(localStorage));
    } catch (error) {
      this.logger.error('[MutationManager] Failed to restore mutations from localStorage:', error);
    }
  }

  /** An upload pass read this queue, under the lock, from this database. */
  beginPass(db: IDBPDatabase, ids: readonly string[]): void {
    this.passDb = db;
    this.passIds = new Set(ids);
  }

  /**
   * Under the lock, during or after an upload pass: remove the entries of rows
   * the pass removed since the last check (uploaded, superseded), then back up
   * the rest. Skipped if the database was replaced meanwhile.
   */
  async checkpointUnderLock(): Promise<void> {
    if (typeof window === 'undefined') return;
    const queued = await this.readQueued();
    if (this.passIds && this.passDb && (await this.database()) === this.passDb) {
      const after = idsOf(queued);
      removeJournalEntries(
        localStorage,
        [...this.passIds].filter(id => !after.has(id))
      );
      this.passIds = after;
    }
    this.backUp(queued);
  }

  private database(): Promise<IDBPDatabase> {
    return databaseManager.getDatabase('MutationManager');
  }

  private async readQueued(): Promise<QueuedRows> {
    const db = await this.database();
    const [pending, failed] = await Promise.all([
      db.getAll(REPLICATION_STORES.PENDING_MUTATIONS),
      db.getAll(REPLICATION_STORES.FAILED_MUTATIONS),
    ]);
    return { pending: pending as PendingMutation[], failed: failed as PendingMutation[] };
  }

  private async readQueuedIds(): Promise<Set<string>> {
    return idsOf(await this.readQueued());
  }

  private async mergeJournalIntoDatabase(
    compacted: Pick<MutationBackupParseResult, 'error' | 'malformedCount'>
  ): Promise<void> {
    const journal = readMutationJournal(localStorage);
    const error = compacted.error ?? journal.error;
    if (error) {
      this.logger.error('[MutationManager] Failed to restore mutations from localStorage:', error);
    }
    const malformedCount = compacted.malformedCount + journal.malformedCount;
    if (malformedCount > 0) {
      this.logger.warn(
        `[MutationManager] Discarded ${malformedCount} malformed mutation(s) from localStorage backup`
      );
    }
    if (journal.mutations.length === 0 && journal.failedMutations.length === 0) return;

    // A row already queued in EITHER store is IndexedDB's to keep: a retried
    // failed mutation now pending must not come back as failed too.
    const queuedIds = await this.readQueuedIds();
    const db = await this.database();
    let restoredCount = 0;
    for (const mutation of journal.mutations) {
      if (queuedIds.has(mutation.id)) continue;
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      queuedIds.add(mutation.id);
      restoredCount++;
    }
    let restoredFailedCount = 0;
    for (const mutation of journal.failedMutations) {
      if (queuedIds.has(mutation.id)) continue;
      await db.put(REPLICATION_STORES.FAILED_MUTATIONS, mutation);
      queuedIds.add(mutation.id);
      restoredFailedCount++;
    }

    if (restoredCount > 0 || restoredFailedCount > 0) {
      this.logger.log(
        `[MutationManager] Restored ${restoredCount} pending + ${restoredFailedCount} failed mutation(s) from localStorage backup`
      );
    }
  }
}
