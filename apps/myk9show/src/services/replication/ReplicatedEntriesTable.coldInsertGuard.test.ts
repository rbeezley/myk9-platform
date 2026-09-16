/**
 * MYK9-575: the show-scoped replica may not be seeded ONE ROW AT A TIME.
 *
 * `entries` replicates per show, so on an account-level surface (/my-entries,
 * /exhibitor/entries) the store is legitimately EMPTY and
 * `readWithReplicationFallback({ verifyOnlineWhenEmpty: true })` falls through
 * to PostgREST only while the local result is empty. One stray single-row
 * INSERT makes the store non-empty and an unscoped read then returns that row
 * as the user's whole entry list (MYK9-573, and a second writer found in the
 * review of its fix).
 *
 * Both instances were fixed at their call site; these pin the invariant itself
 * at the choke point - `ReplicatedTable.set` refuses an INSERT on a show-scoped
 * table unless the write names its reason, and the sync door (`batchSet`) is
 * untouched.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { readWithReplicationFallback } from '@/services/database/_shared/read-shape';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const COLD_ROW = {
  id: 'entry-1',
  show_id: 'show-1',
  class_id: 'class-1',
  dog_id: 'dog-1',
  entry_status: 'confirmed',
  version: 7,
};

function entry(id: string): ReplicatedEntry {
  return {
    id,
    showId: 'show-1',
    classId: 'class-1',
    dogId: 'dog-1',
    entryStatus: 'confirmed',
  } as ReplicatedEntry;
}

/** The read-back chain: .from(view).select('*').eq('id', x).maybeSingle() */
function mockReadBack(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.maybeSingle = vi.fn(() => Promise.resolve(result));
  vi.mocked(supabase.from).mockReturnValue(node as never);
  return node;
}

describe('ReplicatedEntriesTable cold-insert guard (MYK9-575)', () => {
  let table: ReplicatedEntriesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(supabase.from).mockReset();
    table = new ReplicatedEntriesTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('refuses a bare single-row INSERT into an empty show-scoped store', async () => {
    await expect(table.set('entry-1', entry('entry-1'))).rejects.toThrow(/cold single-row INSERT/i);

    expect(await table.getAll()).toHaveLength(0);
  });

  it('leaves an account-level read falling through to PostgREST after a refused insert', async () => {
    await table.set('entry-1', entry('entry-1')).catch(() => undefined);

    const postgrest = vi.fn(async () => ({
      data: [entry('entry-1'), entry('entry-2')],
      error: null,
    }));
    const result = await readWithReplicationFallback<ReplicatedEntry[]>({
      replication: async () => ({ data: await table.getAll(), error: null }),
      postgrest,
      table: 'entries',
      operation: 'getUserEntries',
      errorData: [],
      verifyOnlineWhenEmpty: true,
    });

    expect(postgrest).toHaveBeenCalledTimes(1);
    expect(result.data).toHaveLength(2);
  });

  it('still UPDATES a row the store already holds', async () => {
    await table.batchSet([entry('entry-1')]);

    await table.set('entry-1', { ...entry('entry-1'), entryStatus: 'withdrawn' });

    expect((await table.get('entry-1'))?.entryStatus).toBe('withdrawn');
  });

  describe('positive controls - the legitimate doors still open', () => {
    it('the sync adapter seeds the replica through batchSet', async () => {
      await table.batchSet([entry('entry-1'), entry('entry-2')]);

      expect(await table.getAll()).toHaveLength(2);
    });

    it('createEntry inserts a brand-new local row', async () => {
      await table.createEntry(entry('entry-new'));

      expect(await table.get('entry-new')).not.toBeNull();
    });

    it('updateSecretaryLifecycleStatus seeds from the already-loaded secretary row', async () => {
      await table.updateSecretaryLifecycleStatus('entry-1', { entry_status: 'withdrawn' }, {
        showId: 'show-1',
      } as Partial<ReplicatedEntry>);

      expect(await table.get('entry-1')).not.toBeNull();
    });

    it('a write-path hydration (secretary check-in on a cold replica) still hydrates', async () => {
      mockReadBack({ data: COLD_ROW, error: null });

      await table.updateCheckInStatus('entry-1', 'checked-in');

      expect(await table.get('entry-1')).not.toBeNull();
    });
  });

  it('refuses the MYK9-573 read-back shape even with the call-site gate removed', async () => {
    // `hydrateConfirmedRow` (post-withdrawal) and `getOrHydrateEntry` (the Edit
    // Entry eligibility hook) both wrote a freshly-fetched server row back with
    // `set(id, row, false, undefined, serverVersion)`. Each is gated at its call
    // site; this asserts the gate is no longer the only thing holding.
    await expect(table.set('entry-1', entry('entry-1'), false, undefined, 7)).rejects.toThrow(
      /cold single-row INSERT/i
    );

    expect(await table.getAll()).toHaveLength(0);
  });
});
