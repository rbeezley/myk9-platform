/**
 * Rows this device deleted and has a DELETE queued for (MYK9-762).
 *
 * Until the DELETE uploads, the server still counts the row while the device
 * no longer holds it, so a coverage check (sync engine, offline-readiness
 * badge, Add Trials gate) read the pending delete as a missing row. The queue
 * is the durable record — an in-memory set would forget the delete on restart —
 * and counting from it is exact: only this user's queued DELETEs, of rows that
 * were on the server when deleted, in the scope asked about.
 *
 * @module services/replication/pendingDeletes
 */

import type { PendingMutation } from '@myk9/replication';
import { logger } from '@myk9/core';

/** The slice of MutationManager this reads; the provider wires every table to it. */
export interface PendingMutationSource {
  getPendingMutationsForTable(tableName: string): Promise<PendingMutation[]>;
}

/**
 * The DELETE payload key naming the deleted row's show. Present only when the
 * row was already on the server (not a pending local create), so a delete that
 * carries it is one the server still counts until it uploads. Uploading reads
 * only `id` (mutation-execute), so the key never reaches the database.
 */
const DELETED_ROW_SHOW_KEY = 'show_id';

/** Payload for a queued DELETE of `row` (read before the local row is removed). */
export function deletePayload(
  id: string,
  row: { showId?: string | undefined; _localOnly?: boolean | undefined } | null
): Record<string, unknown> {
  const serverBacked = row !== null && row._localOnly !== true && Boolean(row.showId);
  return serverBacked ? { id, [DELETED_ROW_SHOW_KEY]: row.showId } : { id };
}

export class PendingDeletes {
  private source: PendingMutationSource | null = null;

  constructor(private readonly tableName: string) {}

  attach(source: PendingMutationSource): void {
    this.source = source;
  }

  /**
   * Every row with a queued DELETE, whatever its scope or origin: a fetch must
   * not bring any of them back. Empty when the queue cannot be read.
   */
  async allIds(): Promise<Set<string>> {
    return new Set((await this.read()).map(mutation => String(mutation.rowId)));
  }

  /**
   * Server-backed rows of `showId` with a queued DELETE: the rows the server
   * still counts for that show that this device has deliberately let go of.
   * No show (an unscoped sync) means every show. Empty when the queue cannot
   * be read, which reads as NOT covered — never the other way.
   */
  async coveredIds(showId?: string): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const mutation of await this.read()) {
      const deletedFrom = mutation.data[DELETED_ROW_SHOW_KEY];
      if (typeof deletedFrom !== 'string' || !deletedFrom) continue;
      if (showId && deletedFrom !== showId) continue;
      ids.add(String(mutation.rowId));
    }
    return ids;
  }

  private async read(): Promise<PendingMutation[]> {
    if (!this.source) return [];
    try {
      const pending = await this.source.getPendingMutationsForTable(this.tableName);
      return pending.filter(mutation => mutation.operation === 'DELETE');
    } catch (error) {
      logger.warn(`[${this.tableName}] Pending deletes unreadable; counting none`, 'replication', {
        message: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
