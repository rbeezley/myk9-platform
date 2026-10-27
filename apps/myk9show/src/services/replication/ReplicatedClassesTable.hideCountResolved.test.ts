// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1451: a failed official hide-count lookup must not overwrite the judge-set count a warm
 * ringside device already holds. Drives the real enrichment (RPC mocked) through rowToClass and
 * resolveConflict, the path an incremental re-sync of a changed class takes.
 */
const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => 'user-a',
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));

import { ReplicatedClassesTable, rowToClass, type ReplicatedClass } from './ReplicatedClassesTable';
import { invalidateClassEnrichment } from './classEnrichmentCache';

const TRIALS = [{ id: 'trial-1', show_id: 'show-1', registry_id: 'AKC' }];
const CLASS_ROW = { id: 'class-1', trial_id: 'trial-1', element: 'Interior', level: 'Novice' };

type Enrich = (rows: unknown[]) => Promise<Array<Record<string, unknown>>>;
type Resolve = (local: ReplicatedClass, remote: ReplicatedClass) => ReplicatedClass;

function builder(rows: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'in', 'eq', 'not']) chain[step] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: error ? null : rows, error });
  return chain;
}

/** The warm device's incremental re-sync of the changed class: enrich, map, merge. */
async function resyncOver(local: ReplicatedClass): Promise<ReplicatedClass> {
  const table = new ReplicatedClassesTable();
  const [enriched] = await (table as unknown as { enrichClassRows: Enrich }).enrichClassRows([
    CLASS_ROW,
  ]);
  const remote = rowToClass(enriched as unknown as Parameters<typeof rowToClass>[0]);
  return (table as unknown as { resolveConflict: Resolve }).resolveConflict(local, remote);
}

const warm = { id: 'class-1', name: 'Novice', hideCount: 5, hideCountResolved: true };

describe('official hide count survives a failed lookup (MYK9-1451)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
    mockFrom.mockImplementation((table: string) => builder(table === 'trials' ? TRIALS : []));
  });

  const rpc = (hideCounts: { data: unknown; error: unknown }) =>
    mockRpc.mockImplementation(async (name: string) =>
      name === 'get_shows_class_hide_counts' ? hideCounts : { data: [], error: null }
    );

  it('keeps the persisted count when the official lookup returns an error', async () => {
    rpc({ data: null, error: { message: 'function does not exist' } });

    const merged = await resyncOver(warm as ReplicatedClass);

    expect(merged.hideCount).toBe(5);
  });

  it('keeps the persisted count when the official lookup rejects', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'get_shows_class_hide_counts') throw new TypeError('Failed to fetch');
      return { data: [], error: null };
    });

    const merged = await resyncOver(warm as ReplicatedClass);

    expect(merged.hideCount).toBe(5);
  });

  it('clears the count when the lookup answered with no count for the class', async () => {
    rpc({ data: [], error: null });

    const merged = await resyncOver(warm as ReplicatedClass);

    expect(merged.hideCount).toBeUndefined();
    expect(merged.hideCountResolved).toBe(true);
  });

  it('keeps a fixed count when the public rules read fails and the official RPC has no row', async () => {
    // Exhibitor/anon devices and public fixed-count classes get no official row; with the rules
    // read down the count is unknown, not "none".
    mockFrom.mockImplementation((table: string) =>
      table === 'sport_class_rules'
        ? builder([], { message: 'rules unavailable' })
        : builder(table === 'trials' ? TRIALS : [])
    );
    rpc({ data: [], error: null });

    const merged = await resyncOver({ ...warm, hideCount: 3 } as ReplicatedClass);

    expect(merged.hideCount).toBe(3);
  });

  it('adopts the server count when the lookup answered with one', async () => {
    rpc({ data: [{ show_id: 'show-1', class_id: 'class-1', num_hides: 3 }], error: null });

    const merged = await resyncOver(warm as ReplicatedClass);

    expect(merged.hideCount).toBe(3);
  });

  it('marks nothing resolved and keeps the count when a later show batch throws', async () => {
    // 201 shows split into two RPC batches (200 + 1). The first answers with no count; the
    // second rejects, so the whole lookup is a failure and the first batch must not count.
    const shows = Array.from({ length: 201 }, (_, i) => `show-${String(i).padStart(3, '0')}`);
    const trials = shows.map((show, i) => ({
      id: `trial-${i}`,
      show_id: show,
      registry_id: 'AKC',
    }));
    mockFrom.mockImplementation((table: string) => builder(table === 'trials' ? trials : []));
    mockRpc.mockImplementation(async (name: string, args: { p_show_ids?: string[] }) => {
      if (name !== 'get_shows_class_hide_counts') return { data: [], error: null };
      if (args.p_show_ids?.includes('show-200')) throw new TypeError('Failed to fetch');
      return { data: [], error: null };
    });
    const first = { id: 'class-1', trial_id: 'trial-0', element: 'Interior', level: 'Novice' };
    const last = { id: 'class-2', trial_id: 'trial-200', element: 'Interior', level: 'Novice' };
    const table = new ReplicatedClassesTable();

    const enriched = await (table as unknown as { enrichClassRows: Enrich }).enrichClassRows([
      first,
      last,
    ]);
    const remote = rowToClass(enriched[0] as unknown as Parameters<typeof rowToClass>[0]);
    const merged = (table as unknown as { resolveConflict: Resolve }).resolveConflict(
      warm as ReplicatedClass,
      remote
    );

    expect(enriched.map(row => row._hideCountResolved)).toEqual([false, false]);
    expect(merged.hideCount).toBe(5);
  });
});
