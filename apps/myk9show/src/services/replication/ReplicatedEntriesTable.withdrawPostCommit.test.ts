/**
 * MYK9-749: once withdraw_own_entry has COMMITTED, the local cache refresh is
 * an optimisation. An IndexedDB failure there must not turn a withdrawal the
 * server already recorded into a "withdrawal failed" the exhibitor would retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable } from './ReplicatedEntriesTable';

const supabaseMocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: supabaseMocks.rpc, from: supabaseMocks.from },
}));

function mockReadBack(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.maybeSingle = vi.fn(() => Promise.resolve(result));
  supabaseMocks.from.mockReturnValue(node);
}

describe('ReplicatedEntriesTable.withdrawOwnEntry after the server commits', () => {
  const entry = {
    id: 'entry-1',
    showId: 'show-1',
    classId: 'class-1',
    entryStatus: 'confirmed',
    paymentStatus: 'pending',
    checkInStatus: 'no-status',
    isScored: false,
    isInRing: false,
  };
  let table: ReplicatedEntriesTable;

  beforeEach(() => {
    vi.clearAllMocks();
    table = new ReplicatedEntriesTable();
    const internals = table as unknown as Record<string, unknown>;
    // The pre-RPC read succeeds; every read after the commit hits a broken store.
    internals.get = vi
      .fn()
      .mockResolvedValueOnce(entry)
      .mockRejectedValue(new Error('IndexedDB connection lost'));
    internals.set = vi.fn().mockRejectedValue(new Error('IndexedDB connection lost'));
    internals.getServerVersion = vi.fn().mockResolvedValue(6);
    supabaseMocks.rpc.mockResolvedValue({ data: 7, error: null });
  });

  it('reports the committed withdrawal as done when the read-back succeeds but the store fails', async () => {
    mockReadBack({ data: { id: 'entry-1', entry_status: 'withdrawn', version: 7 }, error: null });

    await expect(
      table.withdrawOwnEntry('entry-1', { kind: 'withdraw', reason: 'in_season' })
    ).resolves.toEqual({ from: 'confirmed', to: 'withdrawn' });
  });

  it('reports the committed pull as done when the read-back fails and the store fails', async () => {
    mockReadBack({ data: null, error: { message: 'network' } });

    await expect(table.withdrawOwnEntry('entry-1', { kind: 'pull' })).resolves.toEqual({
      from: 'confirmed',
      to: 'scratched',
    });
  });
});
