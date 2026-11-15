/**
 * MYK9-2015 (owner, 2026-11-14: refuse visibly). Judge A scores dogs with no signal, the
 * secretary gives the class to judge B, and A's phone reconnects. The server refuses each score
 * (RS403 "This class is judged by B"); none may vanish. Driven through the real queue and the
 * real replica on this device: every one of A's scores is counted, and listed by dog with the
 * "now judged by" reason and the values, for the secretary to key.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { configureConflictSurfacing, databaseManager, MutationManager } from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ReplicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable';
import { RINGSIDE_RPC_FUNCTION } from '@/services/replication/ringsideEntryRpc';
import { readDeviceUnsentWork } from '@/services/replication/unsentWork';
import { supabase } from '@/services/database/supabaseClient';
import { buildScoresNotSentRows } from './useScoresNotSent';

const shared = vi.hoisted(() => ({ manager: null as MutationManager | null }));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: {
    getFailedMutations: () => shared.manager!.getFailedMutations(),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(async (id: string) => ({ id, name: 'Container Novice A' })),
  },
}));

const SHOW = 'show-1';
const AUTH = 'judge-a-user';

const dog = (id: string, armband: string, callName: string) =>
  ({
    id,
    showId: SHOW,
    classId: 'class-1',
    dogId: `dog-${id}`,
    armband,
    dogCallName: callName,
    entryStatus: 'confirmed',
    checkInStatus: 'checked-in',
    check_in_status: 'checked-in',
    isScored: false,
    is_scored: false,
    resultStatus: 'pending',
    result_status: 'pending',
  }) as ReplicatedEntry;

const score = (
  resultStatus: string,
  seconds: number,
  faults: number
): Partial<ReplicatedEntry> => ({
  isScored: true,
  is_scored: true,
  resultStatus,
  result_status: resultStatus,
  searchTimeSeconds: seconds,
  search_time_seconds: seconds,
  totalFaults: faults,
  total_faults: faults,
  checkInStatus: 'completed',
  check_in_status: 'completed',
});

describe("judge A's offline scores after the class goes to judge B (MYK9-2015)", () => {
  let table: ReplicatedEntriesTable;
  let manager: MutationManager;
  let rpc: ReturnType<typeof vi.fn>;

  /** The phone's queue, opened on this device's database (a reload opens a new one). */
  function newManager(): MutationManager {
    const client = { rpc } as unknown as SupabaseClient;
    const opened = new MutationManager(client, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: client }),
    });
    shared.manager = opened;
    table.setMutationManager(opened);
    return opened;
  }

  beforeEach(async () => {
    await databaseManager.reset();
    // The server as A's phone finds it on reconnect: the class is judge B's now.
    rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'RS403', message: 'This class is judged by Lee Okafor' },
    }));
    table = new ReplicatedEntriesTable();
    manager = newManager();
    await table.clearCache();
    await table.batchSet(
      [dog('e1', '101', 'Willow'), dog('e2', '102', 'Juniper'), dog('e3', '103', 'Pip')],
      new Map([
        ['e1', 1],
        ['e2', 1],
        ['e3', 1],
      ])
    );
  });

  afterEach(async () => {
    configureConflictSurfacing(false);
    manager.destroy();
    shared.manager = null;
    await databaseManager.reset();
  });

  const readEntry = async (id: string) =>
    (await table.getReplicatedRowIncludingOtherAccounts(id))?.data;

  /** Each of A's three scores: counted, listed by dog with the reason and the values. */
  async function expectEveryScoreListedAsRefused(
    work: Awaited<ReturnType<typeof readDeviceUnsentWork>>
  ) {
    expect(work.unsentScoreCount).toBe(3);
    expect(work.refusedCount).toBe(3);
    const rows = await buildScoresNotSentRows(SHOW, work);
    const byDog = Object.fromEntries(rows.map(row => [row.dogLabel, row]));
    expect(Object.keys(byDog).sort()).toEqual(['101 Willow', '102 Juniper', '103 Pip']);
    for (const row of rows) {
      expect(row.state).toBe('refused');
      expect(row.why).toBe('This class is now judged by Lee Okafor.');
      expect(row.className).toBe('Container Novice A');
      // Judge A can still act on them from this phone (Try again, Remove).
      expect(row.canAct).toBe(true);
    }
    expect(byDog['101 Willow']!.scoreText).toBe('Result Qualified · Time 0:42.50 · Faults 0');
    expect(byDog['102 Juniper']!.scoreText).toBe('Result NQ · Time 1:01.25 · Faults 2');
    expect(byDog['103 Pip']!.scoreText).toBe('Result Qualified · Time 0:38.00 · Faults 1');
  }

  /** Judge A scores three dogs offline, reconnects, and the server refuses all three. */
  async function scoreOfflineThenRefuse() {
    await table.updateEntry('e1', score('qualified', 42.5, 0));
    await table.updateEntry('e2', score('nq', 61.25, 2));
    await table.updateEntry('e3', score('qualified', 38, 1));
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect(await manager.getFailedMutations()).toHaveLength(3));
  }

  /** The server's rows as a pull returns them: never scored, and moved on a version. */
  function mockUnscoredServerRows() {
    const rows = [
      ['e1', '101', 'Willow'],
      ['e2', '102', 'Juniper'],
      ['e3', '103', 'Pip'],
    ].map(([id, armband, callName]) => ({
      id,
      dog_call_name: callName,
      show_id: SHOW,
      class_id: 'class-1',
      dog_id: `dog-${id}`,
      armband,
      entry_status: 'confirmed',
      check_in_status: 'checked-in',
      is_scored: false,
      result_status: 'pending',
      version: 2,
      updated_at: '2026-11-15T05:00:00.000000+00:00',
    }));
    const chain: Record<string, unknown> = {};
    for (const step of ['select', 'gt', 'gte', 'or', 'order', 'eq', 'range', 'in', 'is']) {
      chain[step] = vi.fn(() => chain);
    }
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
    vi.mocked(supabase.from).mockReturnValue(chain as never);
  }

  it.each([
    ['with conflict surfacing on', true],
    ['with conflict surfacing off', false],
  ])(
    'keeps every refused score listed and counted after a re-pull and a reload (%s)',
    async (_label, surfacing) => {
      configureConflictSurfacing(surfacing);
      await scoreOfflineThenRefuse();

      // The app pulls the server's (unscored) rows, then the phone reloads.
      mockUnscoredServerRows();
      await table.sync(SHOW);
      await table.batchSet(
        [dog('e1', '101', 'Willow'), dog('e2', '102', 'Juniper'), dog('e3', '103', 'Pip')],
        new Map([
          ['e1', 2],
          ['e2', 2],
          ['e3', 2],
        ])
      );
      manager.destroy();
      manager = newManager();

      await expectEveryScoreListedAsRefused(await readDeviceUnsentWork(readEntry));
      for (const id of ['e1', 'e2', 'e3']) expect((await table.get(id))?.isScored).toBe(true);
    }
  );

  it('counts and lists every refused score by dog, with the reason and the values', async () => {
    // Judge A, no signal: three dogs scored on the phone, nothing sent yet.
    await table.updateEntry('e1', score('qualified', 42.5, 0));
    await table.updateEntry('e2', score('nq', 61.25, 2));
    await table.updateEntry('e3', score('qualified', 38, 1));
    expect(rpc).not.toHaveBeenCalled();
    const offline = await readDeviceUnsentWork(readEntry);
    expect(offline.unsentScoreCount).toBe(3);

    // Reconnect: every score goes up, and every one is refused for good.
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect(await manager.getFailedMutations()).toHaveLength(3));
    expect(rpc).toHaveBeenCalledTimes(3);
    for (const call of rpc.mock.calls) expect(call[0]).toBe(RINGSIDE_RPC_FUNCTION);

    const work = await readDeviceUnsentWork(readEntry);
    expect(work.unsentScoreCount).toBe(3);
    expect(work.refusedCount).toBe(3);

    await expectEveryScoreListedAsRefused(work);

    // Refused is not dropped: the phone still shows each dog as scored.
    for (const id of ['e1', 'e2', 'e3']) expect((await table.get(id))?.isScored).toBe(true);
  });
});
