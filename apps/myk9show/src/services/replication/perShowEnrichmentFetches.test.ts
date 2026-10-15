// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RowRefetchAdapter } from '@myk9/replication';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));
vi.mock('./resolveClassVisibility', async importOriginal => ({
  ...(await importOriginal<typeof import('./resolveClassVisibility')>()),
  resolveVisibilityForClassRows: vi.fn(async () => new Map()),
}));
vi.mock('./resolveClassTimeLimitRules', () => ({
  resolveTimeLimitRulesForClassRows: vi.fn(async () => new Map()),
}));

import { ReplicatedClassesTable } from './ReplicatedClassesTable';

/**
 * MYK9-1170: class replication syncs once per TRIAL, and each sync's enrichment asked the
 * per-SHOW RPCs. A seven-trial show paid for seven identical `get_show_judges` and
 * `get_show_class_hide_counts` round trips per page load. These drive the real table's
 * enrichment (the by-id re-fetch path runs the same `enrichClassRows` as the sync).
 */
const SHOW_ID = 'show-heartland';
const trialIds = Array.from({ length: 7 }, (_, i) => `trial-${i + 1}`);
const classIdOf = (trialId: string) => `class-of-${trialId}`;

type Fetcher = RowRefetchAdapter<unknown, { id: string }>['fetchRowsById'];
const fetchRowsByIdOf = (table: ReplicatedClassesTable): Fetcher =>
  (
    table as unknown as { getRowRefetchAdapter(): RowRefetchAdapter<unknown, { id: string }> }
  ).getRowRefetchAdapter().fetchRowsById;

function rpcCalls(name: string): unknown[][] {
  return mockRpc.mock.calls.filter(call => call[0] === name);
}

describe('per-show enrichment RPCs across a per-trial class sync (MYK9-1170)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'classes') {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: ids.map(id => ({ id, trial_id: id.replace('class-of-', ''), updated_at: 't' })),
              error: null,
            }),
          }),
        };
      }
      if (table === 'trials') {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: ids.map(id => ({ id, show_id: SHOW_ID, registry_id: 'AKC' })),
              error: null,
            }),
          }),
        };
      }
      if (table === 'sport_class_rules') {
        const chain = {
          in: () => chain,
          eq: () => chain,
          not: async () => ({ data: [], error: null }),
        };
        return { select: () => chain };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    // Settle on a later tick, the way a network round trip does, so concurrent callers overlap.
    mockRpc.mockImplementation(async (name: string) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return name === 'get_show_judges'
        ? {
            data: trialIds.map(trialId => ({
              assignment_id: `a-${trialId}`,
              class_id: classIdOf(trialId),
              trial_id: trialId,
              person_id: 'judge-1',
              first_name: 'Jo',
              last_name: 'Judge',
              status: 'confirmed',
            })),
            error: null,
          }
        : { data: [{ class_id: classIdOf('trial-1'), num_hides: 4 }], error: null };
    });
  });

  const syncEveryTrial = (table: ReplicatedClassesTable) =>
    Promise.all(
      trialIds.map(trialId => fetchRowsByIdOf(table)([classIdOf(trialId)])) as Array<
        Promise<Array<Record<string, unknown>>>
      >
    );

  it('asks each per-show RPC once for a show whose trials sync together', async () => {
    const results = await syncEveryTrial(new ReplicatedClassesTable());

    expect(rpcCalls('get_show_judges')).toEqual([['get_show_judges', { p_show_id: SHOW_ID }]]);
    expect(rpcCalls('get_show_class_hide_counts')).toEqual([
      ['get_show_class_hide_counts', { p_show_id: SHOW_ID }],
    ]);
    // Sharing the round trip must not cost any trial its own answer.
    expect(results[0]![0]).toMatchObject({ num_hides: 4 });
    for (const [index, trialId] of trialIds.entries()) {
      expect(results[index]![0]).toMatchObject({
        id: classIdOf(trialId),
        _judgeResolved: true,
        _judge: { firstName: 'Jo' },
      });
    }
  });

  it('reads fresh on a later sync: nothing is cached once the shared read settles', async () => {
    const table = new ReplicatedClassesTable();
    await syncEveryTrial(table);
    await syncEveryTrial(table);

    expect(rpcCalls('get_show_judges')).toHaveLength(2);
    expect(rpcCalls('get_show_class_hide_counts')).toHaveLength(2);
  });
});
