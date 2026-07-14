import type { Logger } from './dependencies';
import type { PendingMutation, SyncResult } from './types';

export function dispatchQueueOverflow(logger: Logger, queueSize: number, maxSize: number): void {
  logger.error(
    `[MutationManager] Mutation queue at maximum capacity (${queueSize}/${maxSize}). ` +
      `Please sync immediately to prevent data loss!`
  );

  // Dispatch critical warning event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('replication:queue-overflow', {
        detail: { queueSize, maxSize },
      })
    );
  }
}

export function dispatchUploadComplete(
  logger: Logger,
  results: SyncResult[],
  pendingCount: number,
  startTime: number
): void {
  const successful = results.filter(r => r.success);
  const duration = Date.now() - startTime;
  logger.log(
    `[MutationManager] Uploaded ${successful.length}/${pendingCount} mutations in ${duration}ms`
  );

  // Notify listeners of successful uploads so caches can be invalidated
  if (successful.length > 0 && typeof window !== 'undefined') {
    const affectedTables = [...new Set(successful.map(r => r.tableName))];
    window.dispatchEvent(
      new CustomEvent('replication:upload-complete', {
        detail: { tables: affectedTables, count: successful.length },
      })
    );
  }
}

/**
 * Notify user of sync failures via CustomEvent
 */
export function notifyUserOfSyncFailure(logger: Logger, failedMutations: PendingMutation[]): void {
  if (failedMutations.length === 0) return;

  if (typeof window !== 'undefined') {
    const event = new CustomEvent('replication:sync-failed', {
      detail: {
        count: failedMutations.length,
        mutations: failedMutations,
        message: `${failedMutations.length} change(s) failed to sync. Please check your connection and try again.`,
      },
    });

    window.dispatchEvent(event);
  }

  logger.error(
    `[MutationManager] ${failedMutations.length} mutations failed permanently`,
    failedMutations
  );
}
