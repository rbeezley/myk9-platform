import type { Logger } from '../dependencies';
import type { ReplicatedSetResult } from './coldInsertGuard';

/** What one dirty `set()` reports back to {@link writeAndQueue}. */
export interface DirtyWriteOutcome {
  result: ReplicatedSetResult;
  /** The row's local revision after the write that landed. */
  revision?: number;
}

export interface WriteAndQueueSteps {
  /** Persist the mutation with its upload deferred; null when no MutationManager is set. */
  queueDeferred: () => Promise<string | null>;
  writeDirty: () => Promise<DirtyWriteOutcome>;
  /** Clear the mutation's hold and stamp the revision in one write (undefined: nothing landed). */
  releaseQueued: (mutationId: string, revision?: number) => Promise<void>;
  removeQueued: (mutationId: string) => Promise<void>;
  requestUpload: () => void;
  logger: Logger;
}

export interface WriteAndQueueResult {
  mutationId: string | null;
  result: ReplicatedSetResult;
}

/**
 * Queue a mutation and mark its row dirty as one unit (MYK9-1471).
 *
 * The mutation is persisted FIRST, with its upload deferred: if that throws
 * (backlog full, IndexedDB failure) the row was never touched, so it keeps its
 * data, dirty flag and server version. If the dirty write then throws, the
 * queued mutation is removed so no Sync issues entry or upload is left for a
 * change that never landed locally. Until the write lands the mutation is HELD:
 * no upload pass sends it. Once it lands, one store write releases the hold and
 * stamps the revision it produced (Discard revert, MYK9-1076, needs it), and the
 * upload is requested.
 */
export async function writeAndQueue(steps: WriteAndQueueSteps): Promise<WriteAndQueueResult> {
  const mutationId = await steps.queueDeferred();
  let outcome: DirtyWriteOutcome;
  try {
    outcome = await steps.writeDirty();
  } catch (writeError) {
    if (mutationId !== null) {
      try {
        await steps.removeQueued(mutationId);
      } catch (removeError) {
        steps.logger.error(
          `[writeAndQueue] Could not remove mutation ${mutationId} after a failed local write:`,
          removeError
        );
      }
    }
    throw writeError;
  }
  if (mutationId !== null) {
    try {
      await steps.releaseQueued(mutationId, outcome.result.written ? outcome.revision : undefined);
    } catch (releaseError) {
      // Still held and durable: the hold lapses on its own (HELD_FOR_LOCAL_WRITE_TTL_MS),
      // so the upload below is only delayed, and only Discard revert loses its revision.
      steps.logger.error(
        `[writeAndQueue] Could not release mutation ${mutationId} for upload:`,
        releaseError
      );
    }
    steps.requestUpload();
  }
  return { mutationId, result: outcome.result };
}
