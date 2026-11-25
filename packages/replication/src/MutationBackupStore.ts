import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import {
  MUTATION_BACKUP_STORAGE_KEY,
  parseMutationBackup,
  writeMutationBackup,
} from './mutation-backup';
import type { PendingMutation } from './types';

/**
 * Keeps IndexedDB pending/failed rows and the localStorage recovery copy aligned.
 *
 * The backup is the only copy of a mutation IndexedDB lost (eviction, a
 * recreated database), until a restore merges it back. So a restore request
 * marks the restore OWED, and while it is owed no write outside the upload lock
 * may replace the backup (MYK9-2360): IndexedDB may be missing the very rows the
 * backup still holds. Writes under the lock (the upload pass) are authoritative,
 * and the pass restores an owed backup before it reads the queue. A row this tab
 * removes while the restore is owed is remembered so the restore does not bring
 * back a discarded or cleared mutation.
 */
export class MutationBackupStore {
  private restoreOwed = false;
  private readonly removedWhileOwed = new Set<string>();

  constructor(private readonly logger: Logger) {}

  /** A restore was requested; hold the backup until one succeeds under the lock. */
  markRestoreOwed(): void {
    this.restoreOwed = true;
  }

  /** The upload pass's first step, under the lock: settle an owed restore. */
  async restoreIfOwedUnderLock(): Promise<void> {
    if (this.restoreOwed) await this.restoreUnderLock();
  }

  /**
   * Backup write for callers OUTSIDE the upload lock. Skipped while a restore is
   * owed: the restore writes the backup itself once IndexedDB holds every row.
   */
  async writeCurrent(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (this.restoreOwed) {
      this.logger.log('[MutationManager] Backup write held until the owed restore runs');
      return;
    }
    await this.writeUnderLock();
  }

  async backupSafely(): Promise<void> {
    try {
      await this.writeCurrent();
    } catch (error) {
      this.logger.warn('[MutationManager] Failed to backup mutations to localStorage:', error);
    }
  }

  /**
   * Run a queue operation that may delete rows. While a restore is owed, record
   * the ids it removed so the restore skips them.
   */
  async trackRemovals<R>(operation: () => Promise<R>): Promise<R> {
    if (!this.restoreOwed || typeof window === 'undefined') return operation();
    const before = await this.readQueuedIds();
    const result = await operation();
    const after = await this.readQueuedIds();
    for (const id of before) if (!after.has(id)) this.removedWhileOwed.add(id);
    return result;
  }

  /**
   * Merge the backup into IndexedDB, then rewrite the backup from it. Call ONLY
   * while holding the upload lock. Returns false when IndexedDB failed, in which
   * case the restore stays owed and the backup is left as it was.
   */
  async restoreUnderLock(): Promise<boolean> {
    if (typeof window === 'undefined') return true;

    try {
      await this.mergeBackupIntoDatabase();
    } catch (error) {
      this.logger.error('[MutationManager] Failed to restore mutations from localStorage:', error);
      return false;
    }
    this.restoreOwed = false;
    this.removedWhileOwed.clear();
    try {
      await this.writeUnderLock();
    } catch (error) {
      this.logger.warn('[MutationManager] Failed to backup mutations to localStorage:', error);
    }
    return true;
  }

  clear(): void {
    if (typeof window !== 'undefined') localStorage.removeItem(MUTATION_BACKUP_STORAGE_KEY);
  }

  /** Backup write for callers holding the upload lock (the upload pass). */
  async writeUnderLock(): Promise<void> {
    if (typeof window === 'undefined') return;
    const { pending, failed } = await this.readQueued();

    writeMutationBackup(localStorage, [...pending, ...failed]);
    if (pending.length > 0 || failed.length > 0) {
      this.logger.log(
        `[MutationManager] Backed up ${pending.length} pending + ${failed.length} failed mutation(s) to localStorage`
      );
    }
  }

  private async readQueued(): Promise<{ pending: PendingMutation[]; failed: PendingMutation[] }> {
    const db = await databaseManager.getDatabase('MutationManager');
    const [pending, failed] = await Promise.all([
      db.getAll(REPLICATION_STORES.PENDING_MUTATIONS),
      db.getAll(REPLICATION_STORES.FAILED_MUTATIONS),
    ]);
    return { pending: pending as PendingMutation[], failed: failed as PendingMutation[] };
  }

  private async readQueuedIds(): Promise<Set<string>> {
    const { pending, failed } = await this.readQueued();
    return new Set([...pending, ...failed].map(mutation => mutation.id));
  }

  /** Throws only on an IndexedDB failure; an unreadable backup has nothing to restore. */
  private async mergeBackupIntoDatabase(): Promise<void> {
    const backup = localStorage.getItem(MUTATION_BACKUP_STORAGE_KEY);
    const parsed = parseMutationBackup(backup);
    if (parsed.error) {
      this.logger.error(
        '[MutationManager] Failed to restore mutations from localStorage:',
        parsed.error
      );
      return;
    }
    if (parsed.malformedCount > 0) {
      this.logger.warn(
        `[MutationManager] Discarded ${parsed.malformedCount} malformed mutation(s) from localStorage backup`
      );
    }
    if (parsed.mutations.length === 0 && parsed.failedMutations.length === 0) return;

    // A row already queued in EITHER store is IndexedDB's to keep: a retried
    // failed mutation now pending must not come back as failed too.
    const queuedIds = await this.readQueuedIds();
    const skip = (mutation: PendingMutation) =>
      queuedIds.has(mutation.id) || this.removedWhileOwed.has(mutation.id);

    const db = await databaseManager.getDatabase('MutationManager');
    let restoredCount = 0;
    for (const mutation of parsed.mutations) {
      if (skip(mutation)) continue;
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
      queuedIds.add(mutation.id);
      restoredCount++;
    }
    let restoredFailedCount = 0;
    for (const mutation of parsed.failedMutations) {
      if (skip(mutation)) continue;
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
