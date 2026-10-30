// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RowRefetchAdapter } from '@myk9/replication';

const { mockFrom, mockRpc, session } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  session: { userId: 'user-a' as string | null },
}));

vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => session.userId,
}));

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
import { invalidateClassEnrichment } from './classEnrichmentCache';

/**
 * MYK9-1170: class replication syncs once per TRIAL, and each sync's enrichment asked the
 * per-SHOW RPCs. A seven-trial show paid for seven identical `get_show_judges` and
 * `get_show_class_hide_counts` round trips per page load. MYK9-1450 then batched them: one
 * `get_shows_judges` and one `get_shows_class_hide_counts` call per batch of shows (at most 200)
 * instead of one pair per show. These drive the real table's enrichment (the by-id re-fetch path
 * runs the same `enrichClassRows` as the sync).
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
    invalidateClassEnrichment();
    session.userId = 'user-a';
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
    // Rows are derived from the requested show ids, so a call that names no show gets no rows.
    mockRpc.mockImplementation(async (name: string, args: { p_show_ids: string[] }) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      const asked = args.p_show_ids.includes(SHOW_ID);
      return name === 'get_shows_judges'
        ? {
            data: (asked ? trialIds : []).map(trialId => ({
              show_id: SHOW_ID,
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
        : {
            data: asked ? [{ show_id: SHOW_ID, class_id: classIdOf('trial-1'), num_hides: 4 }] : [],
            error: null,
          };
    });
  });

  const syncEveryTrial = (table: ReplicatedClassesTable) =>
    Promise.all(
      trialIds.map(trialId => fetchRowsByIdOf(table)([classIdOf(trialId)])) as Array<
        Promise<Array<Record<string, unknown>>>
      >
    );

  it('asks each batched RPC once for a show whose trials sync together', async () => {
    const results = await syncEveryTrial(new ReplicatedClassesTable());

    expect(rpcCalls('get_shows_judges')).toEqual([['get_shows_judges', { p_show_ids: [SHOW_ID] }]]);
    expect(rpcCalls('get_shows_class_hide_counts')).toEqual([
      ['get_shows_class_hide_counts', { p_show_ids: [SHOW_ID] }],
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

  it('reads fresh on a later sync: nothing is shared once the in-flight read settles', async () => {
    const table = new ReplicatedClassesTable();
    await syncEveryTrial(table);
    // The sharer holds nothing after it settles; the enrichment cache (MYK9-1360) is a
    // separate, tested layer, so drop it to see the sharer on its own.
    invalidateClassEnrichment();
    await syncEveryTrial(table);

    expect(rpcCalls('get_shows_judges')).toHaveLength(2);
    expect(rpcCalls('get_shows_class_hide_counts')).toHaveLength(2);
  });

  it('never shares a read across an account switch: both batched RPCs answer per caller', async () => {
    // Hold every RPC on the wire until released, so account B's sync overlaps account A's read.
    const answer = mockRpc.getMockImplementation()!;
    let release: () => void = () => {};
    const wire = new Promise<void>(resolve => {
      release = resolve;
    });
    mockRpc.mockImplementation(async (name: string, args: { p_show_ids: string[] }) => {
      await wire;
      return answer(name, args);
    });
    const table = new ReplicatedClassesTable();
    const accountA = syncEveryTrial(table);
    // Hide counts are read first; hold them on the wire while the account switches.
    await vi.waitFor(() => expect(rpcCalls('get_shows_class_hide_counts')).toHaveLength(1));
    session.userId = 'user-b';
    const accountB = syncEveryTrial(table);
    await new Promise(resolve => setTimeout(resolve, 20));
    release();
    await Promise.all([accountA, accountB]);

    // B started its hide-counts read while A's was on the wire, under a different account.
    expect(rpcCalls('get_shows_class_hide_counts')).toHaveLength(2);
  });
});

/**
 * MYK9-1450: a classes batch spanning many shows used to cost one `get_show_judges` and one
 * `get_show_class_hide_counts` call per show. It now costs one batched call per 200 shows.
 */
