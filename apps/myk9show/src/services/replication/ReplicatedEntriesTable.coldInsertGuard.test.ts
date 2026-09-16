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
import type { MutationManager } from '@myk9/replication';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { readWithReplicationFallback } from '@/services/database/_shared/read-shape';
import { supabase } from '@/services/database/supabaseClient';

// The Supabase client comes from the GLOBAL test mock (src/test/setup.ts), which
// keeps the real `createDatabaseError`; a file-local factory would shadow it.
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
  // The batch eligibility read terminates on `.in(...)` and returns a LIST.
  node.in = vi.fn(() =>
    Promise.resolve({ data: result.data == null ? [] : [result.data], error: result.error })
  );
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
    // databaseManager.reset() closes the connection but keeps the DATA, so an
    // empty store has to be asked for explicitly or a shuffled run inherits the
    // previous test's rows.
    await table.clearCache();
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

    it('a write-path hydration (secretary check-in on a cold replica) still hydrates', async () => {
      mockReadBack({ data: COLD_ROW, error: null });

      await table.updateCheckInStatus('entry-1', 'checked-in');

      expect(await table.get('entry-1')).not.toBeNull();
    });
  });

  it('refuses an ANONYMOUS server-row write-back (the shape MYK9-573 used)', async () => {
    // What this proves and what it does NOT: `hydrateConfirmedRow` and the Edit
    // Entry eligibility hook wrote a freshly-fetched server row back with
    // `set(id, row, false, undefined, serverVersion)`. Those specific call sites
    // are closed by the #2266 / #2264 fixes and by `getWithdrawEligibility`
    // writing nothing (asserted below) — this test does not re-prove that.
    // It proves the narrower, structural thing: that exact `set()` SHAPE, with
    // no stated reason, is now refused, so the next writer to reach for it
    // cannot re-open the hole silently.
    await expect(table.set('entry-1', entry('entry-1'), false, undefined, 7)).rejects.toThrow(
      /cold single-row INSERT/i
    );

    expect(await table.getAll()).toHaveLength(0);
  });

  it('the withdrawal eligibility read writes nothing into a cold store', async () => {
    // The read path must not be able to reach the opted-in write-path hydration
    // (`getOrHydrateEntryForWrite`). EntryEditDialog runs this for every class
    // row on open, on the account-level page.
    mockReadBack({ data: COLD_ROW, error: null });

    await table.getWithdrawEligibility('entry-1');

    expect(await table.getAll()).toHaveLength(0);
  });

  describe('updateSecretaryLifecycleStatus on a cold replica', () => {
    function wireMutationManager() {
      const queueMutation = vi.fn(async () => 'mutation-1');
      table.setMutationManager({
        queueMutation,
        acquireMutationWriteLock: vi.fn(async () => vi.fn()),
        getPendingCount: vi.fn(async () => 0),
      } as unknown as MutationManager);
      return queueMutation;
    }

    it('writes NO partial row when there is no cached row and no seed', async () => {
      // `bulkUpdateEntryStatus` (services/database/entries/secretary.ts) passes
      // no seed, so the only thing available to store would be
      // `{ id, entry_status }` — a partial row, written dirty and then uploaded.
      const queueMutation = wireMutationManager();

      await table.updateSecretaryLifecycleStatus('entry-1', { entry_status: 'withdrawn' });

      expect(await table.getAll()).toHaveLength(0);
      expect(queueMutation).toHaveBeenCalledTimes(1);
    });

    it('seeds the row when the caller supplies one', async () => {
      wireMutationManager();

      await table.updateSecretaryLifecycleStatus(
        'entry-1',
        { entry_status: 'withdrawn' },
        entry('entry-1')
      );

      expect((await table.get('entry-1'))?.showId).toBe('show-1');
    });
  });
});
