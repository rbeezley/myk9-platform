import type { ReplicationConflictSnapshot } from './types';

/**
 * Moves the replica rows `rowIds` from owner `from` to owner `to` through the
 * table's own write path, answering the conflict snapshots of the rows moved.
 */
export type OwnerTransfer = (
  rowIds: string[],
  from: string,
  to: string
) => Promise<ReplicationConflictSnapshot[]>;

/**
 * Tables that can hand their replica rows to another owner, by table name
 * (MYK9-1205). Adoption re-owns queued ringside scores; the rows they target
 * must follow, and only the table can write them the way every other write does
 * (and tell its subscribers). The manager has no table references, so each table
 * registers here from `setMutationManager`, like the row refetchers.
 */
export class OwnerTransferRegistry {
  private readonly transfers = new Map<string, OwnerTransfer>();

  /** @returns an unregister function that removes only this transfer. */
  register(tableName: string, transfer: OwnerTransfer): () => void {
    this.transfers.set(tableName, transfer);
    return () => {
      if (this.transfers.get(tableName) === transfer) this.transfers.delete(tableName);
    };
  }

  get(tableName: string): OwnerTransfer | undefined {
    return this.transfers.get(tableName);
  }
}
