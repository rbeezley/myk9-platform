import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, MutationManager, REPLICATION_STORES } from '@myk9/replication';
import { ReplicatedShowDeskPeopleTable } from '../ReplicatedShowDeskPeopleTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * MYK9-2277: a person added at the desk is private to the account that added it.
 * One browser, two accounts, the real table and the real mutation queue.
 */
describe('desk people are private to the account that added them (MYK9-2277)', () => {
  let user: string;
  let insert: ReturnType<typeof vi.fn>;
  let manager: MutationManager;
  let table: ReplicatedShowDeskPeopleTable;

  const seeNames = async () => (await table.getAllOrThrow()).map(p => p.id).sort();

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('MutationManager');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    user = 'secretary-1';
    insert = vi.fn(() => ({
      select: async () => ({ data: [{ id: 'sent' }], error: null, status: 201 }),
    }));
    const client = {
      from: () => ({ insert }),
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      getCurrentUserId: async () => user,
      getCachedUserId: () => null,
      getOwnerIsAnonymous: () => false,
      getCurrentUploadContext: async () => ({ authUserId: user, supabaseClient: client }),
    });
    table = new ReplicatedShowDeskPeopleTable();
    table.setMutationManager(manager);
  });

  afterEach(async () => {
    manager.destroy();
    await databaseManager.reset();
  });

  it('a judge signing in cannot read the walk-in; the secretary still can', async () => {
    await table.createPerson({
      id: 'walk-in',
      firstName: 'Jamie',
      lastName: 'Walker',
      email: 'jamie@example.com',
      phone: '555-0100',
      address: '12 Ring Road',
    });
    expect(await seeNames()).toEqual(['walk-in']);

    user = 'judge-1';
    expect(await seeNames()).toEqual([]);
    expect(await table.get('walk-in')).toBeNull();
    expect(await table.getReplicatedRow('walk-in')).toBeNull();
    expect(await table.getAllLocalIds()).toEqual(new Set());

    user = 'secretary-1';
    expect(await table.get('walk-in')).toEqual(
      expect.objectContaining({ phone: '555-0100', email: 'jamie@example.com' })
    );
  });

  it("the walk-in's queued INSERT is untouched by the judge's session and is sent intact", async () => {
    await table.createPerson({
      id: 'walk-in',
      firstName: 'Jamie',
      lastName: 'Walker',
      phone: '555',
    });

    user = 'judge-1';
    expect(await manager.getPendingMutationsForTable('people')).toEqual([]);
    expect(await manager.getPendingCount()).toBe(1);

    user = 'secretary-1';
    const queued = await manager.getPendingMutationsForTable('people');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toEqual(
      expect.objectContaining({
        operation: 'INSERT',
        rowId: 'walk-in',
        authUserId: 'secretary-1',
        tableName: 'people',
        data: expect.objectContaining({ id: 'walk-in', first_name: 'Jamie', phone: '555' }),
      })
    );
    await manager.uploadPendingMutations();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'walk-in', first_name: 'Jamie', phone: '555' })
    );
    expect(await manager.getPendingCount()).toBe(0);
  });

  it('a walk-in saved before this change (no owner) is shown to no account but is still sent', async () => {
    await table.createPerson({ id: 'legacy', firstName: 'Old', lastName: 'Row', phone: '555' });
    const db = await databaseManager.getDatabase('ReplicatedTables');
    const key = ['people', 'legacy'];
    const stored = await db.get(REPLICATION_STORES.REPLICATED_TABLES, key);
    delete stored.ownerAuthUserId;
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, stored);

    for (const who of ['secretary-1', 'judge-1']) {
      user = who;
      expect(await seeNames()).toEqual([]);
      expect(await table.get('legacy')).toBeNull();
    }

    user = 'secretary-1';
    await manager.uploadPendingMutations();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'legacy', phone: '555' }));
    expect(await manager.getPendingCount()).toBe(0);
  });
});
