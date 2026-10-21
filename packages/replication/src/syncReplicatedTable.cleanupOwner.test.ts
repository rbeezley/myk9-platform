import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTable } from './core/ReplicatedTable';
import { MutationManager } from './MutationManager';
import { syncReplicatedTable, type SyncReplicatedTableAdapter } from './syncReplicatedTable';
import { parseUpdatedAtMs } from './parseUpdatedAt';
import { configureRemoteCountCadence } from './remoteCountCadence';
import type { SyncResult } from './types';

/**
 * MYK9-1250: stale cleanup is pinned to the account whose server response
 * proved a row absent. The session switching back to account B while A's pass
 * is applying must never let A's cleanup delete B's cached rows.
 */

interface LocalRow {
  id: string;
  showId: string;
  name: string;
}

class OwnedTable extends ReplicatedTable<LocalRow> {
  override usesAccountOwnedRows(): boolean {
    return true;
  }
  async sync(): Promise<SyncResult> {
    throw new Error('not used');
  }
  protected resolveConflict(_local: LocalRow, remote: LocalRow): LocalRow {
    return remote;
  }
}

const who = { current: 'user-a' as string | null };
const row = (id: string, showId = 'show-1'): LocalRow => ({ id, showId, name: id });
const CHANGED = 'The signed-in account changed during the sync; nothing was completed.';

function adapter(
  remote: () => LocalRow[],
  mode: 'scoped' | 'unscoped'
): SyncReplicatedTableAdapter<LocalRow, LocalRow> {
  return {
    fetchRemoteRows: vi.fn(async () => remote()),
    getRemoteRowCount: vi.fn(async () => remote().length),
    getRemoteId: r => r.id,
    getRemoteUpdatedAt: r => parseUpdatedAtMs((r as { updated_at?: number }).updated_at),
    toLocalRow: r => r,
    ...(mode === 'scoped'
      ? {
          filterLocalRows: (rows, scope) => rows.filter(r => r.showId === scope.value),
          cleanupStaleRowsOnFullSync: true,
        }
      : { shouldCleanupStaleRows: true }),
  };
}

describe('stale cleanup is pinned to the syncing account (MYK9-1250)', () => {
  let table: OwnedTable;

  beforeEach(async () => {
    // These tests sync one table repeatedly and rely on each pass counting (MYK9-1301).
    configureRemoteCountCadence({ everyPass: true });
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
    who.current = 'user-b';
    table = new OwnedTable(`cleanup_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    table.setMutationManager({
      resolveCurrentUserId: async () => who.current,
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
  });

  afterEach(async () => {
    const { databaseManager } = await import('./core/DatabaseManager');
    await databaseManager.reset();
  });

  const rowsOf = async (owner: string) => {
    who.current = owner;
    return (await table.getAllOrThrow()).map(r => r.id).sort();
  };
  const raw = (id: string) => table.getReplicatedRowIncludingOtherAccounts(id);

  /** B downloads a show clean, then A takes the device and starts a full sync of it. */
  const seedBThenSignInAsA = async (mode: 'scoped' | 'unscoped') => {
    await syncReplicatedTable(
      table,
      adapter(() => [row('b-only')], mode),
      { value: 'show-1' }
    );
    who.current = 'user-a';
  };

  /** Switch back to B the moment A's rows are written: after the identity check, before cleanup. */
  const switchToBAfterWrite = () => {
    const original = table.batchSet.bind(table);
    vi.spyOn(table, 'batchSet').mockImplementation(async (...args) => {
      await original(...args);
      who.current = 'user-b';
    });
  };

  for (const mode of ['scoped', 'unscoped'] as const) {
    it(`${mode}: B's clean cached row survives A's stale completion, which fails`, async () => {
      await seedBThenSignInAsA(mode);
      switchToBAfterWrite();

      const result = await syncReplicatedTable(
        table,
        adapter(() => [row('a-only')], mode),
        { value: 'show-1' },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(CHANGED);
      expect(await rowsOf('user-b')).toEqual(['b-only']);
      expect((await raw('b-only'))?.data).toEqual(row('b-only'));
      expect((await table.getSyncMetadata('show-1'))?.syncedByAuthUserId).not.toBe('user-a');
    });
  }

  it("the same account's stale row is still removed, and its dirty and unrelated rows stay", async () => {
    who.current = 'user-a';
    await syncReplicatedTable(
      table,
      adapter(() => [row('a-old'), row('a-gone')], 'scoped'),
      {
        value: 'show-1',
      }
    );
    await syncReplicatedTable(
      table,
      adapter(() => [row('a-other', 'show-2')], 'scoped'),
      {
        value: 'show-2',
      }
    );
    await table.set('a-local', row('a-local'), true);

    const result = await syncReplicatedTable(
      table,
      adapter(() => [row('a-old')], 'scoped'),
      { value: 'show-1' }
    );

    expect(result.success).toBe(true);
    expect(await rowsOf('user-a')).toEqual(['a-local', 'a-old', 'a-other']);
  });

  it("another account's rows in the same table survive an ordinary sync", async () => {
    await syncReplicatedTable(
      table,
      adapter(() => [row('b-only')], 'scoped'),
      {
        value: 'show-1',
      }
    );
    who.current = 'user-a';
    const result = await syncReplicatedTable(
      table,
      adapter(() => [row('a1')], 'scoped'),
      {
        value: 'show-1',
      }
    );

    expect(result.success).toBe(true);
    expect(await rowsOf('user-b')).toEqual(['b-only']);
  });

  for (const mode of ['scoped', 'unscoped'] as const) {
    it(`${mode}: identity flipping between the guard and the delete removes nothing of the new account`, async () => {
      await seedBThenSignInAsA(mode);
      // Flip after the early identity check, immediately before the delete transaction.
      const original = table.removeStaleEntries.bind(table);
      vi.spyOn(table, 'removeStaleEntries').mockImplementation(async (ids, options) => {
        who.current = 'user-b';
        return original(ids, options);
      });

      const result = await syncReplicatedTable(
        table,
        adapter(() => [row('a-only')], mode),
        { value: 'show-1' }
      );

      expect(result.success).toBe(false);
      expect(await rowsOf('user-b')).toEqual(['b-only']);
    });
  }
});
