import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import {
  MUTATION_BACKUP_STORAGE_KEY,
  parseMutationBackup,
  writeMutationBackup,
} from './mutation-backup';
import type { PendingMutation } from './types';

/** Keeps IndexedDB pending/failed rows and the localStorage recovery copy aligned. */
export class MutationBackupStore {
  constructor(private readonly logger: Logger) {}

  async writeCurrent(): Promise<void> {
    if (typeof window === 'undefined') return;

    const db = await databaseManager.getDatabase('MutationManager');
    const pending = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
    const failed = (await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)) as PendingMutation[];

    writeMutationBackup(localStorage, [...pending, ...failed]);
    if (pending.length > 0 || failed.length > 0) {
      this.logger.log(
        `[MutationManager] Backed up ${pending.length} pending + ${failed.length} failed mutation(s) to localStorage`
      );
    }
  }

  async backupSafely(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      await this.writeCurrent();
    } catch (error) {
      this.logger.warn('[MutationManager] Failed to backup mutations to localStorage:', error);
    }
  }

  async restore(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const backup = localStorage.getItem(MUTATION_BACKUP_STORAGE_KEY);
      const parsed = parseMutationBackup(backup);
      if (parsed.error) {
        this.logger.error(
          '[MutationManager] Failed to restore mutations from localStorage:',
          parsed.error
        );
        return;
      }
      if (
        !backup ||
        (parsed.mutations.length === 0 &&
          parsed.failedMutations.length === 0 &&
          parsed.malformedCount === 0)
      ) {
        return;
      }
      if (parsed.malformedCount > 0) {
        this.logger.warn(
          `[MutationManager] Discarded ${parsed.malformedCount} malformed mutation(s) from localStorage backup`
        );
      }
      if (parsed.mutations.length === 0 && parsed.failedMutations.length === 0) return;

      const db = await databaseManager.getDatabase('MutationManager');
      const existing = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
      const existingIds = new Set(existing.map(mutation => mutation.id));
      let restoredCount = 0;
      for (const mutation of parsed.mutations) {
        if (!existingIds.has(mutation.id)) {
          await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
          restoredCount++;
        }
      }

      const existingFailed = (await db.getAll(
        REPLICATION_STORES.FAILED_MUTATIONS
      )) as PendingMutation[];
      const existingFailedIds = new Set(existingFailed.map(mutation => mutation.id));
      let restoredFailedCount = 0;
      for (const mutation of parsed.failedMutations) {
        if (!existingFailedIds.has(mutation.id)) {
          await db.put(REPLICATION_STORES.FAILED_MUTATIONS, mutation);
          restoredFailedCount++;
        }
      }

      if (restoredCount > 0 || restoredFailedCount > 0) {
        this.logger.log(
          `[MutationManager] Restored ${restoredCount} pending + ${restoredFailedCount} failed mutation(s) from localStorage backup`
        );
      }
    } catch (error) {
      this.logger.error('[MutationManager] Failed to restore mutations from localStorage:', error);
    }
  }

  clear(): void {
    if (typeof window !== 'undefined') localStorage.removeItem(MUTATION_BACKUP_STORAGE_KEY);
  }
}
