// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1360: every score bumps `classes.updated_at`, so every subscribed device re-ran the
 * class enrichment (about eight PostgREST and RPC reads) for values that rarely change. These
 * drive the real resolvers and count the wire calls across consecutive classes deltas.
 */
const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => 'user-a',
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));

import { ReplicatedClassesTable } from './ReplicatedClassesTable';
import { invalidateClassEnrichment } from './classEnrichmentCache';

const SHOW_ID = 'show-1';
const TRIALS = [{ id: 'trial-1', show_id: SHOW_ID, registry_id: 'AKC' }];
const delta = (scoredCount: number) => [
  {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Interior',
    level: 'Novice',
    scored_count: scoredCount,
  },
  { id: 'class-2', trial_id: 'trial-1', element: 'Exterior', level: 'Novice', scored_count: 0 },
];

type Enrich = (rows: unknown[]) => Promise<Array<Record<string, unknown>>>;
const enrich = (table: ReplicatedClassesTable): Enrich =>
  (table as unknown as { enrichClassRows: Enrich }).enrichClassRows.bind(table);

/** A PostgREST builder whose every step returns itself and which resolves to `rows` when awaited. */
function builder(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'in', 'eq', 'not']) chain[step] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
  return chain;
}

const wireCalls = () => mockFrom.mock.calls.length + mockRpc.mock.calls.length;
const tablesRead = () => mockFrom.mock.calls.map(call => call[0] as string);
const rpcNames = () => mockRpc.mock.calls.map(call => call[0] as string);

describe('class enrichment across consecutive classes deltas (MYK9-1360)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
    mockFrom.mockImplementation((table: string) => builder(table === 'trials' ? TRIALS : []));
    // Answers the batched RPCs, with every row stamped for a show the caller actually asked for.
    mockRpc.mockImplementation(async (name: string, args: { p_show_ids: string[] }) =>
      name === 'get_shows_judges'
        ? {
            data: args.p_show_ids.map(showId => ({
              show_id: showId,
              assignment_id: 'a-1',
              class_id: 'class-1',
              trial_id: 'trial-1',
              person_id: 'judge-1',
              first_name: 'Jo',
              last_name: 'Judge',
              status: 'confirmed',
            })),
            error: null,
          }
        : {
            data: args.p_show_ids.map(showId => ({
              show_id: showId,
              class_id: 'class-1',
              num_hides: 4,
            })),
            error: null,
          }
    );
  });

  it('runs every lookup for the first delta, and none for a score-only second delta', async () => {
    const table = new ReplicatedClassesTable();

    const first = await enrich(table)(delta(0));
    expect(tablesRead()).toEqual(
      expect.arrayContaining([
        'trials',
        'show_visibility_settings',
        'trial_visibility_overrides',
        'class_visibility_overrides',
        'sport_class_rules',
      ])
    );
    expect(tablesRead().filter(name => name === 'sport_class_rules')).toHaveLength(2);
    expect(rpcNames().sort()).toEqual(['get_shows_class_hide_counts', 'get_shows_judges']);
    expect(wireCalls()).toBe(8);

    mockFrom.mockClear();
    mockRpc.mockClear();
    const second = await enrich(table)(delta(5));

    expect(wireCalls()).toBe(0);
    // The cached answer is the same one the lookups gave, merged onto the changed row.
    expect(second[0]).toMatchObject({
      id: 'class-1',
      scored_count: 5,
      num_hides: 4,
      _judge: { firstName: 'Jo' },
      _judgeResolved: true,
      _selfCheckinEnabled: first[0]?._selfCheckinEnabled,
      _visibilityPreset: first[0]?._visibilityPreset,
      _timeLimitRule: first[0]?._timeLimitRule,
    });
    expect(second[1]).toMatchObject({ id: 'class-2', num_hides: null, _judge: null });
    expect(second[1]?._judgeResolved).toBe(true);
  });

  it('asks again after the show is invalidated, and only that show', async () => {
    const table = new ReplicatedClassesTable();
    await enrich(table)(delta(0));

    invalidateClassEnrichment('some-other-show');
    mockFrom.mockClear();
    mockRpc.mockClear();
    await enrich(table)(delta(1));
    expect(wireCalls()).toBe(0);

    invalidateClassEnrichment(SHOW_ID);
    await enrich(table)(delta(2));
    // The re-ask is a batched call naming only the invalidated show.
    for (const call of mockRpc.mock.calls) expect(call[1]).toEqual({ p_show_ids: [SHOW_ID] });
    expect(rpcNames().sort()).toEqual(['get_shows_class_hide_counts', 'get_shows_judges']);
    expect(tablesRead().filter(name => name === 'sport_class_rules')).toHaveLength(2);
    expect(wireCalls()).toBe(8);
  });

  it('re-asks on the next delta when the hide-count RPC errored on the first', async () => {
    const answer = mockRpc.getMockImplementation()!;
    mockRpc.mockImplementation(async (name: string, args: { p_show_ids: string[] }) =>
      name === 'get_shows_class_hide_counts'
        ? { data: null, error: { message: 'timeout' } }
        : answer(name, args)
    );
    const table = new ReplicatedClassesTable();
    const first = await enrich(table)(delta(0));
    // The failed read still replicates: judge and visibility answered, hide count is absent.
    expect(first[0]).toMatchObject({ num_hides: null, _judgeResolved: true });

    mockRpc.mockImplementation(answer);
    mockFrom.mockClear();
    mockRpc.mockClear();
    const second = await enrich(table)(delta(1));

    expect(rpcNames()).toContain('get_shows_class_hide_counts');
    expect(second[0]).toMatchObject({ num_hides: 4 });

    mockRpc.mockClear();
    await enrich(table)(delta(2));
    expect(rpcNames()).toEqual([]);
  });

  it('asks again for a judge reassignment written on this device', async () => {
    const table = new ReplicatedClassesTable();
    await enrich(table)(delta(0));
    const { replicatedJudgeAssignmentsTable } = await import('./ReplicatedJudgeAssignmentsTable');
    vi.spyOn(replicatedJudgeAssignmentsTable, 'get').mockResolvedValue({ id: 'a-1' } as never);
    vi.spyOn(replicatedJudgeAssignmentsTable, 'set').mockResolvedValue(undefined as never);
    vi.spyOn(
      replicatedJudgeAssignmentsTable as unknown as { queueMutation: () => Promise<string | null> },
      'queueMutation'
    ).mockResolvedValue(null);

    mockRpc.mockClear();
    await replicatedJudgeAssignmentsTable.updateAssignment('a-1', { personId: 'judge-2' });
    await enrich(table)(delta(1));

    expect(rpcNames()).toContain('get_shows_judges');
  });
});
