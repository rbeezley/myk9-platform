/**
 * MYK9-1476: a change to the signed-in user's active role set purges each held
 * show's clean cached entries locally and starts a forced full sync.
 * Runs against a real IndexedDB replica; only the network sync is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '@myk9/replication';
import type { UserRoleWithDetails } from '@/types/rbac-types';
import { supabase } from '@/services/database/supabaseClient';
import { TEST_ACCOUNT_ID } from '@/test/setup';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { noteEntriesAccessRoles } from './entriesAccessResync';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

const SIGNATURE_KEY = `myk9:entries:access-signature:v1:${TEST_ACCOUNT_ID}`;

function role(name: string, clubId: string | null, showId: string | null, active = true) {
  return {
    id: `${name}-${clubId}-${showId}`,
    user_id: 'user-1',
    role_id: name,
    club_id: clubId,
    show_id: showId,
    expires_at: null,
    is_active: active,
    role: { name },
  } as unknown as UserRoleWithDetails;
}

const entry = (id: string, showId: string) =>
  ({
    id,
    showId,
    classId: 'class-1',
    dogId: `dog-${id}`,
    armband: id,
    entryStatus: 'confirmed',
    resultStatus: 'pending',
  }) as ReplicatedEntry;

const ok: SyncResult = {
  tableName: 'entries',
  success: true,
  operation: 'full-sync',
  rowsAffected: 0,
  duration: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

const secretary = role('secretary', 'club-1', null);
const steward = role('steward', null, 'show-1');

describe('entries access resync', () => {
  let table: ReplicatedEntriesTable;
  let syncShow: ReturnType<typeof vi.fn>;
  const ids = async () => (await table.getAllOrThrow()).map(row => row.id).sort();

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    localStorage.clear();
    vi.mocked(supabase.from).mockReset();
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await table.batchSet([entry('a', 'show-1'), entry('b', 'show-1'), entry('c', 'show-2')]);
    // The purge never evicts a row synced in or after its own starting millisecond.
    await new Promise(resolve => setTimeout(resolve, 2));
    syncShow = vi.fn(async () => ok);
    (table as unknown as { syncShow: unknown }).syncShow = syncShow;
    // Record the starting role set; it purges nothing it should not.
    localStorage.setItem(SIGNATURE_KEY, JSON.stringify(['secretary|club-1|']));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('purges every held show and starts a forced full sync on a role change', async () => {
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);

    expect(await ids()).toEqual([]);
    expect(syncShow).toHaveBeenCalledWith('show-1', 'anonymous', true);
    expect(syncShow).toHaveBeenCalledWith('show-2', 'anonymous', true);
    expect(localStorage.getItem(SIGNATURE_KEY)).toContain('steward|');
  });

  it('notifies subscribers so open readers see the purge', async () => {
    const listener = vi.fn();
    const unsubscribe = table.subscribe(listener);

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);

    unsubscribe();
    expect(listener).toHaveBeenCalled();
  });

  it('keeps a row with unsent local work', async () => {
    await table.updateEntry('a', { resultStatus: 'qualified' });

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);

    expect(await ids()).toEqual(['a']);
  });

  it('keeps a clean row that has a pending or failed mutation', async () => {
    const unsent = vi.spyOn(table, 'hasUnsyncedLocalWork');
    unsent.mockImplementation(async id => id === 'b');

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);

    expect(await ids()).toEqual(['b']);
  });

  it('queues no server delete and records no local delete', async () => {
    const deleteSpy = vi.spyOn(table, 'delete');

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect((table as unknown as { _deletedIds: Map<string, unknown> })._deletedIds.size).toBe(0);
  });

  it('purges nothing and starts no sync when the role set is unchanged', async () => {
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary], table);

    expect(await ids()).toEqual(['a', 'b', 'c']);
    expect(syncShow).not.toHaveBeenCalled();
  });

  it('treats the same roles in a different order as no change', async () => {
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    syncShow.mockClear();
    await table.batchSet([entry('d', 'show-1')]);

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [steward, secretary], table);

    expect(await ids()).toEqual(['d']);
    expect(syncShow).not.toHaveBeenCalled();
  });

  it('records no signature after a failed read and retries on the next call', async () => {
    vi.spyOn(table, 'getAllOrThrow').mockRejectedValueOnce(new Error('idb down'));
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    expect(localStorage.getItem(SIGNATURE_KEY)).toBe(JSON.stringify(['secretary|club-1|']));
    expect(await ids()).toEqual(['a', 'b', 'c']);

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    expect(await ids()).toEqual([]);
    expect(localStorage.getItem(SIGNATURE_KEY)).toContain('steward|');
  });

  it('records no signature after a failed purge and retries on the next call', async () => {
    vi.spyOn(table, 'removeStaleEntries').mockRejectedValueOnce(new Error('tx aborted'));
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    expect(localStorage.getItem(SIGNATURE_KEY)).toBe(JSON.stringify(['secretary|club-1|']));

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    expect(await ids()).toEqual([]);
    expect(localStorage.getItem(SIGNATURE_KEY)).toContain('steward|');
  });

  it('waits for an in-flight sync of the show to settle before purging', async () => {
    const inFlight = deferred<SyncResult>();
    syncShow.mockReturnValueOnce(inFlight.promise);
    const running = table.sync('show-1');

    const noted = noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(await ids()).toEqual(['a', 'b', 'c']);

    inFlight.resolve(ok);
    await running;
    await noted;
    expect(await ids()).toEqual([]);
  });

  it('keeps a row another sync wrote after the purge read the replica', async () => {
    const read = table.getAllOrThrow.bind(table);
    let reads = 0;
    vi.spyOn(table, 'getAllOrThrow').mockImplementation(async () => {
      const rows = await read();
      // The second read is show-1's keep set; another show's sync lands right after it.
      if (++reads === 2) await table.batchSet([entry('late', 'show-3')]);
      return rows;
    });
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    vi.mocked(table.getAllOrThrow).mockRestore();

    expect(await ids()).toEqual(['late']);
  });

  it('abandons the run when the signed-in account changes mid-purge', async () => {
    // Another account signs in as the first show's purge begins.
    let account = TEST_ACCOUNT_ID;
    const signedIn = vi
      .spyOn(table, 'getCurrentAuthUserId')
      .mockImplementation(async () => account);
    vi.spyOn(table, 'whenShowSyncSettles').mockImplementation(() => {
      account = 'user-2';
      return null;
    });
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    signedIn.mockRestore();

    expect(await ids()).toEqual(['a', 'b', 'c']);
    expect(syncShow).not.toHaveBeenCalled();
    expect(localStorage.getItem(SIGNATURE_KEY)).toBe(JSON.stringify(['secretary|club-1|']));
  });

  it('records no signature when a forced sync fails, and re-runs on the next load', async () => {
    // A kept row (unsent work) can hide the failed refetch from coverage checks.
    await table.updateEntry('a', { resultStatus: 'qualified' });
    syncShow.mockResolvedValueOnce({ ...ok, success: false, error: 'offline' });
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    expect(localStorage.getItem(SIGNATURE_KEY)).toBe(JSON.stringify(['secretary|club-1|']));

    // The next verified load runs the resync again for the show still held.
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    expect(syncShow).toHaveBeenCalledTimes(3);
    expect(syncShow).toHaveBeenLastCalledWith('show-1', 'anonymous', true);
    expect(localStorage.getItem(SIGNATURE_KEY)).toContain('steward|');
  });

  it("never evicts another account's rows, even if the account switches at the eviction", async () => {
    let account = 'user-2';
    const signedIn = vi
      .spyOn(table, 'getCurrentAuthUserId')
      .mockImplementation(async () => account);
    await table.batchSet([entry('z', 'show-1')]);
    await new Promise(resolve => setTimeout(resolve, 2));
    account = TEST_ACCOUNT_ID;
    const evict = table.removeStaleEntries.bind(table);
    vi.spyOn(table, 'removeStaleEntries').mockImplementation(async (keep, options) => {
      account = 'user-2';
      return evict(keep, options);
    });

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    account = 'user-2';
    expect(await ids()).toEqual(['z']);
    signedIn.mockRestore();
  });
});
