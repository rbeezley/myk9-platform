import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same shape as reads.countActiveEntriesByDog.test.ts: a direct PostgREST
// head-count, so only the supabase client is mocked and the replication imports
// reads.ts pulls in are stubbed so the module graph loads.
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

import { countBlockingEntriesByDog } from './reads';

interface ChainCalls {
  select?: [string, { count: string; head: boolean }];
  eq?: [string, string];
  is?: [string, null];
  or?: [string];
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
    is: (col: string, val: null) => {
      calls.is = [col, val];
      return chain;
    },
    // Last call in the chain resolves to the PostgREST result.
    or: (filter: string) => {
      calls.or = [filter];
      return Promise.resolve(result);
    },
  };
  return { chain, calls };
}

describe('countBlockingEntriesByDog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts live entries matching the delete-blocking predicate', async () => {
    const { chain, calls } = buildChain({ count: 2, error: null });
    mocks.supabaseFrom.mockReturnValue(chain);

    const result = await countBlockingEntriesByDog('dog-123');

    expect(result).toBe(2);
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('entries');
    expect(calls.select?.[1]).toEqual({ count: 'exact', head: true });
    expect(calls.eq).toEqual(['dog_id', 'dog-123']);
    // Tombstoned entries never block — they are already gone.
    expect(calls.is).toEqual(['deleted_at', null]);

    const filter = calls.or?.[0] ?? '';
    expect(filter).toContain('payment_status.eq.paid');
    expect(filter).toContain('is_scored.is.true');
    expect(filter).toContain('scoring_completed_at.not.is.null');
    expect(filter).toContain('result_status.neq.pending');
  });

  it('does not block on refunded or waived entries', async () => {
    const { chain, calls } = buildChain({ count: 0, error: null });
    mocks.supabaseFrom.mockReturnValue(chain);

    await countBlockingEntriesByDog('dog-123');

    // The money is not being kept in either case, so neither may appear in the
    // predicate — a blanket `payment_status.not.is.null` would trap both.
    const filter = calls.or?.[0] ?? '';
    expect(filter).not.toContain('refunded');
    expect(filter).not.toContain('waived');
  });

  it('returns 0 when PostgREST yields a null count', async () => {
    const { chain } = buildChain({ count: null, error: null });
    mocks.supabaseFrom.mockReturnValue(chain);

    await expect(countBlockingEntriesByDog('dog-123')).resolves.toBe(0);
  });

  it('throws when PostgREST returns an error', async () => {
    const { chain } = buildChain({ count: null, error: new Error('boom') });
    mocks.supabaseFrom.mockReturnValue(chain);

    await expect(countBlockingEntriesByDog('dog-123')).rejects.toThrow('boom');
  });
});
