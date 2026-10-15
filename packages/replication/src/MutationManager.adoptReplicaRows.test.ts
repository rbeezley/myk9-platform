import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ReplicatedTable } from './core/ReplicatedTable';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { MutationManager } from './MutationManager';
import type { ReplicationConflictSnapshot, SyncResult } from './types';

/**
 * MYK9-1205: adopting a held ringside score moves the replica ROW it targets to
 * the new owner too. Rows are read by owner: left behind, a conflicted entry would
 * be invisible to the new session and its upload could never be resolved.
 */
interface Row {
  id: string;
  showId: string;
  name: string;
}

class OwnedTable extends ReplicatedTable<Row> {
  override usesAccountOwnedRows(): boolean {
    return true;
  }
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }
  protected resolveConflict(_local: Row, remote: Row): Row {
    return remote;
  }
}

const data = (id: string, name = id): Row => ({ id, showId: 'show-x', name });
const RPCS = ['ringside_update_entry'] as const;
const SCORE_RPC = { name: 'ringside_update_entry', fields: { result_status: 'qualified' } };

describe('adoption moves the replica rows with the queue (MYK9-1205)', () => {
  let user = 'anon-1';
  let rpc: ReturnType<typeof vi.fn>;
  let table: OwnedTable;
  let manager: MutationManager;

  const queue = (rowId: string, owner = 'anon-1') => {
    user = owner;
    return manager.queueMutation(
      table.getTableName(),
      'UPDATE',
      rowId,
      { id: rowId },
      undefined,
      undefined,
      SCORE_RPC,
      false,
      undefined,
      'show-x'
    );
  };
  const snapshot = (rowId: string, version: number): ReplicationConflictSnapshot<Row> => ({
    tableName: table.getTableName(),
    rowId,
    fields: ['name'],
    localData: data(rowId, 'local'),
    remoteData: data(rowId, 'remote'),
    baseData: data(rowId, 'base'),
    baseVersion: 1,
    localVersion: version,
    remoteServerVersion: 3,
    detectedAt: Date.now(),
  });

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('MutationManager');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    user = 'anon-1';
    rpc = vi.fn(async () => ({ data: 2, error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      getCurrentUserId: async () => user,
      getCachedUserId: () => null,
      getOwnerIsAnonymous: id => id.startsWith('anon-'),
      getCurrentUploadContext: async () => ({ authUserId: user, supabaseClient: client }),
    });
    table = new OwnedTable(`rows_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager(manager);
    await table.batchSet([data('conflicted'), data('plain'), data('theirs')], undefined, 'anon-1');
    // A row some OTHER account owns, targeted by an anon-1 mutation: not ours to move.
    await table.batchSet([data('other-owner')], undefined, 'judge-9');
  });

  afterEach(async () => {
    manager.destroy();
    await databaseManager.reset();
  });

  it('shows an adopted CONFLICTED row to the new owner, resolvable, with its conflict kept', async () => {
    await queue('conflicted');
    const row = (await table.getReplicatedRowIncludingOtherAccounts('conflicted'))!;
    expect(await table.markConflict('conflicted', snapshot('conflicted', row.version), 3)).toBe(
      true
    );
    user = 'anon-2';
    expect(await table.getConflictedRows()).toEqual([]);

    await manager.adoptHeldMutations({ showId: 'show-x', toAuthUserId: 'anon-2', rpcNames: RPCS });

    expect((await table.getConflictedRows()).map(c => c.rowId)).toEqual(['conflicted']);
    expect(await table.resolveReplicationConflict('conflicted', 'keep-local')).toBe(true);
    expect(await table.getConflictedRows()).toEqual([]);
  });

  it('uploads an adopted non-conflicted row on the new session', async () => {
    await queue('plain');
    user = 'anon-2';
    await manager.adoptHeldMutations({ showId: 'show-x', toAuthUserId: 'anon-2', rpcNames: RPCS });
    await manager.uploadPendingMutations();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await manager.getPendingCount()).toBe(0);
  });

  it('moves only rows the adopted mutations name, and only from the same dead owner', async () => {
    await queue('plain');
    await queue('other-owner');
    user = 'anon-2';
    await manager.adoptHeldMutations({ showId: 'show-x', toAuthUserId: 'anon-2', rpcNames: RPCS });

    const owner = async (id: string) =>
      (await table.getReplicatedRowIncludingOtherAccounts(id))?.ownerAuthUserId;
    expect(await owner('plain')).toBe('anon-2');
    expect(await owner('theirs')).toBe('anon-1'); // no mutation names it
    expect(await owner('other-owner')).toBe('judge-9'); // different owner than the mutation's
    const db = await databaseManager.getDatabase('MutationManager');
    const queued = await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS);
    expect(queued.map(m => [m.rowId, m.authUserId]).sort()).toEqual([
      ['other-owner', 'anon-2'],
      ['plain', 'anon-2'],
    ]);
  });

  it('re-surfaces an adopted conflicted row through the existing replication:conflict event, with no sync', async () => {
    await queue('conflicted');
    await queue('plain');
    const row = (await table.getReplicatedRowIncludingOtherAccounts('conflicted'))!;
    await table.markConflict('conflicted', snapshot('conflicted', row.version), 3);
    user = 'anon-2';
    const dispatch = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: dispatch });

    try {
      await manager.adoptHeldMutations({
        showId: 'show-x',
        toAuthUserId: 'anon-2',
        rpcNames: RPCS,
      });
    } finally {
      vi.unstubAllGlobals();
    }

    const conflictEvents = dispatch.mock.calls
      .map(([event]) => event as CustomEvent)
      .filter(event => event.type === 'replication:conflict');
    expect(conflictEvents.map(event => event.detail.rowId)).toEqual(['conflicted']);
    expect(conflictEvents[0]?.detail).toMatchObject({ fields: ['name'], remoteServerVersion: 3 });
  });
});
