/**
 * MYK9-1071: the registrations replica syncs every registration RLS shows this
 * user, and an edit queues a full-row UPDATE restricted to the declared columns.
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
      return { tableName: 'dog_registrations', success: true, operation: 'full-sync' };
    }
  ),
}));

import {
  REGISTRATION_STILL_BEING_CREATED,
  ReplicatedDogRegistrationsTable,
} from '../ReplicatedDogRegistrationsTable';
import {
  DOG_REGISTRATION_REPLICA_COLUMNS,
  REGISTRATION_UPDATE_COLUMNS,
  rowToRegistration,
  type DogRegistrationRow,
} from '../dogRegistrationRowMapping';

const serverRow: DogRegistrationRow = {
  id: 'reg-1',
  dog_id: 'dog-1',
  organization: 'AKC (American Kennel Club)',
  registration_number: 'SR1',
  registration_date: '2020-01-01',
  verified: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  registered_name: 'CH Bea',
  breed: 'Beagle',
  variety: '13 inch',
  status: 'active',
  application_number: null,
  submission_date: null,
  certificate: null,
  is_primary: true,
  dog_deleted_at: null,
  version: 4,
};

describe('ReplicatedDogRegistrationsTable sync (MYK9-1071)', () => {
  beforeEach(() => {
    calls.length = 0;
    response.data = [];
    response.error = null;
  });

  it('forces a full sync until one has completed, and syncs incrementally after (P1)', async () => {
    const table = new ReplicatedDogRegistrationsTable();
    vi.spyOn(table, 'removeStaleEntries').mockResolvedValue(0);
    const isCold = vi.spyOn(table, 'isCold').mockResolvedValue(true);
    await table.sync();
    expect(captured.options).toMatchObject({ forceFullSync: true });

    isCold.mockResolvedValue(false);
    await table.sync();
    expect(captured.options).not.toHaveProperty('forceFullSync');
  });

  it('downloads the declared columns (version included), unscoped', async () => {
    const table = new ReplicatedDogRegistrationsTable();
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
      ['from', 'dog_registrations'],
      ['select', DOG_REGISTRATION_REPLICA_COLUMNS],
      ['gt', 'updated_at', new Date(0).toISOString()],
      ['order', 'updated_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['limit', 1000],
    ]);
    expect(DOG_REGISTRATION_REPLICA_COLUMNS).toContain('version');
    expect(DOG_REGISTRATION_REPLICA_COLUMNS).not.toContain('*');
  });

  it('keeps the resolver fields of a synced row in the read shape', () => {
    const table = new ReplicatedDogRegistrationsTable();
    const row = table.toSupabaseRow(rowToRegistration(serverRow));
    expect(row).toMatchObject({
      id: 'reg-1',
      dog_id: 'dog-1',
      is_primary: true,
      created_at: '2026-01-01T00:00:00.000Z',
      variety: '13 inch',
      registration_date: '2020-01-01',
    });
  });

  it('prunes hard-deleted rows against the complete live id set', async () => {
    const table = new ReplicatedDogRegistrationsTable();
    const prune = vi.spyOn(table, 'removeStaleEntries').mockResolvedValue(1);
    response.data = [{ id: 'reg-1' }];
    await table.sync();
    expect(prune).toHaveBeenCalledWith(new Set(['reg-1']));
  });
});

describe('ReplicatedDogRegistrationsTable.updateRegistration (MYK9-1071)', () => {
  it('writes locally and queues a full-row UPDATE of the declared columns only', async () => {
    const table = new ReplicatedDogRegistrationsTable();
    vi.spyOn(table, 'get').mockResolvedValue(rowToRegistration(serverRow));
    const set = vi.spyOn(table, 'set').mockResolvedValue({ written: true });
    const queue = vi
      .spyOn(
        table as unknown as {
          queueMutation: (op: string, id: string, payload: Record<string, unknown>) => unknown;
        },
        'queueMutation'
      )
      .mockResolvedValue('mutation-1');

    await table.updateRegistration('reg-1', { registeredName: 'GCH Bea' });

    expect(set).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ registeredName: 'GCH Bea', _syncStatus: 'pending' }),
      true
    );
    const [operation, id, payload] = queue.mock.calls[0]!;
    expect([operation, id]).toEqual(['UPDATE', 'reg-1']);
    expect(Object.keys(payload).sort()).toEqual(
      ['id', 'updated_at', ...REGISTRATION_UPDATE_COLUMNS].sort()
    );
    expect(payload).toMatchObject({ registered_name: 'GCH Bea', breed: 'Beagle' });
    for (const forbidden of ['dog_id', 'created_at', 'verified', 'is_primary', 'version']) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });
});

describe('ReplicatedDogRegistrationsTable mirrors (MYK9-1071 P1)', () => {
  it('refuses to queue an UPDATE for a local mirror that has no INSERT of its own', async () => {
    const table = new ReplicatedDogRegistrationsTable();
    vi.spyOn(table, 'get').mockResolvedValue({ ...rowToRegistration(serverRow), _localOnly: true });
    vi.spyOn(table, 'getPendingMutationIdsForRow').mockResolvedValue([]);
    const set = vi.spyOn(table, 'set').mockResolvedValue({ written: true });

    await expect(table.updateRegistration('reg-1', { registeredName: 'X' })).rejects.toThrow(
      REGISTRATION_STILL_BEING_CREATED
    );
    expect(set).not.toHaveBeenCalled();
  });

  it('allows editing a queued add before it uploads (its INSERT precedes the UPDATE)', async () => {
    const table = new ReplicatedDogRegistrationsTable();
    vi.spyOn(table, 'get').mockResolvedValue({ ...rowToRegistration(serverRow), _localOnly: true });
    vi.spyOn(table, 'getPendingMutationIdsForRow').mockResolvedValue(['insert-1']);
    vi.spyOn(table, 'set').mockResolvedValue({ written: true });
    vi.spyOn(
      table as unknown as { queueMutation: () => Promise<string> },
      'queueMutation'
    ).mockResolvedValue('m');
    await expect(table.updateRegistration('reg-1', { registeredName: 'X' })).resolves.toBe('m');
  });
});
