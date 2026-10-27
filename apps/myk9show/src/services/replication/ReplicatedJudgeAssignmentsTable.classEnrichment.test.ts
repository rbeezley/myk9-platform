// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1360: a judge-assignments delta from the server means a judge changed on another
 * device. The class judge names cached for that show must not wait out the TTL.
 */
const { mockFrom, mockRpc, assignments } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  assignments: { rows: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => 'user-a',
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));
// The engine's IndexedDB bookkeeping is not under test: run the adapter's fetch and stop.
vi.mock('@myk9/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/replication')>()),
  syncReplicatedTable: vi.fn(async (_table: unknown, adapter: Record<string, unknown>) => {
    const fetchRemoteRows = adapter.fetchRemoteRows as (context: unknown) => Promise<unknown>;
    await fetchRemoteRows({ scope: {}, since: 0, localRows: [], forceFullSync: false });
    return { success: true };
  }),
}));

import { ReplicatedClassesTable } from './ReplicatedClassesTable';
import { ReplicatedJudgeAssignmentsTable } from './ReplicatedJudgeAssignmentsTable';
import { invalidateClassEnrichment } from './classEnrichmentCache';

const TRIALS = [
  { id: 'trial-1', show_id: 'show-a', registry_id: 'AKC' },
  { id: 'trial-2', show_id: 'show-b', registry_id: 'AKC' },
];
const ROWS = [
  { id: 'class-1', trial_id: 'trial-1', element: 'Interior', level: 'Novice' },
  { id: 'class-2', trial_id: 'trial-2', element: 'Interior', level: 'Novice' },
];

function builder(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'in', 'eq', 'not', 'or', 'gt', 'order', 'range']) {
    chain[step] = () => chain;
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
  return chain;
}

type Enrich = (rows: unknown[]) => Promise<unknown>;
const enrichClasses = () => {
  const table = new ReplicatedClassesTable();
  return (table as unknown as { enrichClassRows: Enrich }).enrichClassRows(ROWS);
};
/** Every show id the batched judge RPC was asked about, across all of its calls. */
const judgeRpcShows = () =>
  mockRpc.mock.calls
    .filter(call => call[0] === 'get_shows_judges')
    .flatMap(call => (call[1] as { p_show_ids: string[] }).p_show_ids)
    .sort();

describe('a remote judge-assignments delta drops that show from the class enrichment cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
    assignments.rows = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trials') {
        // Honour the `in('id', ids)` filter, as PostgREST does.
        return {
          select: () => ({
            in: async (_column: string, ids: string[]) => ({
              data: TRIALS.filter(trial => ids.includes(trial.id)),
              error: null,
            }),
          }),
        };
      }
      return builder(table === 'judge_assignments' ? assignments.rows : []);
    });
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('re-asks get_shows_judges for the changed show only', async () => {
    await enrichClasses();
    mockRpc.mockClear();

    assignments.rows = [{ id: 'a-1', show_id: 'show-a', updated_at: '2026-10-23T00:00:00Z' }];
    await new ReplicatedJudgeAssignmentsTable().sync();
    await enrichClasses();

    expect(judgeRpcShows()).toEqual(['show-a']);
  });

  it('falls back to the show of the assigned class when the row has no show_id', async () => {
    await enrichClasses();
    mockRpc.mockClear();

    assignments.rows = [
      {
        id: 'a-2',
        show_id: null,
        updated_at: '2026-10-23T00:00:00Z',
        classes: { trials: { show_id: 'show-b' } },
      },
    ];
    await new ReplicatedJudgeAssignmentsTable().sync();
    await enrichClasses();

    expect(judgeRpcShows()).toEqual(['show-b']);
  });

  it('leaves the cache alone when the delta is empty', async () => {
    await enrichClasses();
    mockRpc.mockClear();

    await new ReplicatedJudgeAssignmentsTable().sync();
    await enrichClasses();

    expect(judgeRpcShows()).toEqual([]);
  });
});