describe('batched enrichment RPCs across a many-show classes batch (MYK9-1450)', () => {
  const showIdsOf = (count: number) =>
    Array.from({ length: count }, (_, i) => `show-${String(i + 1).padStart(3, '0')}`);
  const trialOf = (showId: string) => `trial-of-${showId}`;
  const classesOf = (showId: string) => [`${showId}-class-a`, `${showId}-class-b`];
  const showOfTrial = (trialId: string) => trialId.replace('trial-of-', '');

  function mockWire(showIds: string[]) {
    const known = new Set(showIds);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'classes') {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: ids.map(id => ({
                id,
                trial_id: trialOf(id.replace(/-class-[ab]$/, '')),
                updated_at: 't',
              })),
              error: null,
            }),
          }),
        };
      }
      if (table === 'trials') {
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: ids.map(id => ({ id, show_id: showOfTrial(id), registry_id: 'AKC' })),
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
    mockRpc.mockImplementation(async (name: string, args: { p_show_ids: string[] }) => {
      const asked = args.p_show_ids.filter(id => known.has(id));
      if (name === 'get_shows_judges') {
        return {
          data: asked.flatMap(showId =>
            classesOf(showId).map(classId => ({
              show_id: showId,
              assignment_id: `a-${classId}`,
              class_id: classId,
              trial_id: trialOf(showId),
              person_id: 'judge-1',
              first_name: 'Jo',
              last_name: 'Judge',
              status: 'confirmed',
            }))
          ),
          error: null,
        };
      }
      if (name === 'get_shows_class_hide_counts') {
        return {
          data: asked.flatMap(showId =>
            classesOf(showId).map(classId => ({ show_id: showId, class_id: classId, num_hides: 3 }))
          ),
          error: null,
        };
      }
      throw new Error(`Unexpected rpc: ${name}`);
    });
  }

  const sizesOf = (name: string) =>
    rpcCalls(name)
      .map(call => (call[1] as { p_show_ids: string[] }).p_show_ids.length)
      .sort((a, b) => a - b);

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
    session.userId = 'user-a';
  });

  async function syncShows(showIds: string[]) {
    mockWire(showIds);
    // Reversed, so the RPC's sorted p_show_ids is the code's doing, not the input order.
    const classIds = showIds.flatMap(classesOf).reverse();
    return fetchRowsByIdOf(new ReplicatedClassesTable())(classIds) as Promise<
      Array<Record<string, unknown>>
    >;
  }

  it('asks one batched call per RPC for 15 shows, and never the per-show RPCs', async () => {
    const showIds = showIdsOf(15);
    const rows = await syncShows(showIds);

    expect(rows).toHaveLength(30);
    expect(rpcCalls('get_shows_judges')).toEqual([['get_shows_judges', { p_show_ids: showIds }]]);
    expect(rpcCalls('get_shows_class_hide_counts')).toEqual([
      ['get_shows_class_hide_counts', { p_show_ids: showIds }],
    ]);
    expect(rpcCalls('get_show_judges')).toHaveLength(0);
    expect(rpcCalls('get_show_class_hide_counts')).toHaveLength(0);
    for (const row of rows) {
      expect(row).toMatchObject({
        _judgeResolved: true,
        _judge: { firstName: 'Jo' },
        num_hides: 3,
      });
    }
  });

  it('splits 250 shows into batches of 200 and 50 for each batched RPC', async () => {
    const rows = await syncShows(showIdsOf(250));

    expect(rows).toHaveLength(500);
    expect(sizesOf('get_shows_judges')).toEqual([50, 200]);
    expect(sizesOf('get_shows_class_hide_counts')).toEqual([50, 200]);
    expect(rpcCalls('get_show_judges')).toHaveLength(0);
    expect(rpcCalls('get_show_class_hide_counts')).toHaveLength(0);
    for (const row of rows) {
      expect(row).toMatchObject({ _judgeResolved: true, num_hides: 3 });
    }
  });
});
