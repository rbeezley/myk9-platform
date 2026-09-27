import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// MYK9-822: countBlockingEntriesByDog calls the count_blocking_entries_by_dog
// RPC (a SECURITY DEFINER function sharing soft_delete_dog's own predicate),
// not a hand-rolled PostgREST filter. Same shape as
// reads.countActiveEntriesByDog.test.ts: only the supabase client is mocked,
// and the replication imports reads.ts pulls in are stubbed so the module
// graph loads.
const mocks = vi.hoisted(() => ({
  logQuery: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: mocks.logQuery,
  supabase: { from: mocks.supabaseFrom, rpc: mocks.supabaseRpc },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({ replicatedEntriesTable: {} }));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({ replicatedDogsTable: {} }));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({ replicatedClassesTable: {} }));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({ replicatedShowsTable: {} }));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({ replicatedTrialsTable: {} }));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({ replicatedArmbandsTable: {} }));
vi.mock('@/services/mappers/entryMappers', () => ({ mapReplicatedEntryToDbRow: vi.fn() }));

import { countBlockingEntriesByDog } from './reads';

describe('countBlockingEntriesByDog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the count_blocking_entries_by_dog RPC with the dog id', async () => {
    mocks.supabaseRpc.mockResolvedValue({ data: 2, error: null });

    const result = await countBlockingEntriesByDog('dog-123');

    expect(result).toBe(2);
    expect(mocks.supabaseRpc).toHaveBeenCalledWith('count_blocking_entries_by_dog', {
      p_dog_id: 'dog-123',
    });
    // A PostgREST table query would 403 the whole request over
    // result_status (MYK9-799); the RPC must be the only path taken.
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
  });

  it('returns 0 when the RPC yields a null count', async () => {
    mocks.supabaseRpc.mockResolvedValue({ data: null, error: null });

    await expect(countBlockingEntriesByDog('dog-123')).resolves.toBe(0);
  });

  it('throws when the RPC returns an error', async () => {
    mocks.supabaseRpc.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(countBlockingEntriesByDog('dog-123')).rejects.toThrow('boom');
  });
});
