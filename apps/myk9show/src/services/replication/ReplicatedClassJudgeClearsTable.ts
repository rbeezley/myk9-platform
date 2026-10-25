/**
 * A durable, local-only record of "this device cleared this class's judge" (MYK9-1327).
 *
 * Clearing a judge deletes the local assignment row, so once the DELETE is acknowledged nothing
 * local says the class should show no judge while its own row still names the old one. This
 * table keeps one tombstone per deleted row until the class row has been pulled past the
 * acknowledgement. It is a second `ReplicatedTable` in the existing replica store (not a
 * `judge_assignments` row, which every show roster would read, and not the class row, which
 * would need conflict-merge overrides), so it survives a reload like any replica and is never
 * synced or queued.
 */
import {
  databaseManager,
  ReplicatedTable,
  REPLICATION_STORES,
  type ReplicatedRow,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';

export interface ClassJudgeClear {
  /** The deleted assignment row's id. */
  id: string;
  classId: string;
  /** Client time the clear was queued. */
  createdAt: number;
  /** Client time the DELETE was acknowledged; absent while it is queued or failed. Only for cleanup. */
  ackedAt?: number | undefined;
  /**
   * The class row's `serverUpdatedAt` when the DELETE was acknowledged. The delete's trigger
   * moved the server's `updated_at` past it, so a class row pulled with a LATER server time
   * reflects the delete: no client clock is compared with a server clock.
   */
  classTimeAtAck?: number | undefined;
}

/** An unstamped tombstone whose DELETE left the queue without an ack (discarded) is dropped after this. */
export const UNSTAMPED_CLEAR_TTL_MS = 10 * 60 * 1000;
/** A stamped tombstone the class never passed (a skewed clock) stops mattering after this. */
export const STAMPED_CLEAR_TTL_MS = 24 * 60 * 60 * 1000;

export class ReplicatedClassJudgeClearsTable extends ReplicatedTable<ClassJudgeClear> {
  constructor() {
    super('class_judge_clears', { logger });
  }

  /** Local only: there is nothing to download. */
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(local: ClassJudgeClear): ClassJudgeClear {
    return local;
  }

  async record(rowId: string, classId: string): Promise<void> {
    await this.set(rowId, { id: rowId, classId, createdAt: Date.now() }, false);
  }

  /** The `serverUpdatedAt` of the class row as stored now (0 when it is not held). */
  private async storedClassTime(classId: string): Promise<number> {
    try {
      const db = await databaseManager.getDatabase(this.getTableName());
      const row = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, ['classes', classId])) as
        ReplicatedRow<{ serverUpdatedAt?: number }> | undefined;
      return row?.data?.serverUpdatedAt ?? 0;
    } catch {
      return 0;
    }
  }

  /** Stamp the tombstones of DELETEs an upload pass acknowledged (unknown ids are ignored). */
  async stampAcknowledged(rowIds: readonly string[]): Promise<void> {
    for (const rowId of rowIds) {
      const clear = await this.get(rowId);
      if (clear && clear.ackedAt === undefined) {
        const classTimeAtAck = await this.storedClassTime(clear.classId);
        await this.set(rowId, { ...clear, ackedAt: Date.now(), classTimeAtAck }, false);
      }
    }
  }
}

export const replicatedClassJudgeClearsTable = new ReplicatedClassJudgeClearsTable();
