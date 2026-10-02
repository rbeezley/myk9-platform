/**
 * CRUD standard Phase 2: no app code path issues a hard delete for clubs, shows,
 * trials, classes, entries, dogs or people.
 *
 * Behavioral, not a grep: every object is deleted (and restored) through the one
 * client delete path — the real services, the real replicated tables and the
 * real stores — over a recording Supabase client. The test then asserts on what
 * actually reached the two places a hard delete could come from:
 *   - the network: no `.from(<core table>).delete()`, only the soft RPCs;
 *   - the replication queue: no DELETE mutation queued for any table, so the
 *     replication executor is never asked to hard-delete a row.
 * Permanent purge stays a site-admin action on Admin → Deleted Items, which does
 * not go through this path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const recorded = vi.hoisted(() => ({
  rpcs: [] as string[],
  tableCalls: [] as Array<{ table: string; method: string }>,
}));

// Nothing queued in these tests: the queue itself is covered by deleteUnsyncedWork's own test.
vi.mock('./deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('./deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/services/database/supabaseClient', () => {
  /** A PostgREST-ish builder that records every method called on a table. */
  function tableBuilder(table: string) {
    const result = { data: [], error: null, count: 0 };
    const builder: Record<string, unknown> = {};
    const record = (method: string) => () => {
      recorded.tableCalls.push({ table, method });
      return builder;
    };
    for (const method of [
      'select',
      'insert',
      'update',
      'upsert',
      'delete',
      'eq',
      'neq',
      'in',
      'is',
      'gt',
      'gte',
      'lt',
      'order',
      'limit',
      'range',
      'or',
      'not',
    ]) {
      builder[method] = record(method);
    }
    builder.single = () => Promise.resolve({ data: null, error: null });
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
  }
  const rpcResult = (name: string) => {
    if (name === 'soft_delete_entry') return { data: 7, error: null };
    if (name.startsWith('soft_delete_') || name.startsWith('restore_')) {
      return { data: [{ id: 'x', name: 'x' }], error: null };
    }
    return { data: null, error: null };
  };
  const supabase = {
    rpc: (name: string) => {
      recorded.rpcs.push(name);
      const value = rpcResult(name);
      return {
        single: () =>
          Promise.resolve({
            ...value,
            data: Array.isArray(value.data) ? value.data[0] : value.data,
          }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve),
      };
    },
    from: (table: string) => tableBuilder(table),
  };
  return { supabase, default: supabase, logQuery: vi.fn(), createDatabaseError };
});

import { ReplicatedTable } from '@myk9/replication';
import { deleteRecords, restoreRecords } from './deleteRecords';
import type { DeleteObjectKind } from './deleteTypes';

const CORE_TABLES = ['clubs', 'shows', 'trials', 'classes', 'entries', 'dogs', 'people'];
const KINDS: DeleteObjectKind[] = ['club', 'show', 'trial', 'class', 'entry', 'dog', 'person'];
const RPC_NAME: Record<DeleteObjectKind, string> = {
  club: 'club',
  show: 'show',
  trial: 'trial',
  class: 'class',
  entry: 'entry',
  dog: 'dog',
  person: 'person',
};

describe('the one delete path never hard-deletes a core object', () => {
  let queueSpy: { mock: { calls: unknown[][] }; mockRestore: () => void };

  beforeEach(() => {
    recorded.rpcs.length = 0;
    recorded.tableCalls.length = 0;
    queueSpy = vi.spyOn(
      ReplicatedTable.prototype as unknown as { queueMutation: (...args: unknown[]) => unknown },
      'queueMutation'
    );
  });

  afterEach(() => {
    queueSpy.mockRestore();
  });

  it.each(KINDS)('a %s delete soft-deletes through its RPC and queues no DELETE', async kind => {
    const target = {
      id: `${kind}-1`,
      name: kind,
      context: { showId: 'show-1', trialId: 'trial-1', classId: 'class-1' },
    };

    const result = await deleteRecords(kind, [target]);

    expect(result.failed).toEqual([]);
    expect(result.deleted.map(t => t.id)).toEqual([`${kind}-1`]);
    expect(recorded.rpcs).toContain(`soft_delete_${RPC_NAME[kind]}`);
    const hardDeletes = recorded.tableCalls.filter(
      call => call.method === 'delete' && CORE_TABLES.includes(call.table)
    );
    expect(hardDeletes).toEqual([]);
    const queuedDeletes = queueSpy.mock.calls.filter((call: unknown[]) => call[0] === 'DELETE');
    expect(queuedDeletes).toEqual([]);
  });

  it.each(KINDS)('Undo of a %s calls restore_ and queues no DELETE', async kind => {
    const target = { id: `${kind}-1`, name: kind, context: { showId: 'show-1' } };

    const result = await restoreRecords(kind, [target]);

    expect(result.failed).toEqual([]);
    expect(recorded.rpcs).toContain(`restore_${RPC_NAME[kind]}`);
    expect(recorded.tableCalls.filter(call => call.method === 'delete')).toEqual([]);
    expect(queueSpy.mock.calls.filter((call: unknown[]) => call[0] === 'DELETE')).toEqual([]);
  });

  it('a bulk delete of every kind together still never reaches a hard delete', async () => {
    for (const kind of KINDS) {
      await deleteRecords(kind, [
        { id: `${kind}-a`, name: 'a' },
        { id: `${kind}-b`, name: 'b' },
      ]);
    }
    expect(recorded.tableCalls.filter(call => call.method === 'delete')).toEqual([]);
    expect(queueSpy.mock.calls.filter((call: unknown[]) => call[0] === 'DELETE')).toEqual([]);
  });
});
