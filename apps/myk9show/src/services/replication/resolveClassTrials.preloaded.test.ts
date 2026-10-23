// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1345: handed the class rows' trials, each enrichment resolver reads from them and
 * never queries `trials` itself; handed nothing, it still reads them (direct callers).
 */
const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));

import { resolveVisibilityForClassRows } from './resolveClassVisibility';
import { resolveHideCountsForClassRows } from './resolveClassHideCounts';
import { resolveTimeLimitRulesForClassRows } from './resolveClassTimeLimitRules';
import { resolveJudgeNamesForClassRows } from './resolveClassJudgeNames';
import { readClassTrials } from './resolveClassTrials';

const TRIALS = [{ id: 'trial-1', show_id: 'show-1', registry_id: 'AKC' }];
const ROWS = [{ id: 'class-1', trial_id: 'trial-1', element: 'Interior', level: 'Novice' }];

type InCall = { table: string; column: string; ids: string[] };
const inCalls: InCall[] = [];

const tablesRead = () => mockFrom.mock.calls.map(call => call[0] as string);

describe('enrichment resolvers given preloaded trials (MYK9-1345)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inCalls.length = 0;
    // Every table answers empty, trials included, so a stray trials read is visible by name.
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.in = (column: string, ids: string[]) => {
        inCalls.push({ table, column, ids });
        return chain;
      };
      chain.eq = () => chain;
      chain.not = () => chain;
      chain.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
      return chain;
    });
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it.each([
    { name: 'visibility', run: () => resolveVisibilityForClassRows(ROWS, TRIALS) },
    { name: 'hide counts', run: () => resolveHideCountsForClassRows(ROWS, undefined, TRIALS) },
    { name: 'time limits', run: () => resolveTimeLimitRulesForClassRows(ROWS, TRIALS) },
    { name: 'judge names', run: () => resolveJudgeNamesForClassRows(ROWS, undefined, TRIALS) },
  ])('$name never queries trials', async ({ run }) => {
    await run();

    expect(tablesRead()).not.toContain('trials');
  });

  it.each([
    { name: 'visibility', run: () => resolveVisibilityForClassRows(ROWS) },
    { name: 'hide counts', run: () => resolveHideCountsForClassRows(ROWS) },
    { name: 'time limits', run: () => resolveTimeLimitRulesForClassRows(ROWS) },
    { name: 'judge names', run: () => resolveJudgeNamesForClassRows(ROWS) },
  ])('$name still reads trials itself when none are passed', async ({ run }) => {
    await run();

    expect(tablesRead().filter(table => table === 'trials')).toHaveLength(1);
  });

  it('visibility keeps each batch its own trials when the rows span two batches', async () => {
    // VISIBILITY_BATCH_SIZE is 100: the first 100 classes are batch one, the rest batch two.
    const rows = Array.from({ length: 150 }, (_, i) => ({
      id: `class-${i}`,
      trial_id: i < 100 ? 'trial-a' : 'trial-b',
    }));
    const trials = [
      { id: 'trial-a', show_id: 'show-a', registry_id: 'AKC' },
      { id: 'trial-b', show_id: 'show-b', registry_id: 'AKC' },
    ];

    await resolveVisibilityForClassRows(rows, trials);

    expect(tablesRead()).not.toContain('trials');
    expect(inCalls.filter(call => call.table === 'show_visibility_settings')).toEqual([
      { table: 'show_visibility_settings', column: 'show_id', ids: ['show-a'] },
      { table: 'show_visibility_settings', column: 'show_id', ids: ['show-b'] },
    ]);
  });
});

describe('readClassTrials (MYK9-1345)', () => {
  it('resolves [] without querying trials when no row has a trial', async () => {
    mockFrom.mockClear();

    await expect(readClassTrials([])).resolves.toEqual([]);
    await expect(readClassTrials([{ trial_id: null }, {}])).resolves.toEqual([]);

    expect(mockFrom).not.toHaveBeenCalled();
  });
});
