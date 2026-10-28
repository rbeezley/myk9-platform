/**
 * MYK9-1476: a change to the signed-in user's active role set marks every held
 * show for one full entries sync; the mark clears only after that show's full
 * sync returned success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '@myk9/replication';
import type { UserRoleWithDetails } from '@/types/rbac-types';

const syncReplicatedTableMock = vi.hoisted(() => vi.fn());

vi.mock('@myk9/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/replication')>()),
  syncReplicatedTable: syncReplicatedTableMock,
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { ReplicatedEntriesTable } from './ReplicatedEntriesTable';
import { replicatedEntriesTable } from './ReplicatedEntriesTable';
import { supabase } from '@/services/database/supabaseClient';
import {
  getEntriesAccessResyncMark,
  noteEntriesAccessRoles,
  recordEntriesAccessRoleSet,
} from './entriesAccessResync';

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

const result = (success: boolean): SyncResult => ({
  tableName: 'entries',
  success,
  operation: success ? 'full-sync' : 'incremental-sync',
  rowsAffected: 0,
  duration: 0,
  ...(success ? {} : { error: 'boom' }),
});

const secretary = role('secretary', 'club-1', null);
const steward = role('steward', null, 'show-1');

describe('entries access resync', () => {
  beforeEach(async () => {
    localStorage.clear();
    syncReplicatedTableMock.mockReset();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const forcedFlags = () =>
    syncReplicatedTableMock.mock.calls.map(call => call[3]?.forceFullSync as boolean);

  it('marks held shows on a role-set change and the next sync is full', async () => {
    recordEntriesAccessRoleSet('user-1', [secretary], []);
    expect(recordEntriesAccessRoleSet('user-1', [secretary, steward], ['show-1', 'show-2'])).toBe(
      true
    );
    expect(getEntriesAccessResyncMark('show-1')).not.toBeNull();
    expect(getEntriesAccessResyncMark('show-2')).not.toBeNull();

    syncReplicatedTableMock.mockResolvedValue(result(true));
    await new ReplicatedEntriesTable().sync('show-1');
    expect(syncReplicatedTableMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { value: 'show-1' },
      expect.objectContaining({ forceFullSync: true })
    );
  });

  it('adds no full sync when the role set is unchanged', async () => {
    recordEntriesAccessRoleSet('user-1', [secretary], []);
    expect(recordEntriesAccessRoleSet('user-1', [secretary], ['show-1'])).toBe(false);
    expect(getEntriesAccessResyncMark('show-1')).toBeNull();

    // Receipt-reference refresh done, so only the access mark could force a full sync.
    localStorage.setItem('myk9:entries:receipt-reference-refresh:v1:anonymous:show-1', 'complete');
    syncReplicatedTableMock.mockResolvedValue(result(true));
    await new ReplicatedEntriesTable().sync('show-1');
    await new ReplicatedEntriesTable().sync('show-1');
    expect(forcedFlags()).toEqual([false, false]);
    expect(getEntriesAccessResyncMark('show-1')).toBeNull();
  });

  it('keeps the mark after a failed sync and clears it after a later success', async () => {
    recordEntriesAccessRoleSet('user-1', [secretary], []);
    recordEntriesAccessRoleSet('user-1', [steward], ['show-1']);
    const table = new ReplicatedEntriesTable();

    syncReplicatedTableMock.mockResolvedValueOnce(result(false));
    await table.sync('show-1');
    expect(getEntriesAccessResyncMark('show-1')).not.toBeNull();

    syncReplicatedTableMock.mockResolvedValueOnce(result(true));
    await table.sync('show-1');
    expect(forcedFlags()).toEqual([true, true]);
    expect(getEntriesAccessResyncMark('show-1')).toBeNull();
  });

  it('treats the same roles in a different order as no change', () => {
    recordEntriesAccessRoleSet('user-1', [secretary, steward], []);
    expect(recordEntriesAccessRoleSet('user-1', [steward, secretary], ['show-1'])).toBe(false);
    expect(getEntriesAccessResyncMark('show-1')).toBeNull();
  });

  it('counts a deactivated role as a change', () => {
    recordEntriesAccessRoleSet('user-1', [secretary, steward], []);
    expect(
      recordEntriesAccessRoleSet(
        'user-1',
        [secretary, role('steward', null, 'show-1', false)],
        ['show-1']
      )
    ).toBe(true);
  });

  it('does not clear a mark that was replaced while the sync ran', async () => {
    recordEntriesAccessRoleSet('user-1', [secretary], []);
    recordEntriesAccessRoleSet('user-1', [steward], ['show-1']);
    syncReplicatedTableMock.mockImplementationOnce(async () => {
      recordEntriesAccessRoleSet('user-1', [secretary, steward], ['show-1']);
      return result(true);
    });
    await new ReplicatedEntriesTable().sync('show-1');
    expect(getEntriesAccessResyncMark('show-1')).not.toBeNull();
  });

  it('keeps the mark when a zero-row full sync leaves the held rows cached', async () => {
    recordEntriesAccessRoleSet('user-1', [secretary], []);
    recordEntriesAccessRoleSet('user-1', [], ['show-1']);
    const table = new ReplicatedEntriesTable();
    await table.batchSet([{ id: 'entry-1', showId: 'show-1' } as never]);

    // A revoked role: the full fetch sees nothing, and the engine keeps the replica.
    syncReplicatedTableMock.mockResolvedValue(result(true));
    await table.sync('show-1');
    expect(getEntriesAccessResyncMark('show-1')).not.toBeNull();

    await table.delete('entry-1');
    await table.sync('show-1');
    expect(forcedFlags()).toEqual([true, true]);
    expect(getEntriesAccessResyncMark('show-1')).toBeNull();
  });

  it('clears the mark after a full sync the server counted rows for', async () => {
    recordEntriesAccessRoleSet('user-1', [secretary], []);
    recordEntriesAccessRoleSet('user-1', [steward], ['show-1']);
    const table = new ReplicatedEntriesTable();
    await table.batchSet([{ id: 'entry-1', showId: 'show-1' } as never]);
    const chain: Record<string, unknown> = {};
    for (const step of ['select', 'eq']) chain[step] = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ count: 3, error: null }).then(resolve);
    vi.mocked(supabase.from).mockReturnValue(chain as never);
    syncReplicatedTableMock.mockImplementationOnce(async (_table, adapter) => {
      await adapter.getRemoteRowCount();
      return result(true);
    });

    await table.sync('show-1');
    expect(getEntriesAccessResyncMark('show-1')).toBeNull();
  });

  it('records nothing when the replica cannot be read', async () => {
    recordEntriesAccessRoleSet('user-1', [secretary], []);
    vi.spyOn(replicatedEntriesTable, 'getAllOrThrow').mockRejectedValue(new Error('idb timeout'));
    await noteEntriesAccessRoles('user-1', [steward]);

    // The old signature stands, so the next successful load still sees a change.
    expect(recordEntriesAccessRoleSet('user-1', [steward], ['show-1'])).toBe(true);
  });
});
