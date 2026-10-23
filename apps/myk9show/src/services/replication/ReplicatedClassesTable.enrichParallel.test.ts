// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1345: a class sync used to await its four enrichments one after another, and each
 * one read `trials` for the same rows. They now run together on one shared `trials` read.
 */
const { mockFrom, mockRpc, resolvers, trialsRead } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  resolvers: {
    visibility: vi.fn(),
    hideCounts: vi.fn(),
    timeLimits: vi.fn(),
    judges: vi.fn(),
  },
  trialsRead: { error: null as { message: string } | 'throw' | null },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => 'user-a',
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));
vi.mock('./resolveClassVisibility', () => ({
  resolveVisibilityForClassRows: resolvers.visibility,
}));
vi.mock('./resolveClassHideCounts', () => ({
  resolveHideCountsForClassRows: resolvers.hideCounts,
}));
vi.mock('./resolveClassTimeLimitRules', () => ({
  resolveTimeLimitRulesForClassRows: resolvers.timeLimits,
}));
vi.mock('./resolveClassJudgeNames', () => ({
  resolveJudgeNamesForClassRows: resolvers.judges,
}));

import { ReplicatedClassesTable } from './ReplicatedClassesTable';
import { invalidateClassEnrichment } from './classEnrichmentCache';

const TRIALS = [
  { id: 'trial-1', show_id: 'show-1', registry_id: 'AKC' },
  { id: 'trial-2', show_id: 'show-1', registry_id: 'UKC' },
];
const ROWS = [
  { id: 'class-1', trial_id: 'trial-1' },
  { id: 'class-2', trial_id: 'trial-2' },
  { id: 'class-3', trial_id: 'trial-1' },
];

type Enrich = (rows: unknown[]) => Promise<Array<Record<string, unknown>>>;
const enrich = (table: ReplicatedClassesTable): Enrich =>
  (table as unknown as { enrichClassRows: Enrich }).enrichClassRows.bind(table);

const trialsCalls = () => mockFrom.mock.calls.filter(call => call[0] === 'trials');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('class enrichment runs in parallel on one trials read (MYK9-1345)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
    trialsRead.error = null;
    mockFrom.mockImplementation((name: string) => {
      if (name !== 'trials') throw new Error(`Unexpected table: ${name}`);
      return {
        select: () => ({
          in: async () => {
            if (trialsRead.error === 'throw') throw new Error('network down');
            return { data: trialsRead.error ? null : TRIALS, error: trialsRead.error };
          },
        }),
      };
    });
    resolvers.visibility.mockResolvedValue(new Map());
    resolvers.hideCounts.mockResolvedValue(new Map());
    resolvers.timeLimits.mockResolvedValue(new Map());
    resolvers.judges.mockResolvedValue(new Map());
  });

  it('starts all four lookups before any of them resolves', async () => {
    const visibility = deferred<Map<string, unknown>>();
    const hideCounts = deferred<Map<string, number>>();
    const timeLimits = deferred<Map<string, unknown>>();
    const judges = deferred<Map<string, unknown>>();
    resolvers.visibility.mockReturnValue(visibility.promise);
    resolvers.hideCounts.mockReturnValue(hideCounts.promise);
    resolvers.timeLimits.mockReturnValue(timeLimits.promise);
    resolvers.judges.mockReturnValue(judges.promise);

    const enriched = enrich(new ReplicatedClassesTable())(ROWS);

    // None has been resolved: a sequential chain would still be waiting on the first.
    await vi.waitFor(() => {
      expect(resolvers.visibility).toHaveBeenCalledTimes(1);
      expect(resolvers.hideCounts).toHaveBeenCalledTimes(1);
      expect(resolvers.timeLimits).toHaveBeenCalledTimes(1);
      expect(resolvers.judges).toHaveBeenCalledTimes(1);
    });

    visibility.resolve(
      new Map([['class-1', { selfCheckinEnabled: true, visibilityPreset: 'open' }]])
    );
    hideCounts.resolve(new Map([['class-1', 4]]));
    timeLimits.resolve(new Map([['class-1', { fixed: 120, forElement: null, forLevel: null }]]));
    judges.resolve(new Map([['class-1', { firstName: 'Jo', lastName: 'Judge' }]]));

    const [first, second] = await enriched;
    expect(first).toMatchObject({
      id: 'class-1',
      num_hides: 4,
      _selfCheckinEnabled: true,
      _visibilityPreset: 'open',
      _timeLimitRule: { fixed: 120 },
      _judge: { firstName: 'Jo' },
      _judgeResolved: true,
    });
    expect(second).toMatchObject({ id: 'class-2', num_hides: null, _judgeResolved: false });
  });

  it('falls back to the rule already on the device when the time-limit lookup rejects', async () => {
    const table = new ReplicatedClassesTable();
    const rule = { min: 60, max: 180, forElement: 'Interior', forLevel: 'Novice' };
    vi.spyOn(table, 'get').mockImplementation(
      async id => (id === 'class-1' ? { timeLimitRule: rule } : undefined) as never
    );
    resolvers.timeLimits.mockRejectedValue(new Error('network'));

    const enriched = await enrich(table)(ROWS);

    expect(enriched[0]?._timeLimitRule).toEqual(rule);
    expect(enriched[1]?._timeLimitRule).toBeUndefined();
    // The other three lookups still ran and answered.
    expect(resolvers.visibility).toHaveBeenCalledTimes(1);
    expect(resolvers.judges).toHaveBeenCalledTimes(1);
  });

  it('reads trials once and hands the same rows to every lookup', async () => {
    await enrich(new ReplicatedClassesTable())(ROWS);

    expect(trialsCalls()).toHaveLength(1);
    expect(resolvers.visibility).toHaveBeenCalledWith(ROWS, TRIALS);
    expect(resolvers.hideCounts).toHaveBeenCalledWith(
      ROWS,
      expect.any(Function),
      TRIALS,
      expect.any(Function)
    );
    expect(resolvers.timeLimits).toHaveBeenCalledWith(ROWS, TRIALS);
    expect(resolvers.judges).toHaveBeenCalledWith(
      ROWS,
      expect.any(Function),
      TRIALS,
      expect.any(Function)
    );
  });

  it.each([
    { how: 'returns an error', failure: { message: 'boom' } },
    { how: 'throws', failure: 'throw' as const },
  ])(
    'passes nothing on when the shared read $how, so each lookup reads trials itself',
    async ({ failure }) => {
      trialsRead.error = failure;

      await enrich(new ReplicatedClassesTable())(ROWS);

      expect(resolvers.visibility).toHaveBeenCalledWith(ROWS, undefined);
      expect(resolvers.hideCounts).toHaveBeenCalledWith(
        ROWS,
        expect.any(Function),
        undefined,
        expect.any(Function)
      );
      expect(resolvers.timeLimits).toHaveBeenCalledWith(ROWS, undefined);
      expect(resolvers.judges).toHaveBeenCalledWith(
        ROWS,
        expect.any(Function),
        undefined,
        expect.any(Function)
      );
    }
  );
});
