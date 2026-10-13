import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { MutationManager } from '@myk9/replication';
import { ReplicatedWaitlistEntriesTable } from './ReplicatedWaitlistEntriesTable';
import { verifyWaitlistEntriesGone } from './waitlistScopeProof';
import { supabase } from '@/services/database/supabaseClient';

/**
 * MYK9-1148: a zero-row fetch over a replica that holds rows is proof of
 * nothing (MYK9-880). The independent proof must be asked about EVERY row the
 * device holds, whichever account owns it: rows a pre-ownership build left
 * ownerless are invisible to the signed-in account, and an empty held list
 * would read as "nothing to prove" and stamp the waitlist complete.
 */
vi.mock('./waitlistScopeProof', () => ({
  // The real proof: nothing held is vacuously gone; anything else cannot be told here.
  verifyWaitlistEntriesGone: vi.fn(async (ids: readonly string[]) => ids.length === 0),
}));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const who = { current: 'user-a' as string | null };

/** `from('waitlist_entries')` as an RLS gap answers it: head count 0, no rows. */
function mockEmptyServer() {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.gt = vi.fn(() => node);
  node.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  node.then = (resolve: (v: unknown) => unknown) => resolve({ count: 0, error: null });
  vi.mocked(supabase.from).mockReturnValue(node as never);
}

describe('waitlist empty-scope proof counts every account (MYK9-1148)', () => {
  let table: ReplicatedWaitlistEntriesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(verifyWaitlistEntriesGone).mockClear();
    who.current = null;
    table = new ReplicatedWaitlistEntriesTable();
    table.setMutationManager({
      resolveCurrentUserId: async () => who.current,
      getPendingMutationsForRow: async () => [],
      getFailedMutations: async () => [],
      rowRefetchers: { register: () => () => {} },
    } as unknown as MutationManager);
    await table.clearCache();
    // A pre-ownership build's rows: no owner, so no account can read them.
    await table.batchSet([
      { id: 'old1', classId: 'c1', dogId: 'd1', position: 1, status: 'waiting' },
    ]);
    mockEmptyServer();
    who.current = 'user-a';
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('asks the server about the ownerless rows the signed-in account cannot read', async () => {
    expect(await table.getAllOrThrow()).toEqual([]);

    await table.sync();

    expect(verifyWaitlistEntriesGone).toHaveBeenCalledWith(['old1']);
  });

  it('does not stamp the waitlist complete when that proof cannot tell', async () => {
    await table.sync();

    expect((await table.getSyncMetadata())?.syncedByAuthUserId).toBeUndefined();
    expect((await table.getAllOrThrowIncludingOtherAccounts()).map(r => r.id)).toEqual(['old1']);
  });
});
