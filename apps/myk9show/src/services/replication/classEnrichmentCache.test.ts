// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, resolvers, session } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  resolvers: {
    visibility: vi.fn(),
    hideCounts: vi.fn(),
    timeLimits: vi.fn(),
    judges: vi.fn(),
  },
  session: { userId: 'user-a' as string | null },
}));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: mockFrom } }));
vi.mock('@/services/database/persistedAuthUserId', () => ({
  readPersistedAuthUserId: () => session.userId,
}));
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));
vi.mock('@myk9/core', () => ({ logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() } }));
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

import {
  CLASS_ENRICHMENT_TTL_MS,
  HideCountLookupFailedError,
  affectsClassEnrichment,
  invalidateClassEnrichment,
  invalidateClassEnrichmentForShows,
  resolveClassEnrichment,
  type ClassEnrichmentDeps,
} from './classEnrichmentCache';

const TRIALS = [
  { id: 'trial-1', show_id: 'show-1', registry_id: 'AKC' },
  { id: 'trial-2', show_id: 'show-2', registry_id: 'AKC' },
];
const row = (id: string, trialId: string, level = 'Novice', timeLimit = 180) => ({
  id,
  trial_id: trialId,
  element: 'Interior',
  level,
  section: null,
  time_limit_seconds: timeLimit,
  time_limit_area2_seconds: null,
  time_limit_area3_seconds: null,
});
type Row = ReturnType<typeof row>;
const resolve = (rows: Row[], deps: Partial<ClassEnrichmentDeps> = {}) =>
  resolveClassEnrichment(rows as never, {
    shareRead: async (_key, read) => read(),
    localTimeLimitRules: async () => new Map(),
    tableName: 'classes',
    ...deps,
  });

const trialsReads = () => mockFrom.mock.calls.filter(call => call[0] === 'trials').length;
const calledFor = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  (mock.mock.calls[call]?.[0] as Row[]).map(r => r.id);

/** Answers every class it is handed, as the live resolvers do for a signed-in caller. */
function answerEveryClass() {
  resolvers.visibility.mockImplementation(async (rows: Row[]) => {
    return new Map(
      rows.map(r => [r.id, { selfCheckinEnabled: true, visibilityPreset: 'open' } as const])
    );
  });
  resolvers.hideCounts.mockImplementation(async (rows: Row[]) => new Map(rows.map(r => [r.id, 3])));
  resolvers.timeLimits.mockImplementation(
    async (rows: Row[]) =>
      new Map(rows.map(r => [r.id, { fixed: 120, forElement: null, forLevel: null }]))
  );
  resolvers.judges.mockImplementation(
    async (rows: Row[]) =>
      new Map(rows.map(r => [r.id, { personId: 'p', firstName: 'Jo', lastName: 'Judge' }]))
  );
}

let clock = 0;

