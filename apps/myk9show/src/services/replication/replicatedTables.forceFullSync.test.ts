/**
 * The trials, classes and shows tables honour the base contract's
 * `sync(scope, { forceFullSync })` by handing it to the sync engine, which
 * then fetches every row instead of the changes since the watermark. Offline
 * readiness prime depends on it to restore quota-evicted rows (MYK9-752).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { engine } = vi.hoisted(() => ({
  engine: vi.fn(async (..._args: unknown[]) => ({
    tableName: 'x',
    success: true,
    operation: 'incremental-sync' as const,
    rowsAffected: 0,
    duration: 0,
  })),
}));

vi.mock('@myk9/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/replication')>()),
  syncReplicatedTable: (...args: unknown[]) => engine(...args),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { ReplicatedTrialsTable } from './ReplicatedTrialsTable';
import { ReplicatedClassesTable } from './ReplicatedClassesTable';
import { ReplicatedShowsTable } from './ReplicatedShowsTable';

const tables = [
  ['trials', () => new ReplicatedTrialsTable()],
  ['classes', () => new ReplicatedClassesTable()],
  ['shows', () => new ReplicatedShowsTable()],
] as const;

describe.each(tables)('%s table sync forceFullSync', (_name, make) => {
  beforeEach(() => {
    engine.mockClear();
  });

  it('passes forceFullSync: true to the engine when asked', async () => {
    await make().sync('scope-1', { forceFullSync: true });
    expect(engine).toHaveBeenCalledTimes(1);
    expect(engine.mock.calls[0]?.[2]).toEqual({ value: 'scope-1' });
    expect(engine.mock.calls[0]?.[3]).toMatchObject({ forceFullSync: true });
  });

  it('stays incremental by default', async () => {
    await make().sync('scope-1');
    expect(engine.mock.calls[0]?.[3]).toMatchObject({ forceFullSync: false });
  });
});
