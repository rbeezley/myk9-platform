import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, MutationManager, REPLICATION_STORES } from '@myk9/replication';
import { ReplicatedShowDeskPeopleTable } from '../ReplicatedShowDeskPeopleTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const CONTACTS = { email: 'a@example.com', phone: '555-0100', address: '12 Ring Road' };
const NONE = { email: null, phone: null, address: null };

/**
 * MYK9-2356: at sign-out the session is already gone, so the strip must not ask the
 * mutation queue (which needs a signed-in user) whether a row was sent. It reads the
 * row's own replication state. Real table, real queue, no session.
 */
describe('sign-out strip of desk people with no session (MYK9-2356)', () => {
  let user: string | null;
  let manager: MutationManager;
  let table: ReplicatedShowDeskPeopleTable;

  const rawGet = async (id: string) => {
    const db = await databaseManager.getDatabase('ReplicatedTables');
    return db.get(REPLICATION_STORES.REPLICATED_TABLES, ['people', id]);
  };

  const addSent = async (id: string) => {
    await table.createPerson({ id, firstName: id, lastName: 'Sent', ...CONTACTS });
    await manager.uploadPendingMutations();
  };

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('MutationManager');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    user = 'secretary-1';
    const client = {
      from: () => ({
        insert: () => ({ select: async () => ({ data: [{ id: 'x' }], error: null, status: 201 }) }),
      }),
      rpc: vi.fn(),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      getCurrentUserId: async () => {
        if (!user) throw new Error('Not authenticated');
        return user;
      },
      getCachedUserId: () => null,
      getOwnerIsAnonymous: () => false,
      getCurrentUploadContext: async () => ({ authUserId: user ?? '', supabaseClient: client }),
    });
    table = new ReplicatedShowDeskPeopleTable();
    table.setMutationManager(manager);
  });

  afterEach(async () => {
    manager.destroy();
    await databaseManager.reset();
  });

  it('strips sent rows, keeps names, and keeps every field of unsent rows', async () => {
    await addSent('sent-1');
    await addSent('sent-2');
    user = 'secretary-1';
    await table.createPerson({ id: 'unsent', firstName: 'Un', lastName: 'Sent', ...CONTACTS });

    user = null; // auth-js removes the session before it emits SIGNED_OUT
    await expect(table.redactSentContacts()).resolves.toBeUndefined();

    for (const id of ['sent-1', 'sent-2']) {
      expect((await rawGet(id)).data).toEqual(expect.objectContaining({ firstName: id, ...NONE }));
    }
    expect((await rawGet('unsent')).data).toEqual(
      expect.objectContaining({ firstName: 'Un', ...CONTACTS })
    );
  });

  it('holds after a reload: a fresh table with no mutation manager and no session', async () => {
    await addSent('sent-1');
    await table.createPerson({ id: 'unsent', firstName: 'Un', lastName: 'Sent', ...CONTACTS });
    user = null;
    await table.redactSentContacts();

    const reloaded = new ReplicatedShowDeskPeopleTable();
    await reloaded.redactSentContacts();

    expect((await rawGet('sent-1')).data).toEqual(expect.objectContaining(NONE));
    expect((await rawGet('unsent')).data).toEqual(expect.objectContaining(CONTACTS));
  });

  it('a row with unknown state counts as unsent for that row only', async () => {
    await addSent('sent-1');
    await addSent('odd');
    const db = await databaseManager.getDatabase('ReplicatedTables');
    const odd = await rawGet('odd');
    delete odd.isDirty;
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, odd);
    user = null;

    await table.redactSentContacts();

    expect((await rawGet('odd')).data).toEqual(expect.objectContaining(CONTACTS));
    expect((await rawGet('sent-1')).data).toEqual(expect.objectContaining(NONE));
  });

  it('one row that fails does not stop the others', async () => {
    await addSent('bad');
    await addSent('good');
    user = null;
    const internals = table as unknown as {
      init: () => ReturnType<typeof databaseManager.getDatabase>;
    };
    const db = await internals.init();
    let calls = 0;
    const flaky = new Proxy(db, {
      get(target, prop) {
        if (prop === 'transaction') {
          return (...args: Parameters<typeof target.transaction>) => {
            calls += 1;
            if (calls === 1) throw new Error('boom');
            return target.transaction(...args);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    vi.spyOn(internals, 'init').mockResolvedValue(flaky);

    await expect(table.redactSentContacts()).resolves.toBeUndefined();

    const stripped = [(await rawGet('bad')).data, (await rawGet('good')).data].filter(
      data => data.phone === null
    );
    expect(stripped).toHaveLength(1);
  });
});
