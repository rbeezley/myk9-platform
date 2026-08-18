import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// countActiveEntriesByDog is a direct PostgREST head-count. We only need the
// supabase client mocked; the replication imports pulled in by reads.ts are
// stubbed so the module graph loads.
const mocks = vi.hoisted(() => ({
  logQuery: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: mocks.logQuery,
  supabase: { from: mocks.supabaseFrom },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({ replicatedEntriesTable: {} }));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({ replicatedDogsTable: {} }));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({ replicatedClassesTable: {} }));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({ replicatedShowsTable: {} }));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({ replicatedTrialsTable: {} }));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({ replicatedArmbandsTable: {} }));
vi.mock('@/services/mappers/entryMappers', () => ({ mapReplicatedEntryToDbRow: vi.fn() }));

import { countActiveEntriesByDog } from './reads';

interface ChainCalls {
  select?: [string, { count: string; head: boolean }];
  eq?: [string, string];
  is?: [string, null];
}

function buildChain(result: { count: number | null; error: unknown }) {
  const calls: ChainCalls = {};
  const chain = {
    select: (cols: string, opts: { count: string; head: boolean }) => {
      calls.select = [cols, opts];
      return chain;
    },
    eq: (col: string, val: string) => {
      calls.eq = [col, val];
      return chain;
    },
    // Last call in the chain resolves to the PostgREST result.
    is: (col: string, val: null) => {
      calls.is = [col, val];
      return Promise.resolve(result);
    },
  };
  return { chain, calls };
}

describe('countActiveEntriesByDog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts only live entries for the given dog (excludes tombstones)', async () => {
    const { chain, calls } = buildChain({ count: 16, error: null });
    mocks.supabaseFrom.mockReturnValue(chain);

    const result = await countActiveEntriesByDog('dog-123');

    expect(result).toBe(16);
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('entries');
    expect(calls.select?.[0]).toBe('id');
    expect(calls.select?.[1]).toEqual({ count: 'exact', head: true });
    expect(calls.eq).toEqual(['dog_id', 'dog-123']);
    // The critical filter: tombstoned (deleted_at) entries must be excluded.
    expect(calls.is).toEqual(['deleted_at', null]);
  });

  it('returns 0 when PostgREST yields a null count', async () => {
    const { chain } = buildChain({ count: null, error: null });
    mocks.supabaseFrom.mockReturnValue(chain);

    await expect(countActiveEntriesByDog('dog-123')).resolves.toBe(0);
  });

  it('throws when PostgREST returns an error', async () => {
    const { chain } = buildChain({ count: null, error: new Error('boom') });
    mocks.supabaseFrom.mockReturnValue(chain);

    await expect(countActiveEntriesByDog('dog-123')).rejects.toThrow('boom');
  });
});
