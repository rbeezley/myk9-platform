import type { IDBPDatabase } from 'idb';
import type { Logger } from './dependencies';
import type { InFlightWriteRegistry } from './inflight-written-base';
import { executeMutation } from './mutation-execute';
import type { MutationUploadAuthContext } from './mutation-manager-options';
import * as rowSync from './mutation-row-sync';
import type { WrittenFieldOverlayRegistry } from './mutation-written-overlay';
import type { MutationQueueStore } from './MutationQueueStore';
import type { PendingMutation } from './types';

/**
 * Send one queued mutation and apply its acknowledgement to the row and to the
 * still-queued writes behind it.
 *
 * The mutation is registered as IN FLIGHT from the moment its request goes out
 * until its acknowledgement has been applied, success or not (MYK9-1221). In
 * that window the server may already hold the write while the row's merge base
 * does not, and a sync pull that lands there must read the write as the
 * device's own (`resolveInFlightMergeBase`).
 *
 * The row's OCC token never moves backwards (`markReplicatedRowSynced`), and the
 * queued writes are stamped with the row's token after the acknowledgement, not
 * the acknowledgement's own version: a late acknowledgement (a newer snapshot
 * already reconciled) must not hand them a stale `expected_version`.
 */
export async function sendAndAcknowledge(params: {
  db: IDBPDatabase;
  logger: Logger;
  queueStore: MutationQueueStore;
  mutation: PendingMutation;
  context: MutationUploadAuthContext;
  writtenOverlays?: WrittenFieldOverlayRegistry;
  inFlightWrites?: InFlightWriteRegistry;
}): Promise<PendingMutation> {
  const { db, logger, queueStore, mutation, context, writtenOverlays, inFlightWrites } = params;
  inFlightWrites?.begin(mutation);
  try {
    const { newServerVersion, remappedRowId } = await executeMutation(
      context.supabaseClient,
      logger,
      mutation
    );
    const uploaded = remappedRowId
      ? await rowSync.remapUploadedRpcInsertRowId(db, logger, mutation, remappedRowId)
      : mutation;
    const rowToken = await rowSync.markReplicatedRowSynced(
      db,
      uploaded,
      newServerVersion,
      writtenOverlays?.get(uploaded.tableName)
    );
    if (newServerVersion !== undefined) {
      await queueStore.updateMutationServerVersions(
        uploaded.tableName,
        uploaded.rowId,
        rowToken ?? newServerVersion,
        context.authUserId
      );
    }
    return uploaded;
  } finally {
    inFlightWrites?.end(mutation.id);
  }
}
