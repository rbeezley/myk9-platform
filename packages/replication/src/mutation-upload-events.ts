import type { Logger } from './dependencies';
import type {
  PendingMutation,
  SyncResult,
  UploadedMutation,
  UploadCompleteEventDetail,
} from './types';

export function toUploadedMutation(mutation: PendingMutation): UploadedMutation {
  return {
    tableName: mutation.tableName,
    rowId: mutation.rowId,
    operation: mutation.operation,
    ...(mutation.rpc ? { rpcName: mutation.rpc.name } : {}),
  };
}

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
  startTime: number,
  mutations?: UploadedMutation[]
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
        detail: {
          tables: affectedTables,
          count: successful.length,
          ...(mutations ? { mutations } : {}),
        } satisfies UploadCompleteEventDetail,
      })
    );
  }
}

/**
 * Ringside scoring is under admission control (MYK9-115) and RPC uploads are
 * paused until `until`.
 *
 * INTENT: this is emitted for the UI's benefit, not the runner's — the runner
 * already knows. A judge whose scores stop uploading must be told that the
 * SERVER asked for a pause and their work is safe, otherwise the only visible
 * signal is a queue that silently stops draining, which reads as data loss.
 */
export function dispatchContainment(logger: Logger, until: number): void {
  logger.warn(
    `[MutationManager] Ringside scoring contained by the server; RPC uploads paused until ${new Date(
      until
    ).toISOString()}`
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('replication:containment', { detail: { until } }));
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
