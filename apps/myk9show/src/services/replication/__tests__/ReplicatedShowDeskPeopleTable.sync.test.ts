/**
 * MYK9-1071: the people replica syncs every person RLS shows this user, and a
 * person save queues only the changed allowlisted columns through
 * update_person_details_versioned, with the OCC token filled at send time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncReplicatedTableAdapter } from '@myk9/replication';

const { calls, response, captured } = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  response: { data: [] as unknown[] | null, error: null as { message: string } | null },
  captured: {
    adapter: null as SyncReplicatedTableAdapter<unknown, { id: string }> | null,
    options: null as Record<string, unknown> | null,
  },
}));

function makeBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'gt', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: typeof response) => unknown) => resolve(response);
  return builder;
}

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      calls.push(['from', table]);
      return makeBuilder();
    },
  },
}));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@myk9/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/replication')>()),
  syncReplicatedTable: vi.fn(
    async (_table: unknown, adapter: never, _scope: unknown, options: Record<string, unknown>) => {
      captured.adapter = adapter;
      captured.options = options;
      return { tableName: 'people', success: true, operation: 'incremental-sync', rowsAffected: 0 };
    }
  ),
}));

import {
  PERSON_QUEUED_UPDATE_RPC,
  ReplicatedShowDeskPeopleTable,
} from '../ReplicatedShowDeskPeopleTable';
import { PEOPLE_REPLICA_COLUMNS } from '@/services/database/users/peopleColumns';
import type { ReplicatedShowDeskPerson } from '../personRowMapping';

const stored: ReplicatedShowDeskPerson = {
  id: 'p1',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'pat@example.test',
  phone: '555-0100',
  address: '9 Oak Ave',
  city: 'Edison',
  state: 'NJ',
  zipCode: '08817',
  authUserId: null,
  status: 'active',
};

type Queue = (
  operation: string,
  rowId: string,
  payload: Record<string, unknown>,
  dependsOn?: string[],
  rpc?: Record<string, unknown>
) => Promise<string | null>;

function tableWithRow(row: ReplicatedShowDeskPerson | null = stored) {
  const table = new ReplicatedShowDeskPeopleTable();
  vi.spyOn(table, 'get').mockResolvedValue(row);
  const set = vi.spyOn(table, 'set').mockResolvedValue({ written: true });
  const queue = vi
    .spyOn(table as unknown as { queueMutation: Queue }, 'queueMutation')
    .mockResolvedValue('mutation-1');
  return { table, set, queue };
}

describe('ReplicatedShowDeskPeopleTable sync (MYK9-1071)', () => {
  beforeEach(() => {
    calls.length = 0;
    response.data = [];
    response.error = null;
    captured.adapter = null;
  });

  it('forces a full sync until one has completed, and syncs incrementally after (P1)', async () => {
    const table = new ReplicatedShowDeskPeopleTable();
    vi.spyOn(table, 'removeStaleEntries').mockResolvedValue(0);
    const isCold = vi.spyOn(table, 'isCold').mockResolvedValue(true);
    await table.sync();
    expect(captured.options).toMatchObject({ forceFullSync: true });

    isCold.mockResolvedValue(false);
    await table.sync();
    expect(captured.options).not.toHaveProperty('forceFullSync');
  });

  it('downloads the replica columns, live rows only, unscoped (RLS decides)', async () => {
    const table = new ReplicatedShowDeskPeopleTable();
    vi.spyOn(table, 'removeStaleEntries').mockResolvedValue(0);
    await table.sync();

    calls.length = 0;
    await captured.adapter!.fetchRemoteRows({
      scope: {},
      since: 0,
      localRows: [],
      forceFullSync: true,
    });
    expect(calls).toEqual([
      ['from', 'people'],
      ['select', PEOPLE_REPLICA_COLUMNS],
      ['is', 'deleted_at', null],
      ['gt', 'updated_at', new Date(0).toISOString()],
      ['order', 'updated_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['limit', 1000],
    ]);
  });

  it('resolves a clean conflict to the server copy', async () => {
    const table = new ReplicatedShowDeskPeopleTable();
    vi.spyOn(table, 'removeStaleEntries').mockResolvedValue(0);
    await table.sync();
    const resolve = captured.adapter!.resolveConflict as unknown as (
      local: ReplicatedShowDeskPerson,
      remote: ReplicatedShowDeskPerson
    ) => ReplicatedShowDeskPerson;
    const remote = { ...stored, city: 'Server' };
    expect(resolve({ ...stored, city: 'Local' }, remote)).toBe(remote);
  });

  it('prunes against the complete live id set after a successful sync', async () => {
    const table = new ReplicatedShowDeskPeopleTable();
    const prune = vi.spyOn(table, 'removeStaleEntries').mockResolvedValue(1);
    response.data = [{ id: 'p1' }, { id: 'p2' }];
    await table.sync();
    expect(prune).toHaveBeenCalledWith(new Set(['p1', 'p2']));
  });

  it('prunes nothing when the live id read fails', async () => {
    const table = new ReplicatedShowDeskPeopleTable();
    const prune = vi.spyOn(table, 'removeStaleEntries').mockResolvedValue(0);
    response.error = { message: 'boom' };
    await table.sync();
    expect(prune).not.toHaveBeenCalled();
  });
});

describe('ReplicatedShowDeskPeopleTable.updatePerson (MYK9-1071)', () => {
  it('queues only the changed columns through the versioned RPC', async () => {
    const { table, set, queue } = tableWithRow();

    await table.updatePerson(
      'p1',
      { first_name: 'Patricia', phone: '555-0100', city: 'Metuchen' },
      { date_of_birth: '1990-02-03' }
    );

    expect(set).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ firstName: 'Patricia', city: 'Metuchen', _syncStatus: 'pending' }),
      true
    );
    expect(queue).toHaveBeenCalledWith(
      'UPDATE',
      'p1',
      { id: 'p1', first_name: 'Patricia', city: 'Metuchen' },
      undefined,
      {
        name: PERSON_QUEUED_UPDATE_RPC,
        args: {
          p_person_id: 'p1',
          p_expected_version: null,
          p_people: { first_name: 'Patricia', city: 'Metuchen' },
          p_private: { date_of_birth: '1990-02-03' },
        },
        versionArg: 'p_expected_version',
      }
    );
  });

  it('refuses email (online only) before writing or queueing anything', async () => {
    const { table, set, queue } = tableWithRow();

    await expect(
      table.updatePerson('p1', { first_name: 'Patricia', email: 'new@example.test' })
    ).rejects.toThrow(/email/);
    expect(set).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });

  it('refuses any column outside the allowlist', async () => {
    const { table, queue } = tableWithRow();
    await expect(table.updatePerson('p1', { status: 'suspended' })).rejects.toThrow(/status/);
    await expect(table.updatePerson('p1', { auth_user_id: 'x' })).rejects.toThrow(/auth_user_id/);
    expect(queue).not.toHaveBeenCalled();
  });

  it('queues nothing when nothing changed', async () => {
    const { table, set, queue } = tableWithRow();
    await expect(table.updatePerson('p1', { first_name: 'Pat', city: 'Edison' })).resolves.toBe(
      null
    );
    expect(set).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });

  it('throws for a person missing from the replica', async () => {
    const { table } = tableWithRow(null);
    await expect(table.updatePerson('p1', { city: 'X' })).rejects.toThrow(/not found/);
  });
});