describe('class enrichment cache (MYK9-1360)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateClassEnrichment();
    session.userId = 'user-a';
    clock = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'trials') throw new Error(`Unexpected table: ${table}`);
      return { select: () => ({ in: async () => ({ data: TRIALS, error: null }) }) };
    });
    answerEveryClass();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves a repeat delta from the cache with no trials read and no lookup', async () => {
    const rows = [row('c1', 'trial-1'), row('c2', 'trial-2')];
    const first = await resolve(rows);
    expect(first.judges.get('c1')).toMatchObject({ firstName: 'Jo' });
    expect(trialsReads()).toBe(1);

    const second = await resolve(rows);

    expect(trialsReads()).toBe(1);
    for (const mock of Object.values(resolvers)) expect(mock).toHaveBeenCalledTimes(1);
    expect(second.visibility.get('c2')).toEqual({
      selfCheckinEnabled: true,
      visibilityPreset: 'open',
    });
    expect(second.hideCounts.get('c1')).toBe(3);
    expect(second.timeLimitRules.get('c1')).toMatchObject({ fixed: 120 });
    expect(second.judges.get('c2')).toMatchObject({ lastName: 'Judge' });
  });

  it('keeps a cached "no judge" distinct from an unanswered one', async () => {
    resolvers.judges.mockResolvedValue(new Map([['c1', null]]));
    await resolve([row('c1', 'trial-1'), row('c2', 'trial-1')]);

    const again = await resolve([row('c1', 'trial-1'), row('c2', 'trial-1')]);

    // c1 answered "no judge" and is remembered; c2 never answered, so it is asked again.
    expect(again.judges.has('c1')).toBe(true);
    expect(again.judges.get('c1')).toBeNull();
    expect(calledFor(resolvers.judges, 1)).toEqual(['c2']);
  });

  it('asks only for a class the fresh entry does not know, and remembers it', async () => {
    await resolve([row('c1', 'trial-1')]);
    const withNew = await resolve([row('c1', 'trial-1'), row('c3', 'trial-1')]);

    expect(calledFor(resolvers.visibility, 1)).toEqual(['c3']);
    expect(withNew.judges.size).toBe(2);

    await resolve([row('c1', 'trial-1'), row('c3', 'trial-1')]);
    expect(resolvers.visibility).toHaveBeenCalledTimes(2);
  });

  it('asks only for the shows that are missing when two shows share a delta', async () => {
    await resolve([row('c1', 'trial-1')]);
    await resolve([row('c1', 'trial-1'), row('c2', 'trial-2')]);

    expect(calledFor(resolvers.judges, 1)).toEqual(['c2']);
  });

  it('treats a class whose element or level changed as unknown', async () => {
    await resolve([row('c1', 'trial-1', 'Novice')]);
    await resolve([row('c1', 'trial-1', 'Advanced')]);

    expect(calledFor(resolvers.hideCounts, 1)).toEqual(['c1']);
  });

  it('treats a class whose time limit changed as unknown', async () => {
    await resolve([row('c1', 'trial-1', 'Novice', 180)]);
    await resolve([row('c1', 'trial-1', 'Novice', 180)]);
    expect(resolvers.timeLimits).toHaveBeenCalledTimes(1);

    await resolve([row('c1', 'trial-1', 'Novice', 240)]);

    expect(calledFor(resolvers.timeLimits, 1)).toEqual(['c1']);
  });

  it('does not cache a delta whose resolver reports a skipped read', async () => {
    resolvers.hideCounts.mockImplementationOnce(
      async (_rows: Row[], _share: unknown, _trials: unknown, onPartialFailure?: () => void) => {
        onPartialFailure?.();
        return new Map();
      }
    );
    const rows = [row('c1', 'trial-1')];
    // MYK9-1451: a skipped hide-count read fails the enrichment rather than answering "no count".
    await expect(resolve(rows)).rejects.toBeInstanceOf(HideCountLookupFailedError);
    await resolve(rows);

    expect(resolvers.hideCounts).toHaveBeenCalledTimes(2);
    expect(resolvers.judges).toHaveBeenCalledTimes(2);

    await resolve(rows);
    expect(resolvers.hideCounts).toHaveBeenCalledTimes(2);
  });

  it('expires an entry after the TTL, on the monotonic clock', async () => {
    const rows = [row('c1', 'trial-1')];
    await resolve(rows);

    clock += CLASS_ENRICHMENT_TTL_MS - 1;
    await resolve(rows);
    expect(resolvers.judges).toHaveBeenCalledTimes(1);

    clock += 1;
    await resolve(rows);
    expect(resolvers.judges).toHaveBeenCalledTimes(2);
  });

  it('keys by account: another user misses, and the first user does not read the second', async () => {
    const rows = [row('c1', 'trial-1')];
    await resolve(rows);

    session.userId = 'user-b';
    await resolve(rows);
    expect(resolvers.judges).toHaveBeenCalledTimes(2);

    session.userId = 'user-a';
    await resolve(rows);
    // user-a's entry was dropped when user-b's was written, so it asks again.
    expect(resolvers.judges).toHaveBeenCalledTimes(3);
  });

  it('does not write back a read that an invalidation overtook', async () => {
    let release!: (value: Map<string, unknown>) => void;
    resolvers.judges.mockReturnValueOnce(
      new Promise(resolveJudges => {
        release = resolveJudges;
      })
    );
    const rows = [row('c1', 'trial-1')];
    const pending = resolve(rows);
    await vi.waitFor(() => expect(resolvers.judges).toHaveBeenCalledTimes(1));

    invalidateClassEnrichment('show-1');
    release(new Map([['c1', null]]));
    await pending;
    await resolve(rows);

    expect(resolvers.judges).toHaveBeenCalledTimes(2);
  });

  describe('invalidation', () => {
    const rows = [row('c1', 'trial-1'), row('c2', 'trial-2')];

    it('with a show id drops only that show', async () => {
      await resolve(rows);
      invalidateClassEnrichment('show-1');
      await resolve(rows);

      expect(calledFor(resolvers.judges, 1)).toEqual(['c1']);
    });

    it('with no argument drops every show and the trial-to-show map', async () => {
      await resolve(rows);
      invalidateClassEnrichment();
      await resolve(rows);

      expect(calledFor(resolvers.judges, 1)).toEqual(['c1', 'c2']);
      expect(trialsReads()).toBe(2);
    });
  });

  describe('invalidateClassEnrichmentForShows', () => {
    const rows = [row('c1', 'trial-1'), row('c2', 'trial-2')];

    it('drops the named shows only', async () => {
      await resolve(rows);
      invalidateClassEnrichmentForShows(['show-2', 'show-2']);
      await resolve(rows);

      expect(calledFor(resolvers.judges, 1)).toEqual(['c2']);
    });

    it('drops every show when a row names none, and nothing when there are no rows', async () => {
      await resolve(rows);
      invalidateClassEnrichmentForShows([]);
      await resolve(rows);
      expect(resolvers.judges).toHaveBeenCalledTimes(1);

      invalidateClassEnrichmentForShows(['show-1', null]);
      await resolve(rows);
      expect(calledFor(resolvers.judges, 1)).toEqual(['c1', 'c2']);
    });
  });

  describe('a failed lookup is never cached', () => {
    it.each([
      ['visibility', () => resolvers.visibility.mockRejectedValueOnce(new Error('down'))],
      ['hide counts', () => resolvers.hideCounts.mockRejectedValueOnce(new Error('down'))],
      ['time limits', () => resolvers.timeLimits.mockResolvedValueOnce(null)],
      ['judge names', () => resolvers.judges.mockRejectedValueOnce(new Error('down'))],
    ])('%s', async (name, fail) => {
      fail();
      const rows = [row('c1', 'trial-1')];
      // A hide-count failure fails the enrichment (MYK9-1451); the others still answer.
      if (name === 'hide counts') {
        await expect(resolve(rows)).rejects.toBeInstanceOf(HideCountLookupFailedError);
      } else {
        await expect(resolve(rows)).resolves.toBeDefined();
      }

      await resolve(rows);

      expect(resolvers.judges).toHaveBeenCalledTimes(2);
    });

    it('carries the rule already on the device when the rule lookup fails', async () => {
      const rule = { fixed: 90, forElement: 'Interior', forLevel: 'Novice' };
      resolvers.timeLimits.mockResolvedValueOnce(null);

      const result = await resolve([row('c1', 'trial-1')], {
        localTimeLimitRules: async () => new Map([['c1', rule]]) as never,
      });

      expect(result.timeLimitRules.get('c1')).toEqual(rule);
    });

    it('runs every lookup uncached, with no trials, when the trials read fails', async () => {
      mockFrom.mockImplementation(() => ({
        select: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }),
      }));
      const rows = [row('c1', 'trial-1')];
      await resolve(rows);
      await resolve(rows);

      expect(resolvers.judges).toHaveBeenCalledTimes(2);
      expect(resolvers.judges).toHaveBeenLastCalledWith(
        rows,
        expect.any(Function),
        undefined,
        expect.any(Function)
      );
    });
  });

  it('does not cache a class whose lookups never answered for it', async () => {
    resolvers.visibility.mockResolvedValue(new Map());
    const rows = [row('c1', 'trial-1')];
    await resolve(rows);
    await resolve(rows);

    expect(resolvers.judges).toHaveBeenCalledTimes(2);
  });

  describe('affectsClassEnrichment', () => {
    it('is true for edits that change what the values derive from', () => {
      expect(affectsClassEnrichment({ level: 'Advanced' })).toBe(true);
      expect(affectsClassEnrichment({ element: 'Exterior', classStatus: 'in_progress' })).toBe(
        true
      );
    });

    it('is false for status and score edits', () => {
      expect(affectsClassEnrichment({ classStatus: 'completed', scoredCount: 4 })).toBe(false);
    });
  });
});
