/**
 * MYK9-911 regression, through the real delete path (#2655): soft_delete_trial
 * succeeds, `deleteLocalStores` purges the local replica, and the show's trial
 * list stays empty even though the emptied store makes `getTrialsByShow` verify
 * online. The fix is that the online read already honours `deleted_at`; this pins
 * that the whole chain (RPC, purge, empty-store fallback) keeps the trial gone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

const server = vi.hoisted(() => ({
  trials: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/services/database/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/supabaseClient')>();
  // Filters like PostgREST: `.is('deleted_at', null)` hides soft-deleted rows.
  const query = () => {
    let liveOnly = false;
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.is = (column: string) => {
      if (column === 'deleted_at') liveOnly = true;
      return b;
    };
    b.order = () =>
      Promise.resolve({
        data: server.trials.filter(row => !liveOnly || row.deleted_at === null),
        error: null,
      });
    return b;
  };
  return {
    ...actual,
    supabase: {
      from: () => query(),
      rpc: (name: string, args: { p_trial_id: string }) => {
        if (name === 'soft_delete_trial') {
          for (const row of server.trials) {
            if (row.id === args.p_trial_id) row.deleted_at = '2026-10-02T00:00:00.000Z';
          }
        }
        return { single: () => Promise.resolve({ data: null, error: null }) };
      },
    },
  };
});

vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));

import { databaseManager } from '@myk9/replication';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { deleteRecords } from '@/features/delete/deleteRecords';
import { getTrialsByShow } from '../reads';

const serverTrial = {
  id: 't1',
  show_id: 's1',
  name: 'Trial 1',
  date: '2026-10-01',
  deleted_at: null,
  show: null,
};

describe('getTrialsByShow after deleting the last trial through deleteRecords', () => {
  beforeEach(async () => {
    await databaseManager.reset();
    server.trials = [{ ...serverTrial }];
    await replicatedTrialsTable.set(
      't1',
      fromAny({ id: 't1', showId: 's1', name: 'Trial 1', date: '2026-10-01' })
    );
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  it('stays empty when the show is in the replica and the store is empty', async () => {
    await replicatedShowsTable.set(
      's1',
      fromAny({ id: 's1', name: 'Show', startDate: '2026-10-01', endDate: '2026-10-02' })
    );

    const result = await deleteRecords('trial', [
      { id: 't1', name: 'Trial 1', context: { showId: 's1' } },
    ]);

    expect(result.failed).toEqual([]);
    expect(result.deleted).toHaveLength(1);
    expect(await replicatedTrialsTable.get('t1')).toBeNull();
    expect(server.trials[0]?.deleted_at).not.toBeNull();

    const trials = await getTrialsByShow('s1');
    expect(trials.error).toBeNull();
    expect(trials.data).toEqual([]);
  });

  it('stays empty when the show is not in the replica (direct online read)', async () => {
    await deleteRecords('trial', [{ id: 't1', name: 'Trial 1', context: { showId: 's1' } }]);

    const trials = await getTrialsByShow('s1');
    expect(trials.data).toEqual([]);
  });

  it('control: with no delete, the online fallback returns the server trial', async () => {
    await replicatedTrialsTable.deleteRowsIfClean(['t1']);

    const online = await getTrialsByShow('s1');

    expect((online.data as Array<{ id: string }>).map(r => r.id)).toEqual(['t1']);
  });
});
